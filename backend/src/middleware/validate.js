import { AppError } from '../utils/AppError.js';

/**
 * Middleware factory supporting both:
 * 1. An object of schemas: validate({ body?: ZodSchema, params?: ZodSchema, query?: ZodSchema })
 * 2. A single combined Zod schema: validate(CombinedSchema)
 *
 * Extracted query parameters are placed in req.validated.query to preserve Express internals.
 */
export const validate = (schema) => async (req, res, next) => {
  try {
    req.validated = req.validated || {};

    // Pattern 1: Separate schema dictionary { body, params, query }
    if (schema && typeof schema === 'object' && !('parseAsync' in schema)) {
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }
      if (schema.query) {
        req.validated.query = await schema.query.parseAsync(req.query);
      }
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      return next();
    }

    // Pattern 2: Single combined Zod schema
    const parsed = await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params
    });

    if (parsed.body !== undefined) req.body = parsed.body;
    if (parsed.params !== undefined) req.params = parsed.params;
    if (parsed.query !== undefined) {
      req.validated.query = parsed.query;
    }

    next();
  } catch (error) {
    if (error.name === 'ZodError') {
      const fieldErrors = error.errors.map((err) => {
        // Remove container prefixes ('body', 'query', 'params') if present
        const filteredPath = err.path.filter((p) => p !== 'body' && p !== 'query' && p !== 'params');
        const field = filteredPath.length > 0 ? filteredPath.join('.') : 'root';
        return {
          field,
          message: err.message
        };
      });

      return next(new AppError('Validation failed', 400, fieldErrors));
    }
    next(error);
  }
};
