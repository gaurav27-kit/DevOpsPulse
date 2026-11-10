import mongoose from 'mongoose';
import { Incident } from '../models/Incident.js';
import { Application } from '../models/Application.js';
import { AppError } from '../utils/AppError.js';
import { decideIncidentAction } from './incidentRules.js';
import { emitIncidentCreated, emitIncidentUpdated } from '../sockets/events.js';
import { notifyIncidentEvent } from './notificationService.js';

// Maximum number of timeline updates per incident before we stop accepting new ones
const MAX_UPDATES = 200;

/**
 * Maps application environment to automatic severity level.
 * Production outages are high severity; lower environments are lower severity.
 */
const severityForEnvironment = (environment) => {
  const map = { production: 'high', staging: 'medium', development: 'low' };
  return map[environment] ?? 'medium';
};

// ─── Core incident actions ────────────────────────────────────────────────────

/**
 * Opens a new incident for the given application.
 * If MongoDB throws duplicate key (11000), another worker already opened one → fall through
 * to updateActiveIncident instead, ensuring exactly one active incident per application.
 */
async function openIncident(application, result) {
  const severity = severityForEnvironment(application.environment);
  const now = new Date();

  const systemMessage =
    `Incident opened after 2 consecutive failed checks. Last error: ${result.errorType ?? 'unknown'}`;

  try {
    const created = await Incident.create({
      applicationId: application._id,
      ownerId: application.ownerId,
      title: `${application.name} is down`,
      severity,
      status: 'open',
      isActive: true,
      startedAt: now,
      lastFailureAt: now,
      failureCount: 2, // We already have 2 consecutive failures at this point
      updates: [
        {
          message: systemMessage,
          type: 'system',
          author: null,
          createdAt: now
        }
      ]
    });

    // Real-time: emit incident:created AFTER database write succeeds
    emitIncidentCreated(application.ownerId, created, application.name);

    // Outbound alert: trigger incident_opened fire-and-forget without awaiting
    notifyIncidentEvent(created, application, 'incident_opened').catch(() => {});

    console.log(`[Incident] Opened incident for app ${application._id} (${severity})`);
  } catch (err) {
    if (err.code === 11000) {
      // Race condition: another worker opened an incident between our decision and this insert.
      // Fall through to updateActiveIncident — safe to call here since we know one exists now.
      console.warn(`[Incident] Duplicate key on open for app ${application._id}; switching to update`);
      await updateActiveIncident(application._id, now);
    } else {
      throw err;
    }
  }
}

/**
 * Atomically increments failureCount and sets lastFailureAt on the active incident.
 * Uses ONE findOneAndUpdate — no read-modify-write race.
 */
async function updateActiveIncident(applicationId, now = new Date()) {
  const updated = await Incident.findOneAndUpdate(
    { applicationId, isActive: true },
    {
      $inc: { failureCount: 1 },
      $set: { lastFailureAt: now }
    },
    { new: true }
  );

  if (updated) {
    // Real-time: emit incident:updated AFTER database write succeeds
    emitIncidentUpdated(updated.ownerId, updated);
    console.log(`[Incident] Updated active incident for app ${applicationId}, failureCount=${updated.failureCount}`);
  }
}

/**
 * Atomically resolves the active incident.
 * Uses ONE findOneAndUpdate — no read-modify-write race.
 */
