import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { extractCookie, createTestUser, getAuthCookie } from '../helpers.js';

describe('Auth API (/api/v1/auth)', () => {
  it('register creates a user, hashes password, and sets an httpOnly cookie without returning passwordHash', async () => {
    const payload = {
      name: 'Alice Developer',
      email: 'alice@example.com',
      password: 'SecurePassword123!'
    };

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe('alice@example.com');
    expect(res.body.data.user.name).toBe('Alice Developer');

    // Never leak passwordHash in response body
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.password).toBeUndefined();

    // Verify httpOnly cookie
    const tokenCookie = extractCookie(res, 'token');
    expect(tokenCookie).toBeTruthy();
    expect(tokenCookie).toContain('HttpOnly');

    // Verify database document
    const userInDb = await User.findOne({ email: 'alice@example.com' }).select('+passwordHash');
    expect(userInDb).not.toBeNull();
    expect(userInDb.passwordHash).not.toBe('SecurePassword123!');
    const isMatch = await bcrypt.compare('SecurePassword123!', userInDb.passwordHash);
    expect(isMatch).toBe(true);
  });

  it('duplicate email returns 409, including different case and whitespace', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'First User',
        email: 'duplicate@example.com',
        password: 'Password123!'
      });

    // Attempt registration with upper case and surrounding spaces
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Second User',
        email: '   DUPLICATE@EXAMPLE.COM   ',
        password: 'Password123!'
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('wrong password and unknown email return the IDENTICAL message and status code (no user enumeration)', async () => {
    const { user, password } = await createTestUser({ email: 'existing@example.com' });

    // 1. Wrong password
    const wrongPassRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'existing@example.com',
        password: 'CompletelyWrongPassword999!'
      });

    // 2. Unknown email
    const unknownEmailRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'nobody_exists@example.com',
        password: 'SomePassword123!'
      });

    expect(wrongPassRes.status).toBe(401);
    expect(unknownEmailRes.status).toBe(401);
    expect(wrongPassRes.body.message).toBe(unknownEmailRes.body.message);
    expect(wrongPassRes.body.message).toBe('Invalid email or password');
  });

  it('/me works with valid cookie and returns 401 after logout and with tampered cookie', async () => {
    const { user } = await createTestUser();
    const validCookie = getAuthCookie(user);

    // 1. Valid cookie succeeds
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', validCookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe(user.email);
    expect(meRes.body.data.user.passwordHash).toBeUndefined();

    // 2. Tampered cookie fails with 401
    const tamperedCookie = `${validCookie}tampered_signature`;
    const tamperedRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', tamperedCookie);

    expect(tamperedRes.status).toBe(401);

    // 3. Logout clears cookie
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', validCookie);

    expect(logoutRes.status).toBe(200);
    const clearedCookie = extractCookie(logoutRes, 'token');
    expect(clearedCookie).toBeTruthy();
    // Cookie cleared with past expiration or max-age 0
    expect(clearedCookie).toMatch(/Max-Age=0|Expires=/i);

    // 4. Request without cookie returns 401
    const afterLogoutRes = await request(app)
      .get('/api/v1/auth/me');

    expect(afterLogoutRes.status).toBe(401);
  });

  it('invalid input returns 400 with field errors', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: '',
        email: 'not-an-email',
        password: 'short'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);

    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain('name');
    expect(fields).toContain('email');
    expect(fields).toContain('password');
  });

  it('auth rate limiter returns 429 when threshold exceeded', async () => {
    // Configure rate limit threshold dynamically for this test
    const originalMax = process.env.AUTH_RATE_LIMIT_MAX;
    process.env.AUTH_RATE_LIMIT_MAX = '3';

    try {
      // Send requests up to threshold
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: `spam_${i}@example.com`, password: 'BadPassword123!' });
      }

      // The 4th request must be rate limited with 429
      const rateLimitedRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'spam_blocked@example.com', password: 'BadPassword123!' });

      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.body.message).toContain('Too many authentication attempts');
    } finally {
      process.env.AUTH_RATE_LIMIT_MAX = originalMax || '1000';
    }
  });
});
