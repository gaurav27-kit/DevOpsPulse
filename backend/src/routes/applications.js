import { Router } from 'express';
import { z } from 'zod';
import * as applicationController from '../controllers/applicationController.js';
import * as healthCheckController from '../controllers/healthCheckController.js';
import { createDeploymentHandler } from '../controllers/deploymentController.js';
import { getUptimeHandler } from '../controllers/analyticsController.js';
import * as sloController from '../controllers/sloController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { assertSafeUrlSyntax } from '../services/urlSafetyService.js';
import { manualCheckLimiter } from '../middleware/rateLimiters.js';

const router = Router();

// Validate MongoDB ObjectId format in route parameters
const mongoIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid application ID format')
});

// Zod transformer that runs SSRF safe URL syntax checks
const safeUrlSchema = z
  .string({ required_error: 'URL is required' })
  .trim()
  .transform((val, ctx) => {
    try {
      return assertSafeUrlSyntax(val);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err.message
      });
      return z.NEVER;
    }
  });

// Schema for creating an application - strictly rejects unrecognized keys (e.g. ownerId, status)
const createApplicationSchema = z
  .object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(60, 'Name must not exceed 60 characters'),
    url: safeUrlSchema,
    environment: z.enum(['production', 'staging', 'development']).default('production'),
    checkIntervalSeconds: z
      .number()
      .int('Interval must be an integer')
      .min(30, 'Interval must be at least 30 seconds')
      .max(3600, 'Interval cannot exceed 3600 seconds')
      .default(300),
    timeoutMs: z
      .number()
      .int('Timeout must be an integer')
      .min(1000, 'Timeout must be at least 1000 ms')
      .max(30000, 'Timeout cannot exceed 30000 ms')
      .default(10000)
  })
  .strict();

// Schema for updating an application - all fields optional but at least one must be provided
const updateApplicationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(60, 'Name must not exceed 60 characters')
      .optional(),
    url: z
      .string()
      .trim()
      .transform((val, ctx) => {
        try {
          return assertSafeUrlSyntax(val);
        } catch (err) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: err.message
          });
          return z.NEVER;
        }
      })
      .optional(),
    environment: z.enum(['production', 'staging', 'development']).optional(),
    checkIntervalSeconds: z
      .number()
      .int('Interval must be an integer')
      .min(30, 'Interval must be at least 30 seconds')
      .max(3600, 'Interval cannot exceed 3600 seconds')
      .optional(),
    timeoutMs: z
      .number()
      .int('Timeout must be an integer')
      .min(1000, 'Timeout must be at least 1000 ms')
      .max(30000, 'Timeout cannot exceed 30000 ms')
      .optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
  });

// Query params schema for listing applications
const listApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(50, 'Limit cannot exceed 50').default(10),
  sortBy: z
    .enum(['createdAt', 'name', 'status', 'lastCheckedAt'], {
      errorMap: () => ({ message: 'sortBy must be one of: createdAt, name, status, lastCheckedAt' })
    })
    .default('createdAt'),
  order: z
    .enum(['asc', 'desc'], {
      errorMap: () => ({ message: 'order must be either asc or desc' })
    })
    .default('desc'),
  status: z.enum(['unknown', 'up', 'degraded', 'down']).optional(),
  environment: z.enum(['production', 'staging', 'development']).optional(),
  q: z.string().max(100, 'Search query cannot exceed 100 characters').optional()
});

// Query params schema for health-check history
const listHealthChecksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit cannot exceed 100').default(20),
  order: z.enum(['asc', 'desc']).default('desc'),
  success: z
    .string()
    .transform((v) => v === 'true' ? true : v === 'false' ? false : undefined)
    .optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional()
});

// Schema for creating a deployment record under an application
// NOTE: "source" and "ownerId" are intentionally absent — they are server-set only.
const createDeploymentSchema = z
  .object({
    version: z.string().min(1).max(50),
    commitSha: z
      .string()
      .regex(/^[0-9a-fA-F]{7,40}$/, 'commitSha must be 7–40 hexadecimal characters')
      .toLowerCase()
      .optional(),
    branch: z
      .string()
      .min(1)
      .max(100)
      .regex(
        /^[a-zA-Z0-9._\-\/]+$/,
        'Branch name may only contain letters, digits, and . _ - /'
      )
      .optional(),
    environment: z.enum(['production', 'staging', 'development']).optional(),
    status: z
      .enum(['pending', 'in_progress', 'success', 'failed', 'rolled_back'])
      .optional()
      .default('success'),
    startedAt: z
      .string()
      .datetime({ offset: true })
      .optional()
      .refine(
        (val) => !val || new Date(val) <= new Date(Date.now() + 5 * 60 * 1000),
        'startedAt must not be more than 5 minutes in the future'
      ),
    completedAt: z.string().datetime({ offset: true }).optional(),
    description: z.string().max(500).optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    // completedAt must not be earlier than startedAt (or now if startedAt omitted)
    if (data.completedAt) {
      const effectiveStartedAt = data.startedAt ? new Date(data.startedAt) : new Date();
      if (new Date(data.completedAt) < effectiveStartedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['completedAt'],
          message: 'completedAt must be greater than or equal to startedAt'
        });
      }
    }
    // completedAt must be absent when status is pending or in_progress
    if (data.completedAt && (data.status === 'pending' || data.status === 'in_progress')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['completedAt'],
        message: 'completedAt must not be set when status is pending or in_progress'
      });
    }
  });

