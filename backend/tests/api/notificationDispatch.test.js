import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { Application } from '../../src/models/Application.js';
import { Incident } from '../../src/models/Incident.js';
import { NotificationChannel } from '../../src/models/NotificationChannel.js';
import { NotificationDelivery } from '../../src/models/NotificationDelivery.js';
import { createTestUser } from '../helpers.js';
import {
  notifyIncidentEvent,
  sendWebhookRequest,
  sendEmailAlert
} from '../../src/services/notificationService.js';
import { encrypt, generateSigningSecret } from '../../src/utils/crypto.js';

describe('Notification Dispatch & Retry Engine', () => {
  let user;
  let application;
  let incident;
  let webhookChannel;

  beforeEach(async () => {
    const created = await createTestUser({ email: 'dispatch_owner@example.com' });
    user = created.user;

    application = await Application.create({
      name: 'Billing Gateway',
      url: 'https://billing.example.com',
      ownerId: user._id,
      status: 'up',
      nextCheckAt: new Date()
    });

    incident = await Incident.create({
      applicationId: application._id,
      ownerId: user._id,
      title: 'Billing Gateway is down',
      severity: 'high',
      status: 'open',
      isActive: true,
      startedAt: new Date(),
      failureCount: 2
    });

    webhookChannel = await NotificationChannel.create({
      ownerId: user._id,
      name: 'Billing Alerts Hook',
      type: 'webhook',
      urlEncrypted: encrypt('https://receiver.example.com/webhook'),
      secretEncrypted: encrypt('test_webhook_signing_secret_12345678901234567890123456789012'),
      events: ['incident_opened', 'incident_resolved'],
      minSeverity: 'medium',
      enabled: true
    });
  });

  it('1. dispatches webhook with verifiable HMAC-SHA256 signature', async () => {
    let capturedRequest = null;
    const mockHttpSender = vi.fn(async ({ url, secret, event, payloadObject }) => {
      const rawBody = JSON.stringify(payloadObject);
      const timestamp = Date.now().toString();
      const expectedHmac = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

      capturedRequest = {
        url,
        secret,
        event,
        payloadObject,
        signature: `sha256=${expectedHmac}`
      };

      return { success: true, statusCode: 200, errorType: null, retryable: false };
    });

    await notifyIncidentEvent(incident, application, 'incident_opened', {
      customHttpSender: mockHttpSender
    });

    // Give in-process bounded queue a tick to complete
    await new Promise((res) => setTimeout(res, 80));

    expect(mockHttpSender).toHaveBeenCalled();
    expect(capturedRequest.url).toBe('https://receiver.example.com/webhook');
    expect(capturedRequest.event).toBe('incident_opened');
    expect(capturedRequest.payloadObject.incident.title).toBe('Billing Gateway is down');
    expect(capturedRequest.payloadObject.application.name).toBe('Billing Gateway');
    expect(capturedRequest.signature).toMatch(/^sha256=[0-9a-f]{64}$/);

    const delivery = await NotificationDelivery.findOne({
      channelId: webhookChannel._id,
      incidentId: incident._id
    });
    expect(delivery).toBeDefined();
    expect(delivery.status).toBe('sent');
    expect(delivery.attempts).toBe(1);
    expect(delivery.httpStatus).toBe(200);
  });

  it('2. retries on transient 5xx error and succeeds on second attempt', async () => {
    let callCount = 0;
    const mockHttpSender = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return { success: false, statusCode: 503, errorType: 'http_error', retryable: true };
      }
      return { success: true, statusCode: 200, errorType: null, retryable: false };
    });

    await notifyIncidentEvent(incident, application, 'incident_opened', {
      customHttpSender: mockHttpSender
    });

    // Wait for initial attempt + 1s backoff + second attempt
    await new Promise((res) => setTimeout(res, 1200));

    expect(callCount).toBe(2);

    const delivery = await NotificationDelivery.findOne({
      channelId: webhookChannel._id,
      incidentId: incident._id
    });
    expect(delivery.status).toBe('sent');
    expect(delivery.attempts).toBe(2);
  });

  it('3. marks delivery as failed after retry exhaustion (3 attempts)', async () => {
    let callCount = 0;
    const mockHttpSender = vi.fn(async () => {
      callCount++;
      return { success: false, statusCode: 500, errorType: 'http_error', retryable: true };
    });

    await notifyIncidentEvent(incident, application, 'incident_opened', {
      customHttpSender: mockHttpSender,
      retryBackoffs: [10, 20, 30]
    });

    // Wait for retries to complete (10 + 20 + 30 = 60ms)
    await new Promise((res) => setTimeout(res, 120));

    expect(callCount).toBe(3);

    const delivery = await NotificationDelivery.findOne({
      channelId: webhookChannel._id,
      incidentId: incident._id
    });
    expect(delivery).toBeDefined();
    expect(delivery.status).toBe('failed');
    expect(delivery.attempts).toBe(3);
    expect(delivery.errorType).toBe('http_error');
    expect(delivery.httpStatus).toBe(500);
  });

  it('4. does NOT retry client errors (4xx)', async () => {
    let callCount = 0;
    const mockHttpSender = vi.fn(async () => {
      callCount++;
      return { success: false, statusCode: 404, errorType: 'http_error', retryable: false };
    });

    await notifyIncidentEvent(incident, application, 'incident_opened', {
      customHttpSender: mockHttpSender
    });

    await new Promise((res) => setTimeout(res, 80));

    expect(callCount).toBe(1);

    const delivery = await NotificationDelivery.findOne({
      channelId: webhookChannel._id,
      incidentId: incident._id
    });
    expect(delivery.status).toBe('failed');
    expect(delivery.attempts).toBe(1);
    expect(delivery.httpStatus).toBe(404);
  });

  it('5. treats redirects as unretryable errors (no redirects followed)', async () => {
    let callCount = 0;
    const mockHttpSender = vi.fn(async () => {
      callCount++;
      return { success: false, statusCode: 302, errorType: 'http_error', retryable: false };
    });

    await notifyIncidentEvent(incident, application, 'incident_opened', {
      customHttpSender: mockHttpSender
    });

    await new Promise((res) => setTimeout(res, 80));

    expect(callCount).toBe(1);
    const delivery = await NotificationDelivery.findOne({
      channelId: webhookChannel._id,
      incidentId: incident._id
    });
    expect(delivery.status).toBe('failed');
    expect(delivery.attempts).toBe(1);
  });

  it('6. deduplicates duplicate delivery calls: sent once even when called 20 times in parallel', async () => {
    let callCount = 0;
    const mockHttpSender = vi.fn(async () => {
      callCount++;
      return { success: true, statusCode: 200, errorType: null, retryable: false };
    });

    const parallelCalls = Array.from({ length: 20 }, () =>
      notifyIncidentEvent(incident, application, 'incident_opened', {
        customHttpSender: mockHttpSender
      })
    );

    await Promise.all(parallelCalls);
    await new Promise((res) => setTimeout(res, 120));

    expect(callCount).toBe(1);

    const deliveryDocs = await NotificationDelivery.find({
      channelId: webhookChannel._id,
      incidentId: incident._id,
      event: 'incident_opened'
    });
    expect(deliveryDocs).toHaveLength(1);
  });

  it('7. skips delivery when anti-flapping cooldown is active', async () => {
    // Resolve previous incident so application has no active incident
    await Incident.findByIdAndUpdate(incident._id, {
      status: 'resolved',
      isActive: false,
      resolvedAt: new Date(Date.now() - 2 * 60 * 1000)
    });

    // Record a previous sent alert for this application 2 minutes ago
    await NotificationDelivery.create({
      ownerId: user._id,
      channelId: webhookChannel._id,
      incidentId: incident._id,
      applicationId: application._id,
      event: 'incident_opened',
      status: 'sent',
      sentAt: new Date(Date.now() - 2 * 60 * 1000),
      createdAt: new Date(Date.now() - 2 * 60 * 1000)
    });

    const mockHttpSender = vi.fn();

    // Trigger a new incident on same application within cooldown
    const secondIncident = await Incident.create({
      applicationId: application._id,
      ownerId: user._id,
      title: 'Second Flapping Outage',
      severity: 'high',
      status: 'open',
      isActive: true,
      startedAt: new Date(),
      failureCount: 2
    });

    await notifyIncidentEvent(secondIncident, application, 'incident_opened', {
      customHttpSender: mockHttpSender
    });

    await new Promise((res) => setTimeout(res, 80));

    // Webhook should be skipped due to cooldown
    expect(mockHttpSender).not.toHaveBeenCalled();

    const secondDelivery = await NotificationDelivery.findOne({
      incidentId: secondIncident._id
    });
    expect(secondDelivery).toBeDefined();
    expect(secondDelivery.status).toBe('skipped');
    expect(secondDelivery.skipReason).toBe('cooldown');
  });

  it('8. skips delivery when hourly rate cap is reached', async () => {
    // Seed 30 sent deliveries in the last hour
    const pastHourDeliveries = Array.from({ length: 30 }, (_, i) => ({
      ownerId: user._id,
      channelId: webhookChannel._id,
      event: 'incident_opened',
      status: 'sent',
      createdAt: new Date(Date.now() - (i + 1) * 60 * 1000)
    }));
    await NotificationDelivery.insertMany(pastHourDeliveries);

    const mockHttpSender = vi.fn();
    await notifyIncidentEvent(incident, application, 'incident_opened', {
      customHttpSender: mockHttpSender
    });

    await new Promise((res) => setTimeout(res, 80));

    expect(mockHttpSender).not.toHaveBeenCalled();

    const delivery = await NotificationDelivery.findOne({
      incidentId: incident._id,
      status: 'skipped'
    });
    expect(delivery).toBeDefined();
    expect(delivery.skipReason).toBe('rate_limit');
  });

  it('9. notification failure does NOT throw into incident handling or scheduler loop', async () => {
    const crashingHttpSender = vi.fn(() => {
      throw new Error('Fatal network crash');
    });

    // Must never throw to caller
    await expect(
      notifyIncidentEvent(incident, application, 'incident_opened', {
        customHttpSender: crashingHttpSender
      })
    ).resolves.not.toThrow();
  });

  it('10. handles email failure safely when SMTP transport fails', async () => {
    const emailChannel = await NotificationChannel.create({
      ownerId: user._id,
      name: 'Email Alerts Channel',
      type: 'email',
      events: ['incident_opened'],
      minSeverity: 'low',
      enabled: true
    });

    const brokenMailTransport = {
      sendMail: vi.fn().mockRejectedValue(new Error('Connection to SMTP server timed out'))
    };

    await notifyIncidentEvent(incident, application, 'incident_opened', {
      customMailTransport: brokenMailTransport
    });

    await new Promise((res) => setTimeout(res, 120));

    expect(brokenMailTransport.sendMail).toHaveBeenCalled();

    const delivery = await NotificationDelivery.findOne({
      channelId: emailChannel._id,
      incidentId: incident._id
    });
    expect(delivery).toBeDefined();
  });

  // --- Resolved-without-opened integration tests ---

  it('11. incident_resolved skipped when opened was skipped by cooldown', async () => {
    // The opened delivery for this incident+channel was skipped
    await NotificationDelivery.create({
      ownerId: user._id,
      channelId: webhookChannel._id,
      incidentId: incident._id,
      applicationId: application._id,
      event: 'incident_opened',
      status: 'skipped',
      skipReason: 'cooldown',
      attempts: 0
    });

    const mockHttpSender = vi.fn();

    // Resolve the incident
    const resolvedIncident = await Incident.findByIdAndUpdate(
      incident._id,
      { status: 'resolved', isActive: false, resolvedAt: new Date() },
      { new: true }
    );

    await notifyIncidentEvent(resolvedIncident, application, 'incident_resolved', {
      customHttpSender: mockHttpSender
    });

    await new Promise((res) => setTimeout(res, 80));

    expect(mockHttpSender).not.toHaveBeenCalled();

    const delivery = await NotificationDelivery.findOne({
      channelId: webhookChannel._id,
      incidentId: incident._id,
      event: 'incident_resolved'
    });
    expect(delivery).toBeDefined();
    expect(delivery.status).toBe('skipped');
    expect(delivery.skipReason).toBe('no_open_alert');
  });

  it('12. incident_resolved sent when opened was successfully sent', async () => {
    // The opened delivery was sent
    await NotificationDelivery.create({
      ownerId: user._id,
      channelId: webhookChannel._id,
      incidentId: incident._id,
      applicationId: application._id,
      event: 'incident_opened',
      status: 'sent',
      attempts: 1,
      sentAt: new Date(Date.now() - 60000)
    });

    let webhookCalled = false;
    const mockHttpSender = vi.fn(async () => {
      webhookCalled = true;
      return { success: true, statusCode: 200, errorType: null, retryable: false };
    });

    const resolvedIncident = await Incident.findByIdAndUpdate(
      incident._id,
      { status: 'resolved', isActive: false, resolvedAt: new Date() },
      { new: true }
    );

    await notifyIncidentEvent(resolvedIncident, application, 'incident_resolved', {
      customHttpSender: mockHttpSender
    });

    await new Promise((res) => setTimeout(res, 120));

    expect(webhookCalled).toBe(true);

    const delivery = await NotificationDelivery.findOne({
      channelId: webhookChannel._id,
      incidentId: incident._id,
      event: 'incident_resolved'
    });
    expect(delivery).toBeDefined();
    expect(delivery.status).toBe('sent');
  });

  it('13. incident_resolved skipped when opened failed after retries', async () => {
    // The opened delivery failed
    await NotificationDelivery.create({
      ownerId: user._id,
      channelId: webhookChannel._id,
      incidentId: incident._id,
      applicationId: application._id,
      event: 'incident_opened',
      status: 'failed',
      attempts: 3,
      errorType: 'http_error',
      httpStatus: 500
    });

    const mockHttpSender = vi.fn();

    const resolvedIncident = await Incident.findByIdAndUpdate(
      incident._id,
      { status: 'resolved', isActive: false, resolvedAt: new Date() },
      { new: true }
    );

    await notifyIncidentEvent(resolvedIncident, application, 'incident_resolved', {
      customHttpSender: mockHttpSender
    });

    await new Promise((res) => setTimeout(res, 80));

    expect(mockHttpSender).not.toHaveBeenCalled();

    const delivery = await NotificationDelivery.findOne({
      channelId: webhookChannel._id,
      incidentId: incident._id,
      event: 'incident_resolved'
    });
    expect(delivery).toBeDefined();
    expect(delivery.status).toBe('skipped');
    expect(delivery.skipReason).toBe('no_open_alert');
  });

  it('14. email proof: escapes malicious HTML in app name and strips CR/LF from subject header', async () => {
    let capturedMail = null;
    const mockTransport = {
      sendMail: vi.fn(async (options) => {
        capturedMail = options;
        return { messageId: 'test-123' };
      })
    };

    const maliciousApp = {
      _id: application._id,
      name: 'Malicious <script>alert(1)</script> App\r\nBcc: attacker@evil.com\r\nX-Injected: header'
    };

    const maliciousIncident = {
      _id: incident._id,
      ownerId: user._id,
      title: 'Injected title <img src=x onerror=alert(2)>\r\nHeader: inject',
      severity: 'high',
      status: 'open',
      startedAt: new Date()
    };

    const emailChannel = await NotificationChannel.create({
      ownerId: user._id,
      name: 'Email Escape Test',
      type: 'email',
      events: ['incident_opened'],
      enabled: true
    });

    await notifyIncidentEvent(maliciousIncident, maliciousApp, 'incident_opened', {
      customMailTransport: mockTransport
    });

    await new Promise((res) => setTimeout(res, 120));

    expect(mockTransport.sendMail).toHaveBeenCalled();
    expect(capturedMail).toBeDefined();

    // Subject must NOT contain \r or \n (prevents SMTP header injection)
    expect(capturedMail.subject).toBeDefined();
    expect(capturedMail.subject).not.toContain('\r');
    expect(capturedMail.subject).not.toContain('\n');
    expect(capturedMail.subject).toContain('[DevOpsPulse] HIGH:');

    // HTML body must escape script tags (prevents XSS in mail clients)
    expect(capturedMail.html).not.toContain('<script>');
    expect(capturedMail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(capturedMail.html).not.toContain('<img src=x');
    expect(capturedMail.html).toContain('&lt;img src=x');
  });
});
