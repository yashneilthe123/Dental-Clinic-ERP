import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { age, fmtDate, fmtDateTime, fullName, money, titleCase } from '../lib/format.js';
import { Badge, Button, Card, Empty, Field, Input, Loading, Select, StatusBadge, Tabs, Textarea } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import Odontogram, { CONDITIONS, toothName } from '../components/Odontogram.jsx';
import PatientForm from '../components/PatientForm.jsx';
import TreatmentForm from '../components/TreatmentForm.jsx';
import PrescriptionForm from '../components/PrescriptionForm.jsx';

export default function PatientDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [tab, setTab] = useState('chart');
  const [editing, setEditing] = useState(false);
  const patient = useApi(() => api.get(`/patients/${id}`), [id]);
  const summary = useApi(() => api.get(`/patients/${id}/summary`), [id]);

  if (patient.loading && !patient.data) return <Loading />;
  if (patient.error) return <p className="text-rose-600">{patient.error.message}</p>;
  const p = patient.data;
  const s = summary.data;
  const planned = s?.treatments.filter((t) => ['planned', 'in_progress'].includes(t.status)) || [];

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-800">
            {p.first_name[0]}{p.last_name?.[0] || ''}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{fullName(p)}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              <span className="font-mono">{p.patient_code}</span>
              {p.date_of_birth && <> · {age(p.date_of_birth)} yrs</>}
              {p.gender && <> · <span className="capitalize">{p.gender}</span></>}
              {' · '}{p.phone}
              {p.blood_group && <> · {p.blood_group}</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('receptionist', 'dentist') && <Button variant="secondary" onClick={() => setEditing(true)}>Edit details</Button>}
          {can('receptionist', 'dentist') && (
            <Link to={`/appointments?new=1&patientId=${p.id}&patientName=${encodeURIComponent(fullName(p))}`}>
              <Button variant="secondary">Book appointment</Button>
            </Link>
          )}
          {can('receptionist', 'accountant') && <Link to={`/billing/new?patientId=${p.id}`}><Button>Create invoice</Button></Link>}
        </div>
      </div>

      {(p.allergies || p.medical_history) && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {p.allergies && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-rose-700">⚠ Allergies</p>
              <p className="mt-0.5 text-sm text-rose-900">{p.allergies}</p>
            </div>
          )}
          {p.medical_history && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Medical history</p>
              <p className="mt-0.5 text-sm text-amber-900">{p.medical_history}</p>
            </div>
          )}
        </div>
      )}

      {s && (
        <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-xl">
          <MiniStat label="Billed" value={money(s.totals.billed)} />
          <MiniStat label="Paid" value={money(s.totals.paid)} />
          <MiniStat label="Balance due" value={money(s.totals.due)} danger={s.totals.due > 0} />
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'chart', label: 'Dental chart' },
          { value: 'treatments', label: 'Treatments', count: s?.treatments.length },
          { value: 'appointments', label: 'Appointments', count: s?.appointments.length },
          { value: 'prescriptions', label: 'Prescriptions' },
          { value: 'billing', label: 'Invoices', count: s?.invoices.length },
          { value: 'details', label: 'Details' },
        ]}
      />

      {tab === 'chart' && <ChartTab patientId={p.id} onTreatmentAdded={summary.reload} />}
      {tab === 'treatments' && s && <TreatmentsTab patient={p} treatments={s.treatments} planned={planned} reload={summary.reload} />}
      {tab === 'appointments' && s && <AppointmentsTab appointments={s.appointments} />}
      {tab === 'prescriptions' && <PrescriptionsTab patient={p} />}
      {tab === 'billing' && s && <InvoicesTab invoices={s.invoices} />}
      {tab === 'details' && <DetailsTab p={p} />}

      <PatientForm open={editing} onClose={() => setEditing(false)} patient={p} onSaved={(np) => patient.setData(np)} />
    </>
  );
}

