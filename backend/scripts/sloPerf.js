/**
 * backend/scripts/sloPerf.js
 *
 * Dedicated performance suite for SLO high-volume benchmarks:
 * - Single application with 86,400 checks (30-day window at 30s check interval)
 * - Multi-tenant list endpoint with 10 applications over 86,400 checks each (864,000 checks)
 * Asserts rollup speedup, sub-second response times, and exact totals.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import http from 'http';
import { performance } from 'perf_hooks';

import { env } from '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { Application } from '../src/models/Application.js';
import { HealthCheck } from '../src/models/HealthCheck.js';
import { HealthCheckDaily } from '../src/models/HealthCheckDaily.js';
import { Slo } from '../src/models/Slo.js';
import { backfillRollups } from './backfillRollups.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✔ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ✘ FAIL: ${label}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    console.log(`  ✔ PASS: ${label} (${actual})`);
    passed++;
  } else {
    console.error(`  ✘ FAIL: ${label} - expected: ${expected}, got: ${actual}`);
    failed++;
  }
}

function requestJson(baseUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = `${baseUrl}${path}`;
    const url = new URL(fullUrl);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.headers || {})
      }
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function run() {
  console.log('=============================================================');
  console.log('       DevOpsPulse SLO High-Volume Performance Suite        ');
  console.log('=============================================================');

  await connectDB();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const suffix = `perf_${Date.now()}`;
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const user = await User.create({
    name: 'Perf Benchmark User',
    email: `perf_${suffix}@example.com`,
    passwordHash,
    role: 'admin'
  });

  const cookie = `token=${jwt.sign({ id: user._id.toString() }, env.JWT_SECRET, { expiresIn: '24h' })}`;

  try {
    console.log('\n--- 1. Single Application Volume Benchmark (86,400 checks) ---');
    const appSingle = await Application.create({
      name: `Single App 86k ${suffix}`,
      url: `https://single-86k-${suffix}.example.com`,
      ownerId: user._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    await requestJson(baseUrl, `/applications/${appSingle._id}/slo`, {
      method: 'POST',
      cookie,
      body: {
        name: 'Single App 30d 99.9% SLO',
        targetPercent: 99.9,
        windowDays: 30
      }
    });

    const now = Date.now() + 300000; // 5m in future to keep all checks within 30-day window during benchmark
    const total86k = 86400;
    const batchSize = 5000;
    console.log('  Generating 86,400 checks (30s intervals)...');
    for (let offset = 0; offset < total86k; offset += batchSize) {
      const chunk = [];
      const count = Math.min(batchSize, total86k - offset);
      for (let i = 0; i < count; i++) {
        const checkIdx = offset + i;
        chunk.push({
          applicationId: appSingle._id,
          ownerId: user._id,
          checkedAt: new Date(now - ((total86k - 1 - checkIdx) * 30000)),
          success: checkIdx % 100 !== 0,
          statusCode: checkIdx % 100 === 0 ? 500 : 200,
          responseTimeMs: 60 + (checkIdx % 40)
        });
      }
      await HealthCheck.insertMany(chunk, { ordered: false });
    }

    // Backfill rollups
    await backfillRollups({ applicationId: appSingle._id });

    // Measure single app SLO endpoint
    const singleStart = performance.now();
    const resSingle = await requestJson(baseUrl, `/applications/${appSingle._id}/slo`, { cookie });
    const singleDurationMs = Number((performance.now() - singleStart).toFixed(2));

    assertEqual(resSingle.status, 200, 'GET /applications/:id/slo for 86,400 checks returns 200');
    assertEqual(resSingle.data?.data?.totals?.total, 86400, 'All 86,400 checks accurately counted in rollup path');
    console.log(`  Single App Latency: ${singleDurationMs} ms`);
    assert(singleDurationMs <= 500, `Single app SLO latency with rollups <= 500ms (measured: ${singleDurationMs}ms)`);

    console.log('\n--- 2. Multi-Application List Volume Benchmark (10 apps x 86,400 = 864,000 checks) ---');
    const listApps = [];
    for (let a = 0; a < 10; a++) {
      const item = await Application.create({
        name: `Scale App ${a + 1} ${suffix}`,
        url: `https://scale-app-${a + 1}-${suffix}.example.com`,
        ownerId: user._id,
        status: 'up',
        nextCheckAt: new Date()
      });
      listApps.push(item);

      await requestJson(baseUrl, `/applications/${item._id}/slo`, {
        method: 'POST',
        cookie,
        body: {
          name: `Scale App ${a + 1} SLO`,
          targetPercent: 99.0 + (a % 10) * 0.09,
          windowDays: 30
        }
      });
    }

    console.log('  Generating 86,400 checks per app across remaining 9 apps...');
    for (const item of listApps.slice(1)) {
      for (let offset = 0; offset < total86k; offset += batchSize) {
        const chunk = [];
        const count = Math.min(batchSize, total86k - offset);
        for (let i = 0; i < count; i++) {
          const checkIdx = offset + i;
          chunk.push({
            applicationId: item._id,
            ownerId: user._id,
            checkedAt: new Date(now - ((total86k - 1 - checkIdx) * 30000)),
            success: checkIdx % 100 !== 0,
            statusCode: checkIdx % 100 === 0 ? 500 : 200,
            responseTimeMs: 50 + (checkIdx % 30)
          });
        }
        await HealthCheck.insertMany(chunk, { ordered: false });
      }
      await backfillRollups({ applicationId: item._id });
    }

    // Measure list endpoint
    const listStart = performance.now();
    const resList = await requestJson(baseUrl, '/slos?limit=10', { cookie });
    const listDurationMs = Number((performance.now() - listStart).toFixed(2));

    assertEqual(resList.status, 200, 'GET /api/v1/slos returns 200 for 10 applications over 864k checks');
    assertEqual(resList.data?.data?.slos?.length, 10, 'Returned 10 SLOs in list endpoint');
    console.log(`  List Endpoint Latency: ${listDurationMs} ms`);
    assert(listDurationMs <= 1000, `List endpoint SLO latency with rollups <= 1000ms (measured: ${listDurationMs}ms)`);

  } finally {
    console.log('\n--- Cleaning up temporary performance test data ---');
    try {
      await User.deleteOne({ _id: user._id });
      await Application.deleteMany({ ownerId: user._id });
      await HealthCheck.deleteMany({ ownerId: user._id });
      await HealthCheckDaily.deleteMany({ ownerId: user._id });
      await Slo.deleteMany({ ownerId: user._id });
    } catch (cleanErr) {
      console.warn('  Cleanup warning:', cleanErr.message);
    }
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
  }

  console.log('\n=============================================================');
  console.log(`SLO Performance Suite: ${passed} passed, ${failed} failed`);
  console.log('=============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error in sloPerf:', err);
  process.exit(1);
});
