import express from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { handleContactSubmission, contactValidationSchema } from '../controllers/contactController.js';

export const contactLimiter = rateLimit({
  windowMs: env.CONTACT_RATE_LIMIT_WINDOW_MS,
  max: () =>
    process.env.CONTACT_RATE_LIMIT_MAX
      ? Number(process.env.CONTACT_RATE_LIMIT_MAX)
      : env.CONTACT_RATE_LIMIT_MAX,
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many contact messages sent from this IP. Please try again later.'
  }
});

const router = express.Router();

router.post('/', contactLimiter, validate({ body: contactValidationSchema }), handleContactSubmission);

export default router;
