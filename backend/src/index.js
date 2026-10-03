import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import workItemRoutes from './routes/workItems.js';
import commentRoutes from './routes/comments.js';
import teamRoutes from './routes/teams.js';
import dashboardRoutes from './routes/dashboard.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Core Middleware ──────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// Basic rate limiting - protects against abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Auth routes get stricter rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many authentication attempts, please try again later' },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);

// Work items comments are nested under work items path
app.use('/api/work-items', workItemRoutes);
app.use('/api/work-items', commentRoutes);

app.use('/api/teams', teamRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);

// User search (accessible by authenticated users)
app.get('/api/users/search', authenticate, async (req, res, next) => {
  try {
    const { query: pool } = await import('./db/pool.js');
    const { q = '' } = req.query;
    if (q.length < 2) return res.json({ users: [] });

    const { rows } = await pool(`
      SELECT id, name, email FROM users
      WHERE name ILIKE $1 OR email ILIKE $1
      LIMIT 10
    `, [`%${q}%`]);
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
  console.log(`   Database: ${process.env.DATABASE_URL}`);
});

export default app;
