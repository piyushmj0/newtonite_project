import { useQuery } from '@tanstack/react-query';
import { teamsApi } from '../api/client';
import { LoadingPage } from '../components/ui/Common';
import { getApiError } from '../utils/helpers';

function TeamIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  );
}

export default function TeamsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list().then(r => r.data),
  });

  const teams = data?.teams || [];

  if (isLoading) return <LoadingPage message="Loading teams..." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Teams</div>
          <div className="page-subtitle">{teams.length} team{teams.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="page-body">
        {error ? (
          <div className="alert alert-error">{getApiError(error)}</div>
        ) : teams.length === 0 ? (
          <div className="empty-state">
            <TeamIcon />
            <h3>No teams</h3>
            <p>You haven't been added to any teams yet.</p>
          </div>
        ) : (
          <div className="grid-2" style={{ gap: 16 }}>
            {teams.map(team => (
              <div key={team.id} className="card" id={`team-${team.id}`}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{team.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{team.description}</div>
                  </div>
                  <span className={`badge ${team.user_role === 'admin' ? 'badge-high' : 'badge-low'}`}>
                    {team.user_role}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{team.member_count}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Members</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: team.open_item_count > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
                      {team.open_item_count}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Open Items</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
