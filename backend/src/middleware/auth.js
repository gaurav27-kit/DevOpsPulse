import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Authentication middleware that verifies the user's JWT from httpOnly cookies
 * (with fallback to the Authorization Bearer header).
 * Attaches the authenticated user to req.user.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  let token = req.cookies?.token;

  // Optional fallback for Bearer header if testing via HTTP tools
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new AppError('Authentication required. Please log in.', 401);
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      throw new AppError('User belonging to this session no longer exists.', 401);
    }

    // Attach user document to request context
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new AppError('Invalid or expired session. Please log in again.', 401);
    }
    throw error;
  }
});

