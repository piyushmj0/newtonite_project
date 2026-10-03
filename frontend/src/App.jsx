import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Sidebar } from './components/layout/Sidebar';
import { CreateWorkItemModal } from './components/workitems/CreateWorkItemModal';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WorkItemsPage from './pages/WorkItemsPage';
import WorkItemDetailPage from './pages/WorkItemDetailPage';
import TeamsPage from './pages/TeamsPage';
import { Spinner } from './components/ui/Common';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppShell() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar onNewItem={() => setShowCreate(true)} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/work-items" element={<WorkItemsPage />} />
          <Route path="/work-items/:id" element={<WorkItemDetailPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showCreate && <CreateWorkItemModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
