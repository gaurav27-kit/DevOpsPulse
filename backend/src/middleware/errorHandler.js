import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

/**
 * 404 handler for unhandled API routes.
 */
export const notFoundHandler = (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
};

/**
 * Centralized application error handling middleware.
 * Ensures consistent JSON response shape: { success: false, message, errors? }.
 */
export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle MongoDB duplicate key error (E11000)
  if (err.code === 11000) {
    const keys = Object.keys(err.keyValue || {});
    let message = 'Duplicate key error';
    let field = keys[0] || 'field';

    if (keys.includes('url')) {
      field = 'url';
      message = 'You are already monitoring this URL';
    } else if (keys.includes('email')) {
      field = 'email';
      message = 'Email already exists';
    } else {
      message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    }

    error = new AppError(message, 409, [
      {
        field,
        message
      }
    ]);
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    const message = `Invalid format for ${err.path}: ${err.value}`;
    error = new AppError(message, 400);
  }

  // Handle JWT verification errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid authentication token', 401);
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Authentication token has expired', 401);
  }

  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational || false;

  // Operational errors return user-friendly messages; unknown errors return generic 500 message
  const response = {
    success: false,
    message: isOperational ? error.message : 'Internal server error'
  };

  if (error.errors && Array.isArray(error.errors)) {
    response.errors = error.errors;
  }

  // Log non-operational errors for debugging while keeping client response sanitized
  if (!isOperational) {
    console.error('[UNHANDLED ERROR]', err);
  }

  res.status(statusCode).json(response);
};

