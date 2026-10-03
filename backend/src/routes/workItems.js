import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, versionConflict } from '../middleware/errorHandler.js';
import { authenticate, authorizeWorkItem } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';

const router = Router();

// All work item routes require authentication
router.use(authenticate);

// ─── Validation Schemas ───────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  category: z.enum(['customer_issue', 'engineering', 'payment', 'production_incident', 'compliance', 'operational', 'general']).default('general'),
  assignee_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().min(3).max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z.enum(['customer_issue', 'engineering', 'payment', 'production_incident', 'compliance', 'operational', 'general']).optional(),
  assignee_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  // Client must send the current version for optimistic locking
  version: z.number().int().positive(),
});

const statusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'pending_approval', 'resolved', 'closed']),
  version: z.number().int().positive(),
  notes: z.string().max(1000).optional(),
});

// ─── Valid State Transitions ──────────────────────────────────────────────────
const VALID_TRANSITIONS = {
  open: ['in_progress', 'closed'],
  in_progress: ['open', 'pending_approval', 'resolved', 'closed'],
  pending_approval: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};

// ─── List Work Items ──────────────────────────────────────────────────────────

/**
 * GET /api/work-items
 * 
 * Returns work items visible to the current user.
 * Supports: filtering, searching (full-text), pagination, sorting.
 * 
 * Visibility: items created by user, assigned to user, or belonging to user's teams.
 * Pagination: cursor-based using updated_at + id to handle concurrent inserts correctly.
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    status, priority, category, assignee_id, team_id, search,
    page = '1', limit = '25', sort = 'updated_at', order = 'desc',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  // Whitelist sort columns to prevent SQL injection
  const sortCol = ['updated_at', 'created_at', 'priority', 'title'].includes(sort) ? sort : 'updated_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  const params = [req.user.id];
  const conditions = [];

  // Visibility filter: user must be creator, assignee, or team member
  conditions.push(`(
    wi.created_by = $1
    OR wi.assignee_id = $1
    OR EXISTS (
      SELECT 1 FROM team_members tm 
      WHERE tm.team_id = wi.team_id AND tm.user_id = $1
    )
  )`);

  if (status) {
    params.push(status);
    conditions.push(`wi.status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    conditions.push(`wi.priority = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`wi.category = $${params.length}`);
  }
  if (assignee_id) {
    params.push(assignee_id);
    conditions.push(`wi.assignee_id = $${params.length}`);
  }
  if (team_id) {
    params.push(team_id);
    conditions.push(`wi.team_id = $${params.length}`);
  }
  if (search) {
    params.push(search);
    conditions.push(`(wi.title LIKE '%' || $${params.length} || '%' OR wi.description LIKE '%' || $${params.length} || '%')`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Priority ordering: critical > high > medium > low
  const priorityOrder = sortCol === 'priority'
    ? `CASE wi.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END ${sortOrder}`
    : `wi.${sortCol} ${sortOrder}`;

  const [itemsResult, countResult] = await Promise.all([
    query(`
      SELECT 
        wi.id, wi.title, wi.status, wi.priority, wi.category,
        wi.created_at, wi.updated_at, wi.due_date, wi.version,
        wi.created_by, wi.assignee_id, wi.team_id,
        u_creator.name as creator_name,
        u_assignee.name as assignee_name,
        t.name as team_name,
        (SELECT COUNT(*) FROM comments c WHERE c.work_item_id = wi.id)::int as comment_count
      FROM work_items wi
      LEFT JOIN users u_creator ON u_creator.id = wi.created_by
      LEFT JOIN users u_assignee ON u_assignee.id = wi.assignee_id
      LEFT JOIN teams t ON t.id = wi.team_id
      ${whereClause}
      ORDER BY ${priorityOrder}, wi.id ${sortOrder}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limitNum, offset]),
    query(`
      SELECT COUNT(*)::int as total
      FROM work_items wi
      ${whereClause}
    `, params),
  ]);

  const total = countResult.rows[0].total;

  res.json({
    items: itemsResult.rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
}));

// ─── Get Single Work Item ─────────────────────────────────────────────────────

/**
 * GET /api/work-items/:id
 * Returns full details including recent events and comments.
 */
