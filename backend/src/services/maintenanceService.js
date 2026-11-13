import { MaintenanceWindow } from '../models/MaintenanceWindow.js';
import { Application } from '../models/Application.js';
import { AppError } from '../utils/AppError.js';
import {
  emitMaintenanceStarted,
  emitMaintenanceEnded,
  emitMaintenanceScheduled,
  emitMaintenanceCancelled,
  emitApplicationStatus
} from '../sockets/events.js';
import { evaluateIncidentStateAfterMaintenance } from './incidentService.js';

/**
 * Creates a new maintenance window (immediate activation or future scheduled).
 * Verifies application ownership and prevents overlapping active or scheduled windows.
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.userId
 * @param {string|Date} [params.startAt]
 * @param {string|Date} params.endAt
 * @param {string} params.reason
 * @returns {Promise<object>} Created maintenance window document
 */
export async function createMaintenanceWindow({ applicationId, userId, startAt, endAt, reason }) {
  const application = await Application.findOne({ _id: applicationId, ownerId: userId });
  if (!application) {
    throw new AppError('Application not found', 404);
  }

  const now = new Date();
  const startDate = startAt ? new Date(startAt) : now;
  const endDate = new Date(endAt);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new AppError('Invalid date format provided', 400);
  }

  if (endDate.getTime() <= startDate.getTime()) {
    throw new AppError('End time must be strictly after start time', 400);
  }

  // Prevent overlapping active or scheduled maintenance windows for this application
  const overlapping = await MaintenanceWindow.findOne({
    applicationId: application._id,
    status: { $in: ['SCHEDULED', 'ACTIVE'] },
    startAt: { $lt: endDate },
    endAt: { $gt: startDate }
  });

  if (overlapping) {
    throw new AppError(
      'An active or scheduled maintenance window already overlaps with this time range',
      409
    );
  }

  // Determine initial status:
  // If startDate <= now (or within 5 seconds in future), start immediately
  const isImmediate = startDate.getTime() <= now.getTime() + 5000;
  const status = isImmediate ? 'ACTIVE' : 'SCHEDULED';

  const windowDoc = await MaintenanceWindow.create({
    applicationId: application._id,
    ownerId: application.ownerId,
    createdBy: userId,
    reason: reason.trim(),
    startAt: isImmediate ? now : startDate,
    endAt: endDate,
    status
  });

  if (status === 'ACTIVE') {
    // Preserve underlying health state if not already in maintenance
    const currentActual = application.status === 'maintenance'
      ? (application.underlyingStatus || 'unknown')
      : application.status;

    application.underlyingStatus = currentActual;
    application.status = 'maintenance';
    application.activeMaintenanceWindowId = windowDoc._id;
    await application.save();

    emitMaintenanceStarted(application.ownerId, windowDoc);
    emitApplicationStatus(application.ownerId, application);
  } else {
    emitMaintenanceScheduled(application.ownerId, windowDoc);
  }

  const populated = await MaintenanceWindow.findById(windowDoc._id)
    .populate('createdBy', 'name email')
    .populate('endedBy', 'name email')
    .lean();

  return populated;
}

/**
 * Retrieves paginated maintenance history for an application.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} query
 * @param {number} [query.page=1]
 * @param {number} [query.limit=10]
 * @param {string} [query.status]
 * @returns {Promise<object>} { windows, pagination }
 */