function MiniStat({ label, value, danger }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${danger ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ChartTab({ patientId, onTreatmentAdded }) {
  const { can } = useAuth();
  const toast = useToast();
  const chart = useApi(() => api.get(`/patients/${patientId}/chart`), [patientId]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ condition: 'caries', surfaces: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [addTreatment, setAddTreatment] = useState(false);

  if (chart.loading && !chart.data) return <Loading />;
  const history = (chart.data?.history || []).filter((h) => h.tooth_number === selected);
  const current = chart.data?.teeth.find((t) => t.tooth_number === selected);

  const record = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/patients/${patientId}/chart`, { tooth_number: selected, ...form });
      toast(`Tooth ${selected} updated`);
      setForm((f) => ({ ...f, notes: '' }));
      chart.reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 2xl:grid-cols-3">
      <Card className="p-5 2xl:col-span-2">
        <Odontogram teeth={chart.data?.teeth} selected={selected} onSelect={setSelected} />
        <p className="mt-4 text-center text-xs text-slate-400">Click a tooth to view its history{can('dentist') ? ' or record a finding' : ''}.</p>
      </Card>

      <Card title={selected ? `Tooth ${selected}` : 'Select a tooth'}>
        {!selected ? (
          <Empty title="No tooth selected">Pick a tooth on the chart.</Empty>
        ) : (
          <div className="gap-8 p-5 lg:grid lg:grid-cols-2 2xl:block">
           <div>
            <p className="text-sm capitalize text-slate-500">{toothName(selected)}</p>
            <div className="mt-2">
              {current ? <Badge color="teal">{CONDITIONS[current.condition]?.label}{current.surfaces ? ` · ${current.surfaces}` : ''}</Badge> : <Badge>Not charted</Badge>}
            </div>

            {can('dentist') && (
              <form onSubmit={record} className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                <Field label="Finding">
                  <Select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                    {Object.entries(CONDITIONS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                  </Select>
                </Field>
                <Field label="Surfaces" hint="Blank = whole tooth. M O D B L I">
                  <Input value={form.surfaces} maxLength={6}
                    onChange={(e) => setForm({ ...form, surfaces: e.target.value.toUpperCase().replace(/[^MODBLI]/g, '') })} />
                </Field>
                <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                <div className="flex gap-2">
                  <Button type="submit" loading={busy}>Record finding</Button>
                  <Button type="button" variant="secondary" onClick={() => setAddTreatment(true)}>Add treatment</Button>
                </div>
              </form>
            )}
           </div>
           <div>
            <h4 className="mt-6 text-xs font-bold lg:mt-0 2xl:mt-6 uppercase tracking-wide text-slate-500">History</h4>
            {history.length === 0 ? <p className="mt-2 text-sm text-slate-400">No records for this tooth.</p> : (
              <ol className="mt-2 space-y-3 border-l-2 border-slate-100 pl-4">
                {history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <p className="font-semibold">{CONDITIONS[h.condition]?.label}{h.surfaces ? ` (${h.surfaces})` : ''}</p>
                    {h.notes && <p className="text-slate-600">{h.notes}</p>}
                    <p className="text-xs text-slate-400">{fmtDateTime(h.recorded_at)} · {h.recorded_by_name || '—'}</p>
                  </li>
                ))}
              </ol>
            )}
           </div>
          </div>
        )}
      </Card>

      <TreatmentForm open={addTreatment} onClose={() => setAddTreatment(false)} patientId={patientId} tooth={selected} onSaved={onTreatmentAdded} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function TreatmentsTab({ patient, treatments, planned, reload }) {
  const { can } = useAuth();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const planTotal = planned.reduce((sum, t) => sum + Number(t.price), 0);
  const unbilled = treatments.filter((t) => t.status === 'completed' && !t.invoiced);

  const setStatus = async (t, status) => {
    try {
      await api.put(`/treatments/${t.id}`, { status });
      toast(`Marked ${status.replace('_', ' ')}`);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          Treatment plan: <span className="font-semibold text-slate-900">{planned.length} item{planned.length === 1 ? '' : 's'} · {money(planTotal)}</span>
          {unbilled.length > 0 && <> · <span className="font-semibold text-amber-700">{unbilled.length} completed not yet invoiced</span></>}
        </div>
        <div className="flex gap-2">
          {unbilled.length > 0 && can('receptionist', 'accountant') && (
            <Link to={`/billing/new?patientId=${patient.id}`}><Button variant="secondary">Invoice completed work</Button></Link>
          )}
          {can('dentist') && <Button onClick={() => setAdding(true)}>+ Add treatment</Button>}
        </div>
      </div>
      <Card>
        {treatments.length === 0 ? <Empty title="No treatments recorded" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Procedure</th><th>Tooth</th><th>Dentist</th><th>Status</th><th className="text-right">Fee</th><th /></tr></thead>
              <tbody>
                {treatments.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <p className="font-semibold">{t.procedure_name}</p>
                      <p className="text-xs text-slate-500">{t.performed_at ? `Done ${fmtDate(t.performed_at)}` : `Added ${fmtDate(t.created_at)}`}{t.notes ? ` · ${t.notes}` : ''}</p>
                    </td>
                    <td>{t.tooth_number ? `${t.tooth_number}${t.surfaces ? ` ${t.surfaces}` : ''}` : '—'}</td>
                    <td>{t.dentist_name || '—'}</td>
                    <td className="space-x-1"><StatusBadge status={t.status} />{t.invoiced && <Badge color="green">invoiced</Badge>}</td>
                    <td className="text-right font-semibold">{money(t.price)}</td>
                    <td className="whitespace-nowrap text-right">
                      {can('dentist') && t.status === 'planned' && <Button size="sm" variant="ghost" onClick={() => setStatus(t, 'in_progress')}>Start</Button>}
                      {can('dentist') && ['planned', 'in_progress'].includes(t.status) && <Button size="sm" variant="secondary" onClick={() => setStatus(t, 'completed')}>Complete</Button>}
                      {can('dentist') && ['planned', 'in_progress'].includes(t.status) && !t.invoiced && <Button size="sm" variant="ghost" onClick={() => setStatus(t, 'cancelled')}>Cancel</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <TreatmentForm open={adding} onClose={() => setAdding(false)} patientId={patient.id} onSaved={reload} />
    </>
  );
}

function AppointmentsTab({ appointments }) {
  return (
    <Card>
      {appointments.length === 0 ? <Empty title="No appointments yet" /> : (
        <table className="table-base">
          <thead><tr><th>Date & time</th><th>Dentist</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>
            {appointments.map((a) => (
              <tr key={a.id}><td className="font-medium">{fmtDateTime(a.start_time)}</td><td>{a.dentist_name}</td><td>{a.reason || '—'}</td><td><StatusBadge status={a.status} /></td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function PrescriptionsTab({ patient }) {
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const list = useApi(() => api.get(`/prescriptions?patientId=${patient.id}`), [patient.id]);
  return (
    <>
      {can('dentist') && <div className="mb-4 flex justify-end"><Button onClick={() => setAdding(true)}>+ New prescription</Button></div>}
      {list.loading && !list.data ? <Loading /> : list.data.length === 0 ? <Card><Empty title="No prescriptions" /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data.map((rx) => (
            <Card key={rx.id} title={fmtDateTime(rx.created_at)} action={
              <Link to={`/prescriptions/${rx.id}/print`} target="_blank" className="text-sm font-semibold text-brand-700">Print →</Link>
            }>
              <ul className="divide-y divide-slate-100 px-5">
                {rx.items.map((it, i) => (
                  <li key={i} className="py-2.5 text-sm">
                    <p className="font-semibold">{it.drug}</p>
                    <p className="text-slate-500">{[it.dosage, it.frequency, it.duration, it.instructions].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
              <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">{rx.dentist_name}{rx.notes ? ` · ${rx.notes}` : ''}</p>
            </Card>
          ))}
        </div>
      )}
      <PrescriptionForm open={adding} onClose={() => setAdding(false)} patientId={patient.id} allergies={patient.allergies} onSaved={list.reload} />
    </>
  );
}

function InvoicesTab({ invoices }) {
  return (
    <Card>
      {invoices.length === 0 ? <Empty title="No invoices yet" /> : (
        <table className="table-base">
          <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Due</th></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td><Link to={`/billing/${i.id}`} className="font-semibold text-brand-700 hover:underline">{i.invoice_number}</Link></td>
                <td>{fmtDate(i.issue_date)}</td>
                <td><StatusBadge status={i.status} /></td>
                <td className="text-right">{money(i.total)}</td>
                <td className="text-right font-semibold">{i.status === 'void' ? '—' : money(i.total - i.amount_paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function DetailsTab({ p }) {
  const rows = [
    ['Phone', p.phone], ['Email', p.email], ['Date of birth', p.date_of_birth && fmtDate(p.date_of_birth)],
    ['Gender', p.gender && titleCase(p.gender)], ['Blood group', p.blood_group], ['Address', p.address],
    ['Emergency contact', [p.emergency_contact_name, p.emergency_contact_phone].filter(Boolean).join(' · ')],
    ['Notes', p.notes], ['Registered', fmtDateTime(p.created_at)],
  ];
  return (
    <Card>
      <dl className="divide-y divide-slate-100">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-3 gap-4 px-5 py-3 text-sm">
            <dt className="font-medium text-slate-500">{k}</dt>
            <dd className="col-span-2 text-slate-900">{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
