import { useState } from 'react';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/hooks.js';
import { fmtDate, isoDay, money, titleCase } from '../lib/format.js';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Pagination, Select, StatCard, Textarea } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

const METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'credit', 'other'];
const methodLabel = (m) => ({ upi: 'UPI', credit: 'On credit (unpaid)' }[m] || titleCase(m));
// Suggested categories for manual entries; inventory categories come from stock purchases
const CATEGORIES = ['Equipment', 'Repairs & maintenance', 'Lab charges', 'Instruments', 'Consumables', 'Medicines',
  'Freight & delivery', 'Sterilisation', 'Other'];

const presets = {
  month: () => { const n = new Date(); return [isoDay(new Date(n.getFullYear(), n.getMonth(), 1)), isoDay()]; },
  lastMonth: () => { const n = new Date(); return [isoDay(new Date(n.getFullYear(), n.getMonth() - 1, 1)), isoDay(new Date(n.getFullYear(), n.getMonth(), 0))]; },
  '90d': () => [isoDay(new Date(Date.now() - 89 * 864e5)), isoDay()],
  year: () => [isoDay(new Date(new Date().getFullYear(), 0, 1)), isoDay()],
};

export default function Expenses() {
  const toast = useToast();
  const [[from, to], setRange] = useState(presets.month());
  const [category, setCategory] = useState('');
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // expense | {} for new
  const search = useDebounced(q);
  const filter = { from, to, category, source, q: search };

  const { data, loading, reload } = useApi(() => api.get(`/expenses${qs({ ...filter, page })}`), [from, to, category, source, search, page]);
  const categories = useApi(() => api.get('/expenses/categories'), [data?.totals.count]);
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  const exportCsv = async () => {
    try {
      const rows = [];
      for (let p = 1; ; p++) {
        const r = await api.get(`/expenses${qs({ ...filter, page: p, pageSize: 100 })}`);
        rows.push(...r.data);
        if (rows.length >= r.total || !r.data.length) break;
      }
      const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [
        ['Date', 'Type', 'Category', 'Description', 'Supplier', 'Quantity', 'Unit cost', 'Amount', 'Paid via', 'Bill / ref', 'Notes'],
        ...rows.map((e) => [e.expense_date, e.source === 'stock' ? 'Stock purchase' : 'Other', e.category, e.description, e.supplier_name,
          e.quantity, e.unit_cost, e.amount, e.payment_method && methodLabel(e.payment_method), e.reference, e.notes]),
      ].map((r) => r.map(cell).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `expenses_${from}_${to}.csv`;
      a.click();
    } catch (err) { toast(err.message, 'error'); }
  };

  const t = data?.totals;
  const maxCat = Math.max(1, ...(data?.byCategory || []).map((c) => c.amount));

  return (
    <>
      <PageHeader title="Expenses" subtitle="Inventory purchases and other clinic spending"
        actions={<>
          <Button variant="secondary" onClick={exportCsv} disabled={!t?.count}>Export CSV</Button>
          <Button onClick={() => setEditing({})}>+ Add expense</Button>
        </>} />

      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => reset(setRange)([e.target.value, to])} /></Field>
          <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => reset(setRange)([from, e.target.value])} /></Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => reset(setCategory)(e.target.value)} className="w-48">
              <option value="">All categories</option>
              {(categories.data || []).map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={source} onChange={(e) => reset(setSource)(e.target.value)} className="w-44">
              <option value="">All expenses</option>
              <option value="stock">Stock purchases</option>
              <option value="manual">Other expenses</option>
            </Select>
          </Field>
          <Field label="Search"><Input placeholder="Description or bill no…" value={q} onChange={(e) => reset(setQ)(e.target.value)} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {[['month', 'This month'], ['lastMonth', 'Last month'], ['90d', 'Last 90 days'], ['year', 'This year']].map(([k, l]) => (
            <Button key={k} size="sm" variant="ghost" onClick={() => reset(setRange)(presets[k]())}>{l}</Button>
          ))}
        </div>
      </Card>

      {loading && !data ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total spent" value={money(t.total)} sub={`${fmtDate(from)} – ${fmtDate(to)}`} accent="rose" />
            <StatCard label="Inventory purchases" value={money(t.stock_total)} sub="Logged from Stock in" />
            <StatCard label="Other expenses" value={money(t.other_total)} sub="Equipment, repairs, lab…" accent="amber" />
            <StatCard label="Entries" value={t.count} accent="sky" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              {data.data.length === 0 ? (
                <Empty title="No expenses in this period">Receiving stock in Inventory records purchases here automatically.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Paid via</th><th className="text-right">Amount</th><th /></tr></thead>
                    <tbody>
                      {data.data.map((e) => (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap">{fmtDate(e.expense_date)}</td>
                          <td>
                            <p className="font-semibold">{e.description}</p>
                            <p className="text-xs text-slate-500">
                              {[e.source === 'stock' && e.quantity != null && `${e.quantity} ${e.item_unit || ''} × ${money(e.unit_cost)}`,
                                e.supplier_name, e.reference && `Bill ${e.reference}`].filter(Boolean).join(' · ')}
                            </p>
                          </td>
                          <td className="space-y-1">
                            <span className="block">{e.category}</span>
                            <Badge color={e.source === 'stock' ? 'teal' : 'gray'}>{e.source === 'stock' ? 'stock purchase' : 'other'}</Badge>
                          </td>
                          <td>{e.payment_method ? methodLabel(e.payment_method) : <span className="text-slate-400">—</span>}</td>
                          <td className="text-right font-semibold">{money(e.amount)}</td>
                          <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Edit</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
            </Card>

            <div className="space-y-6">
              <Card title="By category">
                {data.byCategory.length === 0 ? <Empty title="Nothing to show" /> : (
                  <ul className="space-y-3 p-5">
                    {data.byCategory.map((c) => (
                      <li key={c.category} className="text-sm">
                        <div className="flex justify-between"><span className="font-medium">{c.category}</span><span className="font-semibold">{money(c.amount)}</span></div>
                        <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-rose-500" style={{ width: `${(c.amount / maxCat) * 100}%` }} /></div>
                        <p className="mt-0.5 text-xs text-slate-500">{c.count} entr{c.count === 1 ? 'y' : 'ies'} · {t.total ? ((c.amount / t.total) * 100).toFixed(0) : 0}%</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Top suppliers">
                {data.bySupplier.length === 0 ? <Empty title="Nothing to show" /> : (
                  <table className="table-base">
                    <tbody>{data.bySupplier.map((s) => (
                      <tr key={s.supplier}><td className="font-medium">{s.supplier}<p className="text-xs text-slate-500">{s.count} purchase{s.count === 1 ? '' : 's'}</p></td><td className="text-right font-semibold">{money(s.amount)}</td></tr>
                    ))}</tbody>
                  </table>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      <ExpenseForm expense={editing} categories={categories.data || []} onClose={() => setEditing(null)} onSaved={() => { reload(); categories.reload(); }} />
    </>
  );
}

function ExpenseForm({ expense, categories, onClose, onSaved }) {
  const toast = useToast();
  const suppliers = useApi(() => (expense ? api.get('/inventory/suppliers') : Promise.resolve([])), [!!expense]);
  const isNew = expense && !expense.id;
  const isStock = expense?.source === 'stock';
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  if (expense !== last) {
    setLast(expense);
    if (expense) setForm({
      expense_date: expense.expense_date || isoDay(), category: expense.category || '', description: expense.description || '',
      amount: expense.amount ?? '', payment_method: expense.payment_method || '', reference: expense.reference || '',
      supplier_id: expense.supplier_id || '', notes: expense.notes || '',
    });
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, supplier_id: form.supplier_id || null, payment_method: form.payment_method || null };
      if (isNew) await api.post('/expenses', body); else await api.put(`/expenses/${expense.id}`, body);
      toast(isNew ? 'Expense added' : 'Expense updated');
      onSaved(); onClose();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm('Delete this expense?')) return;
    try { await api.del(`/expenses/${expense.id}`); toast('Expense deleted'); onSaved(); onClose(); } catch (err) { toast(err.message, 'error'); }
  };

  const allCategories = [...new Set([...CATEGORIES, ...categories])].sort();

  return (
    <Modal open={!!expense} onClose={onClose} title={isNew ? 'Add expense' : isStock ? 'Edit stock purchase' : 'Edit expense'}
      footer={<>
        {!isNew && !isStock && <Button variant="ghost" className="mr-auto text-rose-600" onClick={remove}>Delete</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="expense-form" loading={busy}>Save</Button>
      </>}>
      {isStock && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
          Recorded automatically when {expense.quantity} {expense.item_unit} of {expense.item_name} were received.
          Change the amount here if the supplier bill was different.
        </p>
      )}
      <form id="expense-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Description *" className="sm:col-span-2">
          <Input required minLength={2} value={form.description} onChange={set('description')} placeholder="e.g. Autoclave servicing, X-ray sensor repair" />
        </Field>
        <Field label="Category *">
          <Input required minLength={2} list="expense-categories" value={form.category} onChange={set('category')} />
          <datalist id="expense-categories">{allCategories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Date *"><Input required type="date" max={isoDay()} value={form.expense_date} onChange={set('expense_date')} /></Field>
        <Field label="Amount (₹) *"><Input required type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} /></Field>
        <Field label="Paid via">
          <Select value={form.payment_method} onChange={set('payment_method')}>
            <option value="">Not recorded</option>
            {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
          </Select>
        </Field>
        <Field label="Supplier">
          <Select value={form.supplier_id} onChange={set('supplier_id')}>
            <option value="">—</option>
            {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Bill / reference no."><Input value={form.reference} onChange={set('reference')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}
