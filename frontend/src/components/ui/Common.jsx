import { getInitials } from '../utils/helpers';

export function Avatar({ name = '', size = 'md', color }) {
  const sizeClass = size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : '';
  return (
    <div className={`avatar ${sizeClass}`} title={name}>
      {getInitials(name) || '?'}
    </div>
  );
}

export function StatusBadge({ status }) {
  const labels = {
    open: 'Open',
    in_progress: 'In Progress',
    pending_approval: 'Pending Approval',
    resolved: 'Resolved',
    closed: 'Closed',
  };
  return (
    <span className={`badge badge-dot badge-${status}`}>
      {labels[status] || status}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const labels = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
  return (
    <span className={`badge badge-${priority}`}>
      {labels[priority] || priority}
    </span>
  );
}

export function CategoryBadge({ category }) {
  const labels = {
    customer_issue: 'Customer Issue',
    engineering: 'Engineering',
    payment: 'Payment',
    production_incident: 'Production Incident',
    compliance: 'Compliance',
    operational: 'Operational',
    general: 'General',
  };
  return (
    <span className="badge badge-category">
      {labels[category] || category}
    </span>
  );
}

export function Spinner({ size = 'md' }) {
  return (
    <div
      className="spinner"
      style={size === 'sm' ? { width: 14, height: 14 } : size === 'lg' ? { width: 28, height: 28 } : {}}
    />
  );
}

export function LoadingPage({ message = 'Loading...' }) {
  return (
    <div className="loading-page">
      <Spinner size="lg" />
      <span className="text-secondary text-sm">{message}</span>
    </div>
  );
}

export function ErrorAlert({ error, onRetry }) {
  return (
    <div className="alert alert-error" role="alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div style={{ flex: 1 }}>
        <span>{error}</span>
        {onRetry && (
          <button className="btn btn-ghost btn-sm" onClick={onRetry} style={{ marginLeft: 8, padding: '1px 6px' }}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function ConflictBanner({ onRefresh }) {
  return (
    <div className="conflict-banner" role="alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style={{ flex: 1 }}>
        <strong>Conflict:</strong> This item was updated by someone else while you were editing.
      </span>
      <button className="btn btn-sm" style={{ background: 'var(--warning)', color: 'var(--bg-base)' }} onClick={onRefresh}>
        Reload latest version
      </button>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="empty-state">
      {icon && <div style={{ fontSize: 40, opacity: 0.3 }}>{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
