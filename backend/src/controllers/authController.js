import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/authService.js';
import { env } from '../config/env.js';

const COOKIE_NAME = 'token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns security-hardened cookie configuration options.
 */
const getCookieOptions = () => ({
  httpOnly: true, // Prevents client-side script access
  secure: env.NODE_ENV === 'production', // Send over HTTPS only in production
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax', // Protect against CSRF
  maxAge: SEVEN_DAYS_MS
});

/**
 * Register a new user, issue JWT cookie, and return user profile.
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const { user, token } = await authService.register({ name, email, password });

  res.cookie(COOKIE_NAME, token, getCookieOptions());

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: { user }
  });
});

/**
 * Authenticate existing user, issue JWT cookie, and return user profile.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, token } = await authService.login({ email, password });

  res.cookie(COOKIE_NAME, token, getCookieOptions());

  res.status(200).json({
    success: true,
    message: 'Logged in successfully',
    data: { user }
  });
});

/**
 * Invalidate session by clearing the httpOnly JWT cookie.
 */
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax'
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * Retrieve current authenticated user profile.
 */
export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: { user: req.user }
  });
});