export async function getMaintenanceHistory(applicationId, userId, { page = 1, limit = 10, status } = {}) {
  const application = await Application.findOne({ _id: applicationId, ownerId: userId });
  if (!application) {
    throw new AppError('Application not found', 404);
  }

  const filter = { applicationId: application._id };
  if (status) {
    filter.status = status;
  }

  const skip = (Math.max(1, page) - 1) * limit;

  const [windows, total] = await Promise.all([
    MaintenanceWindow.find(filter)
      .sort({ startAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email')
      .populate('endedBy', 'name email')
      .lean(),
    MaintenanceWindow.countDocuments(filter)
  ]);

  return {
    windows,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

/**
 * Retrieves the currently active maintenance window for an application (if any).
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object|null>} Active maintenance window document or null
 */
export async function getActiveMaintenanceWindow(applicationId, userId) {
  const application = await Application.findOne({ _id: applicationId, ownerId: userId });
  if (!application) {
    throw new AppError('Application not found', 404);
  }

  const activeWindow = await MaintenanceWindow.findOne({
    applicationId: application._id,
    status: 'ACTIVE'
  })
    .populate('createdBy', 'name email')
    .populate('endedBy', 'name email')
    .lean();

  return activeWindow;
}

/**
 * Retrieves a maintenance window by ID.
 *
 * @param {string} maintenanceId
 * @param {string} userId
 * @returns {Promise<object>} Maintenance window document
 */
export async function getMaintenanceById(maintenanceId, userId) {
  const windowDoc = await MaintenanceWindow.findOne({ _id: maintenanceId, ownerId: userId })
    .populate('createdBy', 'name email')
    .populate('endedBy', 'name email');

  if (!windowDoc) {
    throw new AppError('Maintenance window not found', 404);
  }

  return windowDoc.toJSON();
}

/**
 * Ends an active maintenance window or cancels a scheduled maintenance window.
 *
 * @param {string} maintenanceId
 * @param {string} userId
 * @returns {Promise<object>} Updated maintenance window document
 */
export async function endMaintenanceWindow(maintenanceId, userId) {
  const windowDoc = await MaintenanceWindow.findOne({ _id: maintenanceId, ownerId: userId });
  if (!windowDoc) {
    throw new AppError('Maintenance window not found', 404);
  }

  if (windowDoc.status === 'COMPLETED' || windowDoc.status === 'CANCELLED') {
    throw new AppError(`Maintenance window is already ${windowDoc.status.toLowerCase()}`, 400);
  }

  const now = new Date();

  if (windowDoc.status === 'SCHEDULED') {
    // Scheduled window cancelled before activation
    windowDoc.status = 'CANCELLED';
    windowDoc.endedAt = now;
    windowDoc.endedBy = userId;
    await windowDoc.save();

    emitMaintenanceCancelled(windowDoc.ownerId, windowDoc);

    return windowDoc.toJSON();
  }

  // ACTIVE window ended manually
  windowDoc.status = 'COMPLETED';
  windowDoc.endedAt = now;
  windowDoc.endedBy = userId;
  await windowDoc.save();

  // Restore application health & re-evaluate incident state
  await reEvaluateApplicationAfterMaintenance(windowDoc.applicationId, userId);

  emitMaintenanceEnded(windowDoc.ownerId, windowDoc);

  return windowDoc.toJSON();
}

/**
 * Re-evaluates application health and incident state when maintenance concludes.
 * Ensures:
 * 1. An unhealthy service is NEVER marked Operational.
 * 2. If consecutiveFailures >= 2 or down, status remains 'down' and an incident is opened.
 * 3. If service is healthy, status is restored to 'up' (or degraded if slow) and active incidents resolved.
 *
 * @param {string|import('mongoose').Types.ObjectId} applicationId
 * @param {string|null} [endedByUserId]
 */
export async function reEvaluateApplicationAfterMaintenance(applicationId, endedByUserId = null) {
  const application = await Application.findById(applicationId);
  if (!application) return;

  // Clear active maintenance pointer
  application.activeMaintenanceWindowId = null;

  // Check health counters
  if (application.consecutiveFailures >= 2) {
    // The service remained or became unhealthy during maintenance: MUST NOT be marked up!
    application.status = 'down';
    application.underlyingStatus = 'down';
  } else if (application.consecutiveSuccesses >= 2 || application.underlyingStatus === 'up') {
    application.status = 'up';
    application.underlyingStatus = 'up';
  } else {
    // Fall back to preserved underlying status or unknown
    application.status = application.underlyingStatus || 'unknown';
  }

  await application.save();

  // Re-evaluate incidents and notify appropriately
  try {
    await evaluateIncidentStateAfterMaintenance(application);
  } catch (err) {
    console.error(`[Maintenance] Error evaluating incident state for app ${application._id}:`, err.message);
  }

  // Real-time broadcast of restored status
  emitApplicationStatus(application.ownerId, application);
}

/**
 * Background tick for scheduled maintenance windows.
 * Atomically handles:
 * 1. Transitioning due SCHEDULED windows to ACTIVE.
 * 2. Transitioning due ACTIVE windows to COMPLETED when scheduled end time arrives.
 *
 * Safe for multi-instance deployments via atomic findOneAndUpdate.
 *
 * @param {Date} [now=new Date()]
 */
export async function processScheduledMaintenanceTick(now = new Date()) {
  try {
    // 1. Transition due SCHEDULED -> ACTIVE
    const dueScheduled = await MaintenanceWindow.find({
      status: 'SCHEDULED',
      startAt: { $lte: now }
    }).lean();

    for (const win of dueScheduled) {
      // Atomic claim ensures only one background instance activates the window
      const claimed = await MaintenanceWindow.findOneAndUpdate(
        { _id: win._id, status: 'SCHEDULED' },
        { $set: { status: 'ACTIVE' } },
        { new: true }
      );

      if (!claimed) continue;

      const app = await Application.findById(win.applicationId);
      if (app) {
        if (app.status !== 'maintenance') {
          app.underlyingStatus = app.status;
        }
        app.status = 'maintenance';
        app.activeMaintenanceWindowId = claimed._id;
        await app.save();

        emitMaintenanceStarted(app.ownerId, claimed);
        emitApplicationStatus(app.ownerId, app);
      }
    }

    // 2. Transition due ACTIVE -> COMPLETED (automatic expiration)
    const dueActive = await MaintenanceWindow.find({
      status: 'ACTIVE',
      endAt: { $lte: now }
    }).lean();

    for (const win of dueActive) {
      // Atomic claim ensures only one background instance expires the window
      const claimed = await MaintenanceWindow.findOneAndUpdate(
        { _id: win._id, status: 'ACTIVE' },
        { $set: { status: 'COMPLETED', endedAt: now } },
        { new: true }
      );

      if (!claimed) continue;

      await reEvaluateApplicationAfterMaintenance(win.applicationId, null);
      emitMaintenanceEnded(win.ownerId, claimed);
    }
  } catch (err) {
    console.error('[Maintenance] Background tick error:', err.message);
  }
}
