import { asyncHandler } from '../utils/asyncHandler.js';
import * as sloService from '../services/sloService.js';

/**
 * Create an SLO for a specific application.
 * POST /api/v1/applications/:id/slo
 */
export const createSlo = asyncHandler(async (req, res) => {
  const slo = await sloService.createSlo(
    req.user._id,
    req.params.id,
    req.body
  );

  res.status(201).json({
    success: true,
    data: slo
  });
});

/**
 * Retrieve the SLO and evaluated metrics for a specific application.
 * GET /api/v1/applications/:id/slo
 */
export const getSlo = asyncHandler(async (req, res) => {
  const result = await sloService.getSloForApplication(
    req.user._id,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: result
  });
});

/**
 * Update the SLO definition for a specific application.
 * PATCH /api/v1/applications/:id/slo
 */
export const updateSlo = asyncHandler(async (req, res) => {
  const slo = await sloService.updateSlo(
    req.user._id,
    req.params.id,
    req.body
  );

  res.status(200).json({
    success: true,
    data: slo
  });
});

/**
 * Delete the SLO definition for a specific application.
 * DELETE /api/v1/applications/:id/slo
 */
export const deleteSlo = asyncHandler(async (req, res) => {
  const result = await sloService.deleteSlo(
    req.user._id,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: result
  });
});

/**
 * List all SLOs belonging to the authenticated user.
 * GET /api/v1/slos
 */
export const listSlos = asyncHandler(async (req, res) => {
  const query = req.validated?.query || req.query;
  const result = await sloService.listSlos(req.user._id, query);

  res.status(200).json({
    success: true,
    data: result
  });
});

