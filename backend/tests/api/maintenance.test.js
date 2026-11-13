import http from 'http';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { Application } from '../../src/models/Application.js';
import { MaintenanceWindow } from '../../src/models/MaintenanceWindow.js';
import { HealthCheck } from '../../src/models/HealthCheck.js';
import { Incident } from '../../src/models/Incident.js';
import { NotificationChannel } from '../../src/models/NotificationChannel.js';
import { NotificationDelivery } from '../../src/models/NotificationDelivery.js';
import { createTestUser, getAuthCookie } from '../helpers.js';
import { runHealthCheck } from '../../src/services/healthCheckService.js';
import { processCheckResult } from '../../src/services/schedulerService.js';
import {
  createMaintenanceWindow,
  endMaintenanceWindow,
  processScheduledMaintenanceTick,
  reEvaluateApplicationAfterMaintenance
} from '../../src/services/maintenanceService.js';

// Scoped mock to allow local mock HTTP server testing
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

describe('Maintenance Mode Comprehensive API & Service Suite', () => {
  let mockServer;
  let mockPort;
  let mockBaseUrl;

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/healthy') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK 200');
      } else if (url.pathname === '/failing') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else {
        res.writeHead(404);
        res.end();
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

  it('1. enables maintenance manually with immediate activation', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Immediate Maintenance App',
      url: `${mockBaseUrl}/healthy`,
      ownerId: user._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    const endAt = new Date(Date.now() + 3600000).toISOString();

    const res = await request(app)
      .post(`/api/v1/applications/${appDoc._id}/maintenance`)
      .set('Cookie', cookie)
      .send({
        reason: 'Emergency database migration and kernel patch',
        endAt
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const win = res.body.data.maintenanceWindow;
    expect(win.status).toBe('ACTIVE');
    expect(win.reason).toBe('Emergency database migration and kernel patch');
    expect(win.createdBy._id.toString()).toBe(user._id.toString());

    // Verify application status changed to maintenance and preserved underlyingStatus
    const updatedApp = await Application.findById(appDoc._id);
    expect(updatedApp.status).toBe('maintenance');
    expect(updatedApp.underlyingStatus).toBe('up');
    expect(updatedApp.activeMaintenanceWindowId.toString()).toBe(win._id.toString());

    // Verify GET /active returns this window
    const activeRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/maintenance/active`)
      .set('Cookie', cookie);
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data.activeWindow._id.toString()).toBe(win._id.toString());
  });

  it('2. schedules maintenance for a future date/time without affecting current operational status', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Scheduled Maintenance App',
      url: `${mockBaseUrl}/healthy`,
      ownerId: user._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    const futureStart = new Date(Date.now() + 7200000).toISOString();
    const futureEnd = new Date(Date.now() + 10800000).toISOString();

    const res = await request(app)
      .post(`/api/v1/applications/${appDoc._id}/maintenance`)
      .set('Cookie', cookie)
      .send({
        startAt: futureStart,
        endAt: futureEnd,
        reason: 'Scheduled quarterly maintenance window'
      });

    expect(res.status).toBe(201);
    const win = res.body.data.maintenanceWindow;
    expect(win.status).toBe('SCHEDULED');

    // Application status MUST NOT change yet
    const checkedApp = await Application.findById(appDoc._id);
    expect(checkedApp.status).toBe('up');
    expect(checkedApp.activeMaintenanceWindowId).toBeNull();

    // Active endpoint returns null
    const activeRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/maintenance/active`)
      .set('Cookie', cookie);
    expect(activeRes.body.data.activeWindow).toBeNull();

    // History endpoint includes the scheduled window
    const historyRes = await request(app)
      .get(`/api/v1/applications/${appDoc._id}/maintenance`)
      .set('Cookie', cookie);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data.windows.length).toBe(1);
    expect(historyRes.body.data.windows[0].status).toBe('SCHEDULED');
  });

  it('3. rejects overlapping active or scheduled maintenance windows with 409 Conflict', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Overlap Prevention App',
      url: `${mockBaseUrl}/healthy`,
      ownerId: user._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    const start1 = new Date(Date.now() + 3600000);
    const end1 = new Date(Date.now() + 7200000);

    await MaintenanceWindow.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      createdBy: user._id,
      reason: 'Window 1',
      startAt: start1,
      endAt: end1,
      status: 'SCHEDULED'
    });

    // Attempt to create overlapping window (starts inside Window 1)
    const overlappingRes = await request(app)
      .post(`/api/v1/applications/${appDoc._id}/maintenance`)
      .set('Cookie', cookie)
      .send({
        startAt: new Date(Date.now() + 5000000).toISOString(),
        endAt: new Date(Date.now() + 9000000).toISOString(),
        reason: 'Conflicting window'
      });

    expect(overlappingRes.status).toBe(409);
    expect(overlappingRes.body.message).toContain('already overlaps');
  });

  it('4. allows authorized user to end active maintenance manually and records endedBy', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Manual End App',
      url: `${mockBaseUrl}/healthy`,
      ownerId: user._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    const winDoc = await MaintenanceWindow.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      createdBy: user._id,
      reason: 'Routine patch',
      startAt: new Date(Date.now() - 60000),
      endAt: new Date(Date.now() + 3600000),
      status: 'ACTIVE'
    });

    appDoc.status = 'maintenance';
    appDoc.underlyingStatus = 'up';
    appDoc.activeMaintenanceWindowId = winDoc._id;
    await appDoc.save();

    const endRes = await request(app)
      .patch(`/api/v1/maintenance/${winDoc._id}/end`)
      .set('Cookie', cookie);

    expect(endRes.status).toBe(200);
    const win = endRes.body.data.maintenanceWindow;
    expect(win.status).toBe('COMPLETED');
    expect(win.endedBy.toString()).toBe(user._id.toString());
    expect(win.endedAt).not.toBeNull();

    // Verify application status restored
    const updatedApp = await Application.findById(appDoc._id);
    expect(updatedApp.status).toBe('up');
    expect(updatedApp.activeMaintenanceWindowId).toBeNull();
  });

  it('5. cancels scheduled maintenance manually and marks status CANCELLED', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    const appDoc = await Application.create({
      name: 'Cancel Scheduled App',
      url: `${mockBaseUrl}/healthy`,
      ownerId: user._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    const winDoc = await MaintenanceWindow.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      createdBy: user._id,
      reason: 'Future window',
      startAt: new Date(Date.now() + 3600000),
      endAt: new Date(Date.now() + 7200000),
      status: 'SCHEDULED'
    });

    const cancelRes = await request(app)
      .patch(`/api/v1/maintenance/${winDoc._id}/end`)
      .set('Cookie', cookie);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.maintenanceWindow.status).toBe('CANCELLED');
    expect(cancelRes.body.data.maintenanceWindow.endedBy.toString()).toBe(user._id.toString());
  });

  it('6. continues collecting health checks and telemetry during maintenance with isMaintenance flag', async () => {
    const { user } = await createTestUser();

    const appDoc = await Application.create({
      name: 'Telemetry Maintenance App',
      url: `${mockBaseUrl}/healthy`,
      ownerId: user._id,
      status: 'maintenance',
      underlyingStatus: 'up',
      checkIntervalSeconds: 60,
      timeoutMs: 2000,
      nextCheckAt: new Date()
    });

    const winDoc = await MaintenanceWindow.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      createdBy: user._id,
      reason: 'Server upgrade',
      startAt: new Date(Date.now() - 60000),
      endAt: new Date(Date.now() + 3600000),
      status: 'ACTIVE'
    });

    appDoc.activeMaintenanceWindowId = winDoc._id;
    await appDoc.save();

    // Execute health check
    const checkResult = await runHealthCheck(appDoc);
    await processCheckResult(appDoc, checkResult);

    // Verify HealthCheck record created with full telemetry and isMaintenance: true
    const recordedCheck = await HealthCheck.findOne({ applicationId: appDoc._id }).sort({ checkedAt: -1 });
    expect(recordedCheck).not.toBeNull();
    expect(recordedCheck.success).toBe(true);
    expect(recordedCheck.statusCode).toBe(200);
    expect(recordedCheck.isMaintenance).toBe(true);
    expect(recordedCheck.maintenanceWindowId.toString()).toBe(winDoc._id.toString());

    // App status remains 'maintenance'
    const updatedApp = await Application.findById(appDoc._id);
    expect(updatedApp.status).toBe('maintenance');
    expect(updatedApp.underlyingStatus).toBe('up');
  });

  it('7. suppresses incident creation and notifications for failures during maintenance', async () => {
    const { user } = await createTestUser();

    // Create notification channel for user
    const channel = await NotificationChannel.create({
      ownerId: user._id,
      name: 'Maintenance Test Webhook',
      type: 'webhook',
      config: { url: 'https://example.com/webhook', secret: 'webhooksecret12345678901234567890123' },
      enabled: true,
      events: ['incident_opened', 'incident_resolved']
    });

    const appDoc = await Application.create({
      name: 'Suppressed Failures App',
      url: `${mockBaseUrl}/failing`,
      ownerId: user._id,
      status: 'maintenance',
      underlyingStatus: 'up',
      consecutiveFailures: 0,
      checkIntervalSeconds: 60,
      timeoutMs: 2000,
      nextCheckAt: new Date()
    });

    const winDoc = await MaintenanceWindow.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      createdBy: user._id,
      reason: 'Intentional server reboot',
      startAt: new Date(Date.now() - 60000),
      endAt: new Date(Date.now() + 3600000),
      status: 'ACTIVE'
    });

    appDoc.activeMaintenanceWindowId = winDoc._id;
    await appDoc.save();

    // Run 2 consecutive failing checks during maintenance
    const res1 = await runHealthCheck(appDoc);
    await processCheckResult(appDoc, res1);

    const refetchedApp = await Application.findById(appDoc._id);
    const res2 = await runHealthCheck(refetchedApp);
    await processCheckResult(refetchedApp, res2);

    // Verify consecutiveFailures incremented on application
    const appAfterChecks = await Application.findById(appDoc._id);
    expect(appAfterChecks.consecutiveFailures).toBe(2);
    expect(appAfterChecks.status).toBe('maintenance');
    expect(appAfterChecks.underlyingStatus).toBe('down');

    // Crucial check: NO incident was created during maintenance!
    const incidents = await Incident.find({ applicationId: appDoc._id });
    expect(incidents.length).toBe(0);

    // Crucial check: Notification deliveries were NOT dispatched
    const deliveries = await NotificationDelivery.find({ applicationId: appDoc._id, status: 'sent' });
    expect(deliveries.length).toBe(0);
  });

  it('8. restores healthy service to "up" when maintenance ends with no incident opened', async () => {
    const { user } = await createTestUser();

    const appDoc = await Application.create({
      name: 'Healthy Post-Maintenance App',
      url: `${mockBaseUrl}/healthy`,
      ownerId: user._id,
      status: 'maintenance',
      underlyingStatus: 'up',
      consecutiveFailures: 0,
      consecutiveSuccesses: 5,
      nextCheckAt: new Date()
    });

    const winDoc = await MaintenanceWindow.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      createdBy: user._id,
      reason: 'Cache flush',
      startAt: new Date(Date.now() - 120000),
      endAt: new Date(Date.now() - 10000), // Ended
      status: 'ACTIVE'
    });

    appDoc.activeMaintenanceWindowId = winDoc._id;
    await appDoc.save();

    // End maintenance
    await endMaintenanceWindow(winDoc._id, user._id);

    const restoredApp = await Application.findById(appDoc._id);
    expect(restoredApp.status).toBe('up');
    expect(restoredApp.activeMaintenanceWindowId).toBeNull();

    // No incident created
    const incidents = await Incident.find({ applicationId: appDoc._id });
    expect(incidents.length).toBe(0);
  });

  it('9. NEVER marks unhealthy application Operational: opens incident when service remains down after maintenance', async () => {
    const { user } = await createTestUser();

    // Create notification channel
    await NotificationChannel.create({
      ownerId: user._id,
      name: 'Unhealthy Alert Channel',
      type: 'webhook',
      config: { url: 'https://example.com/alerts', secret: 'webhooksecret12345678901234567890123' },
      enabled: true,
      events: ['incident_opened', 'incident_resolved']
    });

    const appDoc = await Application.create({
      name: 'Still Down Post-Maintenance App',
      url: `${mockBaseUrl}/failing`,
      ownerId: user._id,
      status: 'maintenance',
      underlyingStatus: 'down',
      consecutiveFailures: 4, // failed multiple times during maintenance
      consecutiveSuccesses: 0,
      nextCheckAt: new Date()
    });

    const winDoc = await MaintenanceWindow.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      createdBy: user._id,
      reason: 'Failed upgrade',
      startAt: new Date(Date.now() - 120000),
      endAt: new Date(Date.now() + 3600000),
      status: 'ACTIVE'
    });

    appDoc.activeMaintenanceWindowId = winDoc._id;
    await appDoc.save();

    // End maintenance manually
    await endMaintenanceWindow(winDoc._id, user._id);

    const finalizedApp = await Application.findById(appDoc._id);
    // Crucial requirement: Must NOT be marked Operational ('up')!
    expect(finalizedApp.status).toBe('down');
    expect(finalizedApp.activeMaintenanceWindowId).toBeNull();

    // Crucial requirement: An incident is opened immediately
    const incident = await Incident.findOne({ applicationId: appDoc._id, isActive: true });
    expect(incident).not.toBeNull();
    expect(incident.status).toBe('open');
    expect(incident.title).toContain('is down');
  });

  it('10. automatically transitions SCHEDULED to ACTIVE and ACTIVE to COMPLETED in background tick', async () => {
    const { user } = await createTestUser();

    const appDoc = await Application.create({
      name: 'Auto-Transition App',
      url: `${mockBaseUrl}/healthy`,
      ownerId: user._id,
      status: 'up',
      consecutiveFailures: 0,
      consecutiveSuccesses: 2,
      nextCheckAt: new Date()
    });

    // 1. Scheduled window whose start time has arrived
    const scheduledWin = await MaintenanceWindow.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      createdBy: user._id,
      reason: 'Auto start window',
      startAt: new Date(Date.now() - 1000), // Due to start
      endAt: new Date(Date.now() + 60000),
      status: 'SCHEDULED'
    });

    // Run background tick
    await processScheduledMaintenanceTick(new Date());

    const activeWin = await MaintenanceWindow.findById(scheduledWin._id);
    expect(activeWin.status).toBe('ACTIVE');

    const appDuring = await Application.findById(appDoc._id);
    expect(appDuring.status).toBe('maintenance');
    expect(appDuring.activeMaintenanceWindowId.toString()).toBe(scheduledWin._id.toString());

    // 2. Set end time in past to test automatic expiration
    await MaintenanceWindow.findByIdAndUpdate(scheduledWin._id, {
      $set: { endAt: new Date(Date.now() - 1000) }
    });

    // Run background tick again
    await processScheduledMaintenanceTick(new Date());

    const expiredWin = await MaintenanceWindow.findById(scheduledWin._id);
    expect(expiredWin.status).toBe('COMPLETED');
    expect(expiredWin.endedAt).not.toBeNull();

    const appAfter = await Application.findById(appDoc._id);
    expect(appAfter.status).toBe('up');
    expect(appAfter.activeMaintenanceWindowId).toBeNull();
  });

  it('11. prevents race conditions across multiple scheduler instances using atomic claims', async () => {
    const { user } = await createTestUser();

    const appDoc = await Application.create({
      name: 'Multi-Instance Concurrency App',
      url: `${mockBaseUrl}/healthy`,
      ownerId: user._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    const windowDoc = await MaintenanceWindow.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      createdBy: user._id,
      reason: 'Concurrent tick test',
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 3600000),
      status: 'SCHEDULED'
    });

    // Simulate 5 simultaneous scheduler instances ticking at the exact same millisecond
    const results = await Promise.all([
      processScheduledMaintenanceTick(new Date()),
      processScheduledMaintenanceTick(new Date()),
      processScheduledMaintenanceTick(new Date()),
      processScheduledMaintenanceTick(new Date()),
      processScheduledMaintenanceTick(new Date())
    ]);

    // Document is cleanly ACTIVE without duplicate side effects
    const finalized = await MaintenanceWindow.findById(windowDoc._id);
    expect(finalized.status).toBe('ACTIVE');

    const appCheck = await Application.findById(appDoc._id);
    expect(appCheck.status).toBe('maintenance');
  });

  it('12. enforces strict multi-tenant authorization: prevents cross-user access', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    const cookieB = getAuthCookie(userB);

    const appA = await Application.create({
      name: 'User A Application',
      url: `${mockBaseUrl}/healthy`,
      ownerId: userA._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    const winA = await MaintenanceWindow.create({
      applicationId: appA._id,
      ownerId: userA._id,
      createdBy: userA._id,
      reason: 'User A secret window',
      startAt: new Date(),
      endAt: new Date(Date.now() + 3600000),
      status: 'ACTIVE'
    });

    // User B tries to view User A's maintenance history -> 404 (multi-tenant isolation)
    const listRes = await request(app)
      .get(`/api/v1/applications/${appA._id}/maintenance`)
      .set('Cookie', cookieB);
    expect(listRes.status).toBe(404);

    // User B tries to view User A's active maintenance -> 404
    const activeRes = await request(app)
      .get(`/api/v1/applications/${appA._id}/maintenance/active`)
      .set('Cookie', cookieB);
    expect(activeRes.status).toBe(404);

    // User B tries to create maintenance on User A's app -> 404
    const createRes = await request(app)
      .post(`/api/v1/applications/${appA._id}/maintenance`)
      .set('Cookie', cookieB)
      .send({
        reason: 'Malicious maintenance',
        endAt: new Date(Date.now() + 3600000).toISOString()
      });
    expect(createRes.status).toBe(404);

    // User B tries to end User A's maintenance window -> 404
    const endRes = await request(app)
      .patch(`/api/v1/maintenance/${winA._id}/end`)
      .set('Cookie', cookieB);
    expect(endRes.status).toBe(404);
  });
});

