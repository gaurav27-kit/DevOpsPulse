import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { Application } from '../../src/models/Application.js';
import { HealthCheck } from '../../src/models/HealthCheck.js';
import { Incident } from '../../src/models/Incident.js';
import { Deployment } from '../../src/models/Deployment.js';
import { NotificationChannel } from '../../src/models/NotificationChannel.js';
import { NotificationDelivery } from '../../src/models/NotificationDelivery.js';
import { Slo } from '../../src/models/Slo.js';
import { MaintenanceWindow } from '../../src/models/MaintenanceWindow.js';
import { encrypt, generateSigningSecret } from '../../src/utils/crypto.js';
import { createTestUser, getAuthCookie } from '../helpers.js';

/**
 * Extracts all registered HTTP routes from the Express application stack.
 */
function getAllRegisteredRoutes(expressApp) {
  function cleanPrefix(src) {
    let s = src.replace(/^\^/, '');
    const i = s.indexOf('\\/?');
    if (i !== -1) s = s.substring(0, i);
    return s.split('\\/').join('/');
  }

  const routes = [];
  expressApp._router.stack.forEach((layer) => {
    if (layer.route) {
      Object.keys(layer.route.methods).forEach((m) => {
        routes.push(`${m.toUpperCase()} ${layer.route.path}`);
      });
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const base = cleanPrefix(layer.regexp.source);
      layer.handle.stack.forEach((subLayer) => {
        if (subLayer.route) {
          const subPath = subLayer.route.path === '/' ? '' : subLayer.route.path;
          const fullPath = (base + subPath).replace(/\/+/g, '/');
          Object.keys(subLayer.route.methods).forEach((m) => {
            routes.push(`${m.toUpperCase()} ${fullPath}`);
          });
        }
      });
    }
  });

  return routes;
}

