import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { age, fmtDate, fullName, money } from '../lib/format.js';
import { Button, Card, Empty, Input, Loading, PageHeader, Pagination } from '../components/ui.jsx';
import PatientForm from '../components/PatientForm.jsx';

export default function Patients() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const showForm = params.get('new') === '1';

  const { data, loading } = useApi(() => api.get(`/patients${qs({ q: search, page })}`), [search, page]);

  return (
    <>
      <PageHeader
        title="Patients"
        subtitle={data ? `${data.total} patient${data.total === 1 ? '' : 's'}` : ' '}
        actions={can('receptionist', 'dentist') && <Button onClick={() => setParams({ new: '1' })}>+ Add patient</Button>}
      />

      <Card>
        <div className="border-b border-slate-100 p-4">
          <Input
            placeholder="Search by name, phone or patient ID…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="max-w-md"
          />
        </div>
        {loading && !data ? <Loading /> : data.data.length === 0 ? (
          <Empty title={search ? 'No patients match your search' : 'No patients yet'}>
            {!search && 'Register your first patient to get started.'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Patient</th><th>ID</th><th>Phone</th><th>Age / Sex</th><th>Last visit</th><th className="text-right">Balance due</th></tr>
              </thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/patients/${p.id}`)}>
                    <td>
                      <Link to={`/patients/${p.id}`} className="font-semibold text-slate-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                        {fullName(p)}
                      </Link>
                      {p.email && <p className="text-xs text-slate-500">{p.email}</p>}
                    </td>
                    <td className="font-mono text-xs text-slate-500">{p.patient_code}</td>
                    <td>{p.phone}</td>
                    <td className="capitalize">{[age(p.date_of_birth), p.gender?.[0]?.toUpperCase()].filter((x) => x != null).join(' / ') || '—'}</td>
                    <td>{fmtDate(p.last_visit)}</td>
                    <td className={`text-right font-semibold ${p.balance_due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {p.balance_due > 0 ? money(p.balance_due) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>

      <PatientForm
        open={showForm}
        onClose={() => setParams({})}
        onSaved={(p) => navigate(`/patients/${p.id}`)}
      />
    </>
  );
}