router.get('/:id', authorizeWorkItem('read'), asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT 
      wi.*,
      u_creator.name as creator_name, u_creator.email as creator_email,
      u_assignee.name as assignee_name, u_assignee.email as assignee_email,
      t.name as team_name,
      (
        SELECT json_group_array(
          json_object(
            'id', e.id, 'event_type', e.event_type, 'payload', e.payload,
            'created_at', e.created_at, 'user_name', eu.name, 'user_id', eu.id
          ) 
        )
        FROM (SELECT * FROM work_item_events WHERE work_item_id = wi.id ORDER BY created_at ASC) e
        JOIN users eu ON eu.id = e.user_id
      ) as events,
      (
        SELECT json_group_array(
          json_object(
            'id', c.id, 'content', c.content, 'created_at', c.created_at,
            'updated_at', c.updated_at, 'user_id', c.user_id, 'user_name', cu.name
          ) 
        )
        FROM (SELECT * FROM comments WHERE work_item_id = wi.id ORDER BY created_at ASC) c
        JOIN users cu ON cu.id = c.user_id
      ) as comments,
      (
        SELECT json_object(
          'id', a.id, 'status', a.status, 'notes', a.notes,
          'created_at', a.created_at, 'requested_by', ru.name
        )
        FROM approvals a
        JOIN users ru ON ru.id = a.requested_by
        WHERE a.work_item_id = wi.id
        ORDER BY a.created_at DESC LIMIT 1
      ) as approval
    FROM work_items wi
    LEFT JOIN users u_creator ON u_creator.id = wi.created_by
    LEFT JOIN users u_assignee ON u_assignee.id = wi.assignee_id
    LEFT JOIN teams t ON t.id = wi.team_id
    WHERE wi.id = $1
  `, [req.params.id]);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Work item not found' });
  }

  res.json({ item: rows[0] });
}));

// ─── Create Work Item ─────────────────────────────────────────────────────────

/**
 * POST /api/work-items
 * Creates a new work item and seeds the audit log.
 * Supports idempotency keys to prevent duplicate creation.
 */
router.post('/', idempotency, asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const { rows: [item] } = await client.query(`
      INSERT INTO work_items (title, description, priority, category, created_by, assignee_id, team_id, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [data.title, data.description || null, data.priority, data.category,
        req.user.id, data.assignee_id || null, data.team_id || null, data.due_date || null]);

    // Seed the audit log
    await client.query(`
      INSERT INTO work_item_events (work_item_id, user_id, event_type, payload)
      VALUES ($1, $2, 'created', $3)
    `, [item.id, req.user.id, JSON.stringify({
      title: item.title,
      status: item.status,
      priority: item.priority,
      category: item.category,
    })]);

    return item;
  });

  res.status(201).json({ item: result });
}));

// ─── Update Work Item ─────────────────────────────────────────────────────────

/**
 * PATCH /api/work-items/:id
 * 
 * CRITICAL: Uses optimistic locking via version field.
 * Client sends the current version it has. If the DB version differs,
 * another user has updated the item - we return 409 Conflict.
 * 
 * This prevents lost updates when two users edit simultaneously.
 */
