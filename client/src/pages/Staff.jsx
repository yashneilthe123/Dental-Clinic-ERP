import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDateTime } from '../lib/format.js';
import { Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Select } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

const ROLE_COLORS = { admin: 'violet', dentist: 'teal', receptionist: 'blue', accountant: 'amber' };

export default function Staff() {
  const { user } = useAuth();
  const toast = useToast();
  const list = useApi(() => api.get('/users'));
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: form.name, email: form.email, role: form.role, phone: form.phone || null, specialization: form.specialization || null, color: form.color };
      if (form.password) body.password = form.password;
      if (form.id) await api.put(`/users/${form.id}`, body); else await api.post('/users', body);
      toast('Staff member saved'); setForm(null); list.reload();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const toggle = async (u) => {
    try { await api.put(`/users/${u.id}`, { is_active: !u.is_active }); list.reload(); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="Staff" subtitle="Who can sign in, and what they can do"
        actions={<Button onClick={() => setForm({ name: '', email: '', password: '', role: 'receptionist', phone: '', specialization: '', color: '#0d9488' })}>+ Add staff</Button>} />
      <Card>
        {list.loading ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Last login</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ background: u.color }} />
                        <div><p className="font-semibold">{u.name}</p><p className="text-xs text-slate-500">{u.email}{u.specialization ? ` · ${u.specialization}` : ''}</p></div>
                      </div>
                    </td>
                    <td><Badge color={ROLE_COLORS[u.role]}>{u.role}</Badge></td>
                    <td>{u.phone || '—'}</td>
                    <td className="text-xs text-slate-500">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td>
                    <td>{u.is_active ? <Badge color="green">active</Badge> : <Badge>disabled</Badge>}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setForm({ ...u, password: '', phone: u.phone || '', specialization: u.specialization || '' })}>Edit</Button>
                      {u.id !== user.id && <Button size="sm" variant="ghost" onClick={() => toggle(u)}>{u.is_active ? 'Disable' : 'Enable'}</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6 card p-5 text-sm text-slate-600">
        <p className="font-semibold text-slate-900">Role permissions</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Admin</b> — everything, including staff, price list, settings and audit log.</li>
          <li><b>Dentist</b> — patients, dental chart, treatments, prescriptions, own schedule; record stock usage.</li>
          <li><b>Receptionist</b> — patients, appointments, invoices &amp; payments, inventory.</li>
          <li><b>Accountant</b> — invoices, payments, voids and reports.</li>
        </ul>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit staff member' : 'Add staff member'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" form="staff-form" loading={busy}>Save</Button></>}>
        {form && (
          <form id="staff-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *" className="sm:col-span-2"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email *"><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={form.id ? 'New password' : 'Password *'} hint={form.id ? 'Leave blank to keep current' : 'At least 8 characters'}>
              <Input type="password" minLength={8} required={!form.id} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={form.id === user.id}>
                <option value="admin">Admin</option><option value="dentist">Dentist</option>
                <option value="receptionist">Receptionist</option><option value="accountant">Accountant</option>
              </Select>
            </Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            {form.role === 'dentist' && <Field label="Specialization"><Input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} /></Field>}
            <Field label="Calendar colour"><Input type="color" className="h-10 p-1" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
          </form>
        )}
      </Modal>
    </>
  );
}
