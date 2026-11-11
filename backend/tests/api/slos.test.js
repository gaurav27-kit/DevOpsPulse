import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { Application } from '../../src/models/Application.js';
import { Slo } from '../../src/models/Slo.js';
import { HealthCheck } from '../../src/models/HealthCheck.js';
import { createTestUser, getAuthCookie } from '../helpers.js';

describe('SLO API Endpoints (/api/v1/applications/:id/slo & /api/v1/slos)', () => {
  let userA, userB;
  let cookieA, cookieB;
  let appA;

  beforeEach(async () => {
    const createdA = await createTestUser({ email: 'slo_user_a@example.com' });
    const createdB = await createTestUser({ email: 'slo_user_b@example.com' });
    userA = createdA.user;
    userB = createdB.user;
    cookieA = getAuthCookie(userA);
    cookieB = getAuthCookie(userB);

    appA = await Application.create({
      name: 'Production Core API',
      url: 'https://core-api.example.com',
      ownerId: userA._id,
      status: 'up',
      nextCheckAt: new Date()
    });
  });

  describe('POST /api/v1/applications/:id/slo', () => {
    it('creates an SLO successfully with valid parameters', async () => {
      const res = await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: 'Core API Availability 99.9%',
          targetPercent: 99.9,
          windowDays: 30
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        name: 'Core API Availability 99.9%',
        targetPercent: 99.9,
        windowDays: 30,
        applicationId: String(appA._id),
        ownerId: String(userA._id)
      });
    });

    it('creates an SLO with 7 day window and 3 decimal places', async () => {
      const res = await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: 'High Precision SLO',
          targetPercent: 99.999,
          windowDays: 7
        });

      expect(res.status).toBe(201);
      expect(res.body.data.targetPercent).toBe(99.999);
      expect(res.body.data.windowDays).toBe(7);
    });

    it('rejects targetPercent below 90.0', async () => {
      const res = await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: 'Low Target',
          targetPercent: 89.99,
          windowDays: 30
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects targetPercent above 99.999 (e.g. 100%)', async () => {
      const res = await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: 'Perfection Target',
          targetPercent: 100,
          windowDays: 30
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects targetPercent with more than 3 decimal places', async () => {
      const res = await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: 'Too Many Decimals',
          targetPercent: 99.9999,
          windowDays: 30
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects windowDays not equal to 7 or 30', async () => {
      const res = await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: 'Invalid Window',
          targetPercent: 99.5,
          windowDays: 14
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects unknown fields strictly (e.g. injected ownerId)', async () => {
      const res = await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: 'Strict Test',
          targetPercent: 99.5,
          windowDays: 30,
          ownerId: String(userB._id)
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects duplicate SLO creation for the same application with 409', async () => {
      await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: 'Initial SLO',
          targetPercent: 99.9,
          windowDays: 30
        });

      const res = await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: 'Duplicate SLO',
          targetPercent: 99.5,
          windowDays: 7
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already has an SLO');
    });

    it('enforces maximum 20 SLOs per user account with 409', async () => {
      // Create 19 more applications for user A
      const apps = [];
      for (let i = 1; i <= 20; i++) {
        const a = await Application.create({
          name: `Bulk App ${i}`,
          url: `https://app-${i}.example.com`,
          ownerId: userA._id,
          status: 'up',
          nextCheckAt: new Date()
        });
        apps.push(a);
      }

      // Create 20 SLOs (max allowed)
      for (let i = 0; i < 20; i++) {
        await Slo.create({
          name: `SLO ${i}`,
          targetPercent: 99.0,
          windowDays: 30,
          applicationId: apps[i]._id,
          ownerId: userA._id
        });
      }

      // 21st SLO creation attempt should fail with 409
      const res = await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: '21st SLO',
          targetPercent: 99.0,
          windowDays: 30
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Maximum of 20 SLOs allowed per account');
    });

    it('returns 404 when User B attempts to create SLO on User A application', async () => {
      const res = await request(app)
        .post(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieB)
        .send({
          name: 'Cross SLO',
          targetPercent: 99.9,
          windowDays: 30
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Application not found');
    });
  });

  describe('GET /api/v1/applications/:id/slo', () => {
    it('returns 404 when application has no SLO', async () => {
      const res = await request(app)
        .get(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('SLO not found');
    });

    it('returns insufficient_data and safe nulls when fewer than 20 checks recorded', async () => {
      await Slo.create({
        ownerId: userA._id,
        applicationId: appA._id,
        name: 'API SLO',
        targetPercent: 99.9,
        windowDays: 30
      });

      // Insert only 5 checks
      for (let i = 0; i < 5; i++) {
        await HealthCheck.create({
          applicationId: appA._id,
          ownerId: userA._id,
          checkedAt: new Date(Date.now() - i * 60000),
          success: true,
          responseTimeMs: 100
        });
      }

      const res = await request(app)
        .get(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('insufficient_data');
      expect(res.body.data.sli).toBeNull();
      expect(res.body.data.budgetConsumedPct).toBeNull();
      expect(res.body.data.budgetRemainingPct).toBeNull();
      expect(res.body.data.totals.total).toBe(5);
      expect(res.body.data.partialWindow).toBe(true);
      expect(Array.isArray(res.body.data.series)).toBe(true);
    });

    it('returns evaluated metrics accurately when sufficient checks exist', async () => {
      await Slo.create({
        ownerId: userA._id,
        applicationId: appA._id,
        name: 'API SLO',
        targetPercent: 99.9,
        windowDays: 30
      });

      const now = Date.now();
      const checks = [];
      // 995 good, 5 bad out of 1000 -> 99.50% SLI
      // target 99.9 -> allowed error rate = 0.001
      // error rate = 5 / 1000 = 0.005 -> 5x allowed -> budget consumed = 500% -> breached
      for (let i = 0; i < 995; i++) {
        checks.push({
          applicationId: appA._id,
          ownerId: userA._id,
          checkedAt: new Date(now - i * 60000),
          success: true,
          responseTimeMs: 80
        });
      }
      for (let i = 0; i < 5; i++) {
        checks.push({
          applicationId: appA._id,
          ownerId: userA._id,
          checkedAt: new Date(now - (995 + i) * 60000),
          success: false,
          responseTimeMs: 5000,
          errorType: 'timeout',
          errorMessage: 'Timeout'
        });
      }
      await HealthCheck.insertMany(checks);

      const res = await request(app)
        .get(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('breached');
      expect(res.body.data.sli).toBe(99.5);
      expect(res.body.data.errorRatePct).toBe(0.5);
      expect(res.body.data.budgetConsumedPct).toBe(500);
      expect(res.body.data.budgetRemainingPct).toBe(0);
      expect(res.body.data.totals).toEqual({ good: 995, bad: 5, total: 1000 });
      expect(res.body.data.window).toHaveProperty('from');
      expect(res.body.data.window).toHaveProperty('to');
    });

    it('returns 404 when User B requests User A SLO', async () => {
      await Slo.create({
        ownerId: userA._id,
        applicationId: appA._id,
        name: 'API SLO',
        targetPercent: 99.9,
        windowDays: 30
      });

      const res = await request(app)
        .get(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieB);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Application not found');
    });
  });

  describe('PATCH /api/v1/applications/:id/slo', () => {
    beforeEach(async () => {
      await Slo.create({
        ownerId: userA._id,
        applicationId: appA._id,
        name: 'Initial Name',
        targetPercent: 99.5,
        windowDays: 7
      });
    });

    it('updates name and target successfully', async () => {
      const res = await request(app)
        .patch(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({
          name: 'Updated SLO Name',
          targetPercent: 99.9
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated SLO Name');
      expect(res.body.data.targetPercent).toBe(99.9);
      expect(res.body.data.windowDays).toBe(7); // Unchanged
    });

    it('rejects empty update body with 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 404 for User B attempting to update User A SLO', async () => {
      const res = await request(app)
        .patch(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieB)
        .send({ name: 'Tampered' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/applications/:id/slo', () => {
    it('deletes SLO successfully', async () => {
      await Slo.create({
        ownerId: userA._id,
        applicationId: appA._id,
        name: 'To Delete',
        targetPercent: 99.0,
        windowDays: 30
      });

      const res = await request(app)
        .delete(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });

      const checkRes = await request(app)
        .get(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieA);
      expect(checkRes.status).toBe(404);
    });

    it('returns 404 for User B trying to delete User A SLO', async () => {
      await Slo.create({
        ownerId: userA._id,
        applicationId: appA._id,
        name: 'Protected SLO',
        targetPercent: 99.0,
        windowDays: 30
      });

      const res = await request(app)
        .delete(`/api/v1/applications/${appA._id}/slo`)
        .set('Cookie', cookieB);

      expect(res.status).toBe(404);
    });
  });

  describe('Application Cascade Delete', () => {
    it('permanently deletes SLO when parent application is deleted', async () => {
      const slo = await Slo.create({
        ownerId: userA._id,
        applicationId: appA._id,
        name: 'Cascade Target',
        targetPercent: 99.9,
        windowDays: 30
      });

      const delAppRes = await request(app)
        .delete(`/api/v1/applications/${appA._id}`)
        .set('Cookie', cookieA);
      expect(delAppRes.status).toBe(200);

      const sloInDb = await Slo.findById(slo._id);
      expect(sloInDb).toBeNull();
    });
  });

  describe('GET /api/v1/slos', () => {
    beforeEach(async () => {
      const appA2 = await Application.create({
        name: 'Payment Service',
        url: 'https://pay.example.com',
        ownerId: userA._id,
        status: 'up',
        nextCheckAt: new Date()
      });

      await Slo.create({
        ownerId: userA._id,
        applicationId: appA._id,
        name: 'Alpha SLO',
        targetPercent: 99.9,
        windowDays: 30
      });

      await Slo.create({
        ownerId: userA._id,
        applicationId: appA2._id,
        name: 'Beta SLO',
        targetPercent: 99.5,
        windowDays: 7
      });
    });

    it('returns paginated list of user SLOs with summary stats', async () => {
      const res = await request(app)
        .get('/api/v1/slos')
        .set('Cookie', cookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slos).toHaveLength(2);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1
      });
      expect(res.body.data.slos[0]).toHaveProperty('status');
      expect(res.body.data.slos[0]).toHaveProperty('application');
    });

    it('supports sorting by name asc and desc', async () => {
      const resAsc = await request(app)
        .get('/api/v1/slos?sortBy=name&order=asc')
        .set('Cookie', cookieA);

      expect(resAsc.body.data.slos[0].slo.name).toBe('Alpha SLO');
      expect(resAsc.body.data.slos[1].slo.name).toBe('Beta SLO');

      const resDesc = await request(app)
        .get('/api/v1/slos?sortBy=name&order=desc')
        .set('Cookie', cookieA);

      expect(resDesc.body.data.slos[0].slo.name).toBe('Beta SLO');
      expect(resDesc.body.data.slos[1].slo.name).toBe('Alpha SLO');
    });

    it('rejects sorting by budgetConsumedPct with clear 400 error', async () => {
      const res = await request(app)
        .get('/api/v1/slos?sortBy=budgetConsumedPct')
        .set('Cookie', cookieA);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Sorting by computed metrics is not supported. Use createdAt or name');
    });

    it('filters by status correctly', async () => {
      const res = await request(app)
        .get('/api/v1/slos?status=insufficient_data')
        .set('Cookie', cookieA);

      expect(res.status).toBe(200);
      expect(res.body.data.slos).toHaveLength(2);

      const resHealthy = await request(app)
        .get('/api/v1/slos?status=healthy')
        .set('Cookie', cookieA);

      expect(resHealthy.status).toBe(200);
      expect(resHealthy.body.data.slos).toHaveLength(0);
    });

    it('returns empty list for User B (multi-tenant isolation)', async () => {
      const res = await request(app)
        .get('/api/v1/slos')
        .set('Cookie', cookieB);

      expect(res.status).toBe(200);
      expect(res.body.data.slos).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });
  });
});

