import { asyncHandler } from '../utils/asyncHandler.js';
import { getApplicationUptime, getDashboardSummary } from '../services/analyticsService.js';

/**
 * GET /api/v1/applications/:id/uptime?range=24h
 */
export const getUptimeHandler = asyncHandler(async (req, res) => {
  const { range = '24h' } = req.validated?.query ?? req.query;
  const result = await getApplicationUptime(req.user._id, req.params.id, range);
  res.status(200).json({ success: true, data: result });
});

/**
 * GET /api/v1/dashboard/summary?range=24h
 */
export const getDashboardSummaryHandler = asyncHandler(async (req, res) => {
  const { range = '24h' } = req.validated?.query ?? req.query;
  const result = await getDashboardSummary(req.user._id, range);
  res.status(200).json({ success: true, data: result });
});

