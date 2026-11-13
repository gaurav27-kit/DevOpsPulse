import { Router } from 'express';
import { z } from 'zod';
import * as maintenanceController from '../controllers/maintenanceController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

const maintenanceIdParamsSchema = z.object({
  maintenanceId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid maintenance ID format')
});

router.patch(
  '/:maintenanceId/end',
  validate({ params: maintenanceIdParamsSchema }),
  maintenanceController.endMaintenance
);

router.get(
  '/:maintenanceId',
  validate({ params: maintenanceIdParamsSchema }),
  maintenanceController.getMaintenanceById
);

export default router;

