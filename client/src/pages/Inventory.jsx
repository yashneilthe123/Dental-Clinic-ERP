import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, fmtDateTime, money } from '../lib/format.js';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Tabs, Textarea } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Inventory() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState('items');
  return (
    <>
      <PageHeader title="Inventory" subtitle="Consumables, materials and suppliers" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'items', label: 'Stock' }, { value: 'suppliers', label: 'Suppliers' }]} />
      {tab === 'items' ? <Items initialLow={params.get('lowStock') === '1'} /> : <Suppliers />}
    </>
  );
}

function Items({ initialLow }) {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [low, setLow] = useState(initialLow);
  const search = useDebounced(q);
  const items = useApi(() => api.get(`/inventory${qs({ q: search, lowStock: low ? 1 : undefined })}`), [search, low]);
  const [editing, setEditing] = useState(null);   // item | {} for new
  const [moving, setMoving] = useState(null);     // { item, type }
  const [history, setHistory] = useState(null);   // item
  const stockValue = (items.data || []).reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Input className="max-w-xs" placeholder="Search name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low stock only
          </label>
          <span className="ml-auto text-sm text-slate-500">Stock value: <span className="font-semibold text-slate-900">{money(stockValue)}</span></span>
          {can('receptionist') && <Button onClick={() => setEditing({})}>+ Add item</Button>}
        </div>
        {items.loading && !items.data ? <Loading /> : items.data.length === 0 ? <Empty title="No items found" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Item</th><th>Category</th><th className="text-right">In stock</th><th className="text-right">Reorder at</th><th className="text-right">Unit cost</th><th>Expiry</th><th /></tr></thead>
              <tbody>
                {items.data.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <button onClick={() => setHistory(i)} className="text-left font-semibold hover:text-brand-700">{i.name}</button>
                      <p className="font-mono text-xs text-slate-500">{i.sku}{i.supplier_name ? ` · ${i.supplier_name}` : ''}</p>
                    </td>
                    <td>{i.category}</td>
                    <td className="text-right">
                      <span className={`font-semibold ${i.quantity <= 0 ? 'text-rose-600' : i.low_stock ? 'text-amber-600' : 'text-slate-900'}`}>{i.quantity}</span>{' '}
                      <span className="text-slate-500">{i.unit}</span>
                      {i.low_stock && <div><Badge color={i.quantity <= 0 ? 'red' : 'amber'}>{i.quantity <= 0 ? 'out of stock' : 'low'}</Badge></div>}
                    </td>
                    <td className="text-right text-slate-500">{i.reorder_level}</td>
                    <td className="text-right">{money(i.unit_cost)}</td>
                    <td>{i.expiry_date ? <span className={i.expiring_soon ? 'font-semibold text-rose-600' : ''}>{fmtDate(i.expiry_date)}</span> : '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      {can('receptionist') && <Button size="sm" variant="secondary" onClick={() => setMoving({ item: i, type: 'in' })}>Stock in</Button>}{' '}
                      {can('receptionist', 'dentist') && <Button size="sm" variant="secondary" onClick={() => setMoving({ item: i, type: 'out' })}>Use</Button>}{' '}
                      {can('receptionist') && <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>Edit</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ItemForm item={editing} onClose={() => setEditing(null)} onSaved={items.reload} />
      <MovementForm state={moving} onClose={() => setMoving(null)} onSaved={items.reload} />
      <History item={history} onClose={() => setHistory(null)} />
    </>
  );
}

function ItemForm({ item, onClose, onSaved }) {
  const toast = useToast();
  const suppliers = useApi(() => (item ? api.get('/inventory/suppliers') : Promise.resolve([])), [!!item]);
  const isNew = item && !item.id;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [lastItem, setLastItem] = useState(null);
  if (item !== lastItem) {
    setLastItem(item);
    if (item) setForm({
      sku: item.sku || '', name: item.name || '', category: item.category || 'Consumables', unit: item.unit || 'pcs',
      quantity: '', reorder_level: item.reorder_level ?? 0, unit_cost: item.unit_cost ?? 0,
      supplier_id: item.supplier_id || '', expiry_date: item.expiry_date || '',
    });
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, supplier_id: form.supplier_id || null, expiry_date: form.expiry_date || null };
      if (isNew) await api.post('/inventory', { ...body, quantity: Number(form.quantity) || 0 });
      else { delete body.quantity; await api.put(`/inventory/${item.id}`, body); }
      toast(isNew ? 'Item added' : 'Item updated');
      onSaved(); onClose();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!item} onClose={onClose} title={isNew ? 'Add inventory item' : 'Edit item'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="item-form" loading={busy}>Save</Button></>}>
      <form id="item-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" className="sm:col-span-2"><Input required value={form.name} onChange={set('name')} /></Field>
        <Field label="SKU / code *"><Input required value={form.sku} onChange={set('sku')} /></Field>
        <Field label="Category">
          <Select value={form.category} onChange={set('category')}>
            {['Consumables', 'Anesthetics', 'Restorative', 'Endodontics', 'Prosthodontics', 'Orthodontics', 'Surgical', 'Medicines', 'Instruments', 'Other'].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Unit"><Input value={form.unit} onChange={set('unit')} placeholder="box, vial, pack…" /></Field>
        {isNew && <Field label="Opening stock"><Input type="number" min="0" step="0.01" value={form.quantity} onChange={set('quantity')} /></Field>}
        <Field label="Reorder level"><Input type="number" min="0" step="0.01" value={form.reorder_level} onChange={set('reorder_level')} /></Field>
        <Field label="Unit cost (₹)"><Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={set('unit_cost')} /></Field>
        <Field label="Supplier">
          <Select value={form.supplier_id} onChange={set('supplier_id')}>
            <option value="">—</option>
            {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Expiry date"><Input type="date" value={form.expiry_date} onChange={set('expiry_date')} /></Field>
      </form>
    </Modal>
  );
}

function MovementForm({ state, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ quantity: '', reason: '', unit_cost: '' });
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  if (state !== last) { setLast(state); if (state) setForm({ quantity: '', reason: '', unit_cost: state.item.unit_cost }); }
  if (!state) return null;
  const { item, type } = state;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/inventory/${item.id}/movements`, {
        type, quantity: Number(form.quantity), reason: form.reason || null,
        ...(type === 'in' && form.unit_cost !== '' ? { unit_cost: Number(form.unit_cost) } : {}),
      });
      toast(type === 'in' ? 'Stock received' : 'Usage recorded');
      onSaved(); onClose();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title={`${type === 'in' ? 'Receive stock' : 'Record usage'} · ${item.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="move-form" loading={busy}>Save</Button></>}>
      <form id="move-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">Currently in stock: <span className="font-semibold text-slate-900">{item.quantity} {item.unit}</span></p>
        <Field label={`Quantity (${item.unit}) *`}>
          <Input required autoFocus type="number" min="0.01" step="0.01" max={type === 'out' ? item.quantity : undefined} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        </Field>
        {type === 'in' && <Field label="Unit cost (₹)"><Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></Field>}
        <Field label={type === 'in' ? 'Reference (bill no., supplier)' : 'Used for'}>
          <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}

function History({ item, onClose }) {
  const moves = useApi(() => (item ? api.get(`/inventory/${item.id}/movements`) : Promise.resolve([])), [item?.id]);
  return (
    <Modal open={!!item} onClose={onClose} title={item ? `Stock history · ${item.name}` : ''}>
      {moves.loading ? <Loading /> : (moves.data || []).length === 0 ? <Empty title="No movements yet" /> : (
        <table className="table-base">
          <thead><tr><th>When</th><th>Type</th><th className="text-right">Qty</th><th>Note</th></tr></thead>
          <tbody>
            {moves.data.map((m) => (
              <tr key={m.id}>
                <td className="text-xs">{fmtDateTime(m.created_at)}<br /><span className="text-slate-400">{m.user_name}</span></td>
                <td><Badge color={m.type === 'in' ? 'green' : m.type === 'out' ? 'amber' : 'blue'}>{m.type}</Badge></td>
                <td className="text-right font-semibold">{m.type === 'out' ? '−' : m.type === 'in' ? '+' : ''}{m.quantity}</td>
                <td className="text-xs text-slate-600">{m.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function Suppliers() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useApi(() => api.get('/inventory/suppliers'));
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (form.id) await api.put(`/inventory/suppliers/${form.id}`, form);
      else await api.post('/inventory/suppliers', form);
      toast('Supplier saved'); setForm(null); list.reload();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const pick = ({ id, name, contact_person, phone, email, address }) => setForm({ id, name, contact_person: contact_person || '', phone: phone || '', email: email || '', address: address || '' });

  return (
    <>
      {can('receptionist') && <div className="mb-4 flex justify-end"><Button onClick={() => setForm({ name: '', contact_person: '', phone: '', email: '', address: '' })}>+ Add supplier</Button></div>}
      <Card>
        {list.loading ? <Loading /> : list.data.length === 0 ? <Empty title="No suppliers yet" /> : (
          <table className="table-base">
            <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Email</th><th className="text-right">Items</th><th /></tr></thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id}>
                  <td><p className="font-semibold">{s.name}</p><p className="text-xs text-slate-500">{s.address}</p></td>
                  <td>{s.contact_person || '—'}</td><td>{s.phone || '—'}</td><td>{s.email || '—'}</td>
                  <td className="text-right">{s.item_count}</td>
                  <td className="text-right">{can('receptionist') && <Button size="sm" variant="ghost" onClick={() => pick(s)}>Edit</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit supplier' : 'Add supplier'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" form="sup-form" loading={busy}>Save</Button></>}>
        {form && (
          <form id="sup-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *" className="sm:col-span-2"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Contact person"><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email" className="sm:col-span-2"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          </form>
        )}
      </Modal>
    </>
  );
}
