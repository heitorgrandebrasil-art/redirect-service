import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { getBrokenLinks } from '../lib/api';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin',           label: 'Dashboard',     icon: '⊞' },
  { to: '/admin/profiles',  label: 'Perfis',        icon: '◑' },
  { to: '/admin/domains',   label: 'Domínios',      icon: '◎' },
  { to: '/admin/campaigns', label: 'Campanhas',     icon: '◈' },
  { to: '/admin/history',   label: 'Histórico',     icon: '📈', adminOnly: true },
  { to: '/admin/settings',  label: 'Configurações', icon: '⚙' },
  { to: '/admin/users',     label: 'Usuários',      icon: '☰', adminOnly: true },
];

export default function Layout() {
  const { user, clearAuth, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { data: brokenLinks } = useQuery({
    queryKey: ['broken-links'],
    queryFn: getBrokenLinks,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });
  const brokenCount = brokenLinks?.length ?? 0;

  function handleLogout() {
    clearAuth();
    navigate('/admin/login');
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar — always dark */}
      <aside className="w-56 bg-gray-900 flex flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-gray-800">
          <span className="text-white font-semibold text-lg">Redirect Admin</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {/* Top-level items: Dashboard, Perfis, Domínios, Campanhas */}
          {NAV_ITEMS.filter((item) => !item.adminOnly && item.to !== '/admin/settings').map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {/* Links Quebrados — special render for badge */}
          <NavLink
            to="/admin/broken-links"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : brokenCount > 0
                    ? 'text-red-400 hover:bg-gray-800 hover:text-red-300'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="text-base w-5 text-center">⚠</span>
            <span className="flex-1">Links Quebrados</span>
            {brokenCount > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none min-w-[1.25rem] text-center">
                {brokenCount}
              </span>
            )}
          </NavLink>

          {/* Admin-only + Configurações */}
          {NAV_ITEMS.filter((item) => item.adminOnly || item.to === '/admin/settings').filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800 space-y-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
          >
            <span className="w-5 text-center text-base">{theme === 'dark' ? '☀' : '☽'}</span>
            {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          </button>

          <div className="px-3 py-2">
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            <p className="text-xs text-gray-600 capitalize">{user?.role}</p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <span className="w-5 text-center">⇠</span> Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
        <Outlet />
      </main>
    </div>
  );
}
