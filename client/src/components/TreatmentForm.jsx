import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { money } from '../lib/format.js';
import { Button, Field, Input, Modal, Select, Textarea } from './ui.jsx';
import { useToast } from './Toast.jsx';

/** Add a treatment (planned or done) for a patient, optionally pre-filled with a tooth. */
export default function TreatmentForm({ open, onClose, patientId, tooth, onSaved }) {
  const toast = useToast();
  const procedures = useApi(() => (open ? api.get('/procedures') : Promise.resolve(null)), [open]);
  const dentists = useApi(() => (open ? api.get('/users/dentists') : Promise.resolve(null)), [open]);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ procedure_id: '', tooth_number: tooth || '', surfaces: '', price: '', status: 'planned', dentist_id: '', notes: '' });
  }, [open, tooth]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pickProcedure = (e) => {
    const p = procedures.data?.find((x) => String(x.id) === e.target.value);
    setForm((f) => ({ ...f, procedure_id: e.target.value, price: p ? p.default_price : f.price }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await api.post('/treatments', {
        patient_id: patientId,
        procedure_id: form.procedure_id,
        tooth_number: form.tooth_number || null,
        surfaces: form.surfaces || null,
        price: form.price === '' ? undefined : form.price,
        status: form.status,
        dentist_id: form.dentist_id || null,
        notes: form.notes || null,
      });
      toast(`${t.procedure_name} added`);
      onSaved?.(t);
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Group procedures by category for the dropdown
  const groups = (procedures.data || []).reduce((acc, p) => ((acc[p.category] ||= []).push(p), acc), {});

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tooth ? `Add treatment · tooth ${tooth}` : 'Add treatment'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="treatment-form" loading={busy}>Save</Button></>}
    >
      <form id="treatment-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Procedure *" className="sm:col-span-2">
          <Select required value={form.procedure_id} onChange={pickProcedure}>
            <option value="">Select a procedure…</option>
            {Object.entries(groups).map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.default_price)}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Tooth (FDI)" hint="11–48, leave blank for whole mouth">
          <Input type="number" min="11" max="48" value={form.tooth_number} onChange={set('tooth_number')} />
        </Field>
        <Field label="Surfaces" hint="M O D B L I, e.g. MOD">
          <Input value={form.surfaces} maxLength={6} onChange={(e) => setForm((f) => ({ ...f, surfaces: e.target.value.toUpperCase().replace(/[^MODBLI]/g, '') }))} />
        </Field>
        <Field label="Fee (₹)"><Input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} /></Field>
        <Field label="Status">
          <Select value={form.status} onChange={set('status')}>
            <option value="planned">Planned (treatment plan)</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed today</option>
          </Select>
        </Field>
        <Field label="Dentist" className="sm:col-span-2">
          <Select value={form.dentist_id} onChange={set('dentist_id')}>
            <option value="">Me / unassigned</option>
            {(dentists.data || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}
