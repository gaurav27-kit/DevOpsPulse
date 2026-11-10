import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Rate limiter for sensitive authentication endpoints (login, register).
 * Prevents brute-force credential attacks while allowing test configuration.
 */
export const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: () => (process.env.AUTH_RATE_LIMIT_MAX ? Number(process.env.AUTH_RATE_LIMIT_MAX) : env.AUTH_RATE_LIMIT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes'
  }
});

/**
 * Rate limiter for manual health-check trigger endpoint.
 * Prevents abuse while allowing reasonable manual testing and test configuration.
 */
export const manualCheckLimiter = rateLimit({
  windowMs: env.CHECK_RATE_LIMIT_WINDOW_MS,
  max: () => (process.env.CHECK_RATE_LIMIT_MAX ? Number(process.env.CHECK_RATE_LIMIT_MAX) : env.CHECK_RATE_LIMIT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many manual check requests. Please wait before triggering another check.'
  }
});

/**
 * Rate limiter for notification channel test endpoint (POST /channels/:id/test).
 * Limits to 3 test dispatches per minute per user.
 */
export const notificationTestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: () =>
    process.env.NOTIFY_TEST_RATE_LIMIT_MAX
      ? Number(process.env.NOTIFY_TEST_RATE_LIMIT_MAX)
      : 3,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many test notification requests. Rate limit is 3 per minute.'
  }
});
