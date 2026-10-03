import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/teams
 * Returns teams the current user belongs to.
 */
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT 
      t.id, t.name, t.description, t.created_at,
      tm.role as user_role,
      (SELECT COUNT(*)::int FROM team_members WHERE team_id = t.id) as member_count,
      (SELECT COUNT(*)::int FROM work_items WHERE team_id = t.id AND status NOT IN ('closed', 'resolved')) as open_item_count
    FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = $1
    ORDER BY t.name
  `, [req.user.id]);

  res.json({ teams: rows });
}));

/**
 * GET /api/teams/:teamId/members
 * Returns members of a team (only accessible to team members).
 */
router.get('/:teamId/members', asyncHandler(async (req, res) => {
  const { teamId } = req.params;

  // Check user is a member
  const { rows: [membership] } = await query(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, req.user.id]
  );
  if (!membership) {
    return res.status(403).json({ error: 'Not a member of this team' });
  }

  const { rows } = await query(`
    SELECT u.id, u.name, u.email, tm.role, tm.joined_at
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = $1
    ORDER BY tm.role DESC, u.name ASC
  `, [teamId]);

  res.json({ members: rows });
}));

/**
 * GET /api/users/search?q=
 * Search users by name or email (for assignment autocomplete).
 */
router.get('/users/search', asyncHandler(async (req, res) => {
  const { q = '' } = req.query;
  if (q.length < 2) return res.json({ users: [] });

  const { rows } = await query(`
    SELECT id, name, email
    FROM users
    WHERE name LIKE $1 OR email LIKE $1
    LIMIT 10
  `, [`%${q}%`]);

  res.json({ users: rows });
}));

export default router;
