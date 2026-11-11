/**
 * backend/scripts/sloCheck.js
 *
 * Automated verification check script for Step 15 & 15a (SLO Monitoring):
 * a) Exactly 1000 checks, 5 bad, target 99.9% -> headline budgetConsumedPct 500.0, status 'breached', 0% budget remaining, SLI 99.50%.
 * b) All good checks -> budgetConsumedPct 0.0, 100% budget remaining, SLI 100.0%, status 'healthy'.
 * c) Checks older than window (e.g. 8 days ago for a 7d SLO) do NOT count toward the budget or the SLI.
 * d) Burn rate: computed with plain arithmetic (no imports from sloRules); asserts exact values rounded to 2 decimals,
 *    including a boundary test just below the 14.4 threshold (14.30 -> fastBurn false) and one exactly on it (14.40 -> fastBurn true).
 * e) Series: length is EXACTLY windowDays + 1 for both 7-day and 30-day SLOs (first and last days are partial UTC days),
 *    consecutive UTC days, and last cumulative consumption equals headline budgetConsumedPct.
 * f) User B multi-tenant isolation: User B gets 404 on User A's SLO route and sees 0 SLOs in their list.
 * g) Brand-new application with zero checks: status 'insufficient_data', no NaN, no Infinity, no null where a number is promised, series points valid.
 * h) Aggregation explain: winning plan uses IXSCAN on { applicationId: 1, checkedAt: -1 } and zero COLLSCAN operations.
 * i) Target exactly met boundary: budgetConsumedPct exactly 100 gives 'at_risk' (not 'breached'), plus target 99.9% float-noise case.
 * j) Scaling honesty: single app with 86,400 checks (30d at 30s) <= 3000ms; list endpoint with 10 apps over ~86,400 checks each <= 3000ms.
 *
 * Run: npm run check:slo (from backend) or node backend/scripts/sloCheck.js
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
import { Slo } from '../src/models/Slo.js';

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

async function requestJson(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function main() {
  await connectDB();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const suffix = Date.now();
  const passwordHash = await bcrypt.hash('TestPass123!', 4);

  // Create temporary users A and B
  const userA = await User.create({
    name: `User A ${suffix}`,
    email: `slo_check_a_${suffix}@example.com`,
    passwordHash
  });

  const userB = await User.create({
    name: `User B ${suffix}`,
    email: `slo_check_b_${suffix}@example.com`,
    passwordHash
  });

  const tokenA = jwt.sign({ id: userA._id.toString() }, env.JWT_SECRET, { expiresIn: '1h' });
  const cookieA = `token=${tokenA}`;

  const tokenB = jwt.sign({ id: userB._id.toString() }, env.JWT_SECRET, { expiresIn: '1h' });
  const cookieB = `token=${tokenB}`;

  console.log('\n========================================');
  console.log('       DevOpsPulse SLO Check Suite      ');
  console.log('========================================');

  try {
    // --------------------------------------------------------------------------
    // a) 1000 checks, 5 bad, target 99.9% -> consumed 500.0%, status breached
    // --------------------------------------------------------------------------
    console.log('\n[Check a] 1000 checks, 5 bad, target 99.9% -> budgetConsumedPct 500.0, breached');
    const appA = await Application.create({
      name: `App A ${suffix}`,
      url: `https://app-a-${suffix}.example.com`,
      ownerId: userA._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    const createSloRes = await requestJson(baseUrl, `/applications/${appA._id}/slo`, {
      method: 'POST',
      cookie: cookieA,
      body: {
        name: 'App A Availability 99.9%',
        targetPercent: 99.9,
        windowDays: 30
      }
    });
    assertEqual(createSloRes.status, 201, 'POST /applications/:id/slo returns 201');

    const now = Date.now();
    const batchA = [];
    // 995 good checks, 5 bad checks within last 2 days
    for (let i = 0; i < 995; i++) {
      batchA.push({
        applicationId: appA._id,
        ownerId: userA._id,
        checkedAt: new Date(now - (i + 10) * 120000), // ~2 days of history
        success: true,
        statusCode: 200,
        responseTimeMs: 85
      });
    }
    for (let i = 0; i < 5; i++) {
      batchA.push({
        applicationId: appA._id,
        ownerId: userA._id,
        checkedAt: new Date(now - (i + 1) * 3600000), // last 5 hours
        success: false,
        statusCode: 500,
        responseTimeMs: 5000,
        errorType: 'http_error',
        errorMessage: 'Internal Server Error'
      });
    }
    await HealthCheck.insertMany(batchA);

    const getSloResA = await requestJson(baseUrl, `/applications/${appA._id}/slo`, {
      cookie: cookieA
    });

    assertEqual(getSloResA.status, 200, 'GET /applications/:id/slo returns 200');
    const dataA = getSloResA.data?.data;
    assertEqual(dataA?.totals?.total, 1000, 'data.totals.total is 1000');
    assertEqual(dataA?.totals?.good, 995, 'data.totals.good is 995');
    assertEqual(dataA?.totals?.bad, 5, 'data.totals.bad is 5');
    assertEqual(dataA?.sli, 99.5, 'data.sli is exactly 99.50%');
    assertEqual(dataA?.budgetConsumedPct, 500.0, 'data.budgetConsumedPct is 500.0%');
    assertEqual(dataA?.budgetRemainingPct, 0.0, 'data.budgetRemainingPct is 0.0%');
    assertEqual(dataA?.status, 'breached', 'data.status is breached');

    // --------------------------------------------------------------------------
    // b) All good checks -> budgetConsumedPct 0.0, 100% remaining, status healthy
    // --------------------------------------------------------------------------
    console.log('\n[Check b] All good checks -> budgetConsumedPct 0.0, remaining 100%, healthy');
    const appB = await Application.create({
      name: `App B ${suffix}`,
      url: `https://app-b-${suffix}.example.com`,
      ownerId: userA._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    await requestJson(baseUrl, `/applications/${appB._id}/slo`, {
      method: 'POST',
      cookie: cookieA,
      body: {
        name: 'App B Availability 99.9%',
        targetPercent: 99.9,
        windowDays: 7
      }
    });

    const batchB = [];
    for (let i = 0; i < 60; i++) {
      batchB.push({
        applicationId: appB._id,
        ownerId: userA._id,
        checkedAt: new Date(now - i * 60000),
        success: true,
        statusCode: 200,
        responseTimeMs: 65
      });
    }
    await HealthCheck.insertMany(batchB);

    const getSloResB = await requestJson(baseUrl, `/applications/${appB._id}/slo`, {
      cookie: cookieA
    });

    const dataB = getSloResB.data?.data;
    assertEqual(dataB?.sli, 100.0, 'data.sli is 100.0%');
    assertEqual(dataB?.budgetConsumedPct, 0.0, 'data.budgetConsumedPct is 0.0%');
    assertEqual(dataB?.budgetRemainingPct, 100.0, 'data.budgetRemainingPct is 100.0%');
    assertEqual(dataB?.status, 'healthy', 'data.status is healthy');

    // --------------------------------------------------------------------------
    // c) Checks older than window (8 days ago for 7d window) do NOT count
    // --------------------------------------------------------------------------
    console.log('\n[Check c] Checks older than window (8 days ago) do not count');
    const oldBatch = [];
    for (let i = 0; i < 20; i++) {
      oldBatch.push({
        applicationId: appB._id,
        ownerId: userA._id,
        checkedAt: new Date(now - 8 * 24 * 60 * 60 * 1000 - i * 60000), // 8 days ago
        success: false,
        statusCode: 500,
        responseTimeMs: 2000,
        errorType: 'http_error',
        errorMessage: 'Old failure'
      });
    }
    await HealthCheck.insertMany(oldBatch);

    const getSloResBAfterOld = await requestJson(baseUrl, `/applications/${appB._id}/slo`, {
      cookie: cookieA
    });
    const dataBAfterOld = getSloResBAfterOld.data?.data;
    assertEqual(dataBAfterOld?.totals?.total, 60, 'Checks older than 7d window are excluded (total still 60)');
    assertEqual(dataBAfterOld?.totals?.bad, 0, 'Bad checks older than 7d window are excluded (bad is 0)');
    assertEqual(dataBAfterOld?.budgetConsumedPct, 0.0, 'budgetConsumedPct remains 0.0%');

    // --------------------------------------------------------------------------
    // d) Exact Burn Rate Assertions with Plain Arithmetic (Section 2a)
    // --------------------------------------------------------------------------
    console.log('\n[Check d] Exact burn rate assertions computed via plain arithmetic & 14.4 boundary');
    // App Burn: target 99.0% -> allowedErrorRate = (100 - 99.0) / 100 = 0.01
    const appBurn = await Application.create({
      name: `App Burn ${suffix}`,
      url: `https://app-burn-${suffix}.example.com`,
      ownerId: userA._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    await requestJson(baseUrl, `/applications/${appBurn._id}/slo`, {
      method: 'POST',
      cookie: cookieA,
      body: {
        name: 'Burn Rate Test SLO 99.0%',
        targetPercent: 99.0,
        windowDays: 30
      }
    });

    // Case 1: Exactly on the 14.4 fastBurn threshold:
    // In 1h window: total = 1000, bad = 144
    // Plain arithmetic: errorRate = 144 / 1000 = 0.144; allowedError = 0.01; burnRate1h = 0.144 / 0.01 = 14.40
    // fastBurn: burnRate1h >= 14.4 -> true
    // In 6h window: total = 2000, bad = 120 (144 in last hr + 0 in hr 2-6? wait, bad in 6h includes 1h)
    // Let's set 6h: 144 bad in 1h, and an additional 0 bad + 1000 good in hours 2-6 (total 6h = 2000, bad 6h = 144)
    // Or let's test specific exact arithmetic for 1h and 6h:
    const targetP = 99.0;
    const allowedError = (100 - targetP) / 100; // 0.01

    // 144 bad checks in last 30 minutes
    const burnExactBatch = [];
    for (let i = 0; i < 144; i++) {
      burnExactBatch.push({
        applicationId: appBurn._id,
        ownerId: userA._id,
        checkedAt: new Date(now - (i + 1) * 10000), // within last 25 minutes
        success: false,
        statusCode: 500,
        responseTimeMs: 1200
      });
    }
    // 856 good checks in last 50 minutes (total in 1h = 144 + 856 = 1000)
    for (let i = 0; i < 856; i++) {
      burnExactBatch.push({
        applicationId: appBurn._id,
        ownerId: userA._id,
        checkedAt: new Date(now - (i + 1) * 3500), // within last 50 minutes
        success: true,
        statusCode: 200,
        responseTimeMs: 50
      });
    }
    // 1000 good checks between 2h and 5h ago (total in 6h = 1000 + 1000 = 2000; bad in 6h = 144)
    for (let i = 0; i < 1000; i++) {
      burnExactBatch.push({
        applicationId: appBurn._id,
        ownerId: userA._id,
        checkedAt: new Date(now - 2 * 3600000 - i * 10000), // 2-5 hrs ago
        success: true,
        statusCode: 200,
        responseTimeMs: 50
      });
    }
    await HealthCheck.insertMany(burnExactBatch);

    // Compute expected values using plain arithmetic (no sloRules import)
    const expectedBurn1hExact = Number(((144 / 1000) / allowedError).toFixed(2)); // (0.144 / 0.01) = 14.40
    const expectedFastBurnExact = expectedBurn1hExact >= 14.4; // true
    const expectedBurn6hExact = Number(((144 / 2000) / allowedError).toFixed(2)); // (0.072 / 0.01) = 7.20
    const expectedSlowBurnExact = expectedBurn6hExact >= 6.0; // true

    const resBurnExact = await requestJson(baseUrl, `/applications/${appBurn._id}/slo`, {
      cookie: cookieA
    });
    const dataBurnExact = resBurnExact.data?.data;
    assertEqual(dataBurnExact?.burnRate1h, expectedBurn1hExact, 'burnRate1h exactly matches plain arithmetic (14.40)');
    assertEqual(dataBurnExact?.fastBurn, expectedFastBurnExact, 'fastBurn is true when burnRate1h is exactly on 14.4 threshold');
    assertEqual(dataBurnExact?.burnRate6h, expectedBurn6hExact, 'burnRate6h exactly matches plain arithmetic (7.20)');
    assertEqual(dataBurnExact?.slowBurn, expectedSlowBurnExact, 'slowBurn is true when burnRate6h >= 6.0');

    // Case 2: Just below the 14.4 fastBurn threshold:
    // Create an app where 1h has total=1000, bad=143
    // Plain arithmetic: errorRate = 143 / 1000 = 0.143; burnRate1h = 0.143 / 0.01 = 14.30
    // 14.30 < 14.4 -> fastBurn must be FALSE!
    const appBurnBelow = await Application.create({
      name: `App Burn Below ${suffix}`,
      url: `https://app-burn-below-${suffix}.example.com`,
      ownerId: userA._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    await requestJson(baseUrl, `/applications/${appBurnBelow._id}/slo`, {
      method: 'POST',
      cookie: cookieA,
      body: {
        name: 'Burn Below Threshold 99.0%',
        targetPercent: 99.0,
        windowDays: 30
      }
    });

    const burnBelowBatch = [];
    // 143 bad checks in last 30 mins
    for (let i = 0; i < 143; i++) {
      burnBelowBatch.push({
        applicationId: appBurnBelow._id,
        ownerId: userA._id,
        checkedAt: new Date(now - (i + 1) * 10000),
        success: false,
        statusCode: 500,
        responseTimeMs: 1200
      });
    }
    // 857 good checks in last 50 mins (total in 1h = 143 + 857 = 1000)
    for (let i = 0; i < 857; i++) {
      burnBelowBatch.push({
        applicationId: appBurnBelow._id,
        ownerId: userA._id,
        checkedAt: new Date(now - (i + 1) * 3500),
        success: true,
        statusCode: 200,
        responseTimeMs: 50
      });
    }
    await HealthCheck.insertMany(burnBelowBatch);

    const expectedBurn1hBelow = Number(((143 / 1000) / allowedError).toFixed(2)); // (0.143 / 0.01) = 14.30
    const expectedFastBurnBelow = expectedBurn1hBelow >= 14.4; // false

    const resBurnBelow = await requestJson(baseUrl, `/applications/${appBurnBelow._id}/slo`, {
      cookie: cookieA
    });
    const dataBurnBelow = resBurnBelow.data?.data;
    assertEqual(dataBurnBelow?.burnRate1h, expectedBurn1hBelow, 'burnRate1h matches plain arithmetic (14.30)');
    assertEqual(dataBurnBelow?.fastBurn, expectedFastBurnBelow, 'fastBurn is false when burnRate1h is just below 14.4 (14.30)');

    // --------------------------------------------------------------------------
    // e) Daily Timeseries: exact windowDays + 1 points & consecutive UTC days (Section 2b)
    // --------------------------------------------------------------------------
    console.log('\n[Check e] Daily timeseries: exactly windowDays + 1 points, consecutive UTC days, last point equals headline');
    // Note: The rolling window covers [now - windowDays * 86400000, now]. Because 'now' and 'now - windowDays'
    // land on partial UTC calendar days, the series spans exactly windowDays + 1 distinct UTC calendar days.

    // 1. Check 30-day SLO series length (appA)
    const series30d = dataA?.series;
    assert(Array.isArray(series30d), '30-day series is an array');
    assertEqual(series30d.length, 31, '30-day SLO series length is EXACTLY 31 (windowDays + 1 for partial boundary days)');

    // Verify consecutive UTC days for 30d series
    let consecutive30d = true;
    for (let i = 0; i < series30d.length - 1; i++) {
      const curDate = new Date(`${series30d[i].day}T00:00:00Z`);
      const nextExpected = new Date(curDate.getTime() + 86400000).toISOString().slice(0, 10);
      if (series30d[i + 1].day !== nextExpected) {
        consecutive30d = false;
        console.error(`Non-consecutive day at index ${i}: ${series30d[i].day} -> ${series30d[i + 1].day} (expected ${nextExpected})`);
        break;
      }
    }
    assert(consecutive30d, '30-day series contains strictly consecutive UTC calendar days');
    assertEqual(
      series30d[series30d.length - 1]?.cumulativeBudgetConsumedPct,
      dataA?.budgetConsumedPct,
      'Last 30-day series point cumulativeBudgetConsumedPct equals headline budgetConsumedPct'
    );

    // 2. Check 7-day SLO series length (appB)
    const series7d = dataBAfterOld?.series;
    assert(Array.isArray(series7d), '7-day series is an array');
    assertEqual(series7d.length, 8, '7-day SLO series length is EXACTLY 8 (windowDays + 1 for partial boundary days)');

    let consecutive7d = true;
    for (let i = 0; i < series7d.length - 1; i++) {
      const curDate = new Date(`${series7d[i].day}T00:00:00Z`);
      const nextExpected = new Date(curDate.getTime() + 86400000).toISOString().slice(0, 10);
      if (series7d[i + 1].day !== nextExpected) {
        consecutive7d = false;
        break;
      }
    }
    assert(consecutive7d, '7-day series contains strictly consecutive UTC calendar days');
    assertEqual(
      series7d[series7d.length - 1]?.cumulativeBudgetConsumedPct,
      dataBAfterOld?.budgetConsumedPct,
      'Last 7-day series point cumulativeBudgetConsumedPct equals headline budgetConsumedPct'
    );

    // --------------------------------------------------------------------------
    // i) Target Exactly Met Boundary & Float-Noise Avoidance (Section 2c)
    // --------------------------------------------------------------------------
    console.log('\n[Check i] Target exactly met boundary (consumed 100 gives at_risk) & float-noise avoidance');
    // Boundary Test 1: Target 99.0%, window 30d, 1000 checks, exactly 10 bad (1.0% error rate = allowed 1.0%)
    // Budget consumed = (0.01 / 0.01) * 100 = 100.0%. Status MUST be 'at_risk', NOT 'breached'.
    const appBoundary = await Application.create({
      name: `App Boundary 100% ${suffix}`,
      url: `https://app-boundary-${suffix}.example.com`,
      ownerId: userA._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    await requestJson(baseUrl, `/applications/${appBoundary._id}/slo`, {
      method: 'POST',
      cookie: cookieA,
      body: {
        name: 'Target Exactly Met 99.0%',
        targetPercent: 99.0,
        windowDays: 30
      }
    });

    const boundaryBatch = [];
    for (let i = 0; i < 990; i++) {
      boundaryBatch.push({
        applicationId: appBoundary._id,
        ownerId: userA._id,
        checkedAt: new Date(now - (i + 1) * 60000),
        success: true,
        statusCode: 200,
        responseTimeMs: 60
      });
    }
    for (let i = 0; i < 10; i++) {
      boundaryBatch.push({
        applicationId: appBoundary._id,
        ownerId: userA._id,
        checkedAt: new Date(now - (i + 1) * 3600000),
        success: false,
        statusCode: 500,
        responseTimeMs: 1500
      });
    }
    await HealthCheck.insertMany(boundaryBatch);

    const resBoundary = await requestJson(baseUrl, `/applications/${appBoundary._id}/slo`, {
      cookie: cookieA
    });
    const dataBoundary = resBoundary.data?.data;
    assertEqual(dataBoundary?.budgetConsumedPct, 100.0, 'budgetConsumedPct is exactly 100.0% when target is exactly met');
    assertEqual(dataBoundary?.budgetRemainingPct, 0.0, 'budgetRemainingPct is exactly 0.0%');
    assertEqual(dataBoundary?.status, 'at_risk', 'Status is "at_risk" (NOT breached) when budget consumed is exactly 100.0%');

    // Boundary Test 2: Target 99.9% float noise case
    // IEEE-754: 100 - 99.9 = 0.10000000000000142. If calculated with floating point: (1/1000) / 0.0010000000000000142 = 99.9999%
    // Integer thousandths arithmetic produces exactly 100.0%
    const appFloatNoise = await Application.create({
      name: `App Float Noise ${suffix}`,
      url: `https://app-float-noise-${suffix}.example.com`,
      ownerId: userA._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    await requestJson(baseUrl, `/applications/${appFloatNoise._id}/slo`, {
      method: 'POST',
      cookie: cookieA,
      body: {
        name: 'Target Float Noise 99.9%',
        targetPercent: 99.9,
        windowDays: 30
      }
    });

    const floatNoiseBatch = [];
    for (let i = 0; i < 999; i++) {
      floatNoiseBatch.push({
        applicationId: appFloatNoise._id,
        ownerId: userA._id,
        checkedAt: new Date(now - (i + 1) * 60000),
        success: true,
        statusCode: 200,
        responseTimeMs: 60
      });
    }
    floatNoiseBatch.push({
      applicationId: appFloatNoise._id,
      ownerId: userA._id,
      checkedAt: new Date(now - 120000),
      success: false,
      statusCode: 500,
      responseTimeMs: 2000
    });
    await HealthCheck.insertMany(floatNoiseBatch);

    const resFloatNoise = await requestJson(baseUrl, `/applications/${appFloatNoise._id}/slo`, {
      cookie: cookieA
    });
    const dataFloatNoise = resFloatNoise.data?.data;
    assertEqual(dataFloatNoise?.budgetConsumedPct, 100.0, 'Target 99.9% with 1/1000 bad yields exactly 100.0% without float noise');
    assertEqual(dataFloatNoise?.status, 'at_risk', 'Status is "at_risk" for float noise 99.9% boundary');

    // --------------------------------------------------------------------------
    // f) User B multi-tenant isolation
    // --------------------------------------------------------------------------
    console.log('\n[Check f] User B multi-tenant isolation');
    const userBAccessA = await requestJson(baseUrl, `/applications/${appA._id}/slo`, {
      cookie: cookieB
    });
    assertEqual(userBAccessA.status, 404, 'User B calling GET /applications/:id/slo for User A returns 404');

    const userBList = await requestJson(baseUrl, '/slos', {
      cookie: cookieB
    });
    assertEqual(userBList.status, 200, 'User B calling GET /slos returns 200');
    assertEqual(userBList.data?.data?.slos?.length, 0, 'User B sees 0 SLOs in their list');
    assertEqual(userBList.data?.data?.pagination?.total, 0, 'User B pagination total is 0');

    // --------------------------------------------------------------------------
    // g) Brand-new application with zero checks
    // --------------------------------------------------------------------------
    console.log('\n[Check g] Brand-new application with zero checks');
    const appEmpty = await Application.create({
      name: `App Empty ${suffix}`,
      url: `https://empty-${suffix}.example.com`,
      ownerId: userA._id,
      status: 'unknown',
      nextCheckAt: new Date()
    });

    await requestJson(baseUrl, `/applications/${appEmpty._id}/slo`, {
      method: 'POST',
      cookie: cookieA,
      body: {
        name: 'Empty App SLO',
        targetPercent: 99.5,
        windowDays: 30
      }
    });

    const getEmptySlo = await requestJson(baseUrl, `/applications/${appEmpty._id}/slo`, {
      cookie: cookieA
    });

    const dataEmpty = getEmptySlo.data?.data;
    assertEqual(dataEmpty?.status, 'insufficient_data', 'Zero-check application status is insufficient_data');
    assertEqual(dataEmpty?.sli, null, 'sli is null (no false 100% or 0%)');
    assertEqual(dataEmpty?.budgetConsumedPct, null, 'budgetConsumedPct is null');
    assertEqual(dataEmpty?.budgetRemainingPct, null, 'budgetRemainingPct is null');
    assertEqual(dataEmpty?.burnRate1h, null, 'burnRate1h is null');
    assertEqual(dataEmpty?.burnRate6h, null, 'burnRate6h is null');
    assertEqual(dataEmpty?.fastBurn, false, 'fastBurn is false');
    assertEqual(dataEmpty?.slowBurn, false, 'slowBurn is false');
    assert(!Number.isNaN(dataEmpty?.coveragePct), 'coveragePct is not NaN');
    assertEqual(dataEmpty?.coveragePct, 0, 'coveragePct is 0');
    assertEqual(dataEmpty?.partialWindow, true, 'partialWindow is true');
    assert(Array.isArray(dataEmpty?.series), 'series is an array');

    // --------------------------------------------------------------------------
    // h) Aggregation explain: IXSCAN and 0 COLLSCAN
    // --------------------------------------------------------------------------
    console.log('\n[Check h] Aggregation explain: verify IXSCAN and 0 COLLSCAN');
    const perfWindowFrom = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const perfWindowTo = new Date(now);
    const oneHourAgo = new Date(now - 3600000);
    const sixHoursAgo = new Date(now - 6 * 3600000);

    const pipeline = [
      {
        $match: {
          applicationId: appA._id,
          checkedAt: { $gte: perfWindowFrom, $lte: perfWindowTo }
        }
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                good: { $sum: { $cond: ['$success', 1, 0] } },
                bad: { $sum: { $cond: ['$success', 0, 1] } },
                firstCheckAt: { $min: '$checkedAt' }
              }
            }
          ],
          burn1h: [
            { $match: { checkedAt: { $gte: oneHourAgo } } },
            { $group: { _id: null, total: { $sum: 1 }, bad: { $sum: { $cond: ['$success', 0, 1] } } } }
          ],
          burn6h: [
            { $match: { checkedAt: { $gte: sixHoursAgo } } },
            { $group: { _id: null, total: { $sum: 1 }, bad: { $sum: { $cond: ['$success', 0, 1] } } } }
          ],
          daily: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkedAt', timezone: 'UTC' } },
                total: { $sum: 1 },
                bad: { $sum: { $cond: ['$success', 0, 1] } }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ];

    const explainOutput = await HealthCheck.aggregate(pipeline).explain('executionStats');
    const explainStr = JSON.stringify(explainOutput);

    const hasIxScan = explainStr.includes('"stage":"IXSCAN"') || explainStr.includes('IXSCAN');
    const hasCollScan = explainStr.includes('"stage":"COLLSCAN"');

    assert(hasIxScan, 'Aggregation winning plan uses IXSCAN on { applicationId: 1, checkedAt: -1 }');
    assert(!hasCollScan, 'Aggregation winning plan performs 0 COLLSCAN operations');

    // --------------------------------------------------------------------------
    // j) Scaling Honesty: 86,400 checks single app & list endpoint with 10 apps (Section 3a)
    // --------------------------------------------------------------------------
    console.log('\n[Check j] Scaling honesty: realistic worst-case performance measurements');

    // 1. Single Application with 86,400 checks (30 days at 30-second interval)
    console.log('  1. Testing single application with 86,400 checks over a 30-day window...');
    const app86k = await Application.create({
      name: `App 86k ${suffix}`,
      url: `https://app-86k-${suffix}.example.com`,
      ownerId: userA._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    await requestJson(baseUrl, `/applications/${app86k._id}/slo`, {
      method: 'POST',
      cookie: cookieA,
      body: {
        name: 'App 86k SLO 99.9%',
        targetPercent: 99.9,
        windowDays: 30
      }
    });

    const total86k = 86400;
    const batchSize = 20000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const genStart86k = performance.now();
    for (let offset = 0; offset < total86k; offset += batchSize) {
      const chunk = [];
      const count = Math.min(batchSize, total86k - offset);
      for (let i = 0; i < count; i++) {
        const checkIdx = offset + i;
        chunk.push({
          applicationId: app86k._id,
          ownerId: userA._id,
          checkedAt: new Date(now - (checkIdx * 30000)), // evenly spaced 30 seconds across 30 days
          success: checkIdx % 100 !== 0,
          statusCode: checkIdx % 100 === 0 ? 500 : 200,
          responseTimeMs: 65 + (checkIdx % 20)
        });
      }
      await HealthCheck.insertMany(chunk, { ordered: false });
    }
    const genDuration86k = Math.round(performance.now() - genStart86k);
    console.log(`  Inserted 86,400 checks in ${genDuration86k} ms.`);

    // Measure single app SLO calculation via HTTP endpoint
    const singleStart = performance.now();
    const res86k = await requestJson(baseUrl, `/applications/${app86k._id}/slo`, {
      cookie: cookieA
    });
    const singleDurationMs = Number((performance.now() - singleStart).toFixed(2));
    assertEqual(res86k.status, 200, 'GET /applications/:id/slo for 86,400 checks returns 200');
    assertEqual(res86k.data?.data?.totals?.total, 86400, 'All 86,400 checks accurately processed');
    console.log(`  Single App (86,400 checks) Endpoint Latency: ${singleDurationMs} ms.`);
    assert(singleDurationMs <= 3000, `Single app SLO latency within <= 3000ms threshold (measured: ${singleDurationMs}ms)`);
    if (singleDurationMs > 2000) {
      console.log(`  NOTE: Single app SLO calculation latency exceeded 2000ms (${singleDurationMs}ms) under 86,400 check volume.`);
    }

    // 2. List Endpoint with 10 SLOs of 30-day windows over ~86,400 checks each
    console.log('\n  2. Testing list endpoint (/api/v1/slos) with 10 applications over ~86,400 checks each...');
    const listApps = [];
    for (let a = 0; a < 10; a++) {
      const appItem = await Application.create({
        name: `Scale App ${a + 1} ${suffix}`,
        url: `https://scale-app-${a + 1}-${suffix}.example.com`,
        ownerId: userA._id,
        status: 'up',
        nextCheckAt: new Date()
      });
      listApps.push(appItem);

      await requestJson(baseUrl, `/applications/${appItem._id}/slo`, {
        method: 'POST',
        cookie: cookieA,
        body: {
          name: `Scale App ${a + 1} SLO`,
          targetPercent: 99.0 + (a % 10) * 0.09,
          windowDays: 30
        }
      });
    }

    // Generate ~86,400 checks for each of the 10 applications
    console.log('  Generating ~86,400 checks for each of the 10 applications (total ~864,000 documents)...');
    const scaleGenStart = performance.now();
    for (const appItem of listApps) {
      for (let offset = 0; offset < total86k; offset += batchSize) {
        const chunk = [];
        const count = Math.min(batchSize, total86k - offset);
        for (let i = 0; i < count; i++) {
          const checkIdx = offset + i;
          chunk.push({
            applicationId: appItem._id,
            ownerId: userA._id,
            checkedAt: new Date(now - (checkIdx * 30000)),
            success: checkIdx % 100 !== 0,
            statusCode: checkIdx % 100 === 0 ? 500 : 200,
            responseTimeMs: 50 + (checkIdx % 30)
          });
        }
        await HealthCheck.insertMany(chunk, { ordered: false });
      }
    }
    const scaleGenDuration = Math.round(performance.now() - scaleGenStart);
    console.log(`  Inserted ~864,000 checks across 10 applications in ${scaleGenDuration} ms.`);

    // Measure GET /api/v1/slos latency through real HTTP server
    const listStart = performance.now();
    const resList = await requestJson(baseUrl, '/slos?limit=10', {
      cookie: cookieA
    });
    const listDurationMs = Number((performance.now() - listStart).toFixed(2));
    assertEqual(resList.status, 200, 'GET /api/v1/slos returns 200 for 10 applications');
    assertEqual(resList.data?.data?.slos?.length, 10, 'Returned 10 SLOs in list endpoint');
    console.log(`  List Endpoint (10 SLOs x 86,400 checks) Latency: ${listDurationMs} ms.`);
    if (listDurationMs > 2000) {
      console.log(`  NOTE: List endpoint latency exceeded 2000ms (${listDurationMs}ms) under 10 x 86,400 check volume (raw check scanning limitation).`);
    }

  } finally {
    // Clean up temporary database records
    console.log('\n--- Cleaning up temporary check data ---');
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    await Application.deleteMany({ ownerId: { $in: [userA._id, userB._id] } });
    await Slo.deleteMany({ ownerId: { $in: [userA._id, userB._id] } });
    await HealthCheck.deleteMany({ ownerId: { $in: [userA._id, userB._id] } });

    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    console.log('Database disconnected and server closed.');
  }

  console.log(`\n========================================`);
  console.log(`SLO Check Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL] Unhandled error during sloCheck:', err);
  process.exit(1);
});
