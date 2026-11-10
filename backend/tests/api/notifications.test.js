import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import dns from 'dns';
import app from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { NotificationChannel } from '../../src/models/NotificationChannel.js';
import { NotificationDelivery } from '../../src/models/NotificationDelivery.js';
import { createTestUser, getAuthCookie } from '../helpers.js';
import { encrypt, generateSigningSecret } from '../../src/utils/crypto.js';
import { setSmtpConfiguredOverride } from '../../src/services/notificationService.js';

describe('Notifications API (/api/v1/notifications)', () => {
  let user, cookie;

  beforeEach(async () => {
    const created = await createTestUser({ email: 'notifier@example.com' });
    user = created.user;
    cookie = getAuthCookie(user);
  });

  describe('Channel Management', () => {
    it('creates a webhook channel, encrypts secrets, and returns signingSecret ONCE', async () => {
      const payload = {
        name: 'Production Slack Alerts',
        type: 'webhook',
        url: 'https://alert-webhook.example.com/services/T123/B456/789tokenSecret',
        format: 'slack',
        events: ['incident_opened', 'incident_resolved'],
        minSeverity: 'high'
      };

      const res = await request(app)
        .post('/api/v1/notifications/channels')
        .set('Cookie', cookie)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.channel).toBeDefined();
      expect(res.body.data.channel.name).toBe('Production Slack Alerts');
      expect(res.body.data.channel.minSeverity).toBe('high');
      expect(res.body.data.channel.format).toBe('slack');

      // Returns signingSecret once at creation
      expect(res.body.data.signingSecret).toBeDefined();
      expect(typeof res.body.data.signingSecret).toBe('string');
      expect(res.body.data.signingSecret.length).toBe(64);

      // URL in response is masked, secrets are never returned in plaintext
      expect(res.body.data.channel.url).toBeDefined();
      expect(res.body.data.channel.url.includes('789tokenSecret')).toBe(false);
      expect(res.body.data.channel.url).toMatch(/\*\*\*$/);
      expect(res.body.data.channel.urlEncrypted).toBeUndefined();
      expect(res.body.data.channel.secretEncrypted).toBeUndefined();

      // Database verification: secrets are encrypted
      const doc = await NotificationChannel.findById(res.body.data.channel._id).select(
        '+urlEncrypted +secretEncrypted'
      );
      expect(doc.urlEncrypted).toBeDefined();
      expect(doc.urlEncrypted.includes('789tokenSecret')).toBe(false);
      expect(doc.secretEncrypted).toBeDefined();
      expect(doc.secretEncrypted).not.toBe(res.body.data.signingSecret);
    });

    it('returns 409 when attempting to create more than 5 channels per user', async () => {
      for (let i = 1; i <= 5; i++) {
        await NotificationChannel.create({
          ownerId: user._id,
          name: `Channel ${i}`,
          type: 'webhook',
          urlEncrypted: encrypt(`https://example.com/webhook${i}`),
          secretEncrypted: encrypt(generateSigningSecret()),
          events: ['incident_opened']
        });
      }

      const res = await request(app)
        .post('/api/v1/notifications/channels')
        .set('Cookie', cookie)
        .send({
          name: 'Channel 6',
          type: 'webhook',
          url: 'https://example.com/webhook6',
          events: ['incident_opened']
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/maximum of 5/i);
    });

    it('rejects unexpected fields in request body (.strict())', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/channels')
        .set('Cookie', cookie)
        .send({
          name: 'Strict Test',
          type: 'webhook',
          url: 'https://example.com/webhook',
          events: ['incident_opened'],
          maliciousField: 'exploit',
          ownerId: 'hacked'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(
        res.body.errors.some(
          (e) =>
            (e.field && e.field.includes('maliciousField')) ||
            (e.message && e.message.includes('maliciousField'))
        )
      ).toBe(true);
    });

    it('returns 409 for email channel creation when SMTP is not configured', async () => {
      setSmtpConfiguredOverride(false);
      try {
        const res = await request(app)
          .post('/api/v1/notifications/channels')
          .set('Cookie', cookie)
          .send({
            name: 'Email Alerts',
            type: 'email',
            events: ['incident_opened']
          });

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/email is not configured/i);
      } finally {
        setSmtpConfiguredOverride(null);
      }
    });

    it('lists channels with masked webhook URLs and secrets completely omitted', async () => {
      const plainWebhookUrl = 'https://api.ops.example.com/webhooks?secret_token=super_secret_123';
      const createdChannel = await NotificationChannel.create({
        ownerId: user._id,
        name: 'List Webhook',
        type: 'webhook',
        urlEncrypted: encrypt(plainWebhookUrl),
        secretEncrypted: encrypt(generateSigningSecret()),
        events: ['incident_opened']
      });

      const res = await request(app)
        .get('/api/v1/notifications/channels')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.channels).toHaveLength(1);
      const ch = res.body.data.channels[0];
      expect(ch.name).toBe('List Webhook');
      expect(ch.url.includes('super_secret_123')).toBe(false);
      expect(ch.url).toMatch(/https:\/\/api\.ops\.example\.com\/.*\*\*\*/);
      expect(ch.urlEncrypted).toBeUndefined();
      expect(ch.secretEncrypted).toBeUndefined();
      expect(ch.signingSecret).toBeUndefined();

      // Assert plain webhook URL string does not appear anywhere in raw document or list endpoint output
      const rawDoc = await NotificationChannel.collection.findOne({ _id: createdChannel._id });
      const rawDocString = JSON.stringify(rawDoc);
      const resBodyString = JSON.stringify(res.body);

      expect(rawDocString.includes(plainWebhookUrl)).toBe(false);
      expect(resBodyString.includes(plainWebhookUrl)).toBe(false);
    });

    it('updates channel configuration (PATCH /channels/:id) and keeps secret unchanged', async () => {
      const channel = await NotificationChannel.create({
        ownerId: user._id,
        name: 'Original Channel',
        type: 'webhook',
        urlEncrypted: encrypt('https://example.com/original'),
        secretEncrypted: encrypt(generateSigningSecret()),
        events: ['incident_opened'],
        minSeverity: 'low'
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/channels/${channel._id}`)
        .set('Cookie', cookie)
        .send({
          name: 'Renamed Channel',
          minSeverity: 'critical',
          enabled: false
        });

      expect(res.status).toBe(200);
      expect(res.body.data.channel.name).toBe('Renamed Channel');
      expect(res.body.data.channel.minSeverity).toBe('critical');
      expect(res.body.data.channel.enabled).toBe(false);
      expect(res.body.data.signingSecret).toBeUndefined();
    });

    it('rotates webhook signing secret (POST /channels/:id/rotate-secret) and returns new secret once', async () => {
      const initialSecret = generateSigningSecret();
      const channel = await NotificationChannel.create({
        ownerId: user._id,
        name: 'Webhook For Rotation',
        type: 'webhook',
        urlEncrypted: encrypt('https://example.com/rotate'),
        secretEncrypted: encrypt(initialSecret),
        events: ['incident_opened']
      });

      const res = await request(app)
        .post(`/api/v1/notifications/channels/${channel._id}/rotate-secret`)
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.signingSecret).toBeDefined();
      expect(res.body.data.signingSecret).not.toBe(initialSecret);
      expect(res.body.data.signingSecret.length).toBe(64);

      // Verify database updated
      const updated = await NotificationChannel.findById(channel._id).select('+secretEncrypted');
      expect(updated.getDecryptedSecret()).toBe(res.body.data.signingSecret);
    });

    it('deletes channel and cascades deletion to associated delivery logs', async () => {
      const channel = await NotificationChannel.create({
        ownerId: user._id,
        name: 'Channel To Delete',
        type: 'webhook',
        urlEncrypted: encrypt('https://example.com/del'),
        secretEncrypted: encrypt(generateSigningSecret()),
        events: ['incident_opened']
      });

      await NotificationDelivery.create({
        ownerId: user._id,
        channelId: channel._id,
        event: 'test',
        status: 'sent'
      });

      const delRes = await request(app)
        .delete(`/api/v1/notifications/channels/${channel._id}`)
        .set('Cookie', cookie);

      expect(delRes.status).toBe(200);

      // Verify channel deleted
      const foundChan = await NotificationChannel.findById(channel._id);
      expect(foundChan).toBeNull();

      // Verify deliveries deleted
      const foundDelivs = await NotificationDelivery.find({ channelId: channel._id });
      expect(foundDelivs).toHaveLength(0);
    });
  });

  describe('SSRF Protection for Webhook URLs', () => {
    it('rejects localhost and private IP addresses in webhook URLs', async () => {
      const badUrls = [
        'http://localhost:8080/hook',
        'http://127.0.0.1/hook',
        'http://192.168.1.1/hook',
        'http://10.0.0.1/hook',
        'http://169.254.169.254/latest/meta-data',
        'http://admin:pass@example.com/hook'
      ];

      for (const badUrl of badUrls) {
        const res = await request(app)
          .post('/api/v1/notifications/channels')
          .set('Cookie', cookie)
          .send({
            name: 'Bad SSRF Webhook',
            type: 'webhook',
            url: badUrl,
            events: ['incident_opened']
          });

        expect(res.status).toBe(400);
      }
    });

    it('rejects a domain that resolves to a private IP address (DNS rebinding check)', async () => {
      const lookupSpy = vi.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '127.0.0.1', family: 4 }
      ]);

      const res = await request(app)
        .post('/api/v1/notifications/channels')
        .set('Cookie', cookie)
        .send({
          name: 'Private Domain Webhook',
          type: 'webhook',
          url: 'https://internal-dns.attacker.com/hook',
          events: ['incident_opened']
        });

      lookupSpy.mockRestore();

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/private or restricted IP/i);
    });
  });

  describe('Delivery Logs & Test Dispatch', () => {
    it('lists delivery logs with pagination and filters', async () => {
      const channel = await NotificationChannel.create({
        ownerId: user._id,
        name: 'Deliveries Channel',
        type: 'webhook',
        urlEncrypted: encrypt('https://example.com/hook'),
        secretEncrypted: encrypt(generateSigningSecret()),
        events: ['incident_opened']
      });

      await NotificationDelivery.create({
        ownerId: user._id,
        channelId: channel._id,
        event: 'incident_opened',
        status: 'sent',
        attempts: 1
      });

      await NotificationDelivery.create({
        ownerId: user._id,
        channelId: channel._id,
        event: 'incident_opened',
        status: 'skipped',
        skipReason: 'cooldown',
        attempts: 0
      });

      const res = await request(app)
        .get(`/api/v1/notifications/deliveries?status=sent`)
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.deliveries).toHaveLength(1);
      expect(res.body.data.deliveries[0].status).toBe('sent');
      expect(res.body.data.pagination.total).toBe(1);
    });

    it('POST /channels/:id/test sends properly labelled test alert (email, webhook, slack)', async () => {
      // 1. Webhook channel
      let sentWebhook = null;
      const testSender = vi.fn(async ({ url, secret, event, payloadObject }) => {
        sentWebhook = { event, payloadObject };
        return { success: true, statusCode: 200, errorType: null, retryable: false };
      });

      const webhookChan = await NotificationChannel.create({
        ownerId: user._id,
        name: 'Test Generic Webhook',
        type: 'webhook',
        format: 'generic',
        urlEncrypted: encrypt('https://example.com/test-webhook'),
        secretEncrypted: encrypt(generateSigningSecret()),
        events: ['incident_opened']
      });

      const { setGlobalHttpSender } = await import('../../src/services/notificationService.js');
      setGlobalHttpSender(testSender);

      try {
        const resWeb = await request(app)
          .post(`/api/v1/notifications/channels/${webhookChan._id}/test`)
          .set('Cookie', cookie);

        expect(resWeb.status).toBe(200);
        expect(sentWebhook).toBeDefined();
        expect(sentWebhook.event).toBe('test');
        expect(sentWebhook.payloadObject.event).toBe('test');
        expect(sentWebhook.payloadObject.link).toBeNull();

        // 2. Slack formatted webhook channel
        const slackChan = await NotificationChannel.create({
          ownerId: user._id,
          name: 'Test Slack Webhook',
          type: 'webhook',
          format: 'slack',
          urlEncrypted: encrypt('https://example.com/test-slack'),
          secretEncrypted: encrypt(generateSigningSecret()),
          events: ['incident_opened']
        });

        const resSlack = await request(app)
          .post(`/api/v1/notifications/channels/${slackChan._id}/test`)
          .set('Cookie', cookie);

        expect(resSlack.status).toBe(200);
        expect(sentWebhook.payloadObject.text).toMatch(/^TEST:/);

        // 3. Email channel
        const emailChan = await NotificationChannel.create({
          ownerId: user._id,
          name: 'Test Email Channel',
          type: 'email',
          events: ['incident_opened']
        });

        const capturedMails = [];
        const { sendTestNotification } = await import('../../src/services/notificationService.js');
        const customTransport = {
          sendMail: vi.fn(async (opts) => {
            capturedMails.push(opts);
            return { messageId: 'test-msg-1' };
          })
        };

        await sendTestNotification(emailChan, user, { customMailTransport: customTransport });
        expect(capturedMails).toHaveLength(1);
        expect(capturedMails[0].subject).toBe('[DevOpsPulse] TEST: this is a test notification');
        expect(capturedMails[0].text).toMatch(/no real incident exists/i);
        expect(capturedMails[0].html).toMatch(/no real incident exists/i);
      } finally {
        setGlobalHttpSender(null);
      }
    });
  });
});
