import { asyncHandler } from '../utils/asyncHandler.js';
import * as healthCheckApiService from '../services/healthCheckApiService.js';

/**
 * Trigger a manual health check for an application.
 */
export const triggerCheck = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { healthCheck, application } = await healthCheckApiService.triggerManualCheck(
    req.user._id,
    id
  );

  res.status(200).json({
    success: true,
    message: 'Health check completed',
    data: { healthCheck, application }
  });
});

/**
 * List health check history for an application.
 */
export const listHealthChecks = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await healthCheckApiService.listHealthChecks(
    req.user._id,
    id,
    req.validated?.query || req.query
  );

  res.status(200).json({
    success: true,
    data: {
      healthChecks: result.items,
      pagination: result.pagination
    }
  });
});

