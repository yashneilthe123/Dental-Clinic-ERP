import { useEffect } from 'react';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

const BTN = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

export function Button({ variant = 'primary', size = 'md', className, loading, children, ...props }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        BTN[variant],
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Field({ label, error, children, className, hint }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

export const Input = ({ className, ...p }) => <input className={cx('input', className)} {...p} />;
export const Textarea = ({ className, ...p }) => <textarea rows={3} className={cx('input', className)} {...p} />;
export const Select = ({ className, children, ...p }) => (
  <select className={cx('input pr-8', className)} {...p}>{children}</select>
);

export function Card({ className, children, title, action }) {
  return (
    <div className={cx('card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-sm font-bold">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

const BADGE = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  teal: 'bg-brand-50 text-brand-800 ring-brand-600/20',
};
export function Badge({ color = 'gray', children }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ring-slate-500/10', BADGE[color])}>
      {children}
    </span>
  );
}

const STATUS_COLORS = {
  // appointments
  scheduled: 'blue', confirmed: 'teal', arrived: 'violet', in_progress: 'amber', completed: 'green',
  cancelled: 'gray', no_show: 'red',
  // treatments
  planned: 'blue',
  // invoices
  unpaid: 'red', partial: 'amber', paid: 'green', void: 'gray',
};
export function StatusBadge({ status }) {
  return <Badge color={STATUS_COLORS[status] || 'gray'}>{String(status).replace(/_/g, ' ')}</Badge>;
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-brand-700">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function Empty({ title = 'Nothing here yet', children }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
      <div className="absolute inset-0" onClick={onClose} />
      <div className={cx('relative w-full rounded-2xl bg-white shadow-xl', width)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition',
            value === t.value ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, sub, accent = 'brand' }) {
  const bar = { brand: 'bg-brand-600', amber: 'bg-amber-500', rose: 'bg-rose-500', sky: 'bg-sky-500', violet: 'bg-violet-500' }[accent];
  return (
    <div className="card relative overflow-hidden p-5">
      <span className={cx('absolute inset-y-0 left-0 w-1', bar)} />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>Page {page} of {pages} · {total} records</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
