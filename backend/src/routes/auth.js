import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/**
 * POST /api/auth/register
 * Register a new user.
 */
router.post('/register', asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);

  const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const { rows: [user] } = await query(
    'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
    [data.email, data.name, passwordHash]
  );

  const token = jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
}));

/**
 * POST /api/auth/login
 * Authenticate user, return JWT.
 */
router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);

  const { rows } = await query(
    'SELECT id, email, name, password_hash FROM users WHERE email = $1',
    [data.email]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = rows[0];
  const valid = await bcrypt.compare(data.password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
}));

/**
 * GET /api/auth/me
 * Return current authenticated user profile.
 */
router.get('/me', asyncHandler(async (req, res) => {
  // req.user set by authenticate middleware
  const { rows } = await query(`
    SELECT 
      u.id, u.email, u.name, u.created_at,
      json_agg(json_build_object('team_id', tm.team_id, 'team_name', t.name, 'role', tm.role)) 
        FILTER (WHERE tm.team_id IS NOT NULL) as teams
    FROM users u
    LEFT JOIN team_members tm ON tm.user_id = u.id
    LEFT JOIN teams t ON t.id = tm.team_id
    WHERE u.id = $1
    GROUP BY u.id
  `, [req.user.id]);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user: rows[0] });
}));

export default router;
