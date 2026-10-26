import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDateTime, fmtTime } from '../lib/format.js';
import { Button, Card, Loading, Modal, PageHeader, Select, StatusBadge, cx } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import AppointmentForm from '../components/AppointmentForm.jsx';

const HOUR_PX = 64;
const NO_DENTISTS = [];
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => { const x = startOfDay(d); const day = (x.getDay() + 6) % 7; return addDays(x, -day); }; // Monday
const sameDay = (a, b) => a.toDateString() === b.toDateString();

const NEXT_STATUS = {
  scheduled: ['confirmed', 'arrived', 'cancelled', 'no_show'],
  confirmed: ['arrived', 'cancelled', 'no_show'],
  arrived: ['in_progress', 'completed'],
  in_progress: ['completed'],
  completed: [],
  cancelled: ['scheduled'],
  no_show: ['scheduled'],
};

export default function Appointments() {
  const { can, user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(() => (window.innerWidth < 768 ? 'day' : 'week'));
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [dentistId, setDentistId] = useState(user.role === 'dentist' ? String(user.id) : '');
  const [formState, setFormState] = useState(null); // { initial } | { appointment }
  const [selected, setSelected] = useState(null);

  const settings = useApi(() => api.get('/settings'));
  const dentists = useApi(() => api.get('/users/dentists'));
  const open = settings.data?.opening_hour ?? 9;
  const close = settings.data?.closing_hour ?? 20;

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    const s = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [view, anchor]);
  const from = days[0];
  const to = addDays(days[days.length - 1], 1);

  const appts = useApi(
    () => api.get(`/appointments${qs({ from: from.toISOString(), to: to.toISOString(), dentistId, all: dentistId ? undefined : 1 })}`),
    [from.getTime(), to.getTime(), dentistId]
  );

  // Open the booking form from ?new=1 (e.g. from the dashboard or a patient's page)
  useEffect(() => {
    if (params.get('new') === '1') {
      const pid = params.get('patientId');
      setFormState({ initial: { patient: pid ? { id: Number(pid), name: params.get('patientName') || 'Patient' } : null, dentistId: dentistId || undefined } });
      setParams({}, { replace: true });
    }
  }, [params, setParams, dentistId]);

  const changeStatus = async (a, status) => {
    try {
      const updated = await api.patch(`/appointments/${a.id}/status`, { status });
      toast(`Marked ${status.replace('_', ' ')}`);
      setSelected(updated);
      appts.reload();
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (a) => {
    if (!confirm('Delete this appointment permanently?')) return;
    try {
      await api.del(`/appointments/${a.id}`);
      toast('Appointment deleted');
      setSelected(null);
      appts.reload();
    } catch (err) { toast(err.message, 'error'); }
  };

  const hours = Array.from({ length: close - open }, (_, i) => open + i);
  const step = view === 'day' ? 1 : 7;
  const title = view === 'day'
    ? anchor.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${addDays(to, -1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const clickSlot = (day, hour, e) => {
    if (!can('receptionist', 'dentist')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = (e.clientY - rect.top) / HOUR_PX * 60;
    const start = new Date(day);
    start.setHours(hour, Math.floor(minutes / 15) * 15, 0, 0);
    setFormState({ initial: { start, dentistId: dentistId || undefined } });
  };

  return (
    <>
      <PageHeader
        title="Appointments"
        subtitle={title}
        actions={
          <>
            <Select value={dentistId} onChange={(e) => setDentistId(e.target.value)} className="w-auto">
              <option value="">All dentists</option>
              {(dentists.data || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
              {['day', 'week'].map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={cx('rounded-md px-3 py-1.5 text-sm font-semibold capitalize', view === v ? 'bg-brand-700 text-white' : 'text-slate-600')}>
                  {v}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => setAnchor(addDays(anchor, -step))} aria-label="Previous">‹</Button>
            <Button variant="secondary" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
            <Button variant="secondary" onClick={() => setAnchor(addDays(anchor, step))} aria-label="Next">›</Button>
            {can('receptionist', 'dentist') && <Button onClick={() => setFormState({ initial: { dentistId: dentistId || undefined } })}>+ Book</Button>}
          </>
        }
      />

      <Card className="overflow-hidden">
        {settings.loading || (appts.loading && !appts.data) ? <Loading /> : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: view === 'week' ? 860 : 0 }}>
              {/* Day headers */}
              <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
                <div />
                {days.map((d) => (
                  <button key={d.toISOString()} onClick={() => { setAnchor(d); setView('day'); }}
                    className={cx('border-l border-slate-100 py-2.5 text-center', sameDay(d, new Date()) && 'bg-brand-50')}>
                    <p className="text-[11px] font-semibold uppercase text-slate-500">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</p>
                    <p className={cx('text-lg font-bold', sameDay(d, new Date()) ? 'text-brand-700' : 'text-slate-900')}>{d.getDate()}</p>
                  </button>
                ))}
              </div>

              {/* Time grid */}
              <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
                <div>
                  {hours.map((h) => (
                    <div key={h} style={{ height: HOUR_PX }} className="relative">
                      <span className="absolute right-2 top-1 text-[11px] text-slate-400">
                        {new Date(2000, 0, 1, h).toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true })}
                      </span>
                    </div>
                  ))}
                </div>
                {days.map((day) => {
                  const list = (appts.data || []).filter((a) => sameDay(new Date(a.start_time), day));
                  return (
                    <div key={day.toISOString()} className="relative border-l border-slate-100">
                      {hours.map((h) => (
                        <div key={h} style={{ height: HOUR_PX }} onClick={(e) => clickSlot(day, h, e)}
                          className={cx('border-b border-slate-100', can('receptionist', 'dentist') && 'cursor-pointer hover:bg-brand-50/40')} />
                      ))}
                      {sameDay(day, new Date()) && <NowLine open={open} close={close} />}
                      {layout(list).map(({ a, col, cols }) => {
                        const s = new Date(a.start_time);
                        const e = new Date(a.end_time);
                        const top = ((s.getHours() + s.getMinutes() / 60) - open) * HOUR_PX;
                        const height = Math.max(22, ((e - s) / 3600000) * HOUR_PX - 2);
                        const faded = ['cancelled', 'no_show'].includes(a.status);
                        return (
                          <button
                            key={a.id}
                            onClick={() => setSelected(a)}
                            className={cx('absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-xs shadow-sm transition hover:z-10 hover:shadow-md', faded ? 'bg-slate-100 opacity-60' : 'bg-white')}
                            style={{
                              top: Math.max(0, top), height,
                              left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`,
                              borderLeftColor: a.dentist_color,
                              backgroundColor: faded ? undefined : `${a.dentist_color}14`,
                            }}
                          >
                            <p className={cx('truncate font-semibold text-slate-900', faded && 'line-through')}>{a.patient_name}</p>
                            {height > 34 && <p className="truncate text-slate-500">{fmtTime(a.start_time)} · {a.reason || a.dentist_name}</p>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Appointment details */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Appointment" size="sm"
        footer={selected && can('receptionist', 'dentist') && (
          <>
            {can('receptionist') && ['scheduled', 'confirmed', 'cancelled', 'no_show'].includes(selected.status) && (
              <Button variant="ghost" className="mr-auto text-rose-600" onClick={() => remove(selected)}>Delete</Button>
            )}
            <Button variant="secondary" onClick={() => { setFormState({ appointment: selected }); setSelected(null); }}>Edit</Button>
          </>
        )}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div>
              <Link to={`/patients/${selected.patient_id}`} className="text-lg font-bold text-slate-900 hover:text-brand-700">{selected.patient_name}</Link>
              <p className="text-slate-500">{selected.patient_code} · {selected.patient_phone}</p>
            </div>
            <dl className="grid grid-cols-3 gap-y-2">
              <dt className="text-slate-500">When</dt><dd className="col-span-2 font-medium">{fmtDateTime(selected.start_time)} – {fmtTime(selected.end_time)}</dd>
              <dt className="text-slate-500">Dentist</dt><dd className="col-span-2 font-medium">{selected.dentist_name}</dd>
              <dt className="text-slate-500">Reason</dt><dd className="col-span-2">{selected.reason || '—'}</dd>
              {selected.notes && <><dt className="text-slate-500">Notes</dt><dd className="col-span-2">{selected.notes}</dd></>}
              <dt className="text-slate-500">Status</dt><dd className="col-span-2"><StatusBadge status={selected.status} /></dd>
            </dl>
            {can('receptionist', 'dentist') && NEXT_STATUS[selected.status].length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {NEXT_STATUS[selected.status].map((s) => (
                  <Button key={s} size="sm" variant={['cancelled', 'no_show'].includes(s) ? 'ghost' : 'secondary'} onClick={() => changeStatus(selected, s)}>
                    Mark {s.replace('_', ' ')}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <AppointmentForm
        open={!!formState}
        onClose={() => setFormState(null)}
        dentists={dentists.data || NO_DENTISTS}
        initial={formState?.initial}
        appointment={formState?.appointment}
        defaultDuration={settings.data?.slot_minutes || 30}
        onSaved={appts.reload}
      />
    </>
  );
}

function NowLine({ open, close }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < open || h > close) return null;
  return (
    <div className="pointer-events-none absolute left-0 right-0 z-[5] border-t-2 border-rose-500" style={{ top: (h - open) * HOUR_PX }}>
      <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-rose-500" />
    </div>
  );
}

/** Place overlapping appointments side by side (different dentists can overlap). */
function layout(list) {
  const sorted = [...list].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const out = [];
  let group = [];
  let groupEnd = 0;
  const flush = () => {
    const columns = [];
    for (const a of group) {
      const s = new Date(a.start_time).getTime();
      let c = columns.findIndex((end) => end <= s);
      if (c === -1) { c = columns.length; columns.push(0); }
      columns[c] = new Date(a.end_time).getTime();
      out.push({ a, col: c });
    }
    for (const o of out.slice(out.length - group.length)) o.cols = columns.length;
    group = [];
  };
  for (const a of sorted) {
    const s = new Date(a.start_time).getTime();
    if (group.length && s >= groupEnd) flush();
    group.push(a);
    groupEnd = Math.max(groupEnd, new Date(a.end_time).getTime());
  }
  if (group.length) flush();
  return out;
}
