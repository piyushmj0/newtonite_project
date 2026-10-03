import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

/**
 * Authentication middleware.
 * Validates JWT, attaches user to req.user.
 */
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Attach minimal user info - avoids DB call on every request
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Authorization middleware factory.
 * Checks that the authenticated user has the required role on a team.
 * 
 * Usage: requireTeamRole('admin') will only allow team admins.
 * requireTeamRole('member') will allow members and admins.
 */
export const requireTeamRole = (requiredRole) => async (req, res, next) => {
  const { teamId } = req.params;
  if (!teamId) return next();

  const { rows } = await query(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, req.user.id]
  );

  if (rows.length === 0) {
    return res.status(403).json({ error: 'Not a member of this team' });
  }

  const userRole = rows[0].role;
  if (requiredRole === 'admin' && userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.teamRole = userRole;
  next();
};

/**
 * Resource-level authorization for work items.
 * A user can act on a work item if they:
 *   - created it
 *   - are the assignee
 *   - are a member of the item's team
 *   - are an admin of the item's team
 * 
 * 'write' actions additionally require: creator, assignee, or team admin
 */
export const authorizeWorkItem = (action = 'read') => async (req, res, next) => {
  const workItemId = req.params.id || req.params.workItemId;
  if (!workItemId) return next();

  const { rows } = await query(`
    SELECT 
      wi.id,
      wi.created_by,
      wi.assignee_id,
      wi.team_id,
      tm.role as team_role
    FROM work_items wi
    LEFT JOIN team_members tm ON tm.team_id = wi.team_id AND tm.user_id = $2
    WHERE wi.id = $1
  `, [workItemId, req.user.id]);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Work item not found' });
  }

  const item = rows[0];
  const isCreator = item.created_by === req.user.id;
  const isAssignee = item.assignee_id === req.user.id;
  const isTeamMember = !!item.team_role;
  const isTeamAdmin = item.team_role === 'admin';

  // Read: anyone in the team, creator, or assignee
  if (action === 'read') {
    if (!isCreator && !isAssignee && !isTeamMember) {
      return res.status(403).json({ error: 'Access denied to this work item' });
    }
  }

  // Write: creator, assignee, or team admin (not just any team member)
  if (action === 'write') {
    if (!isCreator && !isAssignee && !isTeamAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions to modify this work item' });
    }
  }

  req.workItem = item;
  next();
};
