import mongoose from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { NotificationChannel } from '../models/NotificationChannel.js';
import { NotificationDelivery } from '../models/NotificationDelivery.js';
import {
  encrypt,
  generateSigningSecret,
  maskWebhookUrl
} from '../utils/crypto.js';
import { assertSafeDestination, assertSafeUrlSyntax } from '../services/urlSafetyService.js';
import { sendTestNotification, isSmtpConfigured } from '../services/notificationService.js';

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ID format'
});

export const channelParamsSchema = z.object({
  id: objectIdSchema
}).strict();

export const createChannelSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(60, 'Name must not exceed 60 characters'),
    type: z.enum(['email', 'webhook'], {
      errorMap: () => ({ message: 'Type must be email or webhook' })
    }),
    enabled: z.boolean().optional().default(true),
    events: z
      .array(z.enum(['incident_opened', 'incident_resolved']))
      .min(1, 'At least one event (incident_opened or incident_resolved) must be selected'),
    minSeverity: z.enum(['low', 'medium', 'high', 'critical']).optional().default('low'),
    url: z.string().url().max(2048).optional(),
    format: z.enum(['generic', 'slack']).optional().default('generic')
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === 'webhook' && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'Webhook URL is required for webhook channels'
      });
    }
  });

export const updateChannelSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    enabled: z.boolean().optional(),
    events: z
      .array(z.enum(['incident_opened', 'incident_resolved']))
      .min(1)
      .optional(),
    minSeverity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    url: z.string().url().max(2048).optional(),
    format: z.enum(['generic', 'slack']).optional()
  })
  .strict();

export const listDeliveriesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    channelId: objectIdSchema.optional(),
    status: z.enum(['pending', 'sent', 'failed', 'skipped']).optional(),
    event: z.enum(['incident_opened', 'incident_resolved', 'test']).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    order: z.enum(['asc', 'desc']).optional().default('desc')
  })
  .strict();

/**
 * Validates a webhook URL against SSRF and protocol policies.
 */
async function validateWebhookUrl(rawUrl) {
  try {
    assertSafeUrlSyntax(rawUrl);
    const parsed = new URL(rawUrl);

    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new AppError('Webhook URLs must use HTTPS in production', 400, [
        { field: 'url', message: 'Webhook URLs must use HTTPS in production' }
      ]);
    }

    return await assertSafeDestination(rawUrl);
  } catch (err) {
    if (err instanceof AppError && (!err.errors || err.errors.length === 0)) {
      err.errors = [{ field: 'url', message: err.message }];
    }
    throw err;
  }
}

/**
 * List all notification channels belonging to the authenticated user.
 */
export const listChannels = asyncHandler(async (req, res) => {
  const channels = await NotificationChannel.find({ ownerId: req.user._id })
    .select('+urlEncrypted')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: {
      channels: channels.map((c) => c.toPublicJSON()),
      isSmtpConfigured: isSmtpConfigured()
    }
  });
});

/**
 * Create a new notification channel (email or webhook).
 */
export const createChannel = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;

  // Max 5 channels per user limit
  const count = await NotificationChannel.countDocuments({ ownerId });
  if (count >= 5) {
    throw new AppError('Maximum of 5 notification channels allowed per account', 409);
  }

  const { name, type, enabled, events, minSeverity, url, format } = req.body;

  let urlEncrypted = null;
  let secretEncrypted = null;
  let signingSecret = null;

  if (type === 'email') {
    if (!isSmtpConfigured()) {
      throw new AppError('Email is not configured on this server', 409);
    }
  } else if (type === 'webhook') {
    const safeUrl = await validateWebhookUrl(url);
    signingSecret = generateSigningSecret();

    urlEncrypted = encrypt(safeUrl);
    secretEncrypted = encrypt(signingSecret);
  }

  const channel = await NotificationChannel.create({
    ownerId,
    name,
    type,
    enabled,
    events,
    minSeverity,
    urlEncrypted,
    secretEncrypted,
    format
  });

  const responseData = { channel: channel.toPublicJSON() };
  if (type === 'webhook') {
    // Return signingSecret once at creation time ONLY
    responseData.signingSecret = signingSecret;
  }

  res.status(201).json({
    success: true,
    message: 'Notification channel created successfully',
    data: responseData
  });
});

