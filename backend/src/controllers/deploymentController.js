import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createDeployment,
  listDeployments,
  getDeployment
} from '../services/deploymentService.js';

/**
 * POST /api/v1/applications/:id/deployments
 */
export const createDeploymentHandler = asyncHandler(async (req, res) => {
  const deployment = await createDeployment(req.user._id, req.params.id, req.body);
  res.status(201).json({ success: true, data: { deployment } });
});

/**
 * GET /api/v1/deployments
 */
export const listDeploymentsHandler = asyncHandler(async (req, res) => {
  const result = await listDeployments(req.user._id, req.validated?.query ?? req.query);
  res.status(200).json({ success: true, data: result });
});

/**
 * GET /api/v1/deployments/:id
 */
export const getDeploymentHandler = asyncHandler(async (req, res) => {
  const deployment = await getDeployment(req.user._id, req.params.id);
  res.status(200).json({ success: true, data: { deployment } });
});

