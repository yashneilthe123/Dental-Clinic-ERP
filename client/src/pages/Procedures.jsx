import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { money } from '../lib/format.js';
import { Badge, Button, Card, Field, Input, Loading, Modal, PageHeader } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Procedures() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useApi(() => api.get('/procedures?all=1'));
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const admin = can();

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { code: form.code, name: form.name, category: form.category, default_price: Number(form.default_price), duration_minutes: Number(form.duration_minutes) };
      if (form.id) await api.put(`/procedures/${form.id}`, body); else await api.post('/procedures', body);
      toast('Procedure saved'); setForm(null); list.reload();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const toggle = async (p) => {
    try { await api.put(`/procedures/${p.id}`, { is_active: !p.is_active }); list.reload(); } catch (err) { toast(err.message, 'error'); }
  };

  const groups = (list.data || []).reduce((acc, p) => ((acc[p.category] ||= []).push(p), acc), {});

  return (
    <>
      <PageHeader title="Procedures & fees" subtitle="Your clinic's price list. Used for treatments and invoices."
        actions={admin && <Button onClick={() => setForm({ code: '', name: '', category: 'General', default_price: '', duration_minutes: 30 })}>+ Add procedure</Button>} />
      {list.loading ? <Loading /> : (
        <div className="space-y-6">
          {Object.entries(groups).map(([cat, items]) => (
            <Card key={cat} title={cat}>
              <table className="table-base">
                <thead><tr><th className="w-24">Code</th><th>Procedure</th><th className="text-right">Duration</th><th className="text-right">Fee</th><th /></tr></thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className={p.is_active ? '' : 'opacity-50'}>
                      <td className="font-mono text-xs">{p.code}</td>
                      <td className="font-medium">{p.name} {!p.is_active && <Badge>inactive</Badge>}</td>
                      <td className="text-right text-slate-500">{p.duration_minutes} min</td>
                      <td className="text-right font-semibold">{money(p.default_price)}</td>
                      <td className="whitespace-nowrap text-right">
                        {admin && <Button size="sm" variant="ghost" onClick={() => setForm({ ...p })}>Edit</Button>}
                        {admin && <Button size="sm" variant="ghost" onClick={() => toggle(p)}>{p.is_active ? 'Disable' : 'Enable'}</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit procedure' : 'Add procedure'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" form="proc-form" loading={busy}>Save</Button></>}>
        {form && (
          <form id="proc-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Code *"><Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Category"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} list="proc-cats" /></Field>
            <datalist id="proc-cats">{Object.keys(groups).map((c) => <option key={c} value={c} />)}</datalist>
            <Field label="Name *" className="sm:col-span-2"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Fee (₹) *"><Input required type="number" min="0" step="0.01" value={form.default_price} onChange={(e) => setForm({ ...form, default_price: e.target.value })} /></Field>
            <Field label="Duration (min)"><Input type="number" min="5" step="5" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></Field>
          </form>
        )}
      </Modal>
    </>
  );
}
