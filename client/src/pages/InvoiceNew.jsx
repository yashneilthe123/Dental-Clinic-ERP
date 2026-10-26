import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { fmtDate, fullName, money } from '../lib/format.js';
import { Button, Card, Empty, Field, Input, Loading, PageHeader, Select, Textarea } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import PatientPicker from '../components/PatientPicker.jsx';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function InvoiceNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [patient, setPatient] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [pay, setPay] = useState({ amount: '', method: 'cash', reference: '' });
  const [busy, setBusy] = useState(false);

  const settings = useApi(() => api.get('/settings'));
  const procedures = useApi(() => api.get('/procedures'));
  useEffect(() => { if (settings.data && taxRate === '') setTaxRate(String(settings.data.default_tax_rate)); }, [settings.data, taxRate]);

  // Pre-select patient from ?patientId=
  useEffect(() => {
    const pid = params.get('patientId');
    if (pid) api.get(`/patients/${pid}`).then((p) => setPatient({ id: p.id, name: fullName(p) })).catch(() => {});
  }, [params]);

  const unbilled = useApi(
    () => (patient ? api.get(`/treatments?patientId=${patient.id}&unbilled=1`) : Promise.resolve([])),
    [patient?.id]
  );
  // Select all unbilled treatments by default when they load
  useEffect(() => { setSelectedIds(new Set((unbilled.data || []).map((t) => t.id))); }, [unbilled.data]);

  const chosen = (unbilled.data || []).filter((t) => selectedIds.has(t.id));
  const subtotal = round2(chosen.reduce((s, t) => s + Number(t.price), 0) + items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0));
  const disc = Math.min(Number(discount) || 0, subtotal);
  const tax = round2(((subtotal - disc) * (Number(taxRate) || 0)) / 100);
  const total = round2(subtotal - disc + tax);

  const toggle = (id) => setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addItem = (proc) => setItems((l) => [...l, proc
    ? { description: proc.name, quantity: 1, unit_price: proc.default_price }
    : { description: '', quantity: 1, unit_price: '' }]);
  const updateItem = (i, k, v) => setItems((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const submit = async () => {
    if (!patient) return toast('Select a patient', 'error');
    setBusy(true);
    try {
      const inv = await api.post('/invoices', {
        patient_id: patient.id,
        treatment_ids: [...selectedIds],
        items: items.filter((i) => i.description.trim()).map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price) || 0 })),
        discount: Number(discount) || 0,
        tax_rate: Number(taxRate) || 0,
        due_date: dueDate || null,
        notes: notes || null,
        payment: Number(pay.amount) > 0 ? { amount: Number(pay.amount), method: pay.method, reference: pay.reference || null } : null,
      });
      toast(`Invoice ${inv.invoice_number} created`);
      navigate(`/billing/${inv.id}`, { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="New invoice" subtitle="Bill completed treatments and any extra items" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Patient" className="overflow-visible">
            <div className="p-5"><PatientPicker value={patient} onChange={(p) => { setPatient(p); setItems([]); }} autoFocus /></div>
          </Card>

          {patient && (
            <Card title="Completed treatments not yet invoiced">
              {unbilled.loading ? <Loading /> : unbilled.data.length === 0 ? (
                <Empty title="Nothing pending">Add line items below, or mark treatments as completed on the patient&apos;s page.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {unbilled.data.map((t) => (
                    <li key={t.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-slate-50">
                        <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={selectedIds.has(t.id)} onChange={() => toggle(t.id)} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{t.procedure_name}{t.tooth_number ? ` · tooth ${t.tooth_number}` : ''}</p>
                          <p className="text-xs text-slate-500">{fmtDate(t.performed_at)} · {t.dentist_name || '—'}</p>
                        </div>
                        <span className="text-sm font-semibold">{money(t.price)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="Other items" action={
            <div className="flex gap-2">
              <Select className="w-48 py-1.5 text-xs" value="" onChange={(e) => { const p = procedures.data?.find((x) => String(x.id) === e.target.value); if (p) addItem(p); }}>
                <option value="">+ From price list…</option>
                {(procedures.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Button size="sm" variant="secondary" onClick={() => addItem(null)}>+ Custom</Button>
            </div>
          }>
            {items.length === 0 ? <p className="px-5 py-4 text-sm text-slate-400">No extra items.</p> : (
              <div className="space-y-2 p-5">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <Input className="col-span-6" placeholder="Description" value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} />
                    <Input className="col-span-2" type="number" min="1" step="1" value={it.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value)} />
                    <Input className="col-span-3" type="number" min="0" step="0.01" placeholder="Rate" value={it.unit_price} onChange={(e) => updateItem(i, 'unit_price', e.target.value)} />
                    <button className="col-span-1 text-slate-400 hover:text-rose-600" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Summary">
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Discount (₹)"><Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
                <Field label="Tax %"><Input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field>
              </div>
              <Field label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
              <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              <dl className="space-y-1.5 border-t border-slate-100 pt-4 text-sm">
                <Row k="Subtotal" v={money(subtotal)} />
                {disc > 0 && <Row k="Discount" v={`− ${money(disc)}`} />}
                {tax > 0 && <Row k={`Tax (${taxRate}%)`} v={money(tax)} />}
                <Row k="Total" v={money(total)} bold />
              </dl>
            </div>
          </Card>

          <Card title="Payment now (optional)">
            <div className="grid grid-cols-2 gap-3 p-5">
              <Field label="Amount"><Input type="number" min="0" step="0.01" max={total} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
              <Field label="Method">
                <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
                  <option value="bank_transfer">Bank transfer</option><option value="insurance">Insurance</option><option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Reference" className="col-span-2"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="UPI txn ID, card slip no…" /></Field>
              <button type="button" className="col-span-2 text-left text-xs font-semibold text-brand-700" onClick={() => setPay({ ...pay, amount: String(total) })}>Paid in full ({money(total)})</button>
            </div>
          </Card>

          <Button className="w-full" onClick={submit} loading={busy} disabled={!patient || subtotal <= 0 && chosen.length === 0}>
            Create invoice · {money(total)}
          </Button>
        </div>
      </div>
    </>
  );
}

const Row = ({ k, v, bold }) => (
  <div className={`flex justify-between ${bold ? 'text-base font-bold text-slate-900' : 'text-slate-600'}`}><dt>{k}</dt><dd>{v}</dd></div>
);
