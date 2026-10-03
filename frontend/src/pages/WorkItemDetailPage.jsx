import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workItemsApi, commentsApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import {
  LoadingPage, StatusBadge, PriorityBadge, CategoryBadge,
  Avatar, ConflictBanner, ErrorAlert, Spinner,
} from '../components/ui/Common';
import { formatRelative, formatDate, getApiError, VALID_TRANSITIONS, STATUS_LABELS } from '../utils/helpers';

// Icons
const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
  </svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

// Timeline event rendering
function EventIcon({ type }) {
  const icons = {
    created: '✨', status_changed: '🔄', assigned: '👤', claimed: '🙋',
    commented: '💬', updated: '✏️', approval_approved: '✅', approval_rejected: '❌',
  };
  return <span style={{ fontSize: 10 }}>{icons[type] || '📌'}</span>;
}

function renderEventText(event) {
  const p = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
  const name = event.user_name;
  switch (event.event_type) {
    case 'created': return `${name} created this item`;
    case 'status_changed': return `${name} changed status from "${p.from}" to "${p.to}"`;
    case 'assigned': return `${name} assigned this item`;
    case 'claimed': return `${name} claimed responsibility`;
    case 'commented': return `${name} added a comment`;
    case 'updated': {
      const changedFields = Object.keys(p.changes || {});
      return `${name} updated: ${changedFields.join(', ')}`;
    }
    case 'approval_approved': return `${name} approved this item`;
    case 'approval_rejected': return `${name} rejected approval${p.notes ? ': ' + p.notes : ''}`;
    default: return `${name}: ${event.event_type}`;
  }
}

