import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { getBrokenLinks } from '../lib/api';

// ── Inline SVG icons (Heroicons / Lucide style) ──────────────────────────────

function IcGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function IcUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IcGlobe() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
function IcMegaphone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  );
}
function IcAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function IcBarChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}
function IcSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IcUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IcSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
function IcMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function IcLogOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// ── Nav definition ────────────────────────────────────────────────────────────

interface NavDef {
  to: string;
  label: string;
  short: string;
  Icon: React.FC;
  adminOnly?: boolean;
  isBroken?: boolean;
}

const NAV: NavDef[] = [
  { to: '/admin',              label: 'Dashboard',       short: 'Home',    Icon: IcGrid },
  { to: '/admin/profiles',     label: 'Perfis',          short: 'Perfis',  Icon: IcUser },
  { to: '/admin/domains',      label: 'Domínios',        short: 'Dom.',    Icon: IcGlobe },
  { to: '/admin/campaigns',    label: 'Campanhas',       short: 'Camp.',   Icon: IcMegaphone },
  { to: '/admin/broken-links', label: 'Links Quebrados', short: 'Links',   Icon: IcAlert, isBroken: true },
  { to: '/admin/history',      label: 'Histórico',       short: 'Hist.',   Icon: IcBarChart, adminOnly: true },
  { to: '/admin/settings',     label: 'Configurações',   short: 'Config',  Icon: IcSettings },
  { to: '/admin/users',        label: 'Usuários',        short: 'Users',   Icon: IcUsers, adminOnly: true },
];

// Mobile bottom nav — 5 most important items
const MOBILE_NAV = NAV.filter((n) =>
  ['/admin', '/admin/profiles', '/admin/campaigns', '/admin/broken-links', '/admin/settings'].includes(n.to),
);

// ── Sidebar NavItem ───────────────────────────────────────────────────────────

function SideNavItem({ item, brokenCount, isAdmin }: { item: NavDef; brokenCount: number; isAdmin: boolean }) {
  if (item.adminOnly && !isAdmin) return null;

  const hasBadge = item.isBroken && brokenCount > 0;

  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      title={item.label}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-brand-500/[0.12] text-brand-400 dark:text-brand-400'
            : hasBadge
              ? 'text-red-400 hover:bg-red-500/[0.08] dark:hover:bg-red-500/[0.08]'
              : 'text-gray-500 dark:text-gh-muted hover:bg-gray-100 dark:hover:bg-white/[0.05] hover:text-gray-900 dark:hover:text-gh-text'
        }`
      }
    >
      <span className="flex-shrink-0 w-[18px] flex justify-center">
        <item.Icon />
      </span>
      <span className="hidden lg:block flex-1 truncate">{item.label}</span>
      {hasBadge && (
        <span className="hidden lg:flex ml-auto items-center justify-center min-w-[1.25rem] h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full animate-badge-pulse">
          {brokenCount}
        </span>
      )}
    </NavLink>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { user, clearAuth, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [postLoginNotice, setPostLoginNotice] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    const notice = sessionStorage.getItem('post_login_notice');
    if (notice) {
      sessionStorage.removeItem('post_login_notice');
      setPostLoginNotice(notice);
      setTimeout(() => setPostLoginNotice(null), 10000);
    }
    if (sessionStorage.getItem('post_setup_complete')) {
      sessionStorage.removeItem('post_setup_complete');
      setSetupComplete(true);
      setTimeout(() => setSetupComplete(false), 8000);
    }
  }, []);

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

  const userInitial = (user?.name ?? user?.email)?.[0]?.toUpperCase() ?? '?';
  const userDisplayName = user?.name || user?.email;
  const userRoleLabel = user?.role === 'admin' ? 'Administrador' : 'Editor';

  return (
    <div className="flex min-h-screen bg-[#f6f8fa] dark:bg-gh-base">

      {/* ── Sidebar: hidden mobile / icon-only tablet / full desktop ── */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-16 lg:w-[220px] z-30 bg-white dark:bg-gh-nav border-r border-gray-200 dark:border-white/[0.08]">

        {/* Logo */}
        <div className="flex items-center gap-3 px-3 lg:px-4 py-5 border-b border-gray-200 dark:border-white/[0.08]">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-brand-500/25">
            <span className="text-white font-bold text-sm select-none">R</span>
          </div>
          <div className="hidden lg:block min-w-0">
            <p className="text-gray-900 dark:text-gh-text font-semibold text-sm leading-tight truncate">Redirect Admin</p>
            <p className="text-gray-500 dark:text-gh-muted text-xs">Gestão de Afiliados</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 lg:px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <SideNavItem key={item.to} item={item} brokenCount={brokenCount} isAdmin={isAdmin} />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 lg:px-3 py-3 border-t border-gray-200 dark:border-white/[0.08] space-y-1">
          {/* User avatar + info (desktop only) */}
          <div className="hidden lg:flex items-center gap-2.5 px-2 py-2.5 mb-1 rounded-lg bg-gray-50 dark:bg-gh-over/60">
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-gray-800 dark:text-gh-text text-xs font-medium truncate">{userDisplayName}</p>
              <p className="text-gray-500 dark:text-gh-muted text-[10px]">{userRoleLabel}</p>
            </div>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gh-muted hover:bg-gray-100 dark:hover:bg-white/[0.05] hover:text-gray-900 dark:hover:text-gh-text transition-colors"
          >
            <span className="flex-shrink-0 w-[18px] flex justify-center">
              {theme === 'dark' ? <IcSun /> : <IcMoon />}
            </span>
            <span className="hidden lg:block text-sm">
              {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            </span>
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gh-muted hover:bg-gray-100 dark:hover:bg-white/[0.05] hover:text-gray-900 dark:hover:text-gh-text transition-colors"
          >
            <span className="flex-shrink-0 w-[18px] flex justify-center">
              <IcLogOut />
            </span>
            <span className="hidden lg:block text-sm">Sair</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 md:ml-16 lg:ml-[220px] pb-14 md:pb-0 min-h-screen">
        {setupComplete && (
          <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-700 text-green-800 dark:text-green-300 text-sm px-4 py-3 flex items-center justify-between">
            <span>
              Conta criada com sucesso! Recomendamos ativar a autenticação de dois fatores.{' '}
              <Link to="/admin/settings" className="font-semibold underline underline-offset-2 hover:opacity-80">
                Ativar agora
              </Link>
            </span>
            <button
              onClick={() => setSetupComplete(false)}
              className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-100 ml-4 font-bold leading-none"
              aria-label="Fechar aviso"
            >
              ✕
            </button>
          </div>
        )}
        {postLoginNotice && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-sm px-4 py-3 flex items-center justify-between">
            <span>⚠️ {postLoginNotice}</span>
            <button
              onClick={() => setPostLoginNotice(null)}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 ml-4 font-bold leading-none"
              aria-label="Fechar aviso"
            >
              ✕
            </button>
          </div>
        )}
        <Outlet />
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 flex items-center justify-around bg-white dark:bg-gh-nav border-t border-gray-200 dark:border-white/[0.08] z-30 px-1">
        {MOBILE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin'}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg transition-colors ${
                isActive
                  ? 'text-brand-500'
                  : item.isBroken && brokenCount > 0
                    ? 'text-red-400'
                    : 'text-gray-400 dark:text-gh-muted'
              }`
            }
          >
            <item.Icon />
            {item.isBroken && brokenCount > 0 && (
              <span className="absolute top-1 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-badge-pulse" />
            )}
            <span className="text-[9px] font-medium">{item.short}</span>
          </NavLink>
        ))}
      </nav>

    </div>
  );
}
