import mongoose from 'mongoose';
import { Deployment } from '../models/Deployment.js';
import { Application } from '../models/Application.js';
import { AppError } from '../utils/AppError.js';

const SORT_ALLOWLIST = new Set(['startedAt', 'createdAt']);

/**
 * Create a deployment record for an application owned by the user.
 * `source` is always set server-side to "manual"; clients cannot supply it.
 */
export async function createDeployment(ownerId, applicationId, data) {
  // Verify application ownership (404 for both non-existent and wrong-owner)
  const app = await Application.findOne({ _id: applicationId, ownerId }).lean();
  if (!app) throw new AppError('Application not found', 404);

  const startedAt = data.startedAt ? new Date(data.startedAt) : new Date();
  const completedAt = data.completedAt ? new Date(data.completedAt) : null;

  const deployment = await Deployment.create({
    applicationId,
    ownerId,
    version: data.version,
    commitSha: data.commitSha ? data.commitSha.toLowerCase() : null,
    branch: data.branch ?? null,
    environment: data.environment ?? app.environment,
    status: data.status ?? 'success',
    source: 'manual', // Always server-set; never from client
    startedAt,
    completedAt,
    description: data.description ?? null
  });

  return deployment;
}

/**
 * Paginated list of deployments scoped by ownerId.
 */
export async function listDeployments(ownerId, query = {}) {
  const {
    page = 1,
    limit = 10,
    applicationId,
    status,
    environment,
    branch,
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
  if (environment) filter.environment = environment;
  if (branch) filter.branch = branch;

  if (applicationId) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      throw new AppError('applicationId must be a valid ObjectId', 400);
    }
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

  const [total, deployments] = await Promise.all([
    Deployment.countDocuments(filter),
    Deployment.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNum)
      .populate('applicationId', 'name url')
      .lean()
  ]);

  return {
    deployments,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
}

/**
 * Fetch a single deployment by ID, scoped by ownerId.
 */
export async function getDeployment(ownerId, id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Deployment not found', 404);

  const deployment = await Deployment.findOne({ _id: id, ownerId })
    .populate('applicationId', 'name url')
    .lean();

  if (!deployment) throw new AppError('Deployment not found', 404);
  return deployment;
}

