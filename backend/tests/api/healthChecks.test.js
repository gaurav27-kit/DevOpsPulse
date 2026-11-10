import http from 'http';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { Application } from '../../src/models/Application.js';
import { HealthCheck } from '../../src/models/HealthCheck.js';
import { createTestUser, getAuthCookie } from '../helpers.js';

// Scoped mock: allow 127.0.0.1 and localhost ONLY for this test file so the local mock server can be reached
vi.mock('../../src/services/urlSafetyService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isPrivateOrSpecialIp: (ip) => {
      if (ip === '127.0.0.1' || ip === '::1') return false;
      return actual.isPrivateOrSpecialIp(ip);
    },
    assertSafeUrlSyntax: (url) => {
      return url;
    },
    assertSafeDestination: async (url) => {
      return url;
    }
  };
});

describe('Health Checks API (/api/v1/applications/:id/check & /health-checks)', () => {
  let server;
  let serverPort;
  let serverStatus = 200;

  beforeAll(async () => {
    await new Promise((resolve) => {
      server = http.createServer((req, res) => {
        if (serverStatus === 200) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('OK');
        } else if (serverStatus === 500) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      });
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('triggers manual health check and returns classified result', async () => {
    serverStatus = 200;
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Local Target',
      url: `http://127.0.0.1:${serverPort}`,
      ownerId: user._id,
      environment: 'production',
      nextCheckAt: new Date()
    });

    const checkRes = await request(app)
      .post(`/api/v1/applications/${appDoc._id}/check`)
      .set('Cookie', cookie);

    expect(checkRes.status).toBe(200);
    expect(checkRes.body.success).toBe(true);
    expect(checkRes.body.data.healthCheck).toBeTruthy();
    expect(checkRes.body.data.healthCheck.success).toBe(true);
    expect(checkRes.body.data.healthCheck.statusCode).toBe(200);
    expect(typeof checkRes.body.data.healthCheck.responseTimeMs).toBe('number');
    expect(checkRes.body.data.application.status).toBe('up');
  });

  it('returns 409 when check lock is currently held', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Locked Target',
      url: `http://127.0.0.1:${serverPort}`,
      ownerId: user._id,
      environment: 'production',
      nextCheckAt: new Date(),
      checkLockUntil: new Date(Date.now() + 30000) // held for 30s
    });

    const checkRes = await request(app)
      .post(`/api/v1/applications/${appDoc._id}/check`)
      .set('Cookie', cookie);

    expect(checkRes.status).toBe(409);
    expect(checkRes.body.success).toBe(false);
    expect(checkRes.body.message).toContain('already running');
  });

  it('history endpoint paginates, filters by success, and orders', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'History App',
      url: `http://127.0.0.1:${serverPort}`,
      ownerId: user._id,
      environment: 'production',
      nextCheckAt: new Date()
    });

    const baseTime = Date.now() - 60000;
    await HealthCheck.insertMany([
      {
        applicationId: appDoc._id,
        ownerId: user._id,
        success: true,
        statusCode: 200,
        responseTimeMs: 80,
        checkedAt: new Date(baseTime + 1000)
      },
      {
        applicationId: appDoc._id,
        ownerId: user._id,
        success: false,
        statusCode: 500,
        responseTimeMs: 120,
        errorType: 'http_error',
        checkedAt: new Date(baseTime + 2000)
      },
      {
        applicationId: appDoc._id,
        ownerId: user._id,
        success: true,
        statusCode: 200,
        responseTimeMs: 90,
        checkedAt: new Date(baseTime + 3000)
      }
    ]);

    // List all
    const allRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/health-checks`)
      .set('Cookie', cookie);
    expect(allRes.status).toBe(200);
    expect(allRes.body.data.healthChecks).toHaveLength(3);

    // Filter success=true
    const successRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/health-checks?success=true`)
      .set('Cookie', cookie);
    expect(successRes.status).toBe(200);
    expect(successRes.body.data.healthChecks).toHaveLength(2);
    expect(successRes.body.data.healthChecks.every((h) => h.success === true)).toBe(true);

    // Filter success=false
    const failRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/health-checks?success=false`)
      .set('Cookie', cookie);
    expect(failRes.status).toBe(200);
    expect(failRes.body.data.healthChecks).toHaveLength(1);
    expect(failRes.body.data.healthChecks[0].success).toBe(false);

    // Order asc vs desc
    const ascRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/health-checks?order=asc`)
      .set('Cookie', cookie);
    expect(ascRes.status).toBe(200);
    const firstAsc = new Date(ascRes.body.data.healthChecks[0].checkedAt).getTime();
    const lastAsc = new Date(ascRes.body.data.healthChecks[2].checkedAt).getTime();
    expect(firstAsc).toBeLessThan(lastAsc);
  });

  it('rejects invalid date parameters with 400', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Date App',
      url: `http://127.0.0.1:${serverPort}`,
      ownerId: user._id,
      environment: 'production',
      nextCheckAt: new Date()
    });

    const res = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/health-checks?from=not-a-date`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

