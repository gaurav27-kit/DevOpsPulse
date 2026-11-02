import { Application } from '../models/Application.js';
import { HealthCheck } from '../models/HealthCheck.js';
import { AppError } from '../utils/AppError.js';
import { runHealthCheck } from './healthCheckService.js';
import { processCheckResult } from './schedulerService.js';

/**
 * Trigger a manual health check for an application.
 * Claims the lock first; if already locked (check in-flight) returns 409.
 */
export const triggerManualCheck = async (ownerId, applicationId) => {
  const now = new Date();

  // Atomically claim the application (same logic as scheduler)
  const application = await Application.findOneAndUpdate(
    {
      _id: applicationId,
      ownerId,
      $or: [
        { checkLockUntil: null },
        { checkLockUntil: { $lte: now } }
      ]
    },
    {
      $set: {
        checkLockUntil: new Date(now.getTime() + 60000) // 60s lock for manual check
      }
    },
    { new: true }
  );

  if (!application) {
    // Could be: not found, wrong owner, or lock already held
    const exists = await Application.exists({ _id: applicationId, ownerId });
    if (!exists) throw new AppError('Application not found', 404);
    throw new AppError('A check is already running for this application', 409);
  }

  let result;
  try {
    result = await runHealthCheck(application);
    await processCheckResult(application, result);
  } catch (err) {
    // Release lock on unexpected error
    await Application.findByIdAndUpdate(applicationId, { $set: { checkLockUntil: null } }).catch(() => {});
    throw err;
  }

  // Fetch the updated application after state change
  const updatedApp = await Application.findOne({ _id: applicationId, ownerId });

  // Fetch the just-inserted health check record
  const healthCheck = await HealthCheck.findOne({ applicationId })
    .sort({ checkedAt: -1 })
    .limit(1);

  return { healthCheck, application: updatedApp };
};

/**
 * List health check records for an application with pagination and filtering.
 * Always scoped by both applicationId and ownerId.
 */
export const listHealthChecks = async (ownerId, applicationId, query = {}) => {
  const {
    page = 1,
    limit = 20,
    order = 'desc',
    success,
    from,
    to
  } = query;

  // Verify application ownership before listing checks
  const appExists = await Application.exists({ _id: applicationId, ownerId });
  if (!appExists) throw new AppError('Application not found', 404);

  const filter = { applicationId, ownerId };

  if (success !== undefined && success !== null) {
    filter.success = success === true || success === 'true';
  }

  if (from || to) {
    filter.checkedAt = {};
    if (from) filter.checkedAt.$gte = new Date(from);
    if (to) filter.checkedAt.$lte = new Date(to);
  }

  const sortOrder = order === 'asc' ? 1 : -1;
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    HealthCheck.countDocuments(filter),
    HealthCheck.find(filter)
      .sort({ checkedAt: sortOrder })
      .skip(skip)
      .limit(limit)
  ]);

  return {
    items,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
};

