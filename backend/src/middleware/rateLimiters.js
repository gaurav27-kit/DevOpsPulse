import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for sensitive authentication endpoints (login, register).
 * Prevents brute-force credential attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes'
  }
});

/**
 * Rate limiter for manual health-check trigger endpoint.
 * 6 requests per minute per IP prevents abuse while allowing reasonable manual testing.
 */
export const manualCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many manual check requests. Please wait before triggering another check.'
  }
});

