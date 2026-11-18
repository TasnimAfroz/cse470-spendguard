import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL, type Role } from '../api/types';

interface NavItem { to: string; label: string; feature: string; roles?: Role[] }

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', feature: '' },
  { to: '/company', label: 'Company', feature: 'F1', roles: ['FINANCE_ADMIN', 'FINANCE_MANAGER'] },
  { to: '/departments', label: 'Departments', feature: 'F2' },
  { to: '/employees', label: 'Employees', feature: 'F3', roles: ['FINANCE_ADMIN', 'FINANCE_MANAGER', 'DEPARTMENT_MANAGER'] },
  { to: '/wallets', label: 'Wallets', feature: 'F4', roles: ['FINANCE_ADMIN', 'FINANCE_MANAGER', 'DEPARTMENT_MANAGER'] },
  { to: '/cards', label: 'Cards', feature: 'F5–F7' },
  { to: '/simulator', label: 'Payment simulator', feature: 'F8' },
];

export default function Layout() {
  const { me, signOut, hasRole } = useAuth();
  const nav = useNavigate();
  if (!me) return null;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden="true"><rect x="1" y="1" width="28" height="20" rx="4" fill="currentColor" opacity=".18" stroke="currentColor" /><rect x="1" y="6" width="28" height="4" fill="var(--accent)" /></svg>
          <div>
            <div className="brand-name">SpendGuard</div>
            <div className="brand-sub">Virtual cards & budgets</div>
          </div>
        </div>
        <nav>
          {NAV.filter((n) => !n.roles || hasRole(...n.roles)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span>{n.label}</span>
              {n.feature && <span className="nav-feature">{n.feature}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="me-name">{me.name}</div>
          <div className="me-role">{ROLE_LABEL[me.role]}{me.departmentName ? ` · ${me.departmentName}` : ''}</div>
          <div className="sidebar-links">
            <NavLink to="/account">Password</NavLink>
            <button className="link-btn" onClick={() => { signOut(); nav('/', { replace: true }); }}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="content">
        {me.mustChangePassword && (
          <div className="alert alert-warning">You are using a temporary password. <NavLink to="/account">Set your own password</NavLink>.</div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
