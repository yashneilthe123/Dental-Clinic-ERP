import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { Button, Card, Field, Input, Loading, PageHeader, Textarea } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

const FIELDS = ['clinic_name', 'address', 'phone', 'email', 'gstin', 'currency', 'default_tax_rate', 'invoice_prefix', 'slot_minutes', 'opening_hour', 'closing_hour'];

export default function Settings() {
  const toast = useToast();
  const { data, loading } = useApi(() => api.get('/settings'));
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  useEffect(() => { if (data) setForm(Object.fromEntries(FIELDS.map((k) => [k, data[k] ?? '']))); }, [data]);
  if (loading || !form) return <Loading />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/settings', {
        ...form,
        default_tax_rate: Number(form.default_tax_rate), slot_minutes: Number(form.slot_minutes),
        opening_hour: Number(form.opening_hour), closing_hour: Number(form.closing_hour),
      });
      toast('Settings saved');
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try { await api.post('/auth/change-password', pw); toast('Password changed'); setPw({ currentPassword: '', newPassword: '' }); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="Clinic settings" subtitle="Shown on invoices and prescriptions" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Clinic profile" className="lg:col-span-2">
          <form onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Clinic name" className="sm:col-span-2"><Input required value={form.clinic_name} onChange={set('clinic_name')} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={form.address} onChange={set('address')} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Email"><Input value={form.email} onChange={set('email')} /></Field>
            <Field label="GSTIN"><Input value={form.gstin} onChange={set('gstin')} /></Field>
            <Field label="Currency" hint="3-letter code"><Input maxLength={3} value={form.currency} onChange={set('currency')} /></Field>
            <Field label="Default tax %" hint="Most dental treatment in India is GST-exempt; use 0 unless advised"><Input type="number" min="0" max="100" step="0.01" value={form.default_tax_rate} onChange={set('default_tax_rate')} /></Field>
            <Field label="Invoice prefix"><Input value={form.invoice_prefix} onChange={set('invoice_prefix')} /></Field>
            <Field label="Default appointment (min)"><Input type="number" min="5" max="240" step="5" value={form.slot_minutes} onChange={set('slot_minutes')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opens (hour)"><Input type="number" min="0" max="23" value={form.opening_hour} onChange={set('opening_hour')} /></Field>
              <Field label="Closes (hour)"><Input type="number" min="1" max="24" value={form.closing_hour} onChange={set('closing_hour')} /></Field>
            </div>
            <div className="sm:col-span-2"><Button type="submit" loading={busy}>Save settings</Button></div>
          </form>
        </Card>
        <Card title="Change my password">
          <form onSubmit={changePassword} className="space-y-4 p-5">
            <Field label="Current password"><Input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password" hint="At least 8 characters"><Input type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Button type="submit" variant="secondary">Update password</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
