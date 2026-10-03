import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/dashboard
 * 
 * Returns a summary of what requires attention for the current user.
 * Intentionally designed to answer: "what needs my attention right now?"
 * 
 * Performance: Uses a single query with CTEs to avoid N+1 issues.
 */
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const [myItemsResult, criticalResult, pendingApprovalResult, recentActivityResult, statsResult] = await Promise.all([
    // Items assigned to me, not resolved/closed
    query(`
      SELECT wi.id, wi.title, wi.status, wi.priority, wi.updated_at, wi.due_date,
             t.name as team_name
      FROM work_items wi
      LEFT JOIN teams t ON t.id = wi.team_id
      WHERE wi.assignee_id = $1 AND wi.status NOT IN ('resolved', 'closed')
      ORDER BY 
        CASE wi.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
        wi.updated_at DESC
      LIMIT 10
    `, [userId]),

    // Critical items across my teams
    query(`
      SELECT wi.id, wi.title, wi.status, wi.priority, wi.updated_at,
             u.name as assignee_name, t.name as team_name
      FROM work_items wi
      LEFT JOIN users u ON u.id = wi.assignee_id
      LEFT JOIN teams t ON t.id = wi.team_id
      WHERE wi.priority = 'critical' 
        AND wi.status NOT IN ('resolved', 'closed')
        AND (
          wi.created_by = $1 OR wi.assignee_id = $1
          OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = wi.team_id AND tm.user_id = $1)
        )
      ORDER BY wi.updated_at DESC
      LIMIT 5
    `, [userId]),

    // Items pending my approval (team admin)
    query(`
      SELECT wi.id, wi.title, wi.priority, a.created_at as requested_at,
             ru.name as requested_by_name, t.name as team_name
      FROM approvals a
      JOIN work_items wi ON wi.id = a.work_item_id
      JOIN users ru ON ru.id = a.requested_by
      LEFT JOIN teams t ON t.id = wi.team_id
      JOIN team_members tm ON tm.team_id = wi.team_id AND tm.user_id = $1
      WHERE a.status = 'pending' AND tm.role = 'admin'
      ORDER BY 
        CASE wi.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
        a.created_at ASC
    `, [userId]),

    // Recent activity on my items
    query(`
      SELECT e.id, e.event_type, e.payload, e.created_at,
             eu.name as actor_name,
             wi.id as work_item_id, wi.title as work_item_title
      FROM work_item_events e
      JOIN users eu ON eu.id = e.user_id
      JOIN work_items wi ON wi.id = e.work_item_id
      WHERE e.user_id != $1 AND (
        wi.created_by = $1 OR wi.assignee_id = $1
        OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = wi.team_id AND tm.user_id = $1)
      )
      ORDER BY e.created_at DESC
      LIMIT 15
    `, [userId]),

    // Summary stats
    query(`
      SELECT 
        COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::int as open_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int as in_progress_count,
        COUNT(*) FILTER (WHERE priority = 'critical' AND status NOT IN ('resolved', 'closed'))::int as critical_count,
        COUNT(*) FILTER (WHERE status = 'pending_approval')::int as pending_approval_count,
        COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('resolved', 'closed'))::int as overdue_count
      FROM work_items
      WHERE created_by = $1 OR assignee_id = $1
        OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = team_id AND tm.user_id = $1)
    `, [userId]),
  ]);

  res.json({
    myItems: myItemsResult.rows,
    criticalItems: criticalResult.rows,
    pendingApprovals: pendingApprovalResult.rows,
    recentActivity: recentActivityResult.rows,
    stats: statsResult.rows[0],
  });
}));

export default router;
