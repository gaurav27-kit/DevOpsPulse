import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listDeploymentsHandler, getDeploymentHandler } from '../controllers/deploymentController.js';

const router = Router();

router.use(requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid deployment ID')
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  applicationId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'applicationId must be a valid ObjectId')
    .optional(),
  status: z.enum(['pending', 'in_progress', 'success', 'failed', 'rolled_back']).optional(),
  environment: z.enum(['production', 'staging', 'development']).optional(),
  branch: z.string().max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sortBy: z.enum(['startedAt', 'createdAt']).optional().default('startedAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc')
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/v1/deployments
router.get('/', validate({ query: listQuerySchema }), listDeploymentsHandler);

// GET /api/v1/deployments/:id
router.get('/:id', validate({ params: idParamSchema }), getDeploymentHandler);

export default router;

