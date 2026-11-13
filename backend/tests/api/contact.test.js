import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { ContactMessage } from '../../src/models/ContactMessage.js';
import * as notificationService from '../../src/services/notificationService.js';

describe('Contact Form API (POST /api/v1/contact)', () => {
  beforeEach(async () => {
    await ContactMessage.deleteMany({});
    delete process.env.CONTACT_RATE_LIMIT_MAX;
    delete process.env.SMTP_HOST;
    delete process.env.CONTACT_TO_EMAIL;
  });

  afterEach(() => {
    delete process.env.CONTACT_RATE_LIMIT_MAX;
    delete process.env.SMTP_HOST;
    delete process.env.CONTACT_TO_EMAIL;
    vi.restoreAllMocks();
  });

  it('1. successfully receives and stores valid contact message in MongoDB with status "new"', async () => {
    const payload = {
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      message: 'Hello, I have an inquiry about DevOpsPulse multi-window SLO alerting capabilities.'
    };

    const res = await request(app)
      .post('/api/v1/contact')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/sent successfully/i);

    const saved = await ContactMessage.findOne({ email: 'jane.doe@example.com' });
    expect(saved).not.toBeNull();
    expect(saved.name).toBe('Jane Doe');
    expect(saved.email).toBe('jane.doe@example.com');
    expect(saved.message).toBe(payload.message);
    expect(saved.status).toBe('new');
    expect(saved.createdAt).toBeInstanceOf(Date);
  });

  it('2. strict body schema rejects unknown or extra fields with 400', async () => {
    const payload = {
      name: 'Malicious Attacker',
      email: 'attacker@example.com',
      message: 'Attempting to inject unexpected fields.',
      isAdmin: true,
      role: 'admin'
    };

    const res = await request(app)
      .post('/api/v1/contact')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    const count = await ContactMessage.countDocuments();
    expect(count).toBe(0);
  });

  it('3. rejects invalid email, short message (< 10 chars), and over-long message (> 2000 chars)', async () => {
    // Invalid email
    const resBadEmail = await request(app)
      .post('/api/v1/contact')
      .send({
        name: 'John Smith',
        email: 'not-an-email',
        message: 'This message has valid length.'
      });
    expect(resBadEmail.status).toBe(400);

    // Short message (< 10)
    const resShortMsg = await request(app)
      .post('/api/v1/contact')
      .send({
        name: 'John Smith',
        email: 'john@example.com',
        message: 'Too short'
      });
    expect(resShortMsg.status).toBe(400);

    // Over-long message (> 2000)
    const resLongMsg = await request(app)
      .post('/api/v1/contact')
      .send({
        name: 'John Smith',
        email: 'john@example.com',
        message: 'A'.repeat(2001)
      });
    expect(resLongMsg.status).toBe(400);

    // Short name (< 2)
    const resShortName = await request(app)
      .post('/api/v1/contact')
      .send({
        name: 'A',
        email: 'john@example.com',
        message: 'Valid length message here.'
      });
    expect(resShortName.status).toBe(400);
  });

  it('4. honeypot field "website": returns 200 success but stores nothing in database', async () => {
    const payload = {
      name: 'Spam Bot',
      email: 'bot@spammer.org',
      message: 'Buy cheap watches and luxury products online now!',
      website: 'https://spam-link.example.com'
    };

    const res = await request(app)
      .post('/api/v1/contact')
      .send(payload);

    // Returns success so spam bot thinks it succeeded
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Confirms nothing stored in database
    const saved = await ContactMessage.findOne({ email: 'bot@spammer.org' });
    expect(saved).toBeNull();
  });

  it('5. enforces IP rate limiting: returns 429 on the 4th request within rate window', async () => {
    process.env.CONTACT_RATE_LIMIT_MAX = '3';

    const testIp = '203.0.113.195';
    const validPayload = {
      name: 'Rate Limiter Tester',
      email: 'rate@example.com',
      message: 'Checking contact form rate limiter enforcement.'
    };

    // Request 1: 200
    const res1 = await request(app).post('/api/v1/contact').set('X-Forwarded-For', testIp).send(validPayload);
    expect(res1.status).toBe(200);

    // Request 2: 200
    const res2 = await request(app).post('/api/v1/contact').set('X-Forwarded-For', testIp).send(validPayload);
    expect(res2.status).toBe(200);

    // Request 3: 200
    const res3 = await request(app).post('/api/v1/contact').set('X-Forwarded-For', testIp).send(validPayload);
    expect(res3.status).toBe(200);

    // Request 4: 429
    const res4 = await request(app).post('/api/v1/contact').set('X-Forwarded-For', testIp).send(validPayload);
    expect(res4.status).toBe(429);
    expect(res4.body.success).toBe(false);
    expect(res4.body.message).toMatch(/too many/i);
  });

  it('6. SMTP mail failure still returns success: email failure never breaks customer submission', async () => {
    // Mock getMailTransport to throw an error simulating SMTP failure
    const mockTransport = {
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP Connection Timeout'))
    };
    vi.spyOn(notificationService, 'getMailTransport').mockReturnValue(mockTransport);

    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.CONTACT_TO_EMAIL = 'admin@example.com';

    const res = await request(app)
      .post('/api/v1/contact')
      .send({
        name: 'Resilience Test',
        email: 'resilience@example.com',
        message: 'Even if SMTP is down, my inquiry must be safely recorded.'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const saved = await ContactMessage.findOne({ email: 'resilience@example.com' });
    expect(saved).not.toBeNull();
  });

  it('7. header injection attempt in name/email stripped of CR and LF characters', async () => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: '123' });
    const mockTransport = {
      sendMail: mockSendMail
    };
    vi.spyOn(notificationService, 'getMailTransport').mockReturnValue(mockTransport);

    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.CONTACT_TO_EMAIL = 'admin@example.com';

    const injectionName = 'Injected Name\r\nBcc: evil@attacker.com\r\nX-Spam: true';
    const res = await request(app)
      .post('/api/v1/contact')
      .send({
        name: injectionName,
        email: 'safe@example.com',
        message: 'Testing header injection defense.'
      });

    expect(res.status).toBe(200);

    // Verify that sendMail subject and headers received stripped name without CRLF
    expect(mockSendMail).toHaveBeenCalled();
    const callArg = mockSendMail.mock.calls[0][0];
    expect(callArg.subject).not.toContain('\r');
    expect(callArg.subject).not.toContain('\n');
    expect(callArg.to).toBe('admin@example.com');
  });
});
