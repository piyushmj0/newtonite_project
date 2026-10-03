import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workItemsApi } from '../api/client';
import { LoadingPage, EmptyState } from '../components/ui/Common';
import { WorkItemRow } from '../components/workitems/WorkItemRow';
import { CreateWorkItemModal } from '../components/workitems/CreateWorkItemModal';
import { CATEGORY_LABELS } from '../utils/helpers';
import { useSearchParams } from 'react-router-dom';

const STATUSES = ['open', 'in_progress', 'pending_approval', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const SORTS = [
  { value: 'updated_at', label: 'Last Updated' },
  { value: 'created_at', label: 'Created' },
  { value: 'priority', label: 'Priority' },
];

function FilterSelect({ label, value, onChange, children, id }) {
  return (
    <select id={id} className="form-control" style={{ width: 'auto', minWidth: 120 }} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{label}</option>
      {children}
    </select>
  );
}

export default function WorkItemsPage({ openCreateModal, onCreateModalClose }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('updated_at');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const queryParams = {
    search: search || undefined,
    status: status || undefined,
    priority: priority || undefined,
    category: category || undefined,
    sort,
    order: 'desc',
    page,
    limit: 25,
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['work-items', queryParams],
    queryFn: () => workItemsApi.list(queryParams).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: 20000, // auto-refresh for concurrent users
  });

  const items = data?.items || [];
  const pagination = data?.pagination;

  const handleSearchChange = useCallback((e) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setPriority('');
    setCategory('');
    setPage(1);
  };

  const hasFilters = search || status || priority || category;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Work Items</div>
          {pagination && (
            <div className="page-subtitle">{pagination.total} total items</div>
          )}
        </div>
        <button id="new-work-item-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Item
        </button>
      </div>

      <div className="page-body" style={{ flex: 1, overflowY: 'auto' }}>
        {/* Filters */}
        <div className="filters-bar">
          <div className="search-input-wrap">
            <div className="search-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <input
              id="work-items-search"
              className="form-control"
              placeholder="Search items..."
              value={search}
              onChange={handleSearchChange}
            />
          </div>

          <FilterSelect id="filter-status" label="All Statuses" value={status} onChange={(v) => { setStatus(v); setPage(1); }}>
            {STATUSES.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
            ))}
          </FilterSelect>

          <FilterSelect id="filter-priority" label="All Priorities" value={priority} onChange={(v) => { setPriority(v); setPage(1); }}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </FilterSelect>

          <FilterSelect id="filter-category" label="All Categories" value={category} onChange={(v) => { setCategory(v); setPage(1); }}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </FilterSelect>

          <FilterSelect id="filter-sort" label="Sort by" value={sort} onChange={setSort}>
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </FilterSelect>

          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
          )}
        </div>

        {/* Auto-refresh indicator */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => refetch()} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>

        {/* List */}
        {isLoading ? (
          <LoadingPage message="Loading work items..." />
        ) : error ? (
          <div className="alert alert-error">Failed to load work items. <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Retry</button></div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="📋"
            title={hasFilters ? 'No items match your filters' : 'No work items yet'}
            description={hasFilters ? 'Try adjusting your search or filters.' : 'Create your first work item to coordinate operational work.'}
            action={!hasFilters && (
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create First Item</button>
            )}
          />
        ) : (
          <>
            <div className="work-item-list">
              {items.map(item => <WorkItemRow key={item.id} item={item} />)}
            </div>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  ← Previous
                </button>
                <span className="text-sm text-muted">
                  Page {page} of {pagination.pages}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page === pagination.pages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreateWorkItemModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