// Edit form component
function EditModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: item.title,
    description: item.description || '',
    priority: item.priority,
    category: item.category,
  });
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);

  const mutation = useMutation({
    mutationFn: (data) => workItemsApi.update(item.id, { ...data, version: item.version }),
    onSuccess: (res) => { onSaved(res.data.item); onClose(); },
    onError: (err) => {
      if (err.response?.data?.code === 'VERSION_CONFLICT') {
        setConflict(true);
      } else {
        setError(getApiError(err));
      }
    },
  });

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Edit Work Item</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }}>
          <div className="modal-body">
            {conflict && <ConflictBanner onRefresh={onClose} />}
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-control" value={form.title} onChange={set('title')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-control" rows={4} value={form.description} onChange={set('description')} />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-control" value={form.priority} onChange={set('priority')}>
                  {['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-control" value={form.category} onChange={set('category')}>
                  {['customer_issue', 'engineering', 'payment', 'production_incident', 'compliance', 'operational', 'general'].map(c => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Status transition modal
function StatusModal({ item, onClose, onSaved }) {
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);

  const available = VALID_TRANSITIONS[item.status] || [];

  const mutation = useMutation({
    mutationFn: () => workItemsApi.updateStatus(item.id, { status: newStatus, version: item.version, notes }),
    onSuccess: (res) => { onSaved(res.data.item); onClose(); },
    onError: (err) => {
      if (err.response?.data?.code === 'VERSION_CONFLICT') setConflict(true);
      else setError(getApiError(err));
    },
  });

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Change Status</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {conflict && <ConflictBanner onRefresh={onClose} />}
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label className="form-label">Current status: <StatusBadge status={item.status} /></label>
          </div>
          <div className="form-group">
            <label className="form-label">Transition to:</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {available.map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: newStatus === s ? 'var(--accent-muted)' : 'var(--bg-elevated)', border: `1px solid ${newStatus === s ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all var(--transition)' }}>
                  <input type="radio" name="status" value={s} checked={newStatus === s} onChange={() => setNewStatus(s)} style={{ accentColor: 'var(--accent)' }} />
                  <StatusBadge status={s} />
                  <span className="text-sm text-secondary">{STATUS_LABELS[s]}</span>
                </label>
              ))}
            </div>
          </div>
          {newStatus === 'pending_approval' && (
            <div className="form-group">
              <label className="form-label">Approval notes (optional)</label>
              <textarea className="form-control" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why does this require approval?" />
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!newStatus || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Updating...' : 'Update Status'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Approval modal
function ApprovalModal({ item, onClose, onSaved }) {
  const [decision, setDecision] = useState('approved');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => workItemsApi.approve(item.id, { decision, notes, version: item.version }),
    onSuccess: (res) => { onSaved(res.data.item); onClose(); },
    onError: (err) => setError(getApiError(err)),
  });

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Approval Decision</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: decision === 'approved' ? 'var(--success-bg)' : 'var(--bg-elevated)', border: `1px solid ${decision === 'approved' ? 'var(--success)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
              <input type="radio" value="approved" checked={decision === 'approved'} onChange={() => setDecision('approved')} style={{ accentColor: 'var(--success)' }} />
              <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Approve</span>
            </label>
            <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: decision === 'rejected' ? 'var(--danger-bg)' : 'var(--bg-elevated)', border: `1px solid ${decision === 'rejected' ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
              <input type="radio" value="rejected" checked={decision === 'rejected'} onChange={() => setDecision('rejected')} style={{ accentColor: 'var(--danger)' }} />
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✕ Reject</span>
            </label>
          </div>
          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <textarea className="form-control" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Provide reasoning for your decision..." />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className={`btn ${decision === 'approved' ? 'btn-success' : 'btn-danger'}`}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Submitting...' : `${decision === 'approved' ? 'Approve' : 'Reject'} Item`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showEdit, setShowEdit] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showApproval, setShowApproval] = useState(false);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['work-item', id],
    queryFn: () => workItemsApi.get(id).then(r => r.data),
    refetchInterval: 15000, // poll frequently for collaboration
  });

  const item = data?.item;

  // Comment mutation
  const commentMutation = useMutation({
    mutationFn: (content) => commentsApi.create(id, { content }),
    onSuccess: () => {
      setComment('');
      setCommentError('');
      queryClient.invalidateQueries({ queryKey: ['work-item', id] });
    },
    onError: (err) => setCommentError(getApiError(err)),
  });

  // Claim mutation
  const claimMutation = useMutation({
    mutationFn: () => workItemsApi.claim(id, { version: item.version }),
    onSuccess: (res) => {
      queryClient.setQueryData(['work-item', id], old => ({ ...old, item: res.data.item }));
    },
    onError: (err) => {
      const code = err.response?.data?.code;
      if (code === 'VERSION_CONFLICT' || code === 'ALREADY_CLAIMED') {
        refetch(); // Refresh to show current state
      }
    },
  });

  const handleSaved = (updatedItem) => {
    queryClient.setQueryData(['work-item', id], old => ({ ...old, item: { ...old.item, ...updatedItem } }));
    queryClient.invalidateQueries({ queryKey: ['work-items'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  if (isLoading) return <LoadingPage message="Loading work item..." />;
  if (error) {
    return (
      <div className="page-body">
        <ErrorAlert error={getApiError(error)} onRetry={refetch} />
      </div>
    );
  }
  if (!item) return null;

  const canEdit = item.created_by === user.id || item.assignee_id === user.id;
  const isUnresolved = !['resolved', 'closed'].includes(item.status);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(-1)} aria-label="Go back">
            <BackIcon />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusBadge status={item.status} />
              <PriorityBadge priority={item.priority} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isUnresolved && item.status === 'pending_approval' && (
            <button className="btn btn-warning btn-sm" onClick={() => setShowApproval(true)}
              style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)' }}>
              Make Approval Decision
            </button>
          )}
          {isUnresolved && !item.assignee_id && (
            <button
              className="btn btn-success btn-sm"
              onClick={() => claimMutation.mutate()}
              disabled={claimMutation.isPending}
            >
              {claimMutation.isPending ? <Spinner size="sm" /> : '🙋 Claim Responsibility'}
            </button>
          )}
          {isUnresolved && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowStatus(true)}>
              Change Status
            </button>
          )}
          {canEdit && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowEdit(true)}>
              <EditIcon /> Edit
            </button>
          )}
        </div>
      </div>

      <div className="page-body" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="detail-layout">
          {/* Main content */}
          <div className="detail-main">
            {/* Title */}
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: 10 }}>
                {item.title}
              </h1>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <CategoryBadge category={item.category} />
                {item.team_name && (
                  <span className="badge badge-category">{item.team_name}</span>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="card">
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</div>
              {item.description ? (
                <p style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {item.description}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>No description provided.</p>
              )}
            </div>

            {/* Approval Info */}
            {item.approval && (
              <div className={`alert ${item.approval.status === 'approved' ? 'alert-success' : item.approval.status === 'rejected' ? 'alert-error' : 'alert-warning'}`}>
                <strong>Approval {item.approval.status}:</strong> Requested by {item.approval.requested_by}
                {item.approval.notes && ` — "${item.approval.notes}"`}
              </div>
            )}

            {/* Comments */}
            <div>
              <div className="section-header">
                <div className="section-title">
                  💬 Comments
                  <span className="count">{item.comments?.length || 0}</span>
                </div>
              </div>

              {item.comments && item.comments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {item.comments.map(c => (
                    <div key={c.id} className="card card-sm">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={c.user_name} size="sm" />
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{c.user_name}</span>
                        </div>
                        <span className="text-muted text-sm">{formatRelative(c.created_at)}</span>
                      </div>
                      <p style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment */}
              <div className="card card-sm">
                <div style={{ display: 'flex', gap: 10 }}>
                  <Avatar name={user?.name} size="sm" />
                  <div style={{ flex: 1 }}>
                    <textarea
                      className="form-control"
                      placeholder="Add a comment..."
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      rows={2}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && comment.trim()) {
                          commentMutation.mutate(comment.trim());
                        }
                      }}
                    />
                    {commentError && <div className="form-error">{commentError}</div>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!comment.trim() || commentMutation.isPending}
                        onClick={() => commentMutation.mutate(comment.trim())}
                      >
                        {commentMutation.isPending ? 'Posting...' : 'Comment'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="detail-sidebar">
            {/* Metadata */}
            <div className="card card-sm">
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Details
              </div>
              <div className="meta-row">
                <span className="meta-label">Assignee</span>
                <span className="meta-value">
                  {item.assignee_name ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar name={item.assignee_name} size="sm" />
                      {item.assignee_name}
                    </div>
                  ) : (
                    <span className="text-muted">Unassigned</span>
                  )}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Created by</span>
                <span className="meta-value">{item.creator_name}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Team</span>
                <span className="meta-value">{item.team_name || <span className="text-muted">None</span>}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Created</span>
                <span className="meta-value">{formatDate(item.created_at)}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Updated</span>
                <span className="meta-value">{formatRelative(item.updated_at)}</span>
              </div>
              {item.due_date && (
                <div className="meta-row">
                  <span className="meta-label">Due Date</span>
                  <span className="meta-value" style={{ color: new Date(item.due_date) < new Date() && isUnresolved ? 'var(--danger)' : undefined }}>
                    {formatDate(item.due_date)}
                  </span>
                </div>
              )}
              {item.resolved_at && (
                <div className="meta-row">
                  <span className="meta-label">Resolved</span>
                  <span className="meta-value" style={{ color: 'var(--success)' }}>{formatDate(item.resolved_at)}</span>
                </div>
              )}
              <div className="meta-row">
                <span className="meta-label">Version</span>
                <span className="meta-value text-muted">v{item.version}</span>
              </div>
            </div>

            {/* Event History */}
            <div className="card card-sm">
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                History
              </div>
              {item.events && item.events.length > 0 ? (
                <div className="timeline">
                  {[...item.events].reverse().map(event => (
                    <div key={event.id} className="timeline-item">
                      <div className={`timeline-dot ${event.event_type}`}>
                        <EventIcon type={event.event_type} />
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-text">{renderEventText(event)}</div>
                        <div className="timeline-time">{formatRelative(event.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No history yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showEdit && <EditModal item={item} onClose={() => setShowEdit(false)} onSaved={handleSaved} />}
      {showStatus && <StatusModal item={item} onClose={() => setShowStatus(false)} onSaved={handleSaved} />}
      {showApproval && <ApprovalModal item={item} onClose={() => setShowApproval(false)} onSaved={handleSaved} />}
    </div>
  );
}
