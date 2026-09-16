import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './app-context';
import { navForRole } from '../lib/permissions';
import type { Role } from '../lib/types';

const roleLabels: Record<Role, string> = { participant: 'Partecipante', referee: 'Arbitro', parent: 'Genitore' };

export function AppLayout() {
  const { member, snapshot, setMemberId } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = navForRole(member.role);
  return <div className="app-shell">
    <header className="topbar">
      <Link className="brand" to="/today" aria-label="Milli e Misfatti, pagina iniziale"><span className="brand-mark" aria-hidden="true">MM</span><span>Milli e<br /><strong>Misfatti</strong></span></Link>
      <div className="topbar-actions"><span className="pill" aria-label={`Modalità demo, versione ${import.meta.env.VITE_APP_VERSION}`}>DEMO · v{import.meta.env.VITE_APP_VERSION}</span><label className="field compact-field"><span className="sr-only">Profilo attivo</span><select value={member.id} onChange={(event) => { setMemberId(event.target.value); navigate('/today'); }}>{snapshot.members.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.displayName} · {roleLabels[item.role]}</option>)}</select></label></div>
    </header>
    <main className="page" aria-live="polite"><Outlet /></main>
    <nav className="bottom-nav" aria-label="Navigazione principale">{nav.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span></NavLink>)}{location.pathname !== '/today' && <NavLink to="/today" className="home-link">⌂</NavLink>}</nav>
  </div>;
}
