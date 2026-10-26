import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { age, fmtDate } from '../lib/format.js';
import { Button, Loading } from '../components/ui.jsx';

/** Standalone A4 page — opened in a new tab and printed with the browser. */
export default function PrescriptionPrint() {
  const { id } = useParams();
  const rx = useApi(() => api.get(`/prescriptions/${id}`), [id]);
  const clinic = useApi(() => api.get('/settings'));
  if (rx.loading || clinic.loading) return <Loading />;
  if (rx.error) return <p className="p-8 text-rose-600">{rx.error.message}</p>;
  const r = rx.data;
  const c = clinic.data;

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4">
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <div className="mx-auto min-h-[297mm] max-w-[210mm] bg-white p-12 shadow print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-brand-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-brand-800">{c.clinic_name}</h1>
            <p className="text-sm text-slate-600">{c.address}</p>
            <p className="text-sm text-slate-600">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="font-bold">{r.dentist_name}</p>
            {r.dentist_specialization && <p className="text-sm text-slate-600">{r.dentist_specialization}</p>}
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-2 text-sm">
          <p><span className="text-slate-500">Patient:</span> <b>{r.patient_name}</b> ({r.patient_code})</p>
          <p className="text-right"><span className="text-slate-500">Date:</span> {fmtDate(r.created_at)}</p>
          <p><span className="text-slate-500">Age / Sex:</span> {age(r.date_of_birth) ?? '—'} / {r.gender || '—'}</p>
          <p className="text-right"><span className="text-slate-500">Phone:</span> {r.patient_phone}</p>
          {r.allergies && <p className="col-span-2 font-semibold text-rose-700">Allergies: {r.allergies}</p>}
        </section>

        <p className="mt-8 text-3xl font-bold italic text-brand-800">℞</p>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
              <th className="py-2">#</th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Instructions</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2.5 pr-2">{i + 1}</td>
                <td className="font-semibold">{it.drug}</td>
                <td>{it.dosage}</td><td>{it.frequency}</td><td>{it.duration}</td><td>{it.instructions}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {r.notes && (
          <div className="mt-8 text-sm">
            <p className="font-semibold">Advice</p>
            <p className="whitespace-pre-line text-slate-700">{r.notes}</p>
          </div>
        )}

        <footer className="mt-24 flex justify-end">
          <div className="w-56 border-t border-slate-400 pt-2 text-center text-sm">
            <p className="font-semibold">{r.dentist_name}</p>
            <p className="text-xs text-slate-500">Signature</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
