import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  listIncidentsHandler,
  getIncidentHandler,
  changeStatusHandler,
  addNoteHandler
} from '../controllers/incidentController.js';

const router = Router();

// All incident routes require authentication
router.use(requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const SORT_ALLOWLIST = ['startedAt', 'lastFailureAt', 'failureCount', 'severity'];

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  status: z.enum(['open', 'investigating', 'resolved']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  applicationId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'applicationId must be a valid ObjectId')
    .optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sortBy: z
    .enum(SORT_ALLOWLIST)
    .optional()
    .default('startedAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc')
});

const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid incident ID')
});

const changeStatusBodySchema = z
  .object({
    status: z.enum(['investigating', 'resolved']),
    note: z.string().max(1000).optional()
  })
  .strict();

const addNoteBodySchema = z
  .object({
    message: z.string().min(1).max(1000)
  })
  .strict();

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/v1/incidents
router.get('/', validate({ query: listQuerySchema }), listIncidentsHandler);

// GET /api/v1/incidents/:id
router.get('/:id', validate({ params: idParamSchema }), getIncidentHandler);

// PATCH /api/v1/incidents/:id/status
router.patch(
  '/:id/status',
  validate({ params: idParamSchema, body: changeStatusBodySchema }),
  changeStatusHandler
);

// POST /api/v1/incidents/:id/updates
router.post(
  '/:id/updates',
  validate({ params: idParamSchema, body: addNoteBodySchema }),
  addNoteHandler
);

export default router;
