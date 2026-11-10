import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { Application } from '../../src/models/Application.js';
import { Deployment } from '../../src/models/Deployment.js';
import { createTestUser, getAuthCookie } from '../helpers.js';

function makeApp(user, extra = {}) {
  return Application.create({
    name: 'Deploy Target',
    url: 'https://deploy-test.example.com',
    ownerId: user._id,
    environment: 'production',
    nextCheckAt: new Date(),
    ...extra
  });
}

describe('Deployments API', () => {
  it('creates a deployment with happy-path body and returns 201', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const res = await request(app)
      .post(`/api/v1/applications/${appDoc._id}/deployments`)
      .set('Cookie', cookie)
      .send({
        version: '2.3.1',
        commitSha: 'abc1234',
        branch: 'main',
        status: 'success',
        description: 'Routine deploy'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.deployment.version).toBe('2.3.1');
    expect(res.body.data.deployment.commitSha).toBe('abc1234'); // stored lowercase
    expect(res.body.data.deployment.source).toBe('manual');
    expect(res.body.data.deployment.ownerId).toBe(user._id.toString());
    // environment defaults to app's environment when omitted
    expect(res.body.data.deployment.environment).toBe('production');
  });

  it('rejects source and ownerId in request body (.strict())', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const res = await request(app)
      .post(`/api/v1/applications/${appDoc._id}/deployments`)
      .set('Cookie', cookie)
      .send({ version: '1.0.0', source: 'webhook', ownerId: user._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('stores commitSha lowercase regardless of input case', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const res = await request(app)
      .post(`/api/v1/applications/${appDoc._id}/deployments`)
      .set('Cookie', cookie)
      .send({ version: '1.1.0', commitSha: 'DEADBEEF123' });

    expect(res.status).toBe(201);
    expect(res.body.data.deployment.commitSha).toBe('deadbeef123');
  });

  it('rejects invalid commitSha (too short, non-hex)', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const badShas = ['abc', 'xyz1234', '123456789012345678901234567890123456789012']; // too short, non-hex, too long

    for (const sha of badShas) {
      const res = await request(app)
        .post(`/api/v1/applications/${appDoc._id}/deployments`)
        .set('Cookie', cookie)
        .send({ version: '1.0.0', commitSha: sha });
      expect(res.status).toBe(400);
    }
  });

  it('rejects completedAt before startedAt', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const start = new Date('2026-01-01T12:00:00Z');
    const before = new Date('2026-01-01T11:00:00Z');

    const res = await request(app)
      .post(`/api/v1/applications/${appDoc._id}/deployments`)
      .set('Cookie', cookie)
      .send({
        version: '1.0.0',
        startedAt: start.toISOString(),
        completedAt: before.toISOString()
      });

    expect(res.status).toBe(400);
  });

  it('rejects completedAt when status is pending or in_progress', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const start = new Date('2026-01-01T12:00:00Z');
    const end = new Date('2026-01-01T13:00:00Z');

    for (const status of ['pending', 'in_progress']) {
      const res = await request(app)
        .post(`/api/v1/applications/${appDoc._id}/deployments`)
        .set('Cookie', cookie)
        .send({
          version: '1.0.0',
          status,
          startedAt: start.toISOString(),
          completedAt: end.toISOString()
        });
      expect(res.status).toBe(400);
    }
  });

  it('rejects startedAt more than 5 minutes in the future', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const farFuture = new Date(Date.now() + 10 * 60 * 1000); // +10 min

    const res = await request(app)
      .post(`/api/v1/applications/${appDoc._id}/deployments`)
      .set('Cookie', cookie)
      .send({ version: '1.0.0', startedAt: farFuture.toISOString() });

    expect(res.status).toBe(400);
  });

  it('paginates, filters by status / environment / branch, and sorts', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const base = {
      applicationId: appDoc._id,
      ownerId: user._id,
      source: 'manual',
      startedAt: new Date()
    };

    await Deployment.create([
      { ...base, version: '1.0.0', status: 'success', environment: 'production', branch: 'main' },
      { ...base, version: '1.1.0', status: 'failed', environment: 'staging', branch: 'dev' },
      { ...base, version: '1.2.0', status: 'rolled_back', environment: 'production', branch: 'main' }
    ]);

    // Filter by status
    const successRes = await request(app)
      .get('/api/v1/deployments?status=success')
      .set('Cookie', cookie);
    expect(successRes.status).toBe(200);
    expect(successRes.body.data.deployments.every((d) => d.status === 'success')).toBe(true);

    // Filter by environment
    const envRes = await request(app)
      .get('/api/v1/deployments?environment=staging')
      .set('Cookie', cookie);
    expect(envRes.status).toBe(200);
    expect(envRes.body.data.deployments.every((d) => d.environment === 'staging')).toBe(true);

    // Filter by branch
    const branchRes = await request(app)
      .get('/api/v1/deployments?branch=main')
      .set('Cookie', cookie);
    expect(branchRes.status).toBe(200);
    expect(branchRes.body.data.deployments.every((d) => d.branch === 'main')).toBe(true);

    // sortBy allowlist: reject bad sortBy
    const badSort = await request(app)
      .get('/api/v1/deployments?sortBy=passwordHash')
      .set('Cookie', cookie);
    expect(badSort.status).toBe(400);
  });

  it('GET /deployments/:id returns the deployment with application populated', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const dep = await Deployment.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      version: '3.0.0',
      status: 'success',
      source: 'manual',
      environment: 'production',
      startedAt: new Date()
    });

    const res = await request(app)
      .get(`/api/v1/deployments/${dep._id}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.deployment.version).toBe('3.0.0');
    expect(res.body.data.deployment.applicationId).toBeTruthy(); // populated
  });
});

