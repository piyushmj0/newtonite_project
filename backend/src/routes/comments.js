import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const commentSchema = z.object({
  content: z.string().min(1).max(5000),
});

/**
 * POST /api/work-items/:workItemId/comments
 * Add a comment to a work item.
 */
router.post('/:workItemId/comments', asyncHandler(async (req, res) => {
  const { workItemId } = req.params;
  const data = commentSchema.parse(req.body);

  // Verify work item exists and user has access
  const { rows: [wi] } = await query(`
    SELECT wi.id FROM work_items wi
    WHERE wi.id = $1 AND (
      wi.created_by = $2 OR wi.assignee_id = $2
      OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = wi.team_id AND tm.user_id = $2)
    )
  `, [workItemId, req.user.id]);

  if (!wi) {
    return res.status(404).json({ error: 'Work item not found or access denied' });
  }

  const { rows: [comment] } = await query(`
    INSERT INTO comments (work_item_id, user_id, content)
    VALUES ($1, $2, $3)
    RETURNING id, content, created_at, user_id
  `, [workItemId, req.user.id, data.content]);

  // Log to audit trail
  await query(`
    INSERT INTO work_item_events (work_item_id, user_id, event_type, payload)
    VALUES ($1, $2, 'commented', $3)
  `, [workItemId, req.user.id, JSON.stringify({ comment_id: comment.id, preview: data.content.slice(0, 100) })]);

  res.status(201).json({ comment });
}));

/**
 * PATCH /api/work-items/:workItemId/comments/:commentId
 * Edit a comment. Only the comment author can edit.
 */
router.patch('/:workItemId/comments/:commentId', asyncHandler(async (req, res) => {
  const { workItemId, commentId } = req.params;
  const data = commentSchema.parse(req.body);

  const { rows } = await query(`
    UPDATE comments SET content = $1, updated_at = NOW()
    WHERE id = $2 AND work_item_id = $3 AND user_id = $4
    RETURNING *
  `, [data.content, commentId, workItemId, req.user.id]);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Comment not found or not your comment' });
  }

  res.json({ comment: rows[0] });
}));

/**
 * DELETE /api/work-items/:workItemId/comments/:commentId
 * Delete a comment. Only the author can delete.
 */
router.delete('/:workItemId/comments/:commentId', asyncHandler(async (req, res) => {
  const { workItemId, commentId } = req.params;

  const { rows } = await query(
    'DELETE FROM comments WHERE id = $1 AND work_item_id = $2 AND user_id = $3 RETURNING id',
    [commentId, workItemId, req.user.id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Comment not found or not your comment' });
  }

  res.json({ message: 'Comment deleted' });
}));

export default router;
