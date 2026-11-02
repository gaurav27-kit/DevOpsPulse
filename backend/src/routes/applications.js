import { Router } from 'express';
import { z } from 'zod';
import * as applicationController from '../controllers/applicationController.js';
import * as healthCheckController from '../controllers/healthCheckController.js';
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

export default router;

