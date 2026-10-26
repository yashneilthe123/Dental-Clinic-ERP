import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, fmtDateTime, money, titleCase } from '../lib/format.js';
import { Button, Card, Field, Input, Loading, Modal, Select, StatusBadge } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

export default function InvoiceDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const { data: inv, loading, error, setData } = useApi(() => api.get(`/invoices/${id}`), [id]);
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState({ amount: '', method: 'cash', reference: '' });
  const [busy, setBusy] = useState(false);

  if (loading && !inv) return <Loading />;
  if (error) return <p className="text-rose-600">{error.message}</p>;
  const balance = Math.round((inv.total - inv.amount_paid) * 100) / 100;

  const recordPayment = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setData(await api.post(`/invoices/${id}/payments`, { ...pay, amount: Number(pay.amount), reference: pay.reference || null }));
      toast('Payment recorded');
      setPaying(false);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const removePayment = async (p) => {
    if (!confirm(`Remove payment of ${money(p.amount)}?`)) return;
    try { setData(await api.del(`/invoices/${id}/payments/${p.id}`)); toast('Payment removed'); } catch (err) { toast(err.message, 'error'); }
  };

  const voidInvoice = async () => {
    if (!confirm('Void this invoice? Its treatments will become billable again.')) return;
    try { setData(await api.post(`/invoices/${id}/void`)); toast('Invoice voided'); } catch (err) { toast(err.message, 'error'); }
  };

  const pdf = () => api.openPdf(`/invoices/${id}/pdf`).catch((err) => toast(err.message, 'error'));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/billing" className="text-sm font-semibold text-brand-700">← Billing</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold tracking-tight">{inv.invoice_number} <StatusBadge status={inv.status} /></h1>
          <p className="mt-1 text-sm text-slate-500">
            Issued {fmtDate(inv.issue_date)}{inv.due_date && ` · due ${fmtDate(inv.due_date)}`} · by {inv.created_by_name || '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={pdf}>Download PDF</Button>
          {can('accountant') && inv.status !== 'void' && inv.amount_paid === 0 && <Button variant="secondary" onClick={voidInvoice}>Void</Button>}
          {can('receptionist', 'accountant') && ['unpaid', 'partial'].includes(inv.status) && (
            <Button onClick={() => { setPay({ amount: String(balance), method: 'cash', reference: '' }); setPaying(true); }}>Record payment</Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap justify-between gap-4 border-b border-slate-100 p-5">
            <div>
              <p className="label">Bill to</p>
              <Link to={`/patients/${inv.patient_id}`} className="font-semibold hover:text-brand-700">{inv.patient_name}</Link>
              <p className="text-sm text-slate-500">{inv.patient_code} · {inv.patient_phone}</p>
            </div>
            <div className="text-right">
              <p className="label">Balance due</p>
              <p className={`text-2xl font-bold ${balance > 0 && inv.status !== 'void' ? 'text-rose-600' : 'text-emerald-600'}`}>
                {inv.status === 'void' ? '—' : money(balance)}
              </p>
            </div>
          </div>
          <table className="table-base">
            <thead><tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {inv.items.map((it) => (
                <tr key={it.id}>
                  <td className="font-medium">{it.description}</td>
                  <td className="text-right">{it.quantity}</td>
                  <td className="text-right">{money(it.unit_price)}</td>
                  <td className="text-right">{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto max-w-xs space-y-1.5 border-t border-slate-100 p-5 text-sm">
            <Row k="Subtotal" v={money(inv.subtotal)} />
            {inv.discount > 0 && <Row k="Discount" v={`− ${money(inv.discount)}`} />}
            {inv.tax_amount > 0 && <Row k={`Tax (${inv.tax_rate}%)`} v={money(inv.tax_amount)} />}
            <Row k="Total" v={money(inv.total)} bold />
            <Row k="Paid" v={money(inv.amount_paid)} />
          </dl>
          {inv.notes && <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">{inv.notes}</p>}
        </Card>

        <Card title="Payments">
          {inv.payments.length === 0 ? <p className="px-5 py-4 text-sm text-slate-400">No payments yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {inv.payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{money(p.amount)} <span className="font-normal text-slate-500">· {titleCase(p.method)}</span></p>
                    <p className="text-xs text-slate-500">{fmtDateTime(p.paid_at)}{p.reference ? ` · ${p.reference}` : ''} · {p.received_by_name || '—'}</p>
                  </div>
                  {can('accountant') && <button onClick={() => removePayment(p)} className="text-xs text-slate-400 hover:text-rose-600">Remove</button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={paying} onClose={() => setPaying(false)} title="Record payment" size="sm"
        footer={<><Button variant="secondary" onClick={() => setPaying(false)}>Cancel</Button><Button type="submit" form="pay-form" loading={busy}>Save payment</Button></>}>
        <form id="pay-form" onSubmit={recordPayment} className="space-y-4">
          <p className="text-sm text-slate-500">Balance due: <span className="font-semibold text-slate-900">{money(balance)}</span></p>
          <Field label="Amount *"><Input required type="number" min="0.01" step="0.01" max={balance} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="Method">
            <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option><option value="insurance">Insurance</option><option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
        </form>
      </Modal>
    </>
  );
}

const Row = ({ k, v, bold }) => (
  <div className={`flex justify-between ${bold ? 'text-base font-bold text-slate-900' : 'text-slate-600'}`}><dt>{k}</dt><dd>{v}</dd></div>
);
