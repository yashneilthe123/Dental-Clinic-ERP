import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { cx } from './ui.jsx';

// Minimal inline icons (Heroicons-style paths) to avoid an icon dependency
const I = {
  dash: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  cal: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  bill: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z',
  box: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  list: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  staff: 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2',
  cog: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
};
export const Icon = ({ d, className = 'h-5 w-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const NAV = [
  { to: '/', label: 'Dashboard', icon: I.dash, end: true },
  { to: '/patients', label: 'Patients', icon: I.users },
  { to: '/appointments', label: 'Appointments', icon: I.cal },
  { to: '/billing', label: 'Billing', icon: I.bill },
  { to: '/inventory', label: 'Inventory', icon: I.box },
  { to: '/reports', label: 'Reports', icon: I.chart, roles: ['accountant'] },
  { section: 'Admin' },
  { to: '/procedures', label: 'Procedures & Fees', icon: I.list },
  { to: '/staff', label: 'Staff', icon: I.staff, roles: [] },
  { to: '/audit', label: 'Audit Log', icon: I.shield, roles: [] },
  { to: '/settings', label: 'Clinic Settings', icon: I.cog, roles: [] },
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => n.section || !n.roles || can(...n.roles));

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-lg">🦷</div>
        <div>
          <p className="text-sm font-bold leading-tight text-white">SmileCare</p>
          <p className="text-[11px] leading-tight text-brand-200">Clinic ERP</p>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((n, i) =>
          n.section ? (
            <p key={i} className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-brand-200/70">{n.section}</p>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-white/12 text-white' : 'text-brand-100/80 hover:bg-white/6 hover:text-white'
                )
              }
            >
              <Icon d={n.icon} />
              {n.label}
            </NavLink>
          )
        )}
      </div>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
        <p className="text-xs capitalize text-brand-200">{user?.role}</p>
        <button onClick={logout} className="mt-3 w-full rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
          Log out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-60 bg-brand-900 lg:block">{sidebar}</aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-brand-900">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
            <Icon d="M4 6h16M4 12h16M4 18h16" />
          </button>
          <span className="font-bold">🦷 SmileCare ERP</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
