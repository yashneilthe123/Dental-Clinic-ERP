import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { isoDay, money, titleCase } from '../lib/format.js';
import { Button, Card, Empty, Field, Input, Loading, PageHeader, StatCard } from '../components/ui.jsx';
import BarChart from '../components/BarChart.jsx';

const presets = {
  '7d': () => [isoDay(new Date(Date.now() - 6 * 864e5)), isoDay()],
  '30d': () => [isoDay(new Date(Date.now() - 29 * 864e5)), isoDay()],
  month: () => { const n = new Date(); return [isoDay(new Date(n.getFullYear(), n.getMonth(), 1)), isoDay()]; },
  lastMonth: () => { const n = new Date(); return [isoDay(new Date(n.getFullYear(), n.getMonth() - 1, 1)), isoDay(new Date(n.getFullYear(), n.getMonth(), 0))]; },
};

export default function Reports() {
  const [[from, to], setRange] = useState(presets['30d']());
  const { data, loading } = useApi(() => api.get(`/reports${qs({ from, to })}`), [from, to]);

  const exportCsv = () => {
    const rows = [['Date', 'Collected'], ...data.daily.map((d) => [d.day, d.amount])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `collections_${from}_${to}.csv`;
    a.click();
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Collections, treatments and dentist performance"
        actions={data && <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>} />

      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} /></Field>
          <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setRange([from, e.target.value])} /></Field>
          {[['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['lastMonth', 'Last month']].map(([k, l]) => (
            <Button key={k} size="sm" variant="ghost" onClick={() => setRange(presets[k]())}>{l}</Button>
          ))}
        </div>
      </Card>

      {loading || !data ? <Loading /> : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Collected" value={money(data.summary.collected)} />
            <StatCard label="Expenses" value={money(data.summary.expenses)}
              sub={`${money(data.summary.inventory_expenses)} on inventory`} accent="rose" />
            <StatCard label={data.summary.net < 0 ? 'Net loss' : 'Net (collected − expenses)'} value={money(data.summary.net)} accent={data.summary.net < 0 ? 'rose' : 'violet'} />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Billed" value={money(data.summary.billed)} sub={`${data.summary.invoice_count} invoices`} accent="sky" />
            <StatCard label="Treatments done" value={data.summary.treatments_done} accent="violet" />
            <StatCard label="New patients" value={data.summary.new_patients} accent="amber" />
            <StatCard label="Appointments" value={data.appointmentsByStatus.reduce((s, a) => s + a.count, 0)}
              sub={data.appointmentsByStatus.map((a) => `${a.count} ${a.status.replace('_', ' ')}`).join(' · ')} accent="rose" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title="Daily collections" className="lg:col-span-2"><div className="p-5"><BarChart data={data.daily} height={200} /></div></Card>
            <Card title="By payment method">
              {data.byMethod.length === 0 ? <Empty title="No payments" /> : (
                <ul className="space-y-3 p-5">
                  {data.byMethod.map((m) => {
                    const pct = data.summary.collected ? (m.amount / data.summary.collected) * 100 : 0;
                    return (
                      <li key={m.method} className="text-sm">
                        <div className="flex justify-between"><span className="font-medium">{titleCase(m.method)}</span><span className="font-semibold">{money(m.amount)}</span></div>
                        <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
                        <p className="mt-0.5 text-xs text-slate-500">{m.count} payments · {pct.toFixed(0)}%</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Revenue by procedure" className="lg:col-span-2">
              {data.byProcedure.length === 0 ? <Empty title="No completed treatments in this period" /> : (
                <table className="table-base">
                  <thead><tr><th>Procedure</th><th>Category</th><th className="text-right">Count</th><th className="text-right">Revenue</th></tr></thead>
                  <tbody>{data.byProcedure.map((p) => (
                    <tr key={p.name}><td className="font-medium">{p.name}</td><td className="text-slate-500">{p.category}</td><td className="text-right">{p.count}</td><td className="text-right font-semibold">{money(p.revenue)}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </Card>
            <Card title="By dentist">
              <table className="table-base">
                <thead><tr><th>Dentist</th><th className="text-right">Done</th><th className="text-right">Revenue</th></tr></thead>
                <tbody>{data.byDentist.map((d) => (
                  <tr key={d.id}><td className="font-medium">{d.name}</td><td className="text-right">{d.treatments}</td><td className="text-right font-semibold">{money(d.revenue)}</td></tr>
                ))}</tbody>
              </table>
            </Card>

            <Card title="Expenses by category" className="lg:col-span-3"
              action={<Link to="/expenses" className="text-sm font-semibold text-brand-700">All expenses →</Link>}>
              {data.expensesByCategory.length === 0 ? <Empty title="No expenses in this period" /> : (
                <table className="table-base">
                  <thead><tr><th>Category</th><th className="text-right">Entries</th><th className="text-right">Amount</th><th className="text-right">Share</th></tr></thead>
                  <tbody>{data.expensesByCategory.map((c) => (
                    <tr key={c.category}><td className="font-medium">{c.category}</td><td className="text-right">{c.count}</td>
                      <td className="text-right font-semibold">{money(c.amount)}</td>
                      <td className="text-right text-slate-500">{data.summary.expenses ? ((c.amount / data.summary.expenses) * 100).toFixed(0) : 0}%</td></tr>
                  ))}</tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
