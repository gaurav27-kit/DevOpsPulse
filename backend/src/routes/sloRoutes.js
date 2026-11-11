import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as sloController from '../controllers/sloController.js';

const router = Router();

const listSlosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['healthy', 'at_risk', 'breached', 'insufficient_data']).optional(),
  sortBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc')
});

router.use(requireAuth);

router.get(
  '/',
  validate({ query: listSlosQuerySchema }),
  sloController.listSlos
);

export default router;
