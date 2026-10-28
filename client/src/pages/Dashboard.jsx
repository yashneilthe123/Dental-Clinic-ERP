import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { money, fmtTime } from '../lib/format.js';
import { Card, Empty, Loading, PageHeader, StatCard, StatusBadge, Button } from '../components/ui.jsx';
import BarChart from '../components/BarChart.jsx';

export default function Dashboard() {
  const { user, can } = useAuth();
  const { data, loading, error } = useApi(() => api.get('/dashboard'));
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) return <Loading />;
  if (error) return <p className="text-rose-600">{error.message}</p>;
  const { stats, todayAppointments, revenueLast30Days, topProcedures, lowStock } = data;

  return (
    <>
      <PageHeader
        title={`${greet}, ${user.name.split(' ')[0] === 'Dr.' ? user.name : user.name.split(' ')[0]}`}
        subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <>
            {can('receptionist', 'dentist') && <Link to="/appointments?new=1"><Button variant="secondary">New appointment</Button></Link>}
            {can('receptionist', 'dentist') && <Link to="/patients?new=1"><Button>Add patient</Button></Link>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Appointments today" value={stats.appointments_today} sub={`${stats.total_patients} active patients`} />
        <StatCard label="Collected today" value={money(stats.collected_today)} accent="sky"
          sub={`${money(stats.collected_month)} this month${stats.expenses_month != null ? ` · ${money(stats.expenses_month)} spent` : ''}`} />
        <StatCard label="Outstanding dues" value={money(stats.outstanding)} sub="Unpaid + partial invoices" accent="amber" />
        <StatCard label="New patients" value={stats.new_patients_month} sub={`${stats.low_stock_count} items low on stock`} accent="violet" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Today's schedule" action={<Link to="/appointments" className="text-sm font-semibold text-brand-700">Open calendar →</Link>}>
          {todayAppointments.length === 0 ? (
            <Empty title="No appointments today" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {todayAppointments.map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-20 shrink-0 text-sm font-semibold text-slate-900">{fmtTime(a.start_time)}</div>
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: a.dentist_color }} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/patients/${a.patient_id}`} className="block truncate text-sm font-semibold hover:text-brand-700">{a.patient_name}</Link>
                    <p className="truncate text-xs text-slate-500">{a.reason || 'Visit'} · {a.dentist_name}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Collections · last 30 days">
          <div className="p-5"><BarChart data={revenueLast30Days} /></div>
        </Card>

        <Card title="Top procedures this month" className="lg:col-span-2">
          {topProcedures.length === 0 ? <Empty title="No completed treatments yet this month" /> : (
            <table className="table-base">
              <thead><tr><th>Procedure</th><th className="text-right">Count</th><th className="text-right">Revenue</th></tr></thead>
              <tbody>
                {topProcedures.map((p) => (
                  <tr key={p.name}><td className="font-medium">{p.name}</td><td className="text-right">{p.count}</td><td className="text-right">{money(p.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Low stock" action={<Link to="/inventory?lowStock=1" className="text-sm font-semibold text-brand-700">View →</Link>}>
          {lowStock.length === 0 ? <Empty title="All stock levels OK" /> : (
            <ul className="divide-y divide-slate-100">
              {lowStock.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="truncate pr-2">{i.name}</span>
                  <span className={`shrink-0 font-semibold ${i.quantity <= 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                    {i.quantity} / {i.reorder_level} {i.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
