/**
 * scripts/analyticsCheck.js
 *
 * Integration test for Step 7:
 * - Deployments API and isolation
 * - Uptime & latency analytics aggregation
 * - Dashboard summary with status counts, active incident counts, and per-app uptimes
 * - Timing of dashboard queries with 100+ HealthCheck documents
 *
 * Run: node scripts/analyticsCheck.js
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
import { Incident } from '../src/models/Incident.js';
import { Deployment } from '../src/models/Deployment.js';
import { getApplicationUptime, getDashboardSummary } from '../src/services/analyticsService.js';

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
    console.error(`  ✘ FAIL: ${label} — expected ${expected}, got ${actual}`);
    failed++;
  }
}

async function main() {
  await connectDB();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const suffix = Date.now();

  // Create User A and User B
  const userA = await User.create({
    name: 'User A Analytics',
    email: `usera+${suffix}@analytics.local`,
    passwordHash: await bcrypt.hash('Password123!', 12)
  });

  const userB = await User.create({
    name: 'User B Analytics',
    email: `userb+${suffix}@analytics.local`,
    passwordHash: await bcrypt.hash('Password123!', 12)
  });

  const tokenA = jwt.sign({ id: userA._id }, env.JWT_SECRET);
  const tokenB = jwt.sign({ id: userB._id }, env.JWT_SECRET);

  // User A apps
  const appA1 = await Application.create({
    ownerId: userA._id,
    name: `App A1 ${suffix}`,
    url: `https://appa1-${suffix}.example.com`,
    environment: 'production',
    status: 'down',
    checkIntervalSeconds: 60,
    timeoutMs: 5000,
    nextCheckAt: new Date()
  });

  const appA2_zeroChecks = await Application.create({
    ownerId: userA._id,
    name: `App A2 Zero ${suffix}`,
    url: `https://appa2-${suffix}.example.com`,
    environment: 'staging',
    status: 'up',
    checkIntervalSeconds: 60,
    timeoutMs: 5000,
    nextCheckAt: new Date()
  });

  // User B app
  const appB = await Application.create({
    ownerId: userB._id,
    name: `App B ${suffix}`,
    url: `https://appb-${suffix}.example.com`,
    environment: 'development',
    status: 'unknown',
    checkIntervalSeconds: 60,
    timeoutMs: 5000,
    nextCheckAt: new Date()
  });

  try {
    console.log('\n── Section A: Uptime & response time calculation ──');
    const now = new Date();

    // 10 checks in window for appA1:
    // 7 successful: 100, 200, 300, 100, 200, 300, 200 (sum=1400, avg=200, min=100, max=300)
    // 3 failed: responseTimeMs=5000
    // plus 1 check older than 24h (e.g. 26h ago) which must NOT be counted
    const recentChecks = [
      { success: true, responseTimeMs: 100, checkedAt: new Date(now.getTime() - 10 * 60 * 1000) },
      { success: true, responseTimeMs: 200, checkedAt: new Date(now.getTime() - 20 * 60 * 1000) },
      { success: true, responseTimeMs: 300, checkedAt: new Date(now.getTime() - 30 * 60 * 1000) },
      { success: true, responseTimeMs: 100, checkedAt: new Date(now.getTime() - 40 * 60 * 1000) },
      { success: true, responseTimeMs: 200, checkedAt: new Date(now.getTime() - 50 * 60 * 1000) },
      { success: true, responseTimeMs: 300, checkedAt: new Date(now.getTime() - 60 * 60 * 1000) },
      { success: true, responseTimeMs: 200, checkedAt: new Date(now.getTime() - 70 * 60 * 1000) },
      { success: false, responseTimeMs: 5000, errorType: 'timeout', checkedAt: new Date(now.getTime() - 80 * 60 * 1000) },
      { success: false, responseTimeMs: 5000, errorType: 'http_error', statusCode: 500, checkedAt: new Date(now.getTime() - 90 * 60 * 1000) },
      { success: false, responseTimeMs: 5000, errorType: 'dns_error', checkedAt: new Date(now.getTime() - 100 * 60 * 1000) }
    ].map((c) => ({
      ...c,
      applicationId: appA1._id,
      ownerId: userA._id
    }));

    // 1 check older than 24h (26 hours ago)
    const oldCheck = {
      applicationId: appA1._id,
      ownerId: userA._id,
      success: true,
      responseTimeMs: 999,
      checkedAt: new Date(now.getTime() - 26 * 60 * 60 * 1000)
    };

    await HealthCheck.insertMany([...recentChecks, oldCheck]);

    const uptimeData = await getApplicationUptime(userA._id, appA1._id, '24h');
    assertEqual(uptimeData.summary.totalChecks, 10, 'A: totalChecks exactly 10 in window');
    assertEqual(uptimeData.summary.successfulChecks, 7, 'A: successfulChecks exactly 7');
    assertEqual(uptimeData.summary.failedChecks, 3, 'A: failedChecks exactly 3');
    assertEqual(uptimeData.summary.uptimePercent, 70, 'A: uptimePercent exactly 70');
    assertEqual(uptimeData.summary.avgResponseTimeMs, 200, 'A: avgResponseTimeMs exactly 200 (failures excluded)');
    assertEqual(uptimeData.summary.minResponseTimeMs, 100, 'A: minResponseTimeMs exactly 100');
    assertEqual(uptimeData.summary.maxResponseTimeMs, 300, 'A: maxResponseTimeMs exactly 300');

    console.log('\n── Section B: App with zero checks ──');
    const zeroCheckData = await getApplicationUptime(userA._id, appA2_zeroChecks._id, '24h');
    assertEqual(zeroCheckData.summary.totalChecks, 0, 'B: zero checks app has totalChecks = 0');
    assertEqual(zeroCheckData.summary.uptimePercent, null, 'B: zero checks app has uptimePercent = null (not 0%)');
    assertEqual(zeroCheckData.summary.avgResponseTimeMs, null, 'B: zero checks app has avgResponseTimeMs = null');

    console.log('\n── Section C: Older checks excluded ──');
    // We already verified totalChecks is 10, even though 11 were inserted for appA1.
    assert(uptimeData.summary.totalChecks === 10, 'C: 26h-old check was not counted in 24h range');

    console.log('\n── Section D: Series has no missing buckets & empty buckets contain null ──');
    assert(Array.isArray(uptimeData.series), 'D: series is an array');
    assert(uptimeData.series.length >= 24, 'D: series has at least 24 hour buckets');
    // Find at least one empty bucket (e.g. from 10 hours ago where no checks were placed)
    const emptyBucket = uptimeData.series.find((b) => b.totalChecks === 0);
    assert(emptyBucket !== undefined, 'D: empty bucket exists in series');
    assertEqual(emptyBucket?.uptimePercent, null, 'D: empty bucket uptimePercent is null');
    assertEqual(emptyBucket?.avgResponseTimeMs, null, 'D: empty bucket avgResponseTimeMs is null');

    console.log('\n── Section E: Dashboard summary keys & User isolation ──');
    // Add an incident and deployment for User A
    await Incident.create({
      applicationId: appA1._id,
      ownerId: userA._id,
      title: 'App A1 is down',
      severity: 'high',
      status: 'open',
      isActive: true,
      startedAt: new Date(),
      lastFailureAt: new Date(),
      failureCount: 2
    });

    await Deployment.create({
      applicationId: appA1._id,
      ownerId: userA._id,
      version: 'v1.0.0',
      environment: 'production',
      status: 'success',
      source: 'manual',
      startedAt: new Date()
    });

    const summaryA = await getDashboardSummary(userA._id, '24h');
    assertEqual(summaryA.applications.total, 2, 'E: User A has 2 applications total');
    assert(
      'unknown' in summaryA.applications.byStatus &&
      'up' in summaryA.applications.byStatus &&
      'degraded' in summaryA.applications.byStatus &&
      'down' in summaryA.applications.byStatus,
      'E: applications.byStatus has unknown, up, degraded, down keys'
    );
    assertEqual(summaryA.applications.byStatus.down, 1, 'E: User A has 1 down application');
    assertEqual(summaryA.applications.byStatus.up, 1, 'E: User A has 1 up application');

    assert(
      'low' in summaryA.incidents.activeBySeverity &&
      'medium' in summaryA.incidents.activeBySeverity &&
      'high' in summaryA.incidents.activeBySeverity &&
      'critical' in summaryA.incidents.activeBySeverity,
      'E: activeBySeverity has all 4 keys'
    );
    assertEqual(summaryA.incidents.activeBySeverity.high, 1, 'E: User A activeBySeverity.high is 1');
    assertEqual(summaryA.incidents.activeCount, 1, 'E: User A activeCount is 1');
    assertEqual(summaryA.deployments.recent.length, 1, 'E: User A recent deployments length is 1');

    // User B summary isolation test
    const summaryB = await getDashboardSummary(userB._id, '24h');
    assertEqual(summaryB.applications.total, 1, 'E: User B has exactly 1 application (isolation)');
    assertEqual(summaryB.incidents.activeCount, 0, 'E: User B has 0 active incidents (does not see A)');
    assertEqual(summaryB.deployments.recent.length, 0, 'E: User B has 0 deployments (does not see A)');
    assertEqual(summaryB.health.totalChecks, 0, 'E: User B has 0 health checks (does not see A)');
    assertEqual(summaryB.health.uptimePercent, null, 'E: User B health uptimePercent is null');

    console.log('\n── Section F: Deployments endpoint validation & security ──');

    // 1. User B posting deployment to User A's application -> 404
    const resBtoA = await fetch(`${baseUrl}/applications/${appA1._id}/deployments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ version: 'v2.0.0' })
    });
    assertEqual(resBtoA.status, 404, 'F: User B posting to User A app returns 404');

    // 2. Body containing forbidden "source" field -> 400
    const resForbiddenSource = await fetch(`${baseUrl}/applications/${appA1._id}/deployments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ version: 'v1.0.1', source: 'manual' })
    });
    assertEqual(resForbiddenSource.status, 400, 'F: Body containing "source" rejected with 400');

    // 3. Body containing forbidden "ownerId" field -> 400
    const resForbiddenOwner = await fetch(`${baseUrl}/applications/${appA1._id}/deployments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ version: 'v1.0.1', ownerId: userA._id.toString() })
    });
    assertEqual(resForbiddenOwner.status, 400, 'F: Body containing "ownerId" rejected with 400');

    // 4. completedAt earlier than startedAt -> 400
    const resInvalidDates = await fetch(`${baseUrl}/applications/${appA1._id}/deployments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        version: 'v1.0.1',
        startedAt: new Date('2026-11-02T10:00:00Z').toISOString(),
        completedAt: new Date('2026-11-02T09:00:00Z').toISOString()
      })
    });
    assertEqual(resInvalidDates.status, 400, 'F: completedAt < startedAt rejected with 400');

    // 5. Valid deployment creation -> 201
    const resValidDeploy = await fetch(`${baseUrl}/applications/${appA1._id}/deployments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        version: 'v1.2.3',
        commitSha: 'a1b2c3d4e5f6',
        branch: 'main',
        environment: 'production',
        status: 'success'
      })
    });
    assertEqual(resValidDeploy.status, 201, 'F: Valid deployment created with 201');
    const deployJson = await resValidDeploy.json();
    assertEqual(deployJson.data.deployment.source, 'manual', 'F: deployment source forced to manual');

    console.log('\n── Section G: Dashboard performance with 100+ health checks ──');
    // Insert 120 more health checks
    const bulkChecks = Array.from({ length: 120 }, (_, i) => ({
      applicationId: appA1._id,
      ownerId: userA._id,
      success: i % 10 !== 0,
      responseTimeMs: 150 + (i % 50),
      checkedAt: new Date(now.getTime() - (i + 1) * 5 * 60 * 1000)
    }));
    await HealthCheck.insertMany(bulkChecks);

    const t0 = performance.now();
    const perfSummary = await getDashboardSummary(userA._id, '24h');
    const elapsedMs = Math.round(performance.now() - t0);
    console.log(`  ⏱ Dashboard summary with 130+ health checks took: ${elapsedMs}ms`);
    assert(elapsedMs < 1000, `G: Dashboard query completed quickly (${elapsedMs}ms < 1000ms)`);
    assert(perfSummary.health.totalChecks >= 130, 'G: All bulk checks counted in health summary');

  } finally {
    // Cleanup
    await Deployment.deleteMany({ ownerId: { $in: [userA._id, userB._id] } });
    await Incident.deleteMany({ ownerId: { $in: [userA._id, userB._id] } });
    await HealthCheck.deleteMany({ ownerId: { $in: [userA._id, userB._id] } });
    await Application.deleteMany({ ownerId: { $in: [userA._id, userB._id] } });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });

    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[Script] Fatal error:', err);
  process.exit(1);
});

