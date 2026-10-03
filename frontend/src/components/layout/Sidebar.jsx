import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../api/client';
import { getInitials } from '../../utils/helpers';

const NavIcon = ({ children }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

function DashboardIcon() {
  return <NavIcon><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></NavIcon>;
}
function ListIcon() {
  return <NavIcon><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></NavIcon>;
}
function TeamIcon() {
  return <NavIcon><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></NavIcon>;
}
function PlusIcon() {
  return <NavIcon><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></NavIcon>;
}
function LogoutIcon() {
  return <NavIcon><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></NavIcon>;
}

export function Sidebar({ onNewItem }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get().then(r => r.data),
    refetchInterval: 30000, // poll every 30s for fresh counts
  });

  const criticalCount = data?.stats?.critical_count || 0;
  const pendingApprovalCount = data?.pendingApprovals?.length || 0;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">N</div>
        <span className="sidebar-logo-text">Newtonite</span>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-label">Workspace</div>
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <DashboardIcon /> Dashboard
            {(criticalCount > 0 || pendingApprovalCount > 0) && (
              <span className="badge">{criticalCount + pendingApprovalCount}</span>
            )}
          </NavLink>
          <NavLink to="/work-items" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <ListIcon /> Work Items
          </NavLink>
          <NavLink to="/teams" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <TeamIcon /> Teams
          </NavLink>
        </div>

        <div className="nav-section">
          <div className="nav-section-label">Actions</div>
          <button className="nav-item" onClick={onNewItem}>
            <PlusIcon /> New Work Item
          </button>
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="user-card" title={user?.email}>
          <div className="avatar" style={{ fontSize: 11 }}>
            {getInitials(user?.name)}
          </div>
          <div className="user-info">
            <div className="user-name">{user?.name}</div>
            <div className="user-email">{user?.email}</div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={handleLogout} title="Logout">
            <LogoutIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}