async function resolveIncident(applicationId) {
  const now = new Date();
  const updated = await Incident.findOneAndUpdate(
    { applicationId, isActive: true },
    {
      $set: {
        status: 'resolved',
        isActive: false,
        resolvedAt: now
      },
      $push: {
        updates: {
          message: 'Resolved automatically after 2 consecutive successful checks.',
          type: 'system',
          author: null,
          createdAt: now
        }
      }
    },
    { new: true }
  );

  if (updated) {
    // Real-time: emit incident:updated AFTER database write succeeds
    emitIncidentUpdated(updated.ownerId, updated);
    console.log(`[Incident] Auto-resolved incident ${updated._id} for app ${applicationId}`);

    // Outbound alert: trigger incident_resolved fire-and-forget without awaiting
    Application.findById(applicationId)
      .select('name _id')
      .lean()
      .then((appDoc) => {
        if (appDoc) {
          notifyIncidentEvent(updated, appDoc, 'incident_resolved').catch(() => {});
        }
      })
      .catch(() => {});
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called by the scheduler after every check result is saved and the Application
 * document is updated. Decides what incident action to take and performs it.
 *
 * @param {object} application - Updated Application document (post-findOneAndUpdate)
 * @param {object} result      - Check result { success, errorType, ... }
 */
export async function handleCheckOutcome(application, result) {
  const activeIncident = await Incident.findOne(
    { applicationId: application._id, isActive: true },
    { _id: 1 } // only need to know if one exists
  ).lean();

  const action = decideIncidentAction({
    resultSuccess: result.success,
    consecutiveFailures: application.consecutiveFailures,
    consecutiveSuccesses: application.consecutiveSuccesses,
    hasActiveIncident: !!activeIncident
  });

  if (action === 'open') await openIncident(application, result);
  else if (action === 'update') await updateActiveIncident(application._id);
  else if (action === 'resolve') await resolveIncident(application._id);
  // 'none': no incident action needed
}

/**
 * Called when an application's monitored URL is changed.
 * If an active incident exists it is resolved with a system note explaining the closure.
 * This prevents the old-URL incident from lingering while the new URL is being monitored.
 *
 * @param {string|ObjectId} applicationId
 */
export async function closeForUrlChange(applicationId) {
  const now = new Date();
  const updated = await Incident.findOneAndUpdate(
    { applicationId, isActive: true },
    {
      $set: {
        status: 'resolved',
        isActive: false,
        resolvedAt: now
      },
      $push: {
        updates: {
          message: 'Monitored URL was changed; incident closed.',
          type: 'system',
          author: null,
          createdAt: now
        }
      }
    },
    { new: true }
  );

  if (updated) {
    // Real-time: emit incident:updated AFTER database write succeeds
    emitIncidentUpdated(updated.ownerId, updated);
    console.log(`[Incident] Closed incident ${updated._id} due to URL change on app ${applicationId}`);

    // Outbound alert: trigger incident_resolved fire-and-forget without awaiting
    Application.findById(applicationId)
      .select('name _id')
      .lean()
      .then((appDoc) => {
        if (appDoc) {
          notifyIncidentEvent(updated, appDoc, 'incident_resolved').catch(() => {});
        }
      })
      .catch(() => {});
  }
}

// ─── Paginated list ───────────────────────────────────────────────────────────

const SORT_ALLOWLIST = new Set(['startedAt', 'lastFailureAt', 'failureCount', 'severity']);

export async function listIncidents(ownerId, query = {}) {
  const {
    page = 1,
    limit = 10,
    status,
    severity,
    applicationId,
    from,
    to,
    sortBy = 'startedAt',
    order = 'desc'
  } = query;

  if (!SORT_ALLOWLIST.has(sortBy)) {
    throw new AppError(`Invalid sortBy field. Allowed: ${[...SORT_ALLOWLIST].join(', ')}`, 400);
  }

  const filter = { ownerId };
  if (status) filter.status = status;
  if (severity) filter.severity = severity;

  if (applicationId) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      throw new AppError('applicationId must be a valid ObjectId', 400);
    }
    // Scope by ownerId ensures user can only filter their own apps' incidents
    filter.applicationId = applicationId;
  }

  if (from || to) {
    filter.startedAt = {};
    if (from) filter.startedAt.$gte = new Date(from);
    if (to) filter.startedAt.$lte = new Date(to);
  }

  const sortOrder = order === 'asc' ? 1 : -1;
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(50, Math.max(1, Number(limit)));
  const skip = (pageNum - 1) * limitNum;

  const [total, incidents] = await Promise.all([
    Incident.countDocuments(filter),
    Incident.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNum)
      .populate('applicationId', 'name url status') // include app context
      .lean()
  ]);

  return {
    incidents,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
}

