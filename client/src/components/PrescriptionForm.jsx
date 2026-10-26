import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Field, Input, Modal, Textarea } from './ui.jsx';
import { useToast } from './Toast.jsx';

const ROW = { drug: '', dosage: '', frequency: '', duration: '', instructions: '' };
// Common dental prescriptions for one-click entry
const QUICK = [
  { drug: 'Amoxicillin 500 mg', dosage: '1 cap', frequency: '1-1-1', duration: '5 days', instructions: 'After food' },
  { drug: 'Ibuprofen 400 mg', dosage: '1 tab', frequency: '1-0-1', duration: '3 days', instructions: 'After food, if pain' },
  { drug: 'Paracetamol 650 mg', dosage: '1 tab', frequency: 'SOS', duration: '3 days', instructions: 'Max 3 per day' },
  { drug: 'Metronidazole 400 mg', dosage: '1 tab', frequency: '1-1-1', duration: '5 days', instructions: 'After food, avoid alcohol' },
  { drug: 'Chlorhexidine 0.2% mouthwash', dosage: '10 ml', frequency: '1-0-1', duration: '7 days', instructions: 'Rinse 30s, do not swallow' },
];

export default function PrescriptionForm({ open, onClose, patientId, allergies, onSaved }) {
  const toast = useToast();
  const [items, setItems] = useState([ROW]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setItems([{ ...ROW }]); setNotes(''); } }, [open]);

  const update = (i, k, v) => setItems((list) => list.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addQuick = (q) => setItems((list) => [...list.filter((r) => r.drug.trim()), { ...q }]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const rx = await api.post('/prescriptions', { patient_id: patientId, items: items.filter((r) => r.drug.trim()), notes });
      toast('Prescription saved');
      onSaved?.(rx);
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open} onClose={onClose} size="lg" title="New prescription"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="rx-form" loading={busy}>Save prescription</Button></>}
    >
      {allergies && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">⚠ Allergies: {allergies}</p>
      )}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q.drug} type="button" onClick={() => addQuick(q)}
            className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800">
            + {q.drug}
          </button>
        ))}
      </div>
      <form id="rx-form" onSubmit={submit} className="space-y-3">
        {items.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
            <Input className="col-span-2" placeholder="Medicine *" value={r.drug} onChange={(e) => update(i, 'drug', e.target.value)} required={i === 0} />
            <Input placeholder="Dose" value={r.dosage} onChange={(e) => update(i, 'dosage', e.target.value)} />
            <Input placeholder="1-0-1" value={r.frequency} onChange={(e) => update(i, 'frequency', e.target.value)} />
            <Input placeholder="Duration" value={r.duration} onChange={(e) => update(i, 'duration', e.target.value)} />
            <div className="flex gap-2">
              <Input placeholder="Notes" value={r.instructions} onChange={(e) => update(i, 'instructions', e.target.value)} />
              {items.length > 1 && (
                <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="px-1 text-slate-400 hover:text-rose-600" aria-label="Remove">✕</button>
              )}
            </div>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => setItems((l) => [...l, { ...ROW }])}>+ Add medicine</Button>
        <Field label="Advice / notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Soft diet for 24 hours, avoid hot drinks" /></Field>
      </form>
    </Modal>
  );
}
