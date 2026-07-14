import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { useTheme } from '../store/theme';
import { api } from '../lib/api';

const ROUTE: Record<string, string> = {
  dashboard: '/dashboard',
  'my-appraisal': '/my-appraisal',
  reviews: '/reviews',
  organization: '/organization',
  analytics: '/analytics',
  templates: '/templates',
  cycles: '/cycles',
  users: '/users',
  security: '/security',
  audit: '/audit',
  gdpr: '/gdpr',
  notifications: '/notifications',
};

const TITLES: Record<string, { eyebrow: string; title: string }> = {
  '/dashboard': { eyebrow: 'Overview', title: 'Dashboard' },
  '/my-appraisal': { eyebrow: 'Appraisal', title: 'My appraisal' },
  '/reviews': { eyebrow: 'Manager', title: 'Team reviews' },
  '/organization': { eyebrow: 'Organization', title: 'Organization' },
  '/analytics': { eyebrow: 'Insights', title: 'Analytics' },
  '/templates': { eyebrow: 'Configuration', title: 'Templates' },
  '/cycles': { eyebrow: 'Scheduling', title: 'Cycles & target dates' },
  '/users': { eyebrow: 'Administration', title: 'Users & roles' },
  '/security': { eyebrow: 'Compliance', title: 'Security & compliance' },
  '/audit': { eyebrow: 'Compliance', title: 'Audit log' },
  '/gdpr': { eyebrow: 'Compliance', title: 'Data protection & GDPR' },
  '/notifications': { eyebrow: 'Messaging', title: 'Notifications' },
};

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="themeseg" role="group" aria-label="Appearance">
      <button className={theme === 'daylight' ? 'on' : ''} title="Daylight" onClick={() => setTheme('daylight')}>☀</button>
      <button className={theme === 'command' ? 'on' : ''} title="Command" onClick={() => setTheme('command')}>◑</button>
      <button className={theme === 'midnight' ? 'on' : ''} title="Midnight" onClick={() => setTheme('midnight')}>☾</button>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  appraisee: 'Employee', it_manager: 'Manager', cto: 'CTO', cio: 'CIO', cfo: 'CFO', md: 'Managing Director', admin: 'Platform Admin',
};

export function Shell() {
  const { me, signOut } = useAuth();
  const loc = useLocation();
  const { data: unread } = useQuery({ queryKey: ['unread'], queryFn: () => api.get<{ count: number }>('/notifications/unread-count'), refetchInterval: 30000 });

  if (!me) return null;
  const meta = TITLES[loc.pathname] ?? { eyebrow: '', title: '' };
  const primaryRole = me.roles[0];

  return (
    <div className="shell">
      <aside className="rail">
        <div className="logoplate"><img src="/lockup.png" alt="Biltema · Birgma" /></div>
        <div className="whoami">
          <div className="lbl">Signed in as</div>
          <div className="nm">{me.displayName}</div>
          <div style={{ fontSize: 'var(--t-xs)', opacity: .7 }}>{me.roles.map((r) => ROLE_LABEL[r]).join(' · ')}</div>
        </div>
        <nav className="rl-nav">
          {me.nav.map((n) => (
            <NavLink key={n.key} to={ROUTE[n.key] ?? '/dashboard'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span>{n.label}</span>
              {n.key === 'notifications' && unread?.count ? <span className="badge">{unread.count}</span> : null}
            </NavLink>
          ))}
        </nav>
        <button className="btn btn-ghost signout" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.25)' }} onClick={signOut}>Sign out</button>
      </aside>

      <div className="main">
        <header className="appbar">
          <div>
            <div className="eyebrow">{meta.eyebrow}</div>
            <h1>{meta.title}</h1>
          </div>
          <div className="grow" style={{ flex: 1 }} />
          <input className="search" placeholder="Search…" aria-label="Search" />
          <NavLink to="/notifications" className="bell" aria-label="Notifications">
            🔔{unread?.count ? <span className="count">{unread.count}</span> : null}
          </NavLink>
          <ThemeSwitcher />
          <span className="roletag">Viewing as {ROLE_LABEL[primaryRole]}</span>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