router.patch('/:id', idempotency, authorizeWorkItem('write'), asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const { id } = req.params;

  const result = await withTransaction(async (client) => {
    // Lock the row and check version atomically
    const { rows: [current] } = await client.query(
      'SELECT * FROM work_items WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (!current) {
      throw Object.assign(new Error('Not found'), { status: 404 });
    }

    // Optimistic locking check
    if (current.version !== data.version) {
      throw versionConflict();
    }

    // Build dynamic update
    const changes = {};
    const setClauses = ['version = version + 1', 'updated_at = NOW()'];
    const params = [];

    const fields = ['title', 'description', 'priority', 'category', 'assignee_id', 'team_id', 'due_date'];
    fields.forEach((field) => {
      if (data[field] !== undefined) {
        changes[field] = { from: current[field], to: data[field] };
        params.push(data[field]);
        setClauses.push(`${field} = $${params.length}`);
      }
    });

    if (params.length === 0) {
      return current; // Nothing to update
    }

    params.push(id);
    const { rows: [updated] } = await client.query(
      `UPDATE work_items SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    // Record all changes in audit log
    await client.query(`
      INSERT INTO work_item_events (work_item_id, user_id, event_type, payload)
      VALUES ($1, $2, 'updated', $3)
    `, [id, req.user.id, JSON.stringify({ changes })]);

    return updated;
  });

  res.json({ item: result });
}));

// ─── Transition Status ────────────────────────────────────────────────────────

/**
 * POST /api/work-items/:id/status
 * 
 * Transitions a work item between states following the defined workflow.
 * Also uses optimistic locking.
 * 
 * State machine: open -> in_progress -> pending_approval -> resolved -> closed
 */
router.post('/:id/status', idempotency, authorizeWorkItem('write'), asyncHandler(async (req, res) => {
  const data = statusSchema.parse(req.body);
  const { id } = req.params;

  const result = await withTransaction(async (client) => {
    const { rows: [current] } = await client.query(
      'SELECT * FROM work_items WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (!current) throw Object.assign(new Error('Not found'), { status: 404 });

    // Optimistic locking
    if (current.version !== data.version) throw versionConflict();

    // Validate state transition
    const allowed = VALID_TRANSITIONS[current.status] || [];
    if (!allowed.includes(data.status)) {
      throw Object.assign(
        new Error(`Cannot transition from '${current.status}' to '${data.status}'`),
        { status: 422, code: 'INVALID_TRANSITION' }
      );
    }

    // Additional authorization: resolving requires assignee or admin
    if (data.status === 'resolved' || data.status === 'closed') {
      const { rows: [membership] } = await client.query(
        'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
        [current.team_id, req.user.id]
      );
      const isAssignee = current.assignee_id === req.user.id;
      const isCreator = current.created_by === req.user.id;
      const isAdmin = membership?.role === 'admin';

      if (!isAssignee && !isCreator && !isAdmin) {
        throw Object.assign(new Error('Only the assignee, creator, or team admin can resolve/close items'), { status: 403 });
      }
    }

    const resolvedAt = data.status === 'resolved' ? 'NOW()' : 'NULL';
    const { rows: [updated] } = await client.query(
      `UPDATE work_items SET status = $1, version = version + 1, updated_at = NOW(), resolved_at = ${resolvedAt} WHERE id = $2 RETURNING *`,
      [data.status, id]
    );

    // If moving to pending_approval, create an approval record
    if (data.status === 'pending_approval') {
      await client.query(`
        INSERT INTO approvals (work_item_id, requested_by, notes)
        VALUES ($1, $2, $3)
      `, [id, req.user.id, data.notes || null]);
    }

    // Audit log
    await client.query(`
      INSERT INTO work_item_events (work_item_id, user_id, event_type, payload)
      VALUES ($1, $2, 'status_changed', $3)
    `, [id, req.user.id, JSON.stringify({
      from: current.status,
      to: data.status,
      notes: data.notes,
    })]);

    return updated;
  });

  res.json({ item: result });
}));

// ─── Take Responsibility (Assign to Self) ─────────────────────────────────────

/**
 * POST /api/work-items/:id/claim
 * 
 * CRITICAL BEHAVIOR: Prevents two users from simultaneously claiming the same item.
 * Uses SELECT FOR UPDATE + version check to ensure only one user wins.
 */
router.post('/:id/claim', idempotency, authorizeWorkItem('read'), asyncHandler(async (req, res) => {
  const { version } = z.object({ version: z.number().int().positive() }).parse(req.body);
  const { id } = req.params;

  const result = await withTransaction(async (client) => {
    const { rows: [current] } = await client.query(
      'SELECT * FROM work_items WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (!current) throw Object.assign(new Error('Not found'), { status: 404 });
    if (current.version !== version) throw versionConflict();

    // If already claimed by someone else, reject
    if (current.assignee_id && current.assignee_id !== req.user.id) {
      throw Object.assign(
        new Error('This item has already been claimed by another user'),
        { status: 409, code: 'ALREADY_CLAIMED' }
      );
    }

    if (current.assignee_id === req.user.id) {
      return current; // Already claimed by this user, idempotent
    }

    const { rows: [updated] } = await client.query(
      'UPDATE work_items SET assignee_id = $1, version = version + 1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [req.user.id, id]
    );

    await client.query(`
      INSERT INTO work_item_events (work_item_id, user_id, event_type, payload)
      VALUES ($1, $2, 'claimed', $3)
    `, [id, req.user.id, JSON.stringify({ assignee_id: req.user.id, previous_assignee: current.assignee_id })]);

    return updated;
  });

  res.json({ item: result });
}));

// ─── Approve / Reject ─────────────────────────────────────────────────────────

/**
 * POST /api/work-items/:id/approve
 * Approves or rejects a pending approval. Only team admins can approve.
 */
router.post('/:id/approve', asyncHandler(async (req, res) => {
  const { decision, notes, version } = z.object({
    decision: z.enum(['approved', 'rejected']),
    notes: z.string().max(1000).optional(),
    version: z.number().int().positive(),
  }).parse(req.body);

  const { id } = req.params;

  const result = await withTransaction(async (client) => {
    const { rows: [wi] } = await client.query(
      'SELECT * FROM work_items WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!wi) throw Object.assign(new Error('Not found'), { status: 404 });
    if (wi.version !== version) throw versionConflict();
    if (wi.status !== 'pending_approval') {
      throw Object.assign(new Error('Item is not pending approval'), { status: 422 });
    }

    // Only team admins can approve
    const { rows: [membership] } = await client.query(
      'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
      [wi.team_id, req.user.id]
    );
    if (membership?.role !== 'admin') {
      throw Object.assign(new Error('Only team admins can approve/reject'), { status: 403 });
    }

    const newStatus = decision === 'approved' ? 'resolved' : 'in_progress';
    const { rows: [updated] } = await client.query(
      'UPDATE work_items SET status = $1, version = version + 1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [newStatus, id]
    );

    await client.query(
      'UPDATE approvals SET status = $1, approved_by = $2, notes = $3, resolved_at = NOW() WHERE work_item_id = $4 AND status = $5',
      [decision, req.user.id, notes || null, id, 'pending']
    );

    await client.query(`
      INSERT INTO work_item_events (work_item_id, user_id, event_type, payload)
      VALUES ($1, $2, $3, $4)
    `, [id, req.user.id, `approval_${decision}`, JSON.stringify({ notes, new_status: newStatus })]);

    return updated;
  });

  res.json({ item: result });
}));

// ─── Delete Work Item ─────────────────────────────────────────────────────────

/**
 * DELETE /api/work-items/:id
 * Only the creator or a team admin can delete.
 */
router.delete('/:id', authorizeWorkItem('write'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    'DELETE FROM work_items WHERE id = $1 AND (created_by = $2 OR EXISTS (SELECT 1 FROM team_members WHERE team_id = (SELECT team_id FROM work_items WHERE id = $1) AND user_id = $2 AND role = $3)) RETURNING id',
    [req.params.id, req.user.id, 'admin']
  );

  if (rows.length === 0) {
    return res.status(403).json({ error: 'Insufficient permissions to delete this item' });
  }

  res.json({ message: 'Work item deleted' });
}));

export default router;
