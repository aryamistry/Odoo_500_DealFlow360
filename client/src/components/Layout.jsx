// src/components/Layout.jsx
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/',             label: 'Dashboard',      roles: ['sales_rep','sales_manager','finance','admin'], icon: '◈' },
  { to: '/quotations',   label: 'Quotations',     roles: ['sales_rep','sales_manager','admin'], icon: '📋' },
  { to: '/approvals',    label: 'Approvals',      roles: ['sales_manager','finance','admin'], icon: '✅' },
  { to: '/fulfillment',  label: 'Fulfillment',    roles: ['sales_manager','finance','admin'], icon: '📦' },
  { to: '/subscriptions',label: 'Subscriptions',  roles: ['finance','admin','sales_manager'], icon: '🔄' },
  { to: '/invoices',     label: 'Invoices',       roles: ['finance','admin','sales_manager'], icon: '🧾' },
  { to: '/deal-health',  label: 'Deal Health',    roles: ['sales_manager','finance','admin'], icon: '💊' },
  { to: '/reports',      label: 'Reports',        roles: ['sales_manager','finance','admin'], icon: '📊' },
  { to: '/admin',        label: 'Admin Config',   roles: ['admin'], icon: '⚙️' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h1 className="text-base font-bold text-indigo-400">DealFlow<span className="text-slate-100">360</span></h1>
          <p className="text-xs text-slate-500 mt-0.5">{user?.role?.replace(/_/g, ' ')}</p>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto space-y-0.5">
          {navItems.filter(item => !item.roles || item.roles.includes(user?.role)).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive
                  ? 'text-indigo-400 bg-indigo-600/20 font-medium'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              <span className="w-5 text-center text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-400 text-sm font-bold">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={logout} className="btn-ghost btn-sm w-full justify-center">Sign out</button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-slate-950 p-6">
        <Outlet />
      </main>
    </div>
  );
}
