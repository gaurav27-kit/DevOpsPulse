import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';
import { env } from '../src/config/env.js';

/**
 * Creates a user directly in the test database.
 */
export async function createTestUser(overrides = {}) {
  const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const password = overrides.password || 'Password123!';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    name: overrides.name || 'Test User',
    email: overrides.email || `test_${unique}@example.com`,
    passwordHash
  });

  return { user, password };
}

/**
 * Generates an authenticated cookie header for a user.
 */
export function getAuthCookie(user) {
  const token = jwt.sign({ id: user._id.toString() }, env.JWT_SECRET, { expiresIn: '1h' });
  return `token=${token}`;
}

/**
 * Extracts a cookie value by name from response Set-Cookie headers.
 */
export function extractCookie(res, cookieName = 'token') {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return null;
  const cookieList = Array.isArray(setCookie) ? setCookie : [setCookie];
  const found = cookieList.find((c) => c.startsWith(`${cookieName}=`));
  return found || null;
}

