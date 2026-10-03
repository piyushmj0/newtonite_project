import { query } from '../db/pool.js';

/**
 * Idempotency middleware for POST/PATCH requests.
 * 
 * Clients send an 'Idempotency-Key' header (UUID) with mutating requests.
 * If we've seen this key before, we return the cached response.
 * This handles: user double-clicks, network retry causing duplicate submissions,
 * client uncertainty about whether first request succeeded.
 * 
 * Keys expire after 24 hours.
 */
export const idempotency = async (req, res, next) => {
  const key = req.headers['idempotency-key'];
  
  if (!key) {
    return next(); // Idempotency is optional
  }

  // Clean up expired keys periodically (cheap, runs ~1% of requests)
  if (Math.random() < 0.01) {
    query('DELETE FROM idempotency_keys WHERE expires_at < NOW()').catch(() => {});
  }

  try {
    const { rows } = await query(
      'SELECT response_status, response_body FROM idempotency_keys WHERE key = $1 AND user_id = $2 AND expires_at > NOW()',
      [key, req.user.id]
    );

    if (rows.length > 0) {
      // Return cached response - idempotent replay
      const cached = rows[0];
      res.setHeader('X-Idempotency-Replayed', 'true');
      return res.status(cached.response_status).json(cached.response_body);
    }

    // Store the key+response after the request completes
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      // Only cache successful responses
      if (res.statusCode < 500) {
        await query(
          'INSERT INTO idempotency_keys (key, user_id, response_status, response_body) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING',
          [key, req.user.id, res.statusCode, body]
        ).catch(() => {}); // Don't fail request if caching fails
      }
      return originalJson(body);
    };

    next();
  } catch (err) {
    // If idempotency check fails, still process the request
    next();
  }
};
