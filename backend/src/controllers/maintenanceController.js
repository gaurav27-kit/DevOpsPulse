import * as maintenanceService from '../services/maintenanceService.js';

/**
 * POST /api/v1/applications/:id/maintenance
 * Creates a maintenance window (manual activation or future scheduled).
 */
export async function createMaintenance(req, res, next) {
  try {
    const maintenanceWindow = await maintenanceService.createMaintenanceWindow({
      applicationId: req.params.id,
      userId: req.user._id,
      startAt: req.body.startAt,
      endAt: req.body.endAt,
      reason: req.body.reason
    });

    res.status(201).json({
      success: true,
      data: { maintenanceWindow }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/applications/:id/maintenance
 * Retrieves paginated maintenance history for an application.
 */
export async function getMaintenanceHistory(req, res, next) {
  try {
    const { page, limit, status } = req.query;
    const result = await maintenanceService.getMaintenanceHistory(
      req.params.id,
      req.user._id,
      { page, limit, status }
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/applications/:id/maintenance/active
 * Retrieves the currently active maintenance window for an application (or null).
 */
export async function getActiveMaintenance(req, res, next) {
  try {
    const activeWindow = await maintenanceService.getActiveMaintenanceWindow(
      req.params.id,
      req.user._id
    );

    res.status(200).json({
      success: true,
      data: { activeWindow }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/maintenance/:maintenanceId
 * Retrieves a single maintenance window by its ID.
 */
export async function getMaintenanceById(req, res, next) {
  try {
    const maintenanceWindow = await maintenanceService.getMaintenanceById(
      req.params.maintenanceId,
      req.user._id
    );

    res.status(200).json({
      success: true,
      data: { maintenanceWindow }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/maintenance/:maintenanceId/end
 * Manually ends an active maintenance window or cancels a scheduled maintenance window.
 */
export async function endMaintenance(req, res, next) {
  try {
    const maintenanceWindow = await maintenanceService.endMaintenanceWindow(
      req.params.maintenanceId,
      req.user._id
    );

    res.status(200).json({
      success: true,
      data: { maintenanceWindow }
    });
  } catch (err) {
    next(err);
  }
}

