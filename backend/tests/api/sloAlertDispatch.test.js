import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { Application } from '../../src/models/Application.js';
import { Slo } from '../../src/models/Slo.js';
import { NotificationChannel } from '../../src/models/NotificationChannel.js';
import { NotificationDelivery } from '../../src/models/NotificationDelivery.js';
import { createTestUser, getAuthCookie } from '../helpers.js';
import { encrypt } from '../../src/utils/crypto.js';
import { evaluateSloAlerts } from '../../src/services/sloAlertService.js';
import { notifyEvent } from '../../src/services/notificationService.js';
import { HealthCheck } from '../../src/models/HealthCheck.js';
import { HealthCheckDaily } from '../../src/models/HealthCheckDaily.js';

describe('SLO Alerting API & Dispatch Engine', () => {
  let userA, cookieA;
  let userB, cookieB;
  let appA, sloA;

  beforeEach(async () => {
    const createdA = await createTestUser({ email: 'slo_owner_a@example.com' });
    userA = createdA.user;
    cookieA = getAuthCookie(userA);

    const createdB = await createTestUser({ email: 'slo_owner_b@example.com' });
    userB = createdB.user;
    cookieB = getAuthCookie(userB);

    appA = await Application.create({
      name: 'Order Checkout Service',
      url: 'https://checkout.example.com',
      ownerId: userA._id,
      status: 'up',
      checkIntervalSeconds: 60,
      lastCheckedAt: new Date(),
      nextCheckAt: new Date(Date.now() + 60000)
    });

    sloA = await Slo.create({
      name: 'Checkout Availability',
      ownerId: userA._id,
      applicationId: appA._id,
      targetPercent: 99.9,
      windowDays: 30
    });
  });

  it('channel creation accepts all 8 new SLO events and rejects unknown ones', async () => {
    // 1. Accepts valid SLO events
    const validPayload = {
      name: 'SLO Operations Webhook',
      type: 'webhook',
      url: 'https://webhook.example.com/slo-alerts',
      events: [
        'slo_at_risk',
        'slo_breached',
        'slo_high_burn_rate',
        'slo_recovered',
        'slo_budget_replenished',
        'slo_insufficient_data',
        'slo_monitoring_unavailable',
        'slo_monitoring_restored'
      ],
      minSeverity: 'medium'
    };

    const resValid = await request(app)
      .post('/api/v1/notifications/channels')
      .set('Cookie', cookieA)
      .send(validPayload);

    expect(resValid.status).toBe(201);
    expect(resValid.body.success).toBe(true);
    expect(resValid.body.data.channel.events).toHaveLength(8);

    // 2. Rejects unknown event string
    const invalidPayload = {
      name: 'Bogus Channel',
      type: 'webhook',
      url: 'https://webhook.example.com/slo-alerts',
      events: ['invalid_slo_event_type']
    };

    const resInvalid = await request(app)
      .post('/api/v1/notifications/channels')
      .set('Cookie', cookieA)
      .send(invalidPayload);

    expect(resInvalid.status).toBe(400);
    expect(resInvalid.body.success).toBe(false);
  });

  it('severity filter suppresses SLO alert when event severity is below channel minSeverity', async () => {
    // Channel requires 'critical', event is 'medium' (slo_at_risk)
    const channel = await NotificationChannel.create({
      ownerId: userA._id,
      name: 'Critical Alerts Only',
      type: 'webhook',
      urlEncrypted: encrypt('https://receiver.example.com/critical'),
      secretEncrypted: encrypt('signing_secret_for_critical_alerts_012345678901234567890123456789'),
      events: ['slo_at_risk', 'slo_breached'],
      minSeverity: 'critical',
      enabled: true
    });

    const mockHttpSender = vi.fn();

    await notifyEvent({
      ownerId: userA._id,
      application: appA,
      slo: sloA,
      type: 'slo_at_risk',
      severity: 'medium',
      dedupeKey: `${sloA._id}:slo_at_risk:1`,
      details: { budgetConsumedPct: 60.0 },
      options: { customHttpSender: mockHttpSender }
    });

    expect(mockHttpSender).not.toHaveBeenCalled();

    const delivery = await NotificationDelivery.findOne({
      channelId: channel._id,
      event: 'slo_at_risk'
    });
    expect(delivery).toBeDefined();
    expect(delivery.status).toBe('skipped');
    expect(delivery.skipReason).toBe('severity');
  });

  it('duplicate evaluation gives exactly one delivery record and execution (idempotency)', async () => {
    const channel = await NotificationChannel.create({
      ownerId: userA._id,
      name: 'Ops Webhook',
      type: 'webhook',
      urlEncrypted: encrypt('https://receiver.example.com/alerts'),
      secretEncrypted: encrypt('signing_secret_for_test_alerts_012345678901234567890123456789'),
      events: ['slo_breached'],
      minSeverity: 'low',
      enabled: true
    });

    const mockHttpSender = vi.fn(async () => ({
      success: true,
      statusCode: 200,
      errorType: null,
      retryable: false
    }));

    const dedupeKey = `${sloA._id}:slo_breached:1`;

    // First call: succeeds
    await notifyEvent({
      ownerId: userA._id,
      application: appA,
      slo: sloA,
      type: 'slo_breached',
      severity: 'critical',
      dedupeKey,
      details: { budgetConsumedPct: 150.0 },
      options: { customHttpSender: mockHttpSender }
    });

    // Wait for async queue
    await new Promise((r) => setTimeout(r, 80));

    expect(mockHttpSender).toHaveBeenCalledTimes(1);

    // Second call with same dedupeKey: duplicate is skipped
    await notifyEvent({
      ownerId: userA._id,
      application: appA,
      slo: sloA,
      type: 'slo_breached',
      severity: 'critical',
      dedupeKey,
      details: { budgetConsumedPct: 150.0 },
      options: { customHttpSender: mockHttpSender }
    });

    await new Promise((r) => setTimeout(r, 80));

    expect(mockHttpSender).toHaveBeenCalledTimes(1);

    const deliveries = await NotificationDelivery.find({
      channelId: channel._id,
      dedupeKey
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe('sent');
  });

  it('cooldown suppresses repeated non-exempt SLO alerts within cooldown window', async () => {
    const channel = await NotificationChannel.create({
      ownerId: userA._id,
      name: 'Cooldown Webhook',
      type: 'webhook',
      urlEncrypted: encrypt('https://receiver.example.com/alerts'),
      secretEncrypted: encrypt('signing_secret_for_test_alerts_012345678901234567890123456789'),
      events: ['slo_at_risk'],
      minSeverity: 'low',
      enabled: true
    });

    const mockHttpSender = vi.fn(async () => ({
      success: true,
      statusCode: 200,
      errorType: null,
      retryable: false
    }));

    const t0 = new Date('2026-11-12T12:00:00Z');

    // Initial alert at t0
    await notifyEvent({
      ownerId: userA._id,
      application: appA,
      slo: sloA,
      type: 'slo_at_risk',
      severity: 'medium',
      dedupeKey: `${sloA._id}:slo_at_risk:1`,
      details: { budgetConsumedPct: 55.0 },
      options: { customHttpSender: mockHttpSender, now: t0 }
    });

    await new Promise((r) => setTimeout(r, 80));
    expect(mockHttpSender).toHaveBeenCalledTimes(1);

    // Second alert 10 minutes later (default cooldown is 30m)
    const t10m = new Date(t0.getTime() + 10 * 60 * 1000);
    await notifyEvent({
      ownerId: userA._id,
      application: appA,
      slo: sloA,
      type: 'slo_at_risk',
      severity: 'medium',
      dedupeKey: `${sloA._id}:slo_at_risk:2`,
      details: { budgetConsumedPct: 60.0 },
      options: { customHttpSender: mockHttpSender, now: t10m }
    });

    await new Promise((r) => setTimeout(r, 80));
    expect(mockHttpSender).toHaveBeenCalledTimes(1);

    const skippedDelivery = await NotificationDelivery.findOne({
      channelId: channel._id,
      dedupeKey: `${sloA._id}:slo_at_risk:2`
    });
    expect(skippedDelivery).toBeDefined();
    expect(skippedDelivery.status).toBe('skipped');
    expect(skippedDelivery.skipReason).toBe('cooldown');
  });

  it('retries transient 500 error and records sent upon success', async () => {
    const channel = await NotificationChannel.create({
      ownerId: userA._id,
      name: 'Flaky Webhook',
      type: 'webhook',
      urlEncrypted: encrypt('https://receiver.example.com/flaky'),
      secretEncrypted: encrypt('signing_secret_for_test_alerts_012345678901234567890123456789'),
      events: ['slo_breached'],
      minSeverity: 'low',
      enabled: true
    });

    let callCount = 0;
    const mockHttpSender = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return { success: false, statusCode: 500, errorType: 'http_error', retryable: true };
      }
      return { success: true, statusCode: 200, errorType: null, retryable: false };
    });

    await notifyEvent({
      ownerId: userA._id,
      application: appA,
      slo: sloA,
      type: 'slo_breached',
      severity: 'critical',
      dedupeKey: `${sloA._id}:slo_breached:retry_test`,
      details: { budgetConsumedPct: 120.0 },
      options: {
        customHttpSender: mockHttpSender,
        retryBackoffs: [20, 50, 100]
      }
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(callCount).toBe(2);

    const delivery = await NotificationDelivery.findOne({
      channelId: channel._id,
      dedupeKey: `${sloA._id}:slo_breached:retry_test`
    });
    expect(delivery.status).toBe('sent');
    expect(delivery.attempts).toBe(2);
  });

  it('a failed email does not break evaluation and captures failure cleanly', async () => {
    await NotificationChannel.create({
      ownerId: userA._id,
      name: 'Owner Email',
      type: 'email',
      events: ['slo_breached'],
      minSeverity: 'low',
      enabled: true
    });

    const failingMailTransport = {
      sendMail: vi.fn(async () => {
        throw new Error('SMTP connection refused');
      })
    };

    // notifyEvent should not throw
    await expect(
      notifyEvent({
        ownerId: userA._id,
        application: appA,
        slo: sloA,
        type: 'slo_breached',
        severity: 'critical',
        dedupeKey: `${sloA._id}:slo_breached:email_fail`,
        details: { budgetConsumedPct: 150.0 },
        options: {
          customMailTransport: failingMailTransport,
          retryBackoffs: [10, 20, 30]
        }
      })
    ).resolves.not.toThrow();

    await new Promise((r) => setTimeout(r, 150));

    const delivery = await NotificationDelivery.findOne({
      dedupeKey: `${sloA._id}:slo_breached:email_fail`
    });
    expect(delivery).toBeDefined();
    expect(delivery.status).toBe('failed');
    expect(delivery.errorType).toBe('smtp_error');
  });

  it('multi-tenant isolation: User B never sees User A deliveries in history endpoint', async () => {
    const channelA = await NotificationChannel.create({
      ownerId: userA._id,
      name: 'User A Webhook',
      type: 'webhook',
      urlEncrypted: encrypt('https://receiver.example.com/a'),
      secretEncrypted: encrypt('signing_secret_for_test_alerts_012345678901234567890123456789'),
      events: ['slo_breached'],
      minSeverity: 'low',
      enabled: true
    });

    await NotificationDelivery.create({
      ownerId: userA._id,
      channelId: channelA._id,
      applicationId: appA._id,
      event: 'slo_breached',
      dedupeKey: `${sloA._id}:slo_breached:tenant_test`,
      status: 'sent',
      attempts: 1
    });

    // User B queries delivery history
    const resB = await request(app)
      .get('/api/v1/notifications/deliveries')
      .set('Cookie', cookieB);

    expect(resB.status).toBe(200);
    expect(resB.body.success).toBe(true);
    expect(resB.body.data.deliveries).toHaveLength(0);

    // User A queries delivery history
    const resA = await request(app)
      .get('/api/v1/notifications/deliveries')
      .set('Cookie', cookieA);

    expect(resA.status).toBe(200);
    expect(resA.body.success).toBe(true);
    expect(resA.body.data.deliveries).toHaveLength(1);
    expect(resA.body.data.deliveries[0].event).toBe('slo_breached');
  });
});