// ─── Single incident ──────────────────────────────────────────────────────────

export async function getIncident(ownerId, id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Incident not found', 404);
  }

  const incident = await Incident.findOne({ _id: id, ownerId })
    .populate('applicationId', 'name url status')
    .lean();

  if (!incident) throw new AppError('Incident not found', 404);

  // Sort updates chronologically for display
  incident.updates = (incident.updates ?? []).sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  return incident;
}

// ─── Status change ────────────────────────────────────────────────────────────

/**
 * Allowed manual status transitions:
 *   open -> investigating
 *   open -> resolved
 *   investigating -> resolved
 * Any other transition (including touching a resolved incident) → 409.
 */
const ALLOWED_FROM = {
  investigating: ['open'],
  resolved: ['open', 'investigating']
};

export async function changeIncidentStatus(ownerId, id, { status: newStatus, note }) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Incident not found', 404);
  }

  const allowedCurrentStatuses = ALLOWED_FROM[newStatus];
  if (!allowedCurrentStatuses) {
    throw new AppError('Invalid status transition', 409);
  }

  const now = new Date();
  const isResolving = newStatus === 'resolved';

  // Build the update payload
  const setFields = { status: newStatus };
  if (isResolving) {
    setFields.isActive = false;
    setFields.resolvedAt = now;
  }

  // Build the timeline update entry
  let updateMessage = `Status changed to "${newStatus}".`;
  if (note && note.trim()) updateMessage += ` Note: ${note.trim()}`;

  /**
   * ONE atomic findOneAndUpdate:
   * - filter includes ownerId (authorization) + allowed CURRENT statuses (transition guard)
   * - two simultaneous requests with the same transition: only one can match; the other gets null → 409
   */
  const updated = await Incident.findOneAndUpdate(
    {
      _id: id,
      ownerId,
      status: { $in: allowedCurrentStatuses }
    },
    {
      $set: setFields,
      $push: {
        updates: {
          message: updateMessage,
          type: 'status_change',
          author: ownerId, // user performing the action
          createdAt: now
        }
      }
    },
    { new: true }
  );

  if (!updated) {
    // Either not found (wrong owner) or transition not allowed from current status
    const exists = await Incident.exists({ _id: id, ownerId });
    if (!exists) throw new AppError('Incident not found', 404);
    throw new AppError('Invalid status transition', 409);
  }

  // Real-time: emit incident:updated AFTER database write succeeds
  emitIncidentUpdated(ownerId, updated);

  // Outbound alert: if transitioned to resolved, trigger incident_resolved fire-and-forget
  if (isResolving) {
    Application.findById(updated.applicationId)
      .select('name _id')
      .lean()
      .then((appDoc) => {
        if (appDoc) {
          notifyIncidentEvent(updated, appDoc, 'incident_resolved').catch(() => {});
        }
      })
      .catch(() => {});
  }

  return updated;
}

// ─── Add manual note ─────────────────────────────────────────────────────────

export async function addIncidentNote(ownerId, id, { message }, userId) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Incident not found', 404);
  }

  const incident = await Incident.findOne({ _id: id, ownerId });
  if (!incident) throw new AppError('Incident not found', 404);

  if ((incident.updates ?? []).length >= MAX_UPDATES) {
    throw new AppError('This incident has reached the maximum number of updates (200)', 409);
  }

  const now = new Date();
  incident.updates.push({
    message,
    type: 'note',
    author: userId,
    createdAt: now
  });

  await incident.save();

  // Real-time: emit incident:updated AFTER database write succeeds
  emitIncidentUpdated(ownerId, incident);

  return incident;
}

