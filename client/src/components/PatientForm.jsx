import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Field, Input, Modal, Select, Textarea } from './ui.jsx';
import { useToast } from './Toast.jsx';

const EMPTY = {
  first_name: '', last_name: '', gender: '', date_of_birth: '', phone: '', email: '', address: '',
  blood_group: '', allergies: '', medical_history: '', emergency_contact_name: '', emergency_contact_phone: '', notes: '',
};

/** Create or edit a patient. Calls onSaved(patient). */
export default function PatientForm({ open, onClose, patient, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(patient ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, patient[k] ?? ''])) : EMPTY);
    }
  }, [open, patient]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, gender: form.gender || null };
      const saved = patient ? await api.put(`/patients/${patient.id}`, body) : await api.post('/patients', body);
      toast(patient ? 'Patient updated' : `Patient ${saved.patient_code} registered`);
      onClose();
      onSaved?.(saved);
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
      size="lg"
      title={patient ? 'Edit patient' : 'Register new patient'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="patient-form" loading={busy}>{patient ? 'Save changes' : 'Register patient'}</Button>
        </>
      }
    >
      <form id="patient-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="First name *"><Input required value={form.first_name} onChange={set('first_name')} /></Field>
        <Field label="Last name"><Input value={form.last_name} onChange={set('last_name')} /></Field>
        <Field label="Phone *"><Input required type="tel" value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Gender">
          <Select value={form.gender} onChange={set('gender')}>
            <option value="">—</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} /></Field>
        <Field label="Blood group">
          <Select value={form.blood_group} onChange={set('blood_group')}>
            <option value="">—</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}
          </Select>
        </Field>
        <Field label="Address"><Input value={form.address} onChange={set('address')} /></Field>
        <Field label="Allergies" className="sm:col-span-2" hint="Drugs, latex, anaesthetics… shown as an alert on the patient profile">
          <Input value={form.allergies} onChange={set('allergies')} />
        </Field>
        <Field label="Medical history" className="sm:col-span-2" hint="Diabetes, BP, cardiac, pregnancy, current medication">
          <Textarea value={form.medical_history} onChange={set('medical_history')} />
        </Field>
        <Field label="Emergency contact name"><Input value={form.emergency_contact_name} onChange={set('emergency_contact_name')} /></Field>
        <Field label="Emergency contact phone"><Input value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}
