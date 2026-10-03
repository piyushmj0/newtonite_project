import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../api/client';
import { LoadingPage, StatusBadge, PriorityBadge, Avatar } from '../components/ui/Common';
import { formatRelative, formatDate, getApiError } from '../utils/helpers';

function AlertIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
    </svg>
  );
}

const EVENT_DESCRIPTIONS = {
  created: (p, a) => `${a} created this item`,
  updated: (p, a) => `${a} updated ${Object.keys(p.changes || {}).join(', ')}`,
  status_changed: (p, a) => `${a} moved from ${p.from} → ${p.to}`,
  assigned: (p, a) => `${a} assigned it`,
  claimed: (p, a) => `${a} claimed this item`,
  commented: (p, a) => `${a} commented`,
  approval_approved: (p, a) => `${a} approved`,
  approval_rejected: (p, a) => `${a} rejected`,
};

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get().then(r => r.data),
    refetchInterval: 30000,
  });

  if (isLoading) return <LoadingPage message="Loading dashboard..." />;
  if (error) return <div className="alert alert-error">{getApiError(error)}</div>;

  const { myItems = [], criticalItems = [], pendingApprovals = [], recentActivity = [], stats = {} } = data;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Your operational overview</div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Open Items</div>
            <div className="stat-value">{stats.open_count ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">In Progress</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.in_progress_count ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Critical</div>
            <div className="stat-value critical">{stats.critical_count ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pending Approval</div>
            <div className="stat-value warning">{stats.pending_approval_count ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Overdue</div>
            <div className="stat-value" style={{ color: stats.overdue_count > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
              {stats.overdue_count ?? 0}
            </div>
          </div>
        </div>

        {/* Alerts: Critical + Pending Approvals */}
        {(criticalItems.length > 0 || pendingApprovals.length > 0) && (
          <div style={{ marginBottom: 24 }}>
            {criticalItems.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div className="section-header">
                  <div className="section-title" style={{ color: 'var(--priority-critical)' }}>
                    <AlertIcon /> Critical Items Requiring Attention
                    <span className="count">{criticalItems.length}</span>
                  </div>
                </div>
                <div className="work-item-list">
                  {criticalItems.map(item => (
                    <Link key={item.id} to={`/work-items/${item.id}`} className="work-item-row" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--priority-critical)', flexShrink: 0, alignSelf: 'center' }} />
                      <div className="item-main">
                        <div className="item-title">{item.title}</div>
                        <div className="item-meta">
                          <StatusBadge status={item.status} />
                          {item.assignee_name
                            ? <span className="text-sm text-secondary">→ {item.assignee_name}</span>
                            : <span className="badge" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>Unassigned</span>
                          }
                          {item.team_name && <span className="text-sm text-muted">{item.team_name}</span>}
                        </div>
                      </div>
                      <span className="text-sm text-muted">{formatRelative(item.updated_at)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {pendingApprovals.length > 0 && (
              <div>
                <div className="section-header">
                  <div className="section-title" style={{ color: 'var(--warning)' }}>
                    <CheckIcon /> Pending Your Approval
                    <span className="count">{pendingApprovals.length}</span>
                  </div>
                </div>
                <div className="work-item-list">
                  {pendingApprovals.map(item => (
                    <Link key={item.id} to={`/work-items/${item.id}`} className="work-item-row" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                      <div className="item-main">
                        <div className="item-title">{item.title}</div>
                        <div className="item-meta">
                          <PriorityBadge priority={item.priority} />
                          <span className="text-sm text-muted">Requested by {item.requested_by_name}</span>
                          {item.team_name && <span className="text-sm text-muted">· {item.team_name}</span>}
                        </div>
                      </div>
                      <span className="text-sm text-muted">{formatRelative(item.requested_at)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          {/* My Items */}
          <div>
            <div className="section-header">
              <div className="section-title">
                <ClockIcon /> Assigned to Me
                <span className="count">{myItems.length}</span>
              </div>
              <Link to="/work-items?assignee=me" className="btn btn-ghost btn-sm">View all</Link>
            </div>
            {myItems.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <CheckIcon />
                <p>No items assigned to you.</p>
              </div>
            ) : (
              <div className="work-item-list">
                {myItems.map(item => (
                  <Link key={item.id} to={`/work-items/${item.id}`} className="work-item-row">
                    <div style={{
                      width: 6, height: 6, borderRadius: 2, flexShrink: 0, alignSelf: 'center',
                      background: item.priority === 'critical' ? 'var(--priority-critical)' :
                                  item.priority === 'high' ? 'var(--priority-high)' :
                                  item.priority === 'medium' ? 'var(--priority-medium)' : 'var(--priority-low)',
                    }} />
                    <div className="item-main">
                      <div className="item-title">{item.title}</div>
                      <div className="item-meta">
                        <StatusBadge status={item.status} />
                        {item.team_name && <span className="text-sm text-muted">{item.team_name}</span>}
                        {item.due_date && (
                          <span style={{ fontSize: 11, color: new Date(item.due_date) < new Date() ? 'var(--danger)' : 'var(--text-muted)' }}>
                            Due {formatDate(item.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-muted" style={{ flexShrink: 0 }}>{formatRelative(item.updated_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div>
            <div className="section-header">
              <div className="section-title">
                <ActivityIcon /> Recent Activity
              </div>
            </div>
            <div className="card card-sm">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted" style={{ padding: 8 }}>No recent activity.</p>
              ) : (
                <div className="timeline">
                  {recentActivity.map(event => {
                    const descFn = EVENT_DESCRIPTIONS[event.event_type] || ((p, a) => `${a}: ${event.event_type}`);
                    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
                    return (
                      <div key={event.id} className="timeline-item">
                        <div className={`timeline-dot ${event.event_type}`}>
                          <ActivityIcon />
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-text">
                            <Link to={`/work-items/${event.work_item_id}`} style={{ color: 'var(--accent)', fontSize: 12 }}>
                              {event.work_item_title?.slice(0, 40)}{event.work_item_title?.length > 40 ? '...' : ''}
                            </Link>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                              {descFn(payload, event.actor_name)}
                            </div>
                          </div>
                          <div className="timeline-time">{formatRelative(event.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
