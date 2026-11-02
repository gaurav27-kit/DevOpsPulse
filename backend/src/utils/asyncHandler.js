/**
 * Wraps an async route handler or middleware to catch any rejected promises
 * and pass the error to Express's next() error handler.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

