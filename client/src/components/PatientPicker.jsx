import { useEffect, useRef, useState } from 'react';
import { api, qs } from '../lib/api.js';
import { useDebounced } from '../lib/hooks.js';
import { fullName } from '../lib/format.js';
import { Input } from './ui.jsx';

/** Search-as-you-type patient selector. value = { id, name } | null */
export default function PatientPicker({ value, onChange, autoFocus }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q, 250);
  const box = useRef(null);

  useEffect(() => {
    if (!debounced) { setResults([]); return; }
    api.get(`/patients${qs({ q: debounced, pageSize: 8 })}`).then((r) => setResults(r.data)).catch(() => setResults([]));
  }, [debounced]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
        <span className="font-semibold text-brand-900">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-brand-700 hover:underline">Change</button>
      </div>
    );
  }

  return (
    <div className="relative" ref={box}>
      <Input
        autoFocus={autoFocus}
        placeholder="Search by name, phone or patient ID…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => { onChange({ id: p.id, name: fullName(p) }); setQ(''); setOpen(false); }}
              >
                <span className="font-medium">{fullName(p)}</span>
                <span className="text-xs text-slate-500">{p.patient_code} · {p.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
