import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Support running from both repository root and backend/ subdirectory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'CLIENT_ORIGIN'];

// In production, NOTIFICATION_ENCRYPTION_KEY is required and must be 32 bytes (64 hex characters)
if (process.env.NODE_ENV === 'production') {
  requiredEnvVars.push('NOTIFICATION_ENCRYPTION_KEY');
}

// Verify that all critical environment variables are present before server starts (except in test mode)
if (process.env.NODE_ENV !== 'test') {
  const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missingEnvVars.length > 0) {
    console.error(
      `[FATAL] Missing required environment variable(s): ${missingEnvVars.join(', ')}.\n` +
      `Please configure them in your .env file or deployment environment.`
    );
    process.exit(1);
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NOTIFICATION_ENCRYPTION_KEY &&
    !/^[0-9a-fA-F]{64}$/.test(process.env.NOTIFICATION_ENCRYPTION_KEY)
  ) {
    console.error(
      `[FATAL] NOTIFICATION_ENCRYPTION_KEY must be a valid 32-byte hex string (64 characters).\n` +
      `Generate one using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
    process.exit(1);
  }
}

export const env = Object.freeze({
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGO_URI: process.env.MONGO_URI,
  MONGO_URI_TEST: process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/devopspulse_test',
  JWT_SECRET: process.env.JWT_SECRET || 'devopspulse_fallback_secret_for_tests_only_32_chars',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // Health-check monitoring & scheduler configuration
  SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED !== 'false',
  SCHEDULER_TICK_MS: Number(process.env.SCHEDULER_TICK_MS) || 10000,
  MAX_CONCURRENT_CHECKS: Number(process.env.MAX_CONCURRENT_CHECKS) || 5,
  SLOW_RESPONSE_MS: Number(process.env.SLOW_RESPONSE_MS) || 2000,
  HEALTHCHECK_RETENTION_DAYS: Number(process.env.HEALTHCHECK_RETENTION_DAYS) || 30,

  // Rate Limiting (configurable for testing)
  AUTH_RATE_LIMIT_WINDOW_MS: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  AUTH_RATE_LIMIT_MAX:
    Number(process.env.AUTH_RATE_LIMIT_MAX) ||
    (process.env.NODE_ENV === 'production' ? 20 : 1000),
  CHECK_RATE_LIMIT_WINDOW_MS: Number(process.env.CHECK_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  CHECK_RATE_LIMIT_MAX: Number(process.env.CHECK_RATE_LIMIT_MAX) || 6,

  // Alerting & Notifications
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || '"DevOpsPulse Alerts" <alerts@example.com>',
  NOTIFICATION_ENCRYPTION_KEY:
    process.env.NOTIFICATION_ENCRYPTION_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  NOTIFY_RATE_PER_HOUR: Number(process.env.NOTIFY_RATE_PER_HOUR) || 30,
  NOTIFY_COOLDOWN_MINUTES: Number(process.env.NOTIFY_COOLDOWN_MINUTES) || 5
});
