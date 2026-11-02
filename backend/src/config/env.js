import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Support running from both repository root and backend/ subdirectory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'CLIENT_ORIGIN'];

// Verify that all critical environment variables are present before server starts
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(
    `[FATAL] Missing required environment variable(s): ${missingEnvVars.join(', ')}.\n` +
    `Please configure them in your .env file or deployment environment.`
  );
  process.exit(1);
}

export const env = Object.freeze({
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,

  // Health-check monitoring & scheduler configuration
  SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED !== 'false',
  SCHEDULER_TICK_MS: Number(process.env.SCHEDULER_TICK_MS) || 10000,
  MAX_CONCURRENT_CHECKS: Number(process.env.MAX_CONCURRENT_CHECKS) || 5,
  SLOW_RESPONSE_MS: Number(process.env.SLOW_RESPONSE_MS) || 2000,
  HEALTHCHECK_RETENTION_DAYS: Number(process.env.HEALTHCHECK_RETENTION_DAYS) || 30
});
