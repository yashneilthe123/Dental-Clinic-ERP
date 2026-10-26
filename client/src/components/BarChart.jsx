import { useState } from 'react';
import { money } from '../lib/format.js';

/** Lightweight SVG bar chart for daily revenue: data = [{ day: 'YYYY-MM-DD', amount }] */
export default function BarChart({ data = [], height = 180 }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => Number(d.amount)));
  const w = 100 / Math.max(1, data.length);
  const total = data.reduce((s, d) => s + Number(d.amount), 0);
  const active = hover != null ? data[hover] : null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="text-slate-500">
          {active ? new Date(active.day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : `${data.length} days`}
        </span>
        <span className="font-bold text-slate-900">{money(active ? active.amount : total)}</span>
      </div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((d, i) => {
          const h = (Number(d.amount) / max) * (height - 4);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * w} y={0} width={w} height={height} fill="transparent" />
              <rect
                x={i * w + w * 0.18}
                y={height - Math.max(h, 1.5)}
                width={w * 0.64}
                height={Math.max(h, 1.5)}
                rx={0.6}
                className={hover === i ? 'fill-brand-800' : Number(d.amount) ? 'fill-brand-500' : 'fill-slate-200'}
              />
            </g>
          );
        })}
      </svg>
      {data.length > 0 && (
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>{new Date(data[0].day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          <span>{new Date(data[data.length - 1].day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        </div>
      )}
    </div>
  );
}
