import { Link } from 'react-router-dom';
import { StatusBadge, PriorityBadge, CategoryBadge, Avatar } from '../ui/Common';
import { formatRelative, formatDate } from '../../utils/helpers';

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  );
}

export function WorkItemRow({ item }) {
  const isOverdue = item.due_date && new Date(item.due_date) < new Date() && !['resolved', 'closed'].includes(item.status);

  return (
    <Link to={`/work-items/${item.id}`} className="work-item-row" id={`work-item-${item.id}`}>
      <div style={{ width: 6, height: 6, borderRadius: 2, flexShrink: 0, alignSelf: 'center',
        background: item.priority === 'critical' ? 'var(--priority-critical)' :
                    item.priority === 'high' ? 'var(--priority-high)' :
                    item.priority === 'medium' ? 'var(--priority-medium)' : 'var(--priority-low)',
      }} />

      <div className="item-main">
        <div className="item-title">{item.title}</div>
        <div className="item-meta">
          <StatusBadge status={item.status} />
          <PriorityBadge priority={item.priority} />
          <CategoryBadge category={item.category} />
          {item.team_name && (
            <>
              <span className="sep">•</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.team_name}</span>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.comment_count > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-muted)', fontSize: 11 }}>
              <CommentIcon /> {item.comment_count}
            </span>
          )}
          {item.assignee_name && (
            <Avatar name={item.assignee_name} size="sm" title={item.assignee_name} />
          )}
        </div>
        {item.due_date && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: isOverdue ? 'var(--danger)' : 'var(--text-muted)' }}>
            <CalendarIcon /> {formatDate(item.due_date)}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatRelative(item.updated_at)}</span>
      </div>
    </Link>
  );
}
