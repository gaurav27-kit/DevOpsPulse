import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import dns from 'dns/promises';
import app from '../../src/app.js';
import { Application } from '../../src/models/Application.js';
import { HealthCheck } from '../../src/models/HealthCheck.js';
import { Incident } from '../../src/models/Incident.js';
import { Deployment } from '../../src/models/Deployment.js';
import { createTestUser, getAuthCookie } from '../helpers.js';

describe('Applications API (/api/v1/applications)', () => {
  it('creates an application with defaults, and strict schema rejects unexpected fields', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    // 1. Happy path create with defaults
    const createRes = await request(app)
      .post('/api/v1/applications')
      .set('Cookie', cookie)
      .send({
        name: 'My Service',
        url: 'https://example.com'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.application.name).toBe('My Service');
    expect(createRes.body.data.application.environment).toBe('production'); // default
    expect(createRes.body.data.application.status).toBe('unknown'); // default
    expect(createRes.body.data.application.checkIntervalSeconds).toBe(300); // default
    expect(createRes.body.data.application.timeoutMs).toBe(10000); // default

    // 2. Strict body rejection: ownerId, status, lastCheckedAt cannot be supplied by client
    const strictRes = await request(app)
      .post('/api/v1/applications')
      .set('Cookie', cookie)
      .send({
        name: 'Hacked App',
        url: 'https://example.org',
        ownerId: '507f1f77bcf86cd799439011',
        status: 'up',
        lastCheckedAt: new Date().toISOString()
      });

    expect(strictRes.status).toBe(400);
    expect(strictRes.body.success).toBe(false);
  });

  it('rejects unsafe destination URLs (SSRF protection)', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const unsafeUrls = [
      'http://localhost:3000',
      'http://127.0.0.1:8080',
      'http://10.0.0.5/api',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]:8080',
      'ftp://example.com/file',
      'http://user:pass@example.com'
    ];

    for (const badUrl of unsafeUrls) {
      const res = await request(app)
        .post('/api/v1/applications')
        .set('Cookie', cookie)
        .send({ name: 'Unsafe App', url: badUrl });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    }

    // Public hostname that resolves to a private IP (DNS rebinding / spoofing)
    const lookupSpy = vi.spyOn(dns, 'lookup').mockResolvedValueOnce([
      { address: '127.0.0.1', family: 4 }
    ]);

    const dnsMockRes = await request(app)
      .post('/api/v1/applications')
      .set('Cookie', cookie)
      .send({ name: 'Spoofed Host', url: 'https://sneaky-public-dns.example.com' });

    expect(dnsMockRes.status).toBe(400);
    lookupSpy.mockRestore();
  });

  it('duplicate URL returns 409 for the same user', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    await request(app)
      .post('/api/v1/applications')
      .set('Cookie', cookie)
      .send({ name: 'App One', url: 'https://dup-test.example.com' });

    const dupRes = await request(app)
      .post('/api/v1/applications')
      .set('Cookie', cookie)
      .send({ name: 'App Two', url: 'https://dup-test.example.com' });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.success).toBe(false);
  });

  it('lists applications with pagination (max 50), filters, and safe search with regex metacharacters', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    // Create applications
    const nextCheck = new Date();
    await Application.create([
      { name: 'Prod API', url: 'https://prod-api.example.com', ownerId: user._id, environment: 'production', status: 'up', nextCheckAt: nextCheck },
      { name: 'Staging API', url: 'https://stage-api.example.com', ownerId: user._id, environment: 'staging', status: 'down', nextCheckAt: nextCheck },
      { name: 'Special App [Test]', url: 'https://special.example.com', ownerId: user._id, environment: 'development', status: 'unknown', nextCheckAt: nextCheck }
    ]);

    // 1. Pagination limit max 50 enforcement
    const overLimitRes = await request(app)
      .get('/api/v1/applications?limit=100')
      .set('Cookie', cookie);
    expect(overLimitRes.status).toBe(400);

    // 2. Sort allowlist (sortBy=passwordHash must be rejected with 400)
    const badSortRes = await request(app)
      .get('/api/v1/applications?sortBy=passwordHash')
      .set('Cookie', cookie);
    expect(badSortRes.status).toBe(400);

    // 3. Status and environment filters
    const filterRes = await request(app)
      .get('/api/v1/applications?environment=production&status=up')
      .set('Cookie', cookie);
    expect(filterRes.status).toBe(200);
    expect(filterRes.body.data.applications.length).toBe(1);
    expect(filterRes.body.data.applications[0].name).toBe('Prod API');

    // 4. Safe q search with regex metacharacters like "(.*" and "["
    const regexSearch1 = await request(app)
      .get('/api/v1/applications?q=' + encodeURIComponent('(.*'))
      .set('Cookie', cookie);
    expect(regexSearch1.status).toBe(200);

    const regexSearch2 = await request(app)
      .get('/api/v1/applications?q=' + encodeURIComponent('['))
      .set('Cookie', cookie);
    expect(regexSearch2.status).toBe(200);
    expect(regexSearch2.body.data.applications.length).toBe(1);
    expect(regexSearch2.body.data.applications[0].name).toBe('Special App [Test]');
  });

  it('updating URL resets status to unknown and resets failure/success counters', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Initial App',
      url: 'https://initial.example.com',
      ownerId: user._id,
      status: 'down',
      consecutiveFailures: 5,
      consecutiveSuccesses: 0,
      lastCheckedAt: new Date(),
      nextCheckAt: new Date()
    });

    const updateRes = await request(app)
      .patch(`/api/v1/applications/${appDoc._id}`)
      .set('Cookie', cookie)
      .send({ url: 'https://new-url.example.com' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.application.status).toBe('unknown');
    expect(updateRes.body.data.application.consecutiveFailures).toBe(0);
    expect(updateRes.body.data.application.consecutiveSuccesses).toBe(0);
    expect(updateRes.body.data.application.lastCheckedAt).toBeNull();
  });

  it('rejects invalid ObjectId with 400', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const res = await request(app)
      .get('/api/v1/applications/invalid-not-an-id')
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
  });

  it('deleting an application cascades to health checks, incidents, and deployments', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'To Delete',
      url: 'https://to-delete.example.com',
      ownerId: user._id,
      nextCheckAt: new Date()
    });

    // Create child records
    await HealthCheck.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      checkedAt: new Date(),
      success: true,
      responseTimeMs: 150
    });

    await Incident.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      title: 'Outage',
      severity: 'high',
      status: 'open',
      isActive: true,
      startedAt: new Date(),
      failureCount: 2
    });

    await Deployment.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      version: '1.0.0',
      status: 'success',
      source: 'manual',
      startedAt: new Date(),
      environment: 'production'
    });

    // Delete application
    const deleteRes = await request(app)
      .delete(`/api/v1/applications/${appDoc._id}`)
      .set('Cookie', cookie);

    expect(deleteRes.status).toBe(200);

    // Verify cascade deletion
    const checksCount = await HealthCheck.countDocuments({ applicationId: appDoc._id });
    const incidentsCount = await Incident.countDocuments({ applicationId: appDoc._id });
    const deploymentsCount = await Deployment.countDocuments({ applicationId: appDoc._id });

    expect(checksCount).toBe(0);
    expect(incidentsCount).toBe(0);
    expect(deploymentsCount).toBe(0);
  });
});

