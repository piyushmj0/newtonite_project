import { useState, useCallback } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { workItemsApi, teamsApi, usersApi } from '../../api/client';
import { getApiError, CATEGORY_LABELS } from '../../utils/helpers';
import { ConflictBanner } from '../ui/Common';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const CATEGORIES = Object.keys(CATEGORY_LABELS);

export function CreateWorkItemModal({ onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: 'general',
    team_id: '',
    assignee_id: '',
    due_date: '',
  });
  const [error, setError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list().then(r => r.data),
  });
  const teams = teamsData?.teams || [];

  const mutation = useMutation({
    mutationFn: (data) => workItemsApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onSuccess?.(res.data.item);
      onClose();
    },
    onError: (err) => setError(getApiError(err)),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError('Title is required');
    mutation.mutate({
      ...form,
      team_id: form.team_id || null,
      assignee_id: form.assignee_id || null,
      due_date: form.due_date || null,
    });
  };

  const searchUsers = useCallback(async (q) => {
    setUserSearch(q);
    if (q.length < 2) return setUserResults([]);
    try {
      const res = await usersApi.search(q);
      setUserResults(res.data.users);
    } catch { setUserResults([]); }
  }, []);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-modal-title">
        <div className="modal-header">
          <span className="modal-title" id="create-modal-title">New Work Item</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="item-title">Title *</label>
              <input
                id="item-title"
                className="form-control"
                value={form.title}
                onChange={set('title')}
                placeholder="What needs to be investigated or resolved?"
                maxLength={300}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="item-description">Description</label>
              <textarea
                id="item-description"
                className="form-control"
                value={form.description}
                onChange={set('description')}
                placeholder="Provide context: what's happening, what's the impact, what's already been tried?"
                rows={4}
              />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="item-priority">Priority</label>
                <select id="item-priority" className="form-control" value={form.priority} onChange={set('priority')}>
                  {PRIORITIES.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="item-category">Category</label>
                <select id="item-category" className="form-control" value={form.category} onChange={set('category')}>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="item-team">Team</label>
                <select id="item-team" className="form-control" value={form.team_id} onChange={set('team_id')}>
                  <option value="">No team</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="item-due">Due Date</label>
                <input
                  id="item-due"
                  type="datetime-local"
                  className="form-control"
                  value={form.due_date}
                  onChange={set('due_date')}
                />
              </div>
            </div>

            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label" htmlFor="item-assignee">Assign To</label>
              <input
                id="item-assignee"
                className="form-control"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => searchUsers(e.target.value)}
              />
              {userResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', marginTop: 2, overflow: 'hidden'
                }}>
                  {userResults.map(u => (
                    <div
                      key={u.id}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
                      className="user-card"
                      onClick={() => {
                        setForm(f => ({ ...f, assignee_id: u.id }));
                        setUserSearch(u.name);
                        setUserResults([]);
                      }}
                    >
                      <strong>{u.name}</strong> <span className="text-muted">{u.email}</span>
                    </div>
                  ))}
                </div>
              )}
              {form.assignee_id && (
                <div className="form-hint">
                  Assigned to selected user.{' '}
                  <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, fontSize: 11 }}
                    onClick={() => { setForm(f => ({ ...f, assignee_id: '' })); setUserSearch(''); }}>
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating...' : 'Create Work Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
