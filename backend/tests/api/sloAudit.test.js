import http from 'http';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { Application } from '../../src/models/Application.js';
import { HealthCheck } from '../../src/models/HealthCheck.js';
import { HealthCheckDaily } from '../../src/models/HealthCheckDaily.js';
import { Slo } from '../../src/models/Slo.js';
import { createTestUser, getAuthCookie } from '../helpers.js';
import { runHealthCheck } from '../../src/services/healthCheckService.js';
import { triggerManualCheck } from '../../src/services/healthCheckApiService.js';
import { processCheckResult } from '../../src/services/schedulerService.js';
import { getSloForApplication } from '../../src/services/sloService.js';
import { computeSloStats, buildBurnDownSeries } from '../../src/services/sloRules.js';

// Scoped mock: allow 127.0.0.1 and localhost for mock server testing
vi.mock('../../src/services/urlSafetyService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isPrivateOrSpecialIp: (ip) => {
      if (ip === '127.0.0.1' || ip === '::1') return false;
      return actual.isPrivateOrSpecialIp(ip);
    },
    assertSafeUrlSyntax: (url) => url,
    assertSafeDestination: async (url) => url
  };
});

describe('SLO Audit Verification Suite (backend/tests/api/sloAudit.test.js)', () => {
  let mockServer;
  let mockPort;
  let mockBaseUrl;

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathname = url.pathname;

      if (pathname === '/status/200') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK 200');
      } else if (pathname === '/status/204') {
        res.writeHead(204);
        res.end();
      } else if (pathname === '/status/301-to-200') {
        res.writeHead(301, { Location: `${mockBaseUrl}/status/200` });
        res.end();
      } else if (pathname === '/status/redirect-loop-1') {
        res.writeHead(301, { Location: `${mockBaseUrl}/status/redirect-loop-2` });
        res.end();
      } else if (pathname === '/status/redirect-loop-2') {
        res.writeHead(301, { Location: `${mockBaseUrl}/status/redirect-loop-1` });
        res.end();
      } else if (pathname === '/status/304') {
        res.writeHead(304);
        res.end();
      } else if (pathname === '/status/400') {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request');
      } else if (pathname === '/status/401') {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
      } else if (pathname === '/status/403') {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
      } else if (pathname === '/status/404') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else if (pathname === '/status/429') {
        res.writeHead(429, { 'Content-Type': 'text/plain' });
        res.end('Too Many Requests');
      } else if (pathname === '/status/500') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else if (pathname === '/status/503') {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Service Unavailable');
      } else if (pathname === '/status/timeout') {
        // Hang indefinitely so timeout fires
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        mockPort = mockServer.address().port;
        mockBaseUrl = `http://127.0.0.1:${mockPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  describe('Audit Point 1 & Part 6: HTTP Status Code Classification Matrix', () => {
    const cases = [
      { path: '/status/200', expectedSuccess: true, expectedStatus: 200, expectedErrorType: null, policyFlag: 'Standard OK' },
      { path: '/status/204', expectedSuccess: true, expectedStatus: 204, expectedErrorType: null, policyFlag: 'Standard No Content' },
      { path: '/status/301-to-200', expectedSuccess: true, expectedStatus: 200, expectedErrorType: null, policyFlag: 'Followed redirect to 200' },
      { path: '/status/redirect-loop-1', expectedSuccess: false, expectedStatus: 301, expectedErrorType: 'too_many_redirects', policyFlag: 'Exceeded max redirects' },
      { path: '/status/304', expectedSuccess: true, expectedStatus: 304, expectedErrorType: null, policyFlag: 'Not Modified (valid cache)' },
      { path: '/status/400', expectedSuccess: false, expectedStatus: 400, expectedErrorType: 'http_error', policyFlag: 'Client error' },
      { path: '/status/401', expectedSuccess: false, expectedStatus: 401, expectedErrorType: 'http_error', policyFlag: 'DECISION NEEDED (Auth barrier vs service health)' },
      { path: '/status/403', expectedSuccess: false, expectedStatus: 403, expectedErrorType: 'http_error', policyFlag: 'DECISION NEEDED (Rate limiting / IP ban vs outage)' },
      { path: '/status/404', expectedSuccess: false, expectedStatus: 404, expectedErrorType: 'http_error', policyFlag: 'Endpoint missing' },
      { path: '/status/429', expectedSuccess: false, expectedStatus: 429, expectedErrorType: 'http_error', policyFlag: 'DECISION NEEDED (Rate limit throttle vs server failure)' },
      { path: '/status/500', expectedSuccess: false, expectedStatus: 500, expectedErrorType: 'http_error', policyFlag: 'Server failure' },
      { path: '/status/503', expectedSuccess: false, expectedStatus: 503, expectedErrorType: 'http_error', policyFlag: 'Service unavailable' },
      { path: '/status/timeout', expectedSuccess: false, expectedStatus: null, expectedErrorType: 'timeout', policyFlag: 'Hard timeout exceeded' }
    ];

    it('records and classifies each status code matching the classification matrix', async () => {
      console.log('\n--- CLASSIFICATION TEST TABLE ---');
      console.log('| Status Code Target | Recorded Status | Success | Error Type | Policy Note |');
      console.log('| --- | --- | --- | --- | --- |');

      for (const tc of cases) {
        const dummyApp = {
          url: `${mockBaseUrl}${tc.path}`,
          timeoutMs: tc.path === '/status/timeout' ? 200 : 2000
        };

        const result = await runHealthCheck(dummyApp);

        console.log(`| ${tc.path} | ${result.statusCode} | ${result.success} | ${result.errorType || 'none'} | ${tc.policyFlag} |`);

        expect(result.success).toBe(tc.expectedSuccess);
        expect(result.statusCode).toBe(tc.expectedStatus);
        expect(result.errorType).toBe(tc.expectedErrorType);
      }
    });
  });

  describe('Audit Point 2: Manual "Check now" results are included in SLO calculations', () => {
    it('verifies manual trigger updates HealthCheck and counts towards SLO metrics', async () => {
      const { user } = await createTestUser();
      const cookie = getAuthCookie(user);

      const appDoc = await Application.create({
        name: 'Manual Check Inclusion App',
        url: `${mockBaseUrl}/status/200`,
        ownerId: user._id,
        status: 'up',
        nextCheckAt: new Date(),
        timeoutMs: 2000
      });

      await Slo.create({
        applicationId: appDoc._id,
        ownerId: user._id,
        name: 'Manual Check SLO',
        targetPercent: 99.0,
        windowDays: 30
      });

      // 1. Seed 24 successful checks directly into HealthCheck and HealthCheckDaily
      const now = new Date();
      const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const checks = [];
      for (let i = 0; i < 24; i++) {
        checks.push({
          applicationId: appDoc._id,
          ownerId: user._id,
          checkedAt: new Date(now.getTime() - (24 - i) * 60000),
          success: true,
          statusCode: 200,
          responseTimeMs: 50
        });
      }
      await HealthCheck.insertMany(checks);
      await HealthCheckDaily.create({
        applicationId: appDoc._id,
        ownerId: user._id,
        day: startOfToday,
        total: 24,
        good: 24
      });

      // Verify baseline SLO before manual check: 24 total, 24 good, 0 bad
      // Expected SLI: (24 / 24) * 100 = 100.00%
      const beforeSlo = await getSloForApplication(user._id, appDoc._id);
      expect(beforeSlo.totals.total).toBe(24);
      expect(beforeSlo.totals.good).toBe(24);
      expect(beforeSlo.totals.bad).toBe(0);
      expect(beforeSlo.sli).toBe(100.0);

      // 2. Perform a manual check via API
      const res = await request(app)
        .post(`/api/v1/applications/${appDoc._id}/check`)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);

      // 3. Verify SLO includes the manual check: 25 total, 25 good, 0 bad
      // Plain arithmetic: expected total = 24 + 1 = 25
      const afterSlo = await getSloForApplication(user._id, appDoc._id);
      console.log(`[Manual Check Inclusion] Total checks before: ${beforeSlo.totals.total}, after: ${afterSlo.totals.total}`);
      expect(afterSlo.totals.total).toBe(25);
      expect(afterSlo.totals.good).toBe(25);
      expect(afterSlo.totals.bad).toBe(0);
    });
  });

  describe('Audit Point 3: Checks from before a URL change are retained in SLO calculations', () => {
    it('retains past check history when an application URL is updated', async () => {
      const { user } = await createTestUser();
      const cookie = getAuthCookie(user);

      const appDoc = await Application.create({
        name: 'URL Change Retention App',
        url: 'https://old-service.example.com/api',
        ownerId: user._id,
        status: 'up',
        nextCheckAt: new Date()
      });

      await Slo.create({
        applicationId: appDoc._id,
        ownerId: user._id,
        name: 'URL Change SLO',
        targetPercent: 99.0,
        windowDays: 30
      });

      // Seed 22 checks under old URL: 20 good, 2 bad
      const now = new Date();
      const checks = [];
      for (let i = 0; i < 22; i++) {
        checks.push({
          applicationId: appDoc._id,
          ownerId: user._id,
          checkedAt: new Date(now.getTime() - (22 - i) * 60000),
          success: i < 20,
          statusCode: i < 20 ? 200 : 500,
          responseTimeMs: 60
        });
      }
      await HealthCheck.insertMany(checks);

      // Verify SLO before URL update:
      // Plain arithmetic:
      // good = 20, total = 22, bad = 2
      // target = 99.0 -> allowedErrorMilli = 100000 - 99000 = 1000
      // expected SLI = (20 / 22) * 100 = 90.91%
      // expected consumed = (2 * 10000000) / (22 * 1000) = 909.09%
      const beforeSlo = await getSloForApplication(user._id, appDoc._id);
      expect(beforeSlo.totals.total).toBe(22);
      expect(beforeSlo.totals.good).toBe(20);
      expect(beforeSlo.totals.bad).toBe(2);
      expect(beforeSlo.sli).toBe(90.91);

      // Update URL via PATCH /api/v1/applications/:id
      const updateRes = await request(app)
        .patch(`/api/v1/applications/${appDoc._id}`)
        .set('Cookie', cookie)
        .send({ url: 'https://new-service.example.com/api' });
      expect(updateRes.status).toBe(200);

      // Verify SLO after URL update: all 22 historical checks are strictly preserved
      const afterSlo = await getSloForApplication(user._id, appDoc._id);
      console.log(`[URL Change Retention] SLO total before: ${beforeSlo.totals.total}, after: ${afterSlo.totals.total}`);
      expect(afterSlo.totals.total).toBe(22);
      expect(afterSlo.totals.good).toBe(20);
      expect(afterSlo.totals.bad).toBe(2);
      expect(afterSlo.sli).toBe(90.91);
      expect(afterSlo.budgetConsumedPct).toBe(beforeSlo.budgetConsumedPct);
    });
  });

  describe('Audit Point 7: Duplicates Concurrency & Locking Proof', () => {
    it('demonstrates lock prevents concurrent scheduler and manual checks from duplicating', async () => {
      const { user } = await createTestUser();

      const appDoc = await Application.create({
        name: 'Concurrency Lock App',
        url: `${mockBaseUrl}/status/200`,
        ownerId: user._id,
        status: 'up',
        checkIntervalSeconds: 30,
        timeoutMs: 2000,
        nextCheckAt: new Date(Date.now() - 5000), // due for scheduler tick
        checkLockUntil: null
      });

      // Simultaneous race: Scheduler claiming lock vs Manual check claiming lock
      const now = new Date();
      const schedulerClaimPromise = Application.findOneAndUpdate(
        {
          _id: appDoc._id,
          nextCheckAt: { $lte: now },
          $or: [{ checkLockUntil: null }, { checkLockUntil: { $lte: now } }]
        },
        { $set: { checkLockUntil: new Date(now.getTime() + 30000) } },
        { new: true }
      );

      const manualTriggerPromise = triggerManualCheck(user._id, appDoc._id)
        .then(() => ({ success: true }))
        .catch((err) => ({ success: false, error: err.message, statusCode: err.statusCode }));

      const [schedulerClaimed, manualResult] = await Promise.all([
        schedulerClaimPromise,
        manualTriggerPromise
      ]);

      console.log(`[Concurrency Proof] Scheduler claimed: ${Boolean(schedulerClaimed)}, Manual check result:`, manualResult);

      // One of them must win and lock; the other must be locked out
      if (schedulerClaimed) {
        expect(manualResult.success).toBe(false);
        expect(manualResult.statusCode).toBe(409);
        expect(manualResult.error).toContain('A check is already running');
      } else {
        expect(manualResult.success).toBe(true);
      }
    });

    it('demonstrates that direct processCheckResult calls without locking insert multiple checks in the same second', async () => {
      const { user } = await createTestUser();
      const appDoc = await Application.create({
        name: 'Direct Call App',
        url: `${mockBaseUrl}/status/200`,
        ownerId: user._id,
        status: 'up',
        nextCheckAt: new Date()
      });

      // Direct calls bypassing the lock executed immediately in the same second
      await Promise.all([
        processCheckResult(appDoc, { success: true, statusCode: 200, responseTimeMs: 40 }),
        processCheckResult(appDoc, { success: true, statusCode: 200, responseTimeMs: 45 })
      ]);

      const inserted = await HealthCheck.find({ applicationId: appDoc._id }).sort({ checkedAt: 1 });
      console.log(`[Direct ProcessCheckResult Proof] Records created concurrently: ${inserted.length}`);
      // Without an index or caller lock, both records are inserted
      expect(inserted.length).toBe(2);
      const diffMs = Math.abs(new Date(inserted[1].checkedAt).getTime() - new Date(inserted[0].checkedAt).getTime());
      expect(diffMs).toBeLessThan(1000); // executed within the same second
    });
  });

  describe('Audit Point 8: Timezone Invariance (TZ=UTC vs TZ=Asia/Kolkata)', () => {
    it('produces identical day bucket series and window boundaries under UTC and Asia/Kolkata', () => {
      const dailyCounts = [
        { day: '2026-11-01', total: 100, bad: 1 },
        { day: '2026-11-02', total: 100, bad: 0 },
        { day: '2026-11-03', total: 100, bad: 2 }
      ];
      const from = new Date('2026-11-01T00:00:00.000Z');
      const to = new Date('2026-11-03T23:59:59.999Z');
      const targetPercent = 99.9;
      const totalInWindow = 300;

      // Run under default environment
      const series1 = buildBurnDownSeries(dailyCounts, from, to, targetPercent, totalInWindow);

      // Simulate Asia/Kolkata (+05:30) offset
      const originalTz = process.env.TZ;
      process.env.TZ = 'Asia/Kolkata';
      const seriesKolkata = buildBurnDownSeries(dailyCounts, from, to, targetPercent, totalInWindow);

      // Simulate UTC offset
      process.env.TZ = 'UTC';
      const seriesUtc = buildBurnDownSeries(dailyCounts, from, to, targetPercent, totalInWindow);

      process.env.TZ = originalTz;

      expect(seriesKolkata).toEqual(seriesUtc);
      expect(seriesKolkata.length).toBe(seriesUtc.length);
      console.log(`[Timezone Test] Day buckets match between UTC and Asia/Kolkata: ${seriesKolkata.length} points.`);
    });
  });
});
