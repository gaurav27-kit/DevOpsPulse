import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { notificationTestLimiter } from '../middleware/rateLimiters.js';
import {
  listChannels,
  createChannel,
  updateChannel,
  rotateChannelSecret,
  deleteChannel,
  testChannel,
  listDeliveries,
  createChannelSchema,
  updateChannelSchema,
  channelParamsSchema,
  listDeliveriesQuerySchema
} from '../controllers/notificationController.js';

const router = express.Router();

// All notification routes require authentication
router.use(requireAuth);

// Channels endpoints
router.get('/channels', listChannels);

router.post(
  '/channels',
  validate({ body: createChannelSchema }),
  createChannel
);

router.patch(
  '/channels/:id',
  validate({ params: channelParamsSchema, body: updateChannelSchema }),
  updateChannel
);

router.post(
  '/channels/:id/rotate-secret',
  validate({ params: channelParamsSchema }),
  rotateChannelSecret
);

router.delete(
  '/channels/:id',
  validate({ params: channelParamsSchema }),
  deleteChannel
);

router.post(
  '/channels/:id/test',
  notificationTestLimiter,
  validate({ params: channelParamsSchema }),
  testChannel
);

// Deliveries audit trail
router.get(
  '/deliveries',
  validate({ query: listDeliveriesQuerySchema }),
  listDeliveries
);

export default router;

