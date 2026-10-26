import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fromLocalInput, toLocalInput } from '../lib/format.js';
import { Button, Field, Input, Modal, Select, Textarea } from './ui.jsx';
import PatientPicker from './PatientPicker.jsx';
import { useToast } from './Toast.jsx';

const DURATIONS = [15, 30, 45, 60, 90, 120];

/**
 * Create / edit an appointment.
 * initial: { start: Date, dentistId, patient: {id, name} }  (for new)
 * appointment: existing appointment row (for edit)
 */
export default function AppointmentForm({ open, onClose, dentists = [], initial, appointment, onSaved, defaultDuration = 30 }) {
  const toast = useToast();
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setPatient({ id: appointment.patient_id, name: appointment.patient_name });
      const mins = Math.round((new Date(appointment.end_time) - new Date(appointment.start_time)) / 60000);
      setForm({
        dentist_id: String(appointment.dentist_id),
        start: toLocalInput(appointment.start_time),
        duration: String(mins),
        reason: appointment.reason || '',
        notes: appointment.notes || '',
      });
    } else {
      const start = initial?.start || nextSlot();
      setPatient(initial?.patient || null);
      setForm({
        dentist_id: String(initial?.dentistId || dentists[0]?.id || ''),
        start: toLocalInput(start),
        duration: String(defaultDuration),
        reason: '',
        notes: '',
      });
    }
  }, [open, appointment, initial, dentists, defaultDuration]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!patient) return toast('Select a patient', 'error');
    setBusy(true);
    try {
      const start = new Date(form.start);
      const body = {
        patient_id: patient.id,
        dentist_id: Number(form.dentist_id),
        start_time: fromLocalInput(form.start),
        end_time: new Date(start.getTime() + Number(form.duration) * 60000).toISOString(),
        reason: form.reason || null,
        notes: form.notes || null,
      };
      const saved = appointment ? await api.put(`/appointments/${appointment.id}`, body) : await api.post('/appointments', body);
      toast(appointment ? 'Appointment updated' : 'Appointment booked');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={appointment ? 'Edit appointment' : 'Book appointment'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="appt-form" loading={busy}>{appointment ? 'Save' : 'Book'}</Button></>}
    >
      <form id="appt-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Patient *" className="sm:col-span-2">
          <PatientPicker value={patient} onChange={setPatient} autoFocus={!patient} />
        </Field>
        <Field label="Dentist *" className="sm:col-span-2">
          <Select required value={form.dentist_id} onChange={set('dentist_id')}>
            <option value="">Select dentist…</option>
            {dentists.map((d) => <option key={d.id} value={d.id}>{d.name}{d.specialization ? ` · ${d.specialization}` : ''}</option>)}
          </Select>
        </Field>
        <Field label="Start *"><Input required type="datetime-local" step="300" value={form.start || ''} onChange={set('start')} /></Field>
        <Field label="Duration">
          <Select value={form.duration} onChange={set('duration')}>
            {[...new Set([...DURATIONS, Number(form.duration) || 30])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} min</option>)}
          </Select>
        </Field>
        <Field label="Reason" className="sm:col-span-2"><Input value={form.reason} onChange={set('reason')} placeholder="e.g. RCT sitting 2, scaling, consultation" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

function nextSlot() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0);
  return d;
}
