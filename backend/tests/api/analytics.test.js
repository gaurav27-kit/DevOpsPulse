import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { Application } from '../../src/models/Application.js';
import { HealthCheck } from '../../src/models/HealthCheck.js';
import { createTestUser, getAuthCookie } from '../helpers.js';

// Create a known set of health checks: 7/10 successful at 200ms avg
async function seedHealthChecks(ownerId, applicationId, opts = {}) {
  const {
    total = 10,
    successCount = 7,
    responseTimeMs = 200,
    checkedAt // base date, defaults to 1 hour ago
  } = opts;

  const baseTime = checkedAt ?? new Date(Date.now() - 60 * 60 * 1000);
  const docs = [];

  for (let i = 0; i < total; i++) {
    const success = i < successCount;
    docs.push({
      applicationId,
      ownerId,
      success,
      responseTimeMs: success ? responseTimeMs : 0,
      checkedAt: new Date(baseTime.getTime() + i * 1000),
      statusCode: success ? 200 : null
    });
  }

  await HealthCheck.insertMany(docs);
}

describe('Analytics API', () => {
  it('uptime endpoint returns exact numbers for known data (70% / 200ms)', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Analytics App',
      url: 'https://analytics.example.com',
      ownerId: user._id,
      environment: 'production',
      nextCheckAt: new Date()
    });

    // 7 successes out of 10 checks = 70.00%, avg 200ms
    await seedHealthChecks(user._id, appDoc._id, {
      total: 10,
      successCount: 7,
      responseTimeMs: 200,
      checkedAt: new Date(Date.now() - 30 * 60 * 1000) // 30 min ago → within 24h range
    });

    const res = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/uptime?range=24h`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const { summary } = res.body.data;
    expect(summary.totalChecks).toBe(10);
    expect(summary.successfulChecks).toBe(7);
    expect(summary.failedChecks).toBe(3);
    expect(summary.uptimePercent).toBe(70);
    expect(summary.avgResponseTimeMs).toBe(200);
    expect(summary.minResponseTimeMs).toBe(200);
    expect(summary.maxResponseTimeMs).toBe(200);
  });

  it('uptime endpoint returns null for no data (never checked)', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Empty App',
      url: 'https://empty-analytics.example.com',
      ownerId: user._id,
      environment: 'production',
      nextCheckAt: new Date()
    });

    const res = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/uptime?range=24h`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const { summary } = res.body.data;
    expect(summary.totalChecks).toBe(0);
    expect(summary.uptimePercent).toBeNull();
    expect(summary.avgResponseTimeMs).toBeNull();
  });

  it('uptime endpoint rejects invalid range value', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Range App',
      url: 'https://range-analytics.example.com',
      ownerId: user._id,
      environment: 'production',
      nextCheckAt: new Date()
    });

    const res = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/uptime?range=1y`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
  });

  it('uptime series has null-filled empty buckets', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Sparse App',
      url: 'https://sparse-analytics.example.com',
      ownerId: user._id,
      environment: 'production',
      nextCheckAt: new Date()
    });

    // Only one check near the start of a 24h window → many empty hour buckets
    await HealthCheck.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      success: true,
      responseTimeMs: 100,
      checkedAt: new Date(Date.now() - 23 * 60 * 60 * 1000) // 23 hours ago
    });

    const res = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/uptime?range=24h`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const { series } = res.body.data;
    // 24h range with 1h buckets → 24+ buckets, most empty
    expect(series.length).toBeGreaterThanOrEqual(20);
    // At least one bucket should have null uptimePercent (empty bucket)
    expect(series.some((s) => s.uptimePercent === null)).toBe(true);
    // At least one bucket should have real data
    expect(series.some((s) => s.totalChecks > 0)).toBe(true);
  });

  it('dashboard summary returns all required keys with no data (new user)', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const { data } = res.body;

    // All top-level keys present
    expect(data).toHaveProperty('applications');
    expect(data).toHaveProperty('incidents');
    expect(data).toHaveProperty('deployments');
    expect(data).toHaveProperty('health');
    expect(data).toHaveProperty('applicationsTable');
    expect(data).toHaveProperty('range');

    // Shape checks for empty state
    expect(data.applications.total).toBe(0);
    expect(data.applications.byStatus).toMatchObject({ unknown: 0, up: 0, degraded: 0, down: 0 });
    expect(data.incidents.activeCount).toBe(0);
    expect(data.incidents.activeBySeverity).toMatchObject({ low: 0, medium: 0, high: 0, critical: 0 });
    expect(data.incidents.recent).toEqual([]);
    expect(data.deployments.recent).toEqual([]);
    expect(data.health.totalChecks).toBe(0);
    expect(data.health.uptimePercent).toBeNull(); // null for no data, NOT 0 or NaN
    expect(data.applicationsTable).toEqual([]);

    // Range fields
    expect(data.range).toHaveProperty('from');
    expect(data.range).toHaveProperty('to');
    expect(data.range).toHaveProperty('label');
  });

  it('dashboard summary range rejects invalid values', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const res = await request(app)
      .get('/api/v1/dashboard/summary?range=invalid')
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
  });

  it('health-checks list paginates and filters correctly', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'HC List App',
      url: 'https://hc-list.example.com',
      ownerId: user._id,
      environment: 'production',
      nextCheckAt: new Date()
    });

    // Seed 5 success + 5 failure checks
    await seedHealthChecks(user._id, appDoc._id, {
      total: 10,
      successCount: 5,
      checkedAt: new Date(Date.now() - 60 * 60 * 1000)
    });

    // Default list
    const listRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/health-checks`)
      .set('Cookie', cookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.healthChecks.length).toBe(10);
    expect(listRes.body.data.pagination.total).toBe(10);

    // Filter success=true
    const successRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/health-checks?success=true`)
      .set('Cookie', cookie);
    expect(successRes.status).toBe(200);
    expect(successRes.body.data.healthChecks.every((hc) => hc.success === true)).toBe(true);
    expect(successRes.body.data.pagination.total).toBe(5);

    // Filter success=false
    const failRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/health-checks?success=false`)
      .set('Cookie', cookie);
    expect(failRes.status).toBe(200);
    expect(failRes.body.data.pagination.total).toBe(5);

    // Pagination: limit=3 page=1
    const pageRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/health-checks?limit=3&page=1`)
      .set('Cookie', cookie);
    expect(pageRes.status).toBe(200);
    expect(pageRes.body.data.healthChecks.length).toBe(3);
    expect(pageRes.body.data.pagination.totalPages).toBe(4); // ceil(10/3) = 4

    // Reject limit > 100
    const overLimitRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/health-checks?limit=200`)
      .set('Cookie', cookie);
    expect(overLimitRes.status).toBe(400);
  });
});

