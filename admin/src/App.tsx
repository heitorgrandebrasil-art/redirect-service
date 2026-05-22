import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { getSetupStatus } from './lib/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Verify2FA from './pages/Verify2FA';
import Setup2FA from './pages/Setup2FA';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Profiles from './pages/Profiles';
import Domains from './pages/Domains';
import Campaigns from './pages/Campaigns';
import CampaignDetail from './pages/CampaignDetail';
import Settings from './pages/Settings';
import Users from './pages/Users';
import BrokenLinks from './pages/BrokenLinks';
import History from './pages/History';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();

  const { data: setupStatus, isLoading: setupLoading } = useQuery({
    queryKey: ['setup-status'],
    queryFn: getSetupStatus,
    enabled: !token,
    staleTime: 60_000,
    retry: false,
  });

  if (!token) {
    if (setupLoading) return null;
    if (setupStatus?.needsSetup) return <Navigate to="/admin/setup" replace />;
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, isAdmin } = useAuth();
  if (!token) return <Navigate to="/admin/login" replace />;
  if (!isAdmin) {
    sessionStorage.setItem('notice_error', 'Você não tem permissão para acessar esta página.');
    return <Navigate to="/admin" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { token } = useAuth();
  return (
    <Routes>
      <Route path="/admin/setup" element={token ? <Navigate to="/admin" replace /> : <Setup />} />
      <Route path="/admin/login" element={token ? <Navigate to="/admin" replace /> : <Login />} />
      <Route path="/admin/login/2fa" element={<Verify2FA />} />
      <Route path="/admin" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="profiles" element={<AdminRoute><Profiles /></AdminRoute>} />
        <Route path="domains" element={<AdminRoute><Domains /></AdminRoute>} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="broken-links" element={<BrokenLinks />} />
        <Route path="history" element={<History />} />
        <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
        <Route path="setup-2fa" element={<Setup2FA />} />
        <Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