/**
 * Update an existing notification channel.
 */
export const updateChannel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user._id;

  const channel = await NotificationChannel.findOne({ _id: id, ownerId }).select('+urlEncrypted +secretEncrypted');
  if (!channel) {
    throw new AppError('Notification channel not found', 404);
  }

  const { name, enabled, events, minSeverity, url, format } = req.body;

  if (name !== undefined) channel.name = name;
  if (enabled !== undefined) channel.enabled = enabled;
  if (events !== undefined) channel.events = events;
  if (minSeverity !== undefined) channel.minSeverity = minSeverity;

  if (channel.type === 'webhook') {
    if (format !== undefined) channel.format = format;
    if (url !== undefined) {
      const safeUrl = await validateWebhookUrl(url);
      channel.urlEncrypted = encrypt(safeUrl);
    }
  }

  await channel.save();

  res.status(200).json({
    success: true,
    message: 'Notification channel updated successfully',
    data: {
      channel: channel.toPublicJSON()
    }
  });
});

/**
 * Rotate signing secret for a webhook channel (returns new secret once).
 */
export const rotateChannelSecret = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user._id;

  const channel = await NotificationChannel.findOne({ _id: id, ownerId }).select('+secretEncrypted');
  if (!channel) {
    throw new AppError('Notification channel not found', 404);
  }

  if (channel.type !== 'webhook') {
    throw new AppError('Only webhook channels have signing secrets', 400);
  }

  const newSecret = generateSigningSecret();
  channel.secretEncrypted = encrypt(newSecret);
  await channel.save();

  res.status(200).json({
    success: true,
    message: 'Webhook signing secret rotated successfully',
    data: {
      signingSecret: newSecret
    }
  });
});

/**
 * Delete a notification channel and cascade delete its delivery logs.
 */
export const deleteChannel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user._id;

  const channel = await NotificationChannel.findOneAndDelete({ _id: id, ownerId });
  if (!channel) {
    throw new AppError('Notification channel not found', 404);
  }

  // Cascade delete delivery logs associated with this channel
  await NotificationDelivery.deleteMany({ channelId: id });

  res.status(200).json({
    success: true,
    message: 'Notification channel deleted successfully'
  });
});

/**
 * Send a test alert through the real dispatch path.
 */
export const testChannel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user._id;

  const channel = await NotificationChannel.findOne({ _id: id, ownerId }).select('+urlEncrypted +secretEncrypted');
  if (!channel) {
    throw new AppError('Notification channel not found', 404);
  }

  const result = await sendTestNotification(channel, req.user);

  res.status(200).json({
    success: result.success,
    message: result.success ? 'Test notification sent successfully' : 'Test notification failed',
    data: {
      status: result.status,
      attempts: result.attempts,
      errorType: result.errorType,
      httpStatus: result.httpStatus
    }
  });
});

/**
 * Retrieve paginated notification delivery audit logs.
 */
export const listDeliveries = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;
  const {
    page,
    limit,
    channelId,
    status,
    event,
    from,
    to,
    order
  } = req.validated?.query || req.query;

  const filter = { ownerId };

  if (channelId) filter.channelId = channelId;
  if (status) filter.status = status;
  if (event) filter.event = event;

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const sortOrder = order === 'asc' ? 1 : -1;
  const skip = (page - 1) * limit;

  const [deliveries, total] = await Promise.all([
    NotificationDelivery.find(filter)
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate('channelId', 'name type')
      .populate('applicationId', 'name')
      .populate('incidentId', 'title severity status')
      .lean(),
    NotificationDelivery.countDocuments(filter)
  ]);

  res.status(200).json({
    success: true,
    data: {
      deliveries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    }
  });
});