describe('Cross-User Authorization Matrix (Multi-tenant Isolation)', () => {
  let userA, userB;
  let cookieA, cookieB;
  let appA, checkA, incidentA, deploymentA, channelA, maintenanceA;

  // Resource ID-scoped routes matrix:
  const SCOPED_RESOURCE_ROUTES = [
    { method: 'GET', routePattern: '/api/v1/applications/:id', getPath: () => `/api/v1/applications/${appA._id}` },
    { method: 'PATCH', routePattern: '/api/v1/applications/:id', getPath: () => `/api/v1/applications/${appA._id}`, body: { name: 'Hacked Name' } },
    { method: 'DELETE', routePattern: '/api/v1/applications/:id', getPath: () => `/api/v1/applications/${appA._id}` },
    { method: 'POST', routePattern: '/api/v1/applications/:id/check', getPath: () => `/api/v1/applications/${appA._id}/check` },
    { method: 'GET', routePattern: '/api/v1/applications/:id/health-checks', getPath: () => `/api/v1/applications/${appA._id}/health-checks` },
    { method: 'POST', routePattern: '/api/v1/applications/:id/deployments', getPath: () => `/api/v1/applications/${appA._id}/deployments`, body: { version: '1.0.0' } },
    { method: 'GET', routePattern: '/api/v1/applications/:id/uptime', getPath: () => `/api/v1/applications/${appA._id}/uptime` },
    { method: 'GET', routePattern: '/api/v1/incidents/:id', getPath: () => `/api/v1/incidents/${incidentA._id}` },
    { method: 'PATCH', routePattern: '/api/v1/incidents/:id/status', getPath: () => `/api/v1/incidents/${incidentA._id}/status`, body: { status: 'investigating' } },
    { method: 'POST', routePattern: '/api/v1/incidents/:id/updates', getPath: () => `/api/v1/incidents/${incidentA._id}/updates`, body: { message: 'Cross user note attempt' } },
    { method: 'GET', routePattern: '/api/v1/deployments/:id', getPath: () => `/api/v1/deployments/${deploymentA._id}` },
    { method: 'PATCH', routePattern: '/api/v1/notifications/channels/:id', getPath: () => `/api/v1/notifications/channels/${channelA._id}`, body: { name: 'Hacked' } },
    { method: 'POST', routePattern: '/api/v1/notifications/channels/:id/rotate-secret', getPath: () => `/api/v1/notifications/channels/${channelA._id}/rotate-secret` },
    { method: 'DELETE', routePattern: '/api/v1/notifications/channels/:id', getPath: () => `/api/v1/notifications/channels/${channelA._id}` },
    { method: 'POST', routePattern: '/api/v1/notifications/channels/:id/test', getPath: () => `/api/v1/notifications/channels/${channelA._id}/test` },
    { method: 'POST', routePattern: '/api/v1/applications/:id/slo', getPath: () => `/api/v1/applications/${appA._id}/slo`, body: { name: 'Cross SLO', targetPercent: 99.9, windowDays: 30 } },
    { method: 'GET', routePattern: '/api/v1/applications/:id/slo', getPath: () => `/api/v1/applications/${appA._id}/slo` },
    { method: 'PATCH', routePattern: '/api/v1/applications/:id/slo', getPath: () => `/api/v1/applications/${appA._id}/slo`, body: { name: 'Hacked SLO' } },
    { method: 'DELETE', routePattern: '/api/v1/applications/:id/slo', getPath: () => `/api/v1/applications/${appA._id}/slo` },
    { method: 'POST', routePattern: '/api/v1/applications/:id/maintenance', getPath: () => `/api/v1/applications/${appA._id}/maintenance`, body: { reason: 'Unauthorized maintenance', endAt: new Date(Date.now() + 3600000).toISOString() } },
    { method: 'GET', routePattern: '/api/v1/applications/:id/maintenance', getPath: () => `/api/v1/applications/${appA._id}/maintenance` },
    { method: 'GET', routePattern: '/api/v1/applications/:id/maintenance/active', getPath: () => `/api/v1/applications/${appA._id}/maintenance/active` },
    { method: 'PATCH', routePattern: '/api/v1/maintenance/:maintenanceId/end', getPath: () => `/api/v1/maintenance/${maintenanceA._id}/end` },
    { method: 'GET', routePattern: '/api/v1/maintenance/:maintenanceId', getPath: () => `/api/v1/maintenance/${maintenanceA._id}` }
  ];

  // Collection/User-level protected routes
  const GENERAL_PROTECTED_ROUTES = [
    { method: 'GET', path: '/api/v1/auth/me' },
    { method: 'GET', path: '/api/v1/applications' },
    { method: 'POST', path: '/api/v1/applications', body: { name: 'App', url: 'https://foo.example.com' } },
    { method: 'GET', path: '/api/v1/incidents' },
    { method: 'GET', path: '/api/v1/deployments' },
    { method: 'GET', path: '/api/v1/dashboard/summary' },
    { method: 'GET', path: '/api/v1/notifications/channels' },
    { method: 'POST', path: '/api/v1/notifications/channels', body: { name: 'Ch', type: 'webhook', url: 'https://example.com/hook', events: ['incident_opened'] } },
    { method: 'GET', path: '/api/v1/notifications/deliveries' },
    { method: 'GET', path: '/api/v1/slos' }
  ];

  // Explicit public routes
  const PUBLIC_ROUTES = [
    'GET /api/v1/health',
    'POST /api/v1/auth/register',
    'POST /api/v1/auth/login',
    'POST /api/v1/auth/logout'
  ];

  beforeEach(async () => {
    // Create Users A and B
    const createdA = await createTestUser({ email: 'owner_a@example.com' });
    const createdB = await createTestUser({ email: 'owner_b@example.com' });
    userA = createdA.user;
    userB = createdB.user;
    cookieA = getAuthCookie(userA);
    cookieB = getAuthCookie(userB);

    // Create resources belonging to User A
    appA = await Application.create({
      name: 'User A Application',
      url: 'https://user-a.example.com',
      ownerId: userA._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    checkA = await HealthCheck.create({
      applicationId: appA._id,
      ownerId: userA._id,
      checkedAt: new Date(),
      success: true,
      statusCode: 200,
      responseTimeMs: 120
    });

    incidentA = await Incident.create({
      applicationId: appA._id,
      ownerId: userA._id,
      title: 'User A Outage',
      severity: 'high',
      status: 'open',
      isActive: true,
      startedAt: new Date(),
      failureCount: 2
    });

    deploymentA = await Deployment.create({
      applicationId: appA._id,
      ownerId: userA._id,
      environment: 'production',
      version: '1.0.0',
      status: 'success',
      source: 'manual',
      startedAt: new Date()
    });

    channelA = await NotificationChannel.create({
      ownerId: userA._id,
      type: 'webhook',
      name: 'User A Webhook',
      urlEncrypted: encrypt('https://user-a.example.com/hook'),
      secretEncrypted: encrypt(generateSigningSecret()),
      events: ['incident_opened']
    });

    await Slo.create({
      ownerId: userA._id,
      applicationId: appA._id,
      name: 'User A SLO',
      targetPercent: 99.9,
      windowDays: 30
    });

    maintenanceA = await MaintenanceWindow.create({
      applicationId: appA._id,
      ownerId: userA._id,
      createdBy: userA._id,
      reason: 'User A Maintenance Window',
      startAt: new Date(),
      endAt: new Date(Date.now() + 3600000),
      status: 'ACTIVE'
    });
  });

  it('completeness assertion: every route under /api/v1 is accounted for in the matrix or explicit public list', () => {
    const allRegistered = getAllRegisteredRoutes(app);
    const coveredRoutes = new Set([
      ...PUBLIC_ROUTES,
      ...GENERAL_PROTECTED_ROUTES.map((r) => `${r.method} ${r.path}`),
      ...SCOPED_RESOURCE_ROUTES.map((r) => `${r.method} ${r.routePattern}`)
    ]);

    const unlisted = allRegistered.filter((route) => !coveredRoutes.has(route));

    expect(unlisted).toEqual([]);
  });

  describe('Scoped resource endpoints: User B accessing User A resource returns 404 (never 403, never data)', () => {
    SCOPED_RESOURCE_ROUTES.forEach(({ method, routePattern, getPath, body }) => {
      it(`User B calling ${method} ${routePattern} returns 404`, async () => {
        const path = getPath();
        const req = request(app)[method.toLowerCase()](path).set('Cookie', cookieB);
        if (body) req.send(body);

        const res = await req;
        // Invariant: Scoped resource operations across users must strictly return 404
        expect(res.status).toBe(404);
        expect(res.status).not.toBe(403);
        expect(res.body.success).toBe(false);
      });
    });
  });

  describe('Unauthenticated access: No cookie returns 401 for all protected routes', () => {
    // General protected routes
    GENERAL_PROTECTED_ROUTES.forEach(({ method, path, body }) => {
      it(`${method} ${path} without cookie returns 401`, async () => {
        const req = request(app)[method.toLowerCase()](path);
        if (body) req.send(body);
        const res = await req;
        expect(res.status).toBe(401);
      });
    });

    // Scoped resource routes
    SCOPED_RESOURCE_ROUTES.forEach(({ method, routePattern, getPath, body }) => {
      it(`${method} ${routePattern} without cookie returns 401`, async () => {
        const path = getPath();
        const req = request(app)[method.toLowerCase()](path);
        if (body) req.send(body);
        const res = await req;
        expect(res.status).toBe(401);
      });
    });
  });

  it('User B list endpoints return empty lists and do not leak User A data', async () => {
    // Applications
    const appsRes = await request(app).get('/api/v1/applications').set('Cookie', cookieB);
    expect(appsRes.status).toBe(200);
    expect(appsRes.body.data.applications).toEqual([]);
    expect(appsRes.body.data.pagination.total).toBe(0);

    // Incidents
    const incsRes = await request(app).get('/api/v1/incidents').set('Cookie', cookieB);
    expect(incsRes.status).toBe(200);
    expect(incsRes.body.data.incidents).toEqual([]);
    expect(incsRes.body.data.pagination.total).toBe(0);

    // Deployments
    const depsRes = await request(app).get('/api/v1/deployments').set('Cookie', cookieB);
    expect(depsRes.status).toBe(200);
    expect(depsRes.body.data.deployments).toEqual([]);
    expect(depsRes.body.data.pagination.total).toBe(0);

    // Notification Channels
    const chanRes = await request(app).get('/api/v1/notifications/channels').set('Cookie', cookieB);
    expect(chanRes.status).toBe(200);
    expect(chanRes.body.data.channels).toEqual([]);

    // Notification Deliveries
    const delivRes = await request(app).get('/api/v1/notifications/deliveries').set('Cookie', cookieB);
    expect(delivRes.status).toBe(200);
    expect(delivRes.body.data.deliveries).toEqual([]);
    expect(delivRes.body.data.pagination.total).toBe(0);

    // SLOs
    const slosRes = await request(app).get('/api/v1/slos').set('Cookie', cookieB);
    expect(slosRes.status).toBe(200);
    expect(slosRes.body.data.slos).toEqual([]);
    expect(slosRes.body.data.pagination.total).toBe(0);
  });

  it('User B dashboard summary contains none of User A data', async () => {
    const dashRes = await request(app).get('/api/v1/dashboard/summary').set('Cookie', cookieB);
    expect(dashRes.status).toBe(200);
    const data = dashRes.body.data;

    expect(data.applications.total).toBe(0);
    expect(data.incidents.activeCount).toBe(0);
    expect(data.deployments.recent).toEqual([]);
    expect(data.health.totalChecks).toBe(0);
    expect(data.health.uptimePercent).toBeNull();
  });
});
