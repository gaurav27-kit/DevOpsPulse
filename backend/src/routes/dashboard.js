import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getDashboardSummaryHandler } from '../controllers/analyticsController.js';

const router = Router();

router.use(requireAuth);

const rangeQuerySchema = z.object({
  range: z
    .enum(['24h', '7d', '30d'], {
      errorMap: () => ({ message: 'range must be one of: 24h, 7d, 30d' })
    })
    .optional()
    .default('24h')
});

// GET /api/v1/dashboard/summary
router.get('/summary', validate({ query: rangeQuerySchema }), getDashboardSummaryHandler);

export default router;

