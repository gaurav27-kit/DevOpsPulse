import mongoose from '../../backend/node_modules/mongoose/index.js';
import { Application } from '../../backend/src/models/Application.js';
import { HealthCheck } from '../../backend/src/models/HealthCheck.js';
import { HealthCheckDaily } from '../../backend/src/models/HealthCheckDaily.js';
import { Slo } from '../../backend/src/models/Slo.js';

export function startOfUtcDay(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const uri = process.env.MONGO_URI_TEST || (process.env.MONGO_URI && process.env.MONGO_URI.endsWith('_test') ? process.env.MONGO_URI : 'mongodb://127.0.0.1:27017/devopspulse_test');

function extractDbName(str) {
  const withoutProtocol = str.replace(/^mongodb(\+srv)?:\/\//, '');
  const pathPart = withoutProtocol.split('?')[0];
  const segments = pathPart.split('/');
  return segments.length > 1 ? segments.pop() : '';
}

const dbName = extractDbName(uri);
if (!dbName.endsWith('_test')) {
  throw new Error(`[FATAL] Refusing to connect to non-test database in sloSeedHelper: "${dbName}"`);
}

let isConnected = false;

export async function ensureDbConnected() {
  if (!isConnected && mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
    isConnected = true;
  }
}

export async function closeDbConnection() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

/**
 * Seeds health checks for an application and keeps daily rollups in sync.
 * @param {string} applicationId
 * @param {string} ownerId
 * @param {Array<{ checkedAt: Date, success: boolean, responseTimeMs?: number, statusCode?: number }>} checksArray
 */
export async function seedAppWithChecks(applicationId, ownerId, checksArray) {
  await ensureDbConnected();

  if (!checksArray || checksArray.length === 0) return;

  const docs = checksArray.map((c) => ({
    applicationId,
    ownerId,
    checkedAt: c.checkedAt || new Date(),
    success: c.success !== undefined ? c.success : true,
    responseTimeMs: c.responseTimeMs || 100,
    statusCode: c.statusCode || (c.success ? 200 : 500)
  }));

  await HealthCheck.insertMany(docs);

  // Maintain daily rollups
  const dayGroups = new Map();
  for (const c of docs) {
    const day = startOfUtcDay(c.checkedAt).getTime();
    if (!dayGroups.has(day)) {
      dayGroups.set(day, { total: 0, good: 0 });
    }
    const g = dayGroups.get(day);
    g.total += 1;
    if (c.success) g.good += 1;
  }

  for (const [dayMs, stats] of dayGroups.entries()) {
    await HealthCheckDaily.updateOne(
      { applicationId, day: new Date(dayMs) },
      {
        $setOnInsert: { ownerId },
        $inc: { total: stats.total, good: stats.good }
      },
      { upsert: true }
    );
  }
}

/**
 * Creates or updates an SLO for an application.
 * @param {string} applicationId
 * @param {string} ownerId
 * @param {{ name?: string, targetPercent: number, windowDays: number }} sloConfig
 */
export async function seedSlo(applicationId, ownerId, sloConfig) {
  await ensureDbConnected();

  return await Slo.findOneAndUpdate(
    { applicationId },
    {
      $set: {
        applicationId,
        ownerId,
        name: sloConfig.name || 'Availability SLO',
        targetPercent: sloConfig.targetPercent,
        windowDays: sloConfig.windowDays
      }
    },
    { upsert: true, new: true }
  );
}

/**
 * Clears all SLO and health check data for an application.
 * @param {string} applicationId
 */
export async function clearSloData(applicationId) {
  await ensureDbConnected();

  await Promise.all([
    Slo.deleteMany({ applicationId }),
    HealthCheck.deleteMany({ applicationId }),
    HealthCheckDaily.deleteMany({ applicationId })
  ]);
}
