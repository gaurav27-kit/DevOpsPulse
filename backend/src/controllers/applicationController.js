import { asyncHandler } from '../utils/asyncHandler.js';
import * as applicationService from '../services/applicationService.js';

/**
 * Create a new monitored application.
 */
export const createApplication = asyncHandler(async (req, res) => {
  const application = await applicationService.createApplication(req.user._id, req.body);

  res.status(201).json({
    success: true,
    message: 'Application created successfully',
    data: { application }
  });
});

/**
 * List applications for the authenticated user.
 */
export const listApplications = asyncHandler(async (req, res) => {
  const result = await applicationService.listApplications(
    req.user._id,
    req.validated?.query || req.query
  );

  res.status(200).json({
    success: true,
    data: {
      applications: result.items,
      pagination: result.pagination
    }
  });
});

/**
 * Retrieve an application by its ID.
 */
export const getApplication = asyncHandler(async (req, res) => {
  const application = await applicationService.getApplication(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    data: { application }
  });
});

/**
 * Update an existing application's configuration.
 */
export const updateApplication = asyncHandler(async (req, res) => {
  const application = await applicationService.updateApplication(
    req.user._id,
    req.params.id,
    req.body
  );

  res.status(200).json({
    success: true,
    message: 'Application updated successfully',
    data: { application }
  });
});

/**
 * Delete an application.
 */
export const deleteApplication = asyncHandler(async (req, res) => {
  await applicationService.deleteApplication(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    message: 'Application deleted successfully'
  });
});

