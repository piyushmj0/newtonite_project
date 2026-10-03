import { ZodError } from 'zod';

/**
 * Global error handler middleware.
 * Maps known error types to appropriate HTTP responses.
 */
export const errorHandler = (err, req, res, next) => {
  // Validation errors from Zod
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // unique_violation
        return res.status(409).json({ error: 'Resource already exists', detail: err.detail });
      case '23503': // foreign_key_violation
        return res.status(400).json({ error: 'Referenced resource not found' });
      case '23514': // check_violation
        return res.status(400).json({ error: 'Invalid value', detail: err.detail });
      case '40001': // serialization_failure (concurrent transaction conflict)
        return res.status(409).json({ error: 'Concurrent modification conflict, please retry' });
    }
  }

  // Optimistic locking conflict (our custom error)
  if (err.name === 'VersionConflict') {
    return res.status(409).json({
      error: 'This item was modified by someone else. Please refresh and try again.',
      code: 'VERSION_CONFLICT',
    });
  }

  if (err.status) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }

  // Unknown errors
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
};

/**
 * Creates a version conflict error.
 */
export const versionConflict = () => {
  const err = new Error('Version conflict');
  err.name = 'VersionConflict';
  return err;
};

/**
 * Async route handler wrapper to avoid try/catch boilerplate.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
