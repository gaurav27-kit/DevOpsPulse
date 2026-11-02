import { Application } from '../models/Application.js';
import { HealthCheck } from '../models/HealthCheck.js';
import { Incident } from '../models/Incident.js';
import { Deployment } from '../models/Deployment.js';
import { AppError } from '../utils/AppError.js';
import { assertSafeDestination } from './urlSafetyService.js';
import { closeForUrlChange } from './incidentService.js';
import { emitApplicationStatus } from '../sockets/events.js';

/**
 * Escapes special regex metacharacters in user search queries to prevent crashes or ReDoS.
 */
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Create a new monitored application for the authenticated owner.
 * Runs full SSRF check (syntax + DNS) on the URL.
 */
export const createApplication = async (ownerId, data) => {
  // Full SSRF validation: syntax + DNS resolution check
  // If ENOTFOUND, creation is allowed; health check will record dns_error
  const safeUrl = await assertSafeDestination(data.url);
  data.url = safeUrl;

  const existing = await Application.findOne({ ownerId, url: data.url });
  if (existing) {
    throw new AppError('You are already monitoring this URL', 409, [
      { field: 'url', message: 'You are already monitoring this URL' }
    ]);
  }

  const nextCheckAt = new Date();

  const application = await Application.create({
    ...data,
    ownerId,
    status: 'unknown',
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    lastCheckedAt: null,
    lastSuccessfulAt: null,
    checkLockUntil: null,
    nextCheckAt
  });

  return application;
};

/**
 * List applications owned by the user with pagination, sorting, and filtering.
 */
export const listApplications = async (ownerId, query = {}) => {
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    order = 'desc',
    status,
    environment,
    q
  } = query;

  const filter = { ownerId };

  if (status) filter.status = status;
  if (environment) filter.environment = environment;

  if (q && q.trim()) {
    const escaped = escapeRegex(q.trim());
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { url: { $regex: escaped, $options: 'i' } }
    ];
  }

  const sortOrder = order === 'asc' ? 1 : -1;
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    Application.countDocuments(filter),
    Application.find(filter)
      .sort({ [sortBy]: sortOrder })
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

/**
 * Retrieve a single application by ID scoped by owner.
 * Returns 404 regardless of whether the app exists under another user (no 403 leakage).
 */
export const getApplication = async (ownerId, id) => {
  const application = await Application.findOne({ _id: id, ownerId });
  if (!application) throw new AppError('Application not found', 404);
  return application;
};

/**
 * Update application configuration.
 * - URL change: runs full SSRF check, resets status/history, reschedules immediately.
 * - Interval change: reschedules immediately.
 */
export const updateApplication = async (ownerId, id, data) => {
  const application = await Application.findOne({ _id: id, ownerId });
  if (!application) throw new AppError('Application not found', 404);

  let urlChanged = false;
  if (data.url && data.url !== application.url) {
    urlChanged = true;
    // Run SSRF check (syntax + DNS) on the new URL
    const safeUrl = await assertSafeDestination(data.url);
    data.url = safeUrl;

    const duplicate = await Application.findOne({ ownerId, url: data.url, _id: { $ne: id } });
    if (duplicate) {
      throw new AppError('You are already monitoring this URL', 409, [
        { field: 'url', message: 'You are already monitoring this URL' }
      ]);
    }

    // Close any active incident before resetting the application state.
    // The old incident belongs to the old URL; the new URL gets a fresh slate.
    await closeForUrlChange(application._id);

    application.url = data.url;
    application.status = 'unknown';
    // Reset consecutive counters so the new URL doesn't inherit stale failure/success streaks
    application.consecutiveFailures = 0;
    application.consecutiveSuccesses = 0;
    application.lastCheckedAt = null;
    application.lastSuccessfulAt = null;
    application.checkLockUntil = null;
    application.nextCheckAt = new Date();
  }

  if (data.name !== undefined) application.name = data.name;
  if (data.environment !== undefined) application.environment = data.environment;
  if (data.timeoutMs !== undefined) application.timeoutMs = data.timeoutMs;

  if (
    data.checkIntervalSeconds !== undefined &&
    data.checkIntervalSeconds !== application.checkIntervalSeconds
  ) {
    application.checkIntervalSeconds = data.checkIntervalSeconds;
    application.nextCheckAt = new Date();
  }

  await application.save();

  if (urlChanged) {
    emitApplicationStatus(ownerId, application);
  }

  return application;
};

/**
 * Delete an application scoped by owner.
 *
 * CASCADE DELETION POLICY:
 * Permanently removes the application and ALL of its associated child records:
 * - Health check telemetry (HealthCheck collection)
 * - Incidents (added in Step 6)
 * - Deployment records (added in Step 7)
 * This prevents orphaned documents and maintains referential integrity.
 */
export const deleteApplication = async (ownerId, id) => {
  const application = await Application.findOne({ _id: id, ownerId });
  if (!application) throw new AppError('Application not found', 404);

  // Cascade: delete all health check records for this application
  await HealthCheck.deleteMany({ applicationId: id });

  // Cascade: delete all incidents (active and resolved) for this application
  await Incident.deleteMany({ applicationId: id });

  // Cascade: delete all deployment records for this application
  await Deployment.deleteMany({ applicationId: id });

  await Application.deleteOne({ _id: id, ownerId });

  return { id };
};