// Query schema for uptime range
const uptimeQuerySchema = z.object({
  range: z
    .enum(['24h', '7d', '30d'], {
      errorMap: () => ({ message: 'range must be one of: 24h, 7d, 30d' })
    })
    .optional()
    .default('24h')
});

// Require authentication for all application management endpoints
router.use(requireAuth);

router.get(
  '/',
  validate({ query: listApplicationsQuerySchema }),
  applicationController.listApplications
);

router.post(
  '/',
  validate({ body: createApplicationSchema }),
  applicationController.createApplication
);

router.get(
  '/:id',
  validate({ params: mongoIdParamsSchema }),
  applicationController.getApplication
);

router.patch(
  '/:id',
  validate({ params: mongoIdParamsSchema, body: updateApplicationSchema }),
  applicationController.updateApplication
);

router.delete(
  '/:id',
  validate({ params: mongoIdParamsSchema }),
  applicationController.deleteApplication
);

// Health-check sub-routes
router.post(
  '/:id/check',
  manualCheckLimiter,
  validate({ params: mongoIdParamsSchema }),
  healthCheckController.triggerCheck
);

router.get(
  '/:id/health-checks',
  validate({ params: mongoIdParamsSchema, query: listHealthChecksQuerySchema }),
  healthCheckController.listHealthChecks
);

// Deployment sub-route
router.post(
  '/:id/deployments',
  validate({ params: mongoIdParamsSchema, body: createDeploymentSchema }),
  createDeploymentHandler
);

// Uptime analytics sub-route
router.get(
  '/:id/uptime',
  validate({ params: mongoIdParamsSchema, query: uptimeQuerySchema }),
  getUptimeHandler
);

// SLO sub-routes schemas
const createSloSchema = z
  .object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(1, 'Name must be at least 1 character')
      .max(60, 'Name cannot exceed 60 characters'),
    targetPercent: z
      .number({ required_error: 'targetPercent is required' })
      .min(90.0, 'Target percent must be at least 90%')
      .max(99.999, 'Target percent cannot exceed 99.999%')
      .refine(
        (val) => {
          const str = String(val);
          const dec = str.split('.')[1];
          return !dec || dec.length <= 3;
        },
        'Target percent cannot have more than 3 decimal places'
      ),
    windowDays: z.union([z.literal(7), z.literal(30)], {
      errorMap: () => ({ message: 'Window days must be either 7 or 30' })
    })
  })
  .strict();

const updateSloSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name must be at least 1 character')
      .max(60, 'Name cannot exceed 60 characters')
      .optional(),
    targetPercent: z
      .number()
      .min(90.0, 'Target percent must be at least 90%')
      .max(99.999, 'Target percent cannot exceed 99.999%')
      .refine(
        (val) => {
          if (val === undefined) return true;
          const str = String(val);
          const dec = str.split('.')[1];
          return !dec || dec.length <= 3;
        },
        'Target percent cannot have more than 3 decimal places'
      )
      .optional(),
    windowDays: z
      .union([z.literal(7), z.literal(30)], {
        errorMap: () => ({ message: 'Window days must be either 7 or 30' })
      })
      .optional()
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  );

// SLO sub-routes
router.post(
  '/:id/slo',
  validate({ params: mongoIdParamsSchema, body: createSloSchema }),
  sloController.createSlo
);

router.get(
  '/:id/slo',
  validate({ params: mongoIdParamsSchema }),
  sloController.getSlo
);

router.patch(
  '/:id/slo',
  validate({ params: mongoIdParamsSchema, body: updateSloSchema }),
  sloController.updateSlo
);

router.delete(
  '/:id/slo',
  validate({ params: mongoIdParamsSchema }),
  sloController.deleteSlo
);

export default router;

