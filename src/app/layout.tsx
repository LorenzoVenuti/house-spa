import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApp } from './app-context';
import { navForRole } from '../lib/permissions';
import type { Role } from '../lib/types';

const roleLabels: Record<Role, string> = { participant: 'Partecipante', referee: 'Arbitro', parent: 'Genitore' };

type NavItem = ReturnType<typeof navForRole>[number];

function NavIcon({ route }: { route: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (route === '/today') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path {...common} d="M3.5 10.5 12 3.5l8.5 7" /><path {...common} d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" /></svg>;
  if (route === '/calendar') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect {...common} x="3.5" y="5" width="17" height="15.5" rx="3" /><path {...common} d="M8 3.5v3M16 3.5v3M3.5 9.5h17" /><path {...common} d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></svg>;
  if (route === '/tribunal') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path {...common} d="M12 3.5v17M6 6h12M4 20.5h16" /><path {...common} d="m6 6-3 6h6L6 6Zm12 0-3 6h6l-3-6Z" /></svg>;
  if (route === '/market') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path {...common} d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3" /></svg>;
  if (route === '/admin') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path {...common} d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4" /><circle {...common} cx="16" cy="6" r="2" /><circle {...common} cx="9" cy="12" r="2" /><circle {...common} cx="14" cy="18" r="2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle {...common} cx="12" cy="12" r="8.5" /><path {...common} d="M8.5 15.5v-7l3.5 4 3.5-4v7" /></svg>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className={`brand ${compact ? 'brand--compact' : ''}`} to="/today" aria-label="House S.p.A., pagina iniziale">
    <span className="brand-mark" aria-hidden="true">HS</span>
    <span className="brand-copy"><strong>House S.p.A.</strong><small>Casa in ordine. Più o meno.</small></span>
  </Link>;
}

function PrimaryNav({ items, className, label }: { items: NavItem[]; className: string; label: string }) {
  return <nav className={className} aria-label={label}>
    {items.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}>
      <span className="nav-symbol"><NavIcon route={item.to} /></span>
      <span>{item.label}</span>
    </NavLink>)}
  </nav>;
}

export function AppLayout() {
  const { member, snapshot, setMemberId } = useApp();
  const navigate = useNavigate();
  const nav = navForRole(member.role);
  const changeMember = (memberId: string) => {
    setMemberId(memberId);
    navigate('/today');
  };
  const profileSelect = (variant: 'desktop' | 'mobile') => <label className={`profile-picker profile-picker--${variant}`}>
    <span className="profile-avatar" style={{ backgroundColor: member.color }} aria-hidden="true">{member.displayName.slice(0, 1)}</span>
    <span className="profile-picker__copy"><small>Profilo attivo</small><strong>{member.displayName}</strong></span>
    <select aria-label="Profilo attivo" value={member.id} onChange={(event) => changeMember(event.target.value)}>
      {snapshot.members.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.displayName} · {roleLabels[item.role]}</option>)}
    </select>
  </label>;

  return <div className="app-shell">
    <aside className="desktop-sidebar">
      <Brand />
      {profileSelect('desktop')}
      <PrimaryNav items={nav} className="sidebar-nav" label="Navigazione principale" />
      <div className="sidebar-status" aria-label={`Modalità demo, versione ${import.meta.env.VITE_APP_VERSION}`}>
        <span aria-hidden="true" />
        <div><small>Demo locale</small><strong>Versione {import.meta.env.VITE_APP_VERSION}</strong></div>
      </div>
    </aside>

    <header className="mobile-topbar">
      <Brand compact />
      {profileSelect('mobile')}
    </header>

    <main className="page" aria-live="polite"><Outlet /></main>
    <PrimaryNav items={nav} className="mobile-tabbar" label="Navigazione principale" />
  </div>;
}
