import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Verify2FA from './pages/Verify2FA';
import Setup2FA from './pages/Setup2FA';
import Dashboard from './pages/Dashboard';
import Profiles from './pages/Profiles';
import Domains from './pages/Domains';
import Campaigns from './pages/Campaigns';
import CampaignDetail from './pages/CampaignDetail';
import Settings from './pages/Settings';
import Users from './pages/Users';
import BrokenLinks from './pages/BrokenLinks';
import History from './pages/History';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { token, isAdmin } = useAuth();
  if (!token) return <Navigate to="/admin/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { token } = useAuth();
  return (
    <Routes>
      <Route path="/admin/login" element={token ? <Navigate to="/admin" replace /> : <Login />} />
      <Route path="/admin/login/2fa" element={<Verify2FA />} />
      <Route path="/admin" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="profiles" element={<Profiles />} />
        <Route path="domains" element={<Domains />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="broken-links" element={<BrokenLinks />} />
        <Route path="history" element={
          <ProtectedRoute adminOnly>
            <History />
          </ProtectedRoute>
        } />
        <Route path="settings" element={<Settings />} />
        <Route path="setup-2fa" element={<Setup2FA />} />
        <Route path="users" element={
          <ProtectedRoute adminOnly>
            <Users />
          </ProtectedRoute>
        } />
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
