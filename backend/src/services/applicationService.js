import { Application } from '../models/Application.js';
import { AppError } from '../utils/AppError.js';

/**
 * Escapes special regex metacharacters in user search queries to prevent crashes or ReDoS.
 */
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Create a new monitored application for the authenticated owner.
 */
export const createApplication = async (ownerId, data) => {
  // Pre-emptively verify URL uniqueness per owner
  const existing = await Application.findOne({ ownerId, url: data.url });
  if (existing) {
    throw new AppError('You are already monitoring this URL', 409, [
      { field: 'url', message: 'You are already monitoring this URL' }
    ]);
  }

  // Initial check is scheduled to run immediately upon creation
  const nextCheckAt = new Date();

  const application = await Application.create({
    ...data,
    ownerId,
    status: 'unknown',
    lastCheckedAt: null,
    lastSuccessfulAt: null,
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

  // Enforce tenant isolation by always scoping query to ownerId
  const filter = { ownerId };

  if (status) {
    filter.status = status;
  }

  if (environment) {
    filter.environment = environment;
  }

  // Safe substring matching across name and url
  if (q && q.trim()) {
    const escaped = escapeRegex(q.trim());
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { url: { $regex: escaped, $options: 'i' } }
    ];
  }

  const sortOrder = order === 'asc' ? 1 : -1;
  const skip = (page - 1) * limit;

  // Execute count and query concurrently to minimize database latency
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
 * Returns 404 if not found OR owned by another user to prevent cross-user enumeration.
 */
export const getApplication = async (ownerId, id) => {
  const application = await Application.findOne({ _id: id, ownerId });
  if (!application) {
    throw new AppError('Application not found', 404);
  }
  return application;
};

/**
 * Update application configuration.
 * - Changing the URL resets health status and forces an immediate check.
 * - Changing check interval resets nextCheckAt.
 */
export const updateApplication = async (ownerId, id, data) => {
  const application = await Application.findOne({ _id: id, ownerId });
  if (!application) {
    throw new AppError('Application not found', 404);
  }

  // If changing URL, ensure new URL is not already registered by this owner
  if (data.url && data.url !== application.url) {
    const duplicate = await Application.findOne({
      ownerId,
      url: data.url,
      _id: { $ne: id }
    });

    if (duplicate) {
      throw new AppError('You are already monitoring this URL', 409, [
        { field: 'url', message: 'You are already monitoring this URL' }
      ]);
    }

    application.url = data.url;
    // URL change resets status and history markers
    application.status = 'unknown';
    application.lastCheckedAt = null;
    application.lastSuccessfulAt = null;
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
    // Reschedule immediate check for the updated interval
    application.nextCheckAt = new Date();
  }

  await application.save();
  return application;
};

/**
 * Delete an application scoped by owner.
 *
 * CASCADE DELETION POLICY:
 * Deleting an application permanently removes all of its associated child records:
 * - Health check telemetry history (HealthCheck collection)
 * - Active and resolved outage records (Incident collection)
 * - Deployment timeline records (Deployment collection)
 * This prevents orphaned records and maintains strict referential integrity.
 *
 * TODO (Steps 5, 6, 8): Implement cascade delete operations when child models are built.
 */
export const deleteApplication = async (ownerId, id) => {
  const application = await Application.findOne({ _id: id, ownerId });
  if (!application) {
    throw new AppError('Application not found', 404);
  }

  // Cascade deletion will hook in here in upcoming steps
  await Application.deleteOne({ _id: id, ownerId });

  return { id };
};

