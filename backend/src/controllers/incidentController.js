import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listIncidents,
  getIncident,
  changeIncidentStatus,
  addIncidentNote
} from '../services/incidentService.js';

/**
 * GET /api/v1/incidents
 * Paginated incident list with filters and sorting.
 */
export const listIncidentsHandler = asyncHandler(async (req, res) => {
  // Use validated + coerced query (from validate middleware)
  const result = await listIncidents(req.user._id, req.validated?.query ?? req.query);
  res.status(200).json({ success: true, data: result });
});

/**
 * GET /api/v1/incidents/:id
 * Full incident detail with chronological update timeline.
 */
export const getIncidentHandler = asyncHandler(async (req, res) => {
  const incident = await getIncident(req.user._id, req.params.id);
  res.status(200).json({ success: true, data: { incident } });
});

/**
 * PATCH /api/v1/incidents/:id/status
 * Manually change incident status with optional note.
 * Allowed: open->investigating, open->resolved, investigating->resolved.
 */
export const changeStatusHandler = asyncHandler(async (req, res) => {
  const incident = await changeIncidentStatus(req.user._id, req.params.id, req.body);
  res.status(200).json({ success: true, data: { incident } });
});

/**
 * POST /api/v1/incidents/:id/updates
 * Add a manual note to the incident timeline.
 */
export const addNoteHandler = asyncHandler(async (req, res) => {
  const incident = await addIncidentNote(
    req.user._id,
    req.params.id,
    req.body,
    req.user._id
  );
  res.status(201).json({ success: true, data: { incident } });
});
