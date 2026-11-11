/**
 * backend/scripts/backfillRollups.js
 *
 * Backfill script for HealthCheckDaily rollups from raw HealthCheck records.
 * Rebuilds daily rollups via aggregation. Fully idempotent (replaces/upserts).
 *
 * Usage:
 *   node scripts/backfillRollups.js
 *   node scripts/backfillRollups.js --application <id>
 *   node scripts/backfillRollups.js --dry-run
 *   npm run rollups:backfill
 */

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import path from 'path';

// Import models and connection relative to backend directory
import { connectDB } from '../src/config/db.js';
import { HealthCheck } from '../src/models/HealthCheck.js';
import { HealthCheckDaily } from '../src/models/HealthCheckDaily.js';

/**
 * Backfills HealthCheckDaily rollup documents from raw HealthCheck telemetry.
 *
 * @param {object} options
 * @param {string} [options.applicationId] - Optional specific application to backfill
 * @param {boolean} [options.dryRun=false] - If true, computes aggregations without writing to DB
 * @returns {Promise<{ processedApps: number, totalBuckets: number, appSummary: Record<string, number> }>}
 */
export async function backfillRollups({ applicationId = null, dryRun = false } = {}) {
  const match = {};
  if (applicationId) {
    match.applicationId = new mongoose.Types.ObjectId(applicationId);
  }

  // Aggregate raw checks grouped by applicationId and UTC day
  const aggregated = await HealthCheck.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          applicationId: '$applicationId',
          day: {
            $dateTrunc: { date: '$checkedAt', unit: 'day', timezone: 'UTC' }
          }
        },
        ownerId: { $first: '$ownerId' },
        total: { $sum: 1 },
        good: { $sum: { $cond: ['$success', 1, 0] } }
      }
    },
    { $sort: { '_id.applicationId': 1, '_id.day': 1 } }
  ]);

  const appSummary = {};
  for (const item of aggregated) {
    const appId = item._id.applicationId.toString();
    appSummary[appId] = (appSummary[appId] || 0) + 1;
  }

  if (dryRun) {
    console.log(`[DRY-RUN] Computed ${aggregated.length} daily rollup buckets across ${Object.keys(appSummary).length} applications.`);
    for (const [appId, count] of Object.entries(appSummary)) {
      console.log(`  Application ${appId}: ${count} daily rollup documents`);
    }
    return {
      processedApps: Object.keys(appSummary).length,
      totalBuckets: aggregated.length,
      appSummary
    };
  }

  if (aggregated.length > 0) {
    // Idempotent bulk replacement / upsert
    const bulkOps = aggregated.map((doc) => ({
      updateOne: {
        filter: {
          applicationId: doc._id.applicationId,
          day: doc._id.day
        },
        update: {
          $set: {
            ownerId: doc.ownerId,
            total: doc.total,
            good: doc.good
          }
        },
        upsert: true
      }
    }));

    // Execute in chunks of 500 ops to keep memory bounded
    const chunkSize = 500;
    for (let i = 0; i < bulkOps.length; i += chunkSize) {
      const chunk = bulkOps.slice(i, i + chunkSize);
      await HealthCheckDaily.bulkWrite(chunk, { ordered: false });
    }
  }

  return {
    processedApps: Object.keys(appSummary).length,
    totalBuckets: aggregated.length,
    appSummary
  };
}

/**
 * Detects drift between raw checks and daily rollups for a given application.
 *
 * @param {string|mongoose.Types.ObjectId} applicationId
 * @returns {Promise<{ drifted: boolean, raw: { total: number, good: number }, rollup: { total: number, good: number }, diff: { total: number, good: number } }>}
 */
export async function detectDrift(applicationId) {
  const appObjId = new mongoose.Types.ObjectId(applicationId);

  // Sum raw checks
  const [rawAgg] = await HealthCheck.aggregate([
    { $match: { applicationId: appObjId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        good: { $sum: { $cond: ['$success', 1, 0] } }
      }
    }
  ]);

  // Sum rollup documents
  const [rollupAgg] = await HealthCheckDaily.aggregate([
    { $match: { applicationId: appObjId } },
    {
      $group: {
        _id: null,
        total: { $sum: '$total' },
        good: { $sum: '$good' }
      }
    }
  ]);

  const raw = {
    total: rawAgg?.total || 0,
    good: rawAgg?.good || 0
  };
  const rollup = {
    total: rollupAgg?.total || 0,
    good: rollupAgg?.good || 0
  };

  const diff = {
    total: Math.abs(raw.total - rollup.total),
    good: Math.abs(raw.good - rollup.good)
  };

  const drifted = diff.total !== 0 || diff.good !== 0;

  return { drifted, raw, rollup, diff };
}

// CLI Execution Entry Point
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const appIndex = args.indexOf('--application');
  const applicationId = appIndex !== -1 && args[appIndex + 1] ? args[appIndex + 1] : null;

  async function run() {
    await connectDB();
    console.log('--- Starting HealthCheckDaily Backfill ---');
    console.log(`Application filter: ${applicationId || 'ALL'}`);
    console.log(`Dry-run mode: ${dryRun}`);

    const startTime = Date.now();
    const result = await backfillRollups({ applicationId, dryRun });
    const durationMs = Date.now() - startTime;

    console.log('\n--- Backfill Summary ---');
    console.log(`Applications processed: ${result.processedApps}`);
    console.log(`Total daily rollup buckets: ${result.totalBuckets}`);
    console.log(`Execution time: ${durationMs}ms`);

    for (const [appId, count] of Object.entries(result.appSummary)) {
      console.log(`  App ${appId}: ${count} daily rollups written`);
    }

    await mongoose.disconnect();
    console.log('--- Backfill Complete ---');
  }

  run().catch((err) => {
    console.error('[FATAL] Backfill failed:', err);
    process.exit(1);
  });
}

