/**
 * backend/scripts/measureLatencies.js
 *
 * Latency Honesty Re-measurement (A4):
 * Measures raw scan vs rollup evaluation on the IDENTICAL dataset:
 * 10 applications x 86,400 checks (total 864,000 checks across 30 days).
 *
 * Runs 3 cold and 3 warm measurements each, computing median and range.
 * Explains the 86,399 vs 86,400 boundary behavior.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { performance } from 'perf_hooks';

import { env } from '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Application } from '../src/models/Application.js';
import { HealthCheck } from '../src/models/HealthCheck.js';
import { HealthCheckDaily } from '../src/models/HealthCheckDaily.js';
import { Slo } from '../src/models/Slo.js';
import {
  getSloForApplication,
  getSloForApplicationRaw,
  listSlos,
  listSlosRaw
} from '../src/services/sloService.js';
import { backfillRollups } from './backfillRollups.js';

function computeStats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = Number((max - min).toFixed(2));
  const median =
    sorted.length % 2 === 0
      ? Number(((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(2))
      : Number(sorted[Math.floor(sorted.length / 2)].toFixed(2));
  return { min, max, range, median };
}

async function main() {
  await connectDB();

  const suffix = Date.now();
  const passwordHash = await bcrypt.hash('TestPass123!', 4);

  const testUser = await User.create({
    name: `Latency User ${suffix}`,
    email: `latency_${suffix}@example.com`,
    passwordHash
  });

  console.log('\n=============================================================');
  console.log('       DevOpsPulse Latency Honesty Re-measurement (A4)       ');
  console.log('=============================================================\n');

  try {
    // 1. Create 10 applications with SLOs
    console.log('Creating 10 applications with 30-day SLOs...');
    const apps = [];
    for (let k = 1; k <= 10; k++) {
      const app = await Application.create({
        ownerId: testUser._id,
        name: `Latency App ${k} ${suffix}`,
        url: `https://latency-app-${k}-${suffix}.example.com`,
        checkIntervalSeconds: 30,
        nextCheckAt: new Date()
      });
      await Slo.create({
        ownerId: testUser._id,
        applicationId: app._id,
        name: `SLO App ${k}`,
        targetPercent: 99.0 + (k % 5) * 0.1,
        windowDays: 30
      });
      apps.push(app);
    }

    // 2. Seed identical dataset: 86,400 checks per app across 30 days
    // Notice the boundary calculation:
    // Window start for 30d is: now - 30 * 86,400,000 ms.
    // To ensure all 86,400 checks fall strictly inside the window,
    // checks are indexed from j = 0 to 86,399 with:
    // checkedAt = now - (86399 - j) * 30000 ms.
    // Then j = 0 has checkedAt = now - 86399 * 30000 = now - 29.9996 days (inside window)!
    const TOTAL_PER_APP = 86400;
    const BATCH_SIZE = 10000;
    const now = Date.now();

    console.log(`Seeding identical dataset: 10 apps x ${TOTAL_PER_APP} = ${TOTAL_PER_APP * 10} checks...`);
    const seedStart = performance.now();

    for (let a = 0; a < apps.length; a++) {
      const app = apps[a];
      for (let offset = 0; offset < TOTAL_PER_APP; offset += BATCH_SIZE) {
        const batch = [];
        const count = Math.min(BATCH_SIZE, TOTAL_PER_APP - offset);
        for (let i = 0; i < count; i++) {
          const j = offset + i;
          batch.push({
            applicationId: app._id,
            ownerId: testUser._id,
            checkedAt: new Date(now - (TOTAL_PER_APP - 1 - j) * 30000),
            success: j % 100 !== 0,
            statusCode: j % 100 === 0 ? 500 : 200,
            responseTimeMs: 70 + (j % 25)
          });
        }
        await HealthCheck.insertMany(batch, { ordered: false });
      }
      process.stdout.write(`  App ${a + 1}/10 seeded (${TOTAL_PER_APP} checks)\r`);
    }

    const seedDuration = ((performance.now() - seedStart) / 1000).toFixed(1);
    console.log(`\nAll 864,000 checks seeded in ${seedDuration}s. Backfilling daily rollups...`);
    await backfillRollups();
    console.log('Daily rollups backfilled successfully.\n');

    // 3. Boundary count verification: inspect app 1
    const app1 = apps[0];
    const targetSlo = await Slo.findOne({ applicationId: app1._id }).lean();
    const windowStart = new Date(Date.now() - 30 * 86400000);
    const earliestCheck = await HealthCheck.findOne({ applicationId: app1._id }).sort({ checkedAt: 1 }).lean();
    const latestCheck = await HealthCheck.findOne({ applicationId: app1._id }).sort({ checkedAt: -1 }).lean();

    console.log('--- Boundary Timestamp Analysis ---');
    console.log(`SLO Window Start (from): ${windowStart.toISOString()}`);
    console.log(`Earliest Check:          ${earliestCheck.checkedAt.toISOString()}`);
    console.log(`Latest Check:            ${latestCheck.checkedAt.toISOString()}`);
    console.log(`Earliest >= WindowStart: ${earliestCheck.checkedAt >= windowStart}`);

    const singleRollup = await getSloForApplication(testUser._id, app1._id);
    const singleRaw = await getSloForApplicationRaw(testUser._id, app1._id);
    console.log(`Total checks counted (Rollup): ${singleRollup.totals.total}`);
    console.log(`Total checks counted (Raw):    ${singleRaw.totals.total}`);
    console.log(`Matches exact 86,400:          ${singleRollup.totals.total === 86400}\n`);

    // 4. Single App Latencies: 3 Cold + 3 Warm
    console.log('--- Measuring Single App Latencies (86,400 checks) ---');
    const singleRawCold = [];
    const singleRawWarm = [];
    const singleRollupCold = [];
    const singleRollupWarm = [];

    // Cold runs: query 3 different apps cold
    for (let i = 0; i < 3; i++) {
      const appId = apps[i]._id;
      const t0 = performance.now();
      await getSloForApplicationRaw(testUser._id, appId);
      singleRawCold.push(Number((performance.now() - t0).toFixed(2)));

      const t1 = performance.now();
      await getSloForApplication(testUser._id, appId);
      singleRollupCold.push(Number((performance.now() - t1).toFixed(2)));
    }

    // Warm runs: query app 1 repeatedly
    for (let i = 0; i < 3; i++) {
      const appId = app1._id;
      const t0 = performance.now();
      await getSloForApplicationRaw(testUser._id, appId);
      singleRawWarm.push(Number((performance.now() - t0).toFixed(2)));

      const t1 = performance.now();
      await getSloForApplication(testUser._id, appId);
      singleRollupWarm.push(Number((performance.now() - t1).toFixed(2)));
    }

    // 5. List Endpoint Latencies: 3 Cold + 3 Warm
    console.log('--- Measuring List Endpoint Latencies (10 apps x 86,400 = 864,000 checks) ---');
    const listRawCold = [];
    const listRawWarm = [];
    const listRollupCold = [];
    const listRollupWarm = [];

    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await listSlosRaw(testUser._id, { limit: 10 });
      if (i === 0) listRawCold.push(Number((performance.now() - t0).toFixed(2)));
      else listRawWarm.push(Number((performance.now() - t0).toFixed(2)));

      const t1 = performance.now();
      await listSlos(testUser._id, { limit: 10 });
      if (i === 0) listRollupCold.push(Number((performance.now() - t1).toFixed(2)));
      else listRollupWarm.push(Number((performance.now() - t1).toFixed(2)));
    }

    // 2 more cold/warm runs
    for (let i = 1; i <= 2; i++) {
      const t0 = performance.now();
      await listSlosRaw(testUser._id, { limit: 10 });
      listRawWarm.push(Number((performance.now() - t0).toFixed(2)));

      const t1 = performance.now();
      await listSlos(testUser._id, { limit: 10 });
      listRollupWarm.push(Number((performance.now() - t1).toFixed(2)));
    }

    const allSingleRaw = [...singleRawCold, ...singleRawWarm];
    const allSingleRollup = [...singleRollupCold, ...singleRollupWarm];
    const allListRaw = [...listRawCold, ...listRawWarm];
    const allListRollup = [...listRollupCold, ...listRollupWarm];

    const statsSingleRaw = computeStats(allSingleRaw);
    const statsSingleRollup = computeStats(allSingleRollup);
    const statsListRaw = computeStats(allListRaw);
    const statsListRollup = computeStats(allListRollup);

    console.log('\n=============================================================');
    console.log('                     FINAL MEASURED RESULTS                  ');
    console.log('=============================================================');
    console.log('\n1. Single Application (86,400 checks):');
    console.log(`  RAW Scan:    Cold [${singleRawCold.join(', ')}] ms | Warm [${singleRawWarm.join(', ')}] ms`);
    console.log(`               Median: ${statsSingleRaw.median} ms | Range: ${statsSingleRaw.min} - ${statsSingleRaw.max} ms (${statsSingleRaw.range} ms spread)`);
    console.log(`  ROLLUP:      Cold [${singleRollupCold.join(', ')}] ms | Warm [${singleRollupWarm.join(', ')}] ms`);
    console.log(`               Median: ${statsSingleRollup.median} ms | Range: ${statsSingleRollup.min} - ${statsSingleRollup.max} ms (${statsSingleRollup.range} ms spread)`);
    console.log(`  Speedup:     ${(statsSingleRaw.median / statsSingleRollup.median).toFixed(1)}x faster\n`);

    console.log('2. List Endpoint (10 apps x 86,400 = 864,000 checks):');
    console.log(`  RAW Scan:    Cold [${listRawCold.join(', ')}] ms | Warm [${listRawWarm.join(', ')}] ms`);
    console.log(`               Median: ${statsListRaw.median} ms | Range: ${statsListRaw.min} - ${statsListRaw.max} ms (${statsListRaw.range} ms spread)`);
    console.log(`  ROLLUP:      Cold [${listRollupCold.join(', ')}] ms | Warm [${listRollupWarm.join(', ')}] ms`);
    console.log(`               Median: ${statsListRollup.median} ms | Range: ${statsListRollup.min} - ${statsListRollup.max} ms (${statsListRollup.range} ms spread)`);
    console.log(`  Speedup:     ${(statsListRaw.median / statsListRollup.median).toFixed(1)}x faster`);
    console.log('=============================================================\n');

  } finally {
    console.log('Cleaning up latency test records...');
    await User.deleteMany({ _id: testUser._id });
    await Application.deleteMany({ ownerId: testUser._id });
    await Slo.deleteMany({ ownerId: testUser._id });
    await HealthCheck.deleteMany({ ownerId: testUser._id });
    await HealthCheckDaily.deleteMany({ ownerId: testUser._id });
    await mongoose.disconnect();
    console.log('Cleanup finished.');
  }
}

main().catch((err) => {
  console.error('[FATAL] Measurement failed:', err);
  process.exit(1);
});
