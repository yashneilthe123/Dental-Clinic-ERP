const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
export const money = (n) => inr.format(Number(n || 0));

export const fmtDate = (d) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

export const fmtDateTime = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '—');

export const age = (dob) => {
  if (!dob) return null;
  const b = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a -= 1;
  return a;
};

export const fullName = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ');

export const titleCase = (s = '') => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** 'YYYY-MM-DD' for a local Date */
export const isoDay = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

/** Value for <input type="datetime-local"> from an ISO string / Date */
export const toLocalInput = (d) => {
  const x = new Date(d);
  const z = new Date(x.getTime() - x.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
};

/** datetime-local value -> ISO string with timezone (what the API expects) */
export const fromLocalInput = (v) => new Date(v).toISOString();
