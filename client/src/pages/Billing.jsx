import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, money } from '../lib/format.js';
import { Button, Card, Empty, Input, Loading, PageHeader, Pagination, Select, StatCard, StatusBadge } from '../components/ui.jsx';

export default function Billing() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const { data, loading } = useApi(() => api.get(`/invoices${qs({ status, q: search, page })}`), [status, search, page]);

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="Invoices, payments and dues"
        actions={can('receptionist', 'accountant') && <Link to="/billing/new"><Button>+ New invoice</Button></Link>}
      />

      {data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Billed (filtered)" value={money(data.sums.total)} />
          <StatCard label="Collected" value={money(data.sums.paid)} accent="sky" />
          <StatCard label="Outstanding" value={money(data.sums.due)} accent="amber" />
        </div>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Input className="max-w-xs" placeholder="Invoice no., patient name or phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="unpaid,partial">Outstanding</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partially paid</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </Select>
        </div>
        {loading && !data ? <Loading /> : data.data.length === 0 ? <Empty title="No invoices found" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Invoice</th><th>Patient</th><th>Date</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Balance</th></tr>
              </thead>
              <tbody>
                {data.data.map((i) => (
                  <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/billing/${i.id}`)}>
                    <td className="font-semibold text-brand-700">{i.invoice_number}</td>
                    <td>
                      <p className="font-medium">{i.patient_name}</p>
                      <p className="text-xs text-slate-500">{i.patient_code}</p>
                    </td>
                    <td>{fmtDate(i.issue_date)}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="text-right">{money(i.total)}</td>
                    <td className="text-right">{money(i.amount_paid)}</td>
                    <td className={`text-right font-semibold ${i.status !== 'void' && i.total - i.amount_paid > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {i.status === 'void' ? '—' : money(i.total - i.amount_paid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </>
  );
}
