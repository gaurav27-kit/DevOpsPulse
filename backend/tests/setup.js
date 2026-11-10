import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { env } from '../src/config/env.js';

// Enforce test environment flags
process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.CHECK_RATE_LIMIT_MAX = '1000';

/**
 * Extracts database name from a MongoDB connection URI.
 */
export function extractDbName(uri) {
  if (!uri || typeof uri !== 'string') return '';
  const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const pathPart = withoutProtocol.split('?')[0];
  const segments = pathPart.split('/');
  return segments.length > 1 ? segments.pop() : '';
}

/**
 * Validates that the targeted database name ends with '_test'.
 * Refuses execution if this invariant fails, protecting production and dev data.
 */
export function assertSafeTestDatabase(uri) {
  const dbName = extractDbName(uri);
  if (!dbName || !dbName.endsWith('_test')) {
    throw new Error(
      `[FATAL] Refusing to run tests: targeted database "${dbName}" does not end with "_test". ` +
      `Tests must target a dedicated test database (e.g. devopspulse_test) to prevent accidental data loss.`
    );
  }
}

beforeAll(async () => {
  const testUri = env.MONGO_URI_TEST;
  assertSafeTestDatabase(testUri);

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(testUri);
  }

  // Double check the connected database name
  const connectedDb = mongoose.connection.name;
  if (!connectedDb || !connectedDb.endsWith('_test')) {
    await mongoose.disconnect();
    throw new Error(
      `[FATAL] Connected database "${connectedDb}" does not end with "_test". Disconnected for safety.`
    );
  }
});

beforeEach(async () => {
  // Clean all collections in test database between tests for complete isolation
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

