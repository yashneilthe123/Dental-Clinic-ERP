import { cx } from './ui.jsx';

// FDI two-digit notation. Displayed as the dentist sees the patient (patient's right on the left).
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export const CONDITIONS = {
  healthy:           { label: 'Healthy',           fill: '#ffffff', stroke: '#cbd5e1' },
  caries:            { label: 'Caries',            fill: '#fb7185', stroke: '#e11d48' },
  filled:            { label: 'Filled',            fill: '#38bdf8', stroke: '#0284c7' },
  crown:             { label: 'Crown',             fill: '#fbbf24', stroke: '#d97706' },
  root_canal:        { label: 'Root canal',        fill: '#a78bfa', stroke: '#7c3aed' },
  implant:           { label: 'Implant',           fill: '#2dd4bf', stroke: '#0d9488' },
  bridge:            { label: 'Bridge',            fill: '#fdba74', stroke: '#ea580c' },
  fractured:         { label: 'Fractured',         fill: '#f87171', stroke: '#b91c1c' },
  sensitive:         { label: 'Sensitive',         fill: '#fde047', stroke: '#ca8a04' },
  extraction_needed: { label: 'Extraction needed', fill: '#fecdd3', stroke: '#e11d48' },
  missing:           { label: 'Missing',           fill: '#e2e8f0', stroke: '#94a3b8' },
};

export const toothName = (n) => {
  const q = Math.floor(n / 10);
  const t = n % 10;
  const side = q === 1 || q === 4 ? 'right' : 'left';
  const arch = q <= 2 ? 'upper' : 'lower';
  const kind = ['', 'central incisor', 'lateral incisor', 'canine', '1st premolar', '2nd premolar', '1st molar', '2nd molar', '3rd molar (wisdom)'][t];
  return `${arch} ${side} ${kind}`;
};

const isAnterior = (n) => n % 10 <= 3;

/**
 * Five-surface tooth: the centre is Occlusal (back teeth) or Incisal (front teeth).
 * Upper teeth: top = Buccal, bottom = Lingual/palatal. Lower teeth: the reverse.
 * Mesial always faces the midline.
 */
function Tooth({ number, state, selected, onClick }) {
  const q = Math.floor(number / 10);
  const upper = q <= 2;
  const mesialOnRight = q === 1 || q === 4;
  const cond = CONDITIONS[state?.condition] || CONDITIONS.healthy;
  const surfaces = (state?.surfaces || '').toUpperCase();
  const whole = !surfaces; // condition applies to the whole tooth

  const center = isAnterior(number) ? 'I' : 'O';
  const regions = {
    top: upper ? 'B' : 'L',
    bottom: upper ? 'L' : 'B',
    left: mesialOnRight ? 'D' : 'M',
    right: mesialOnRight ? 'M' : 'D',
    center,
  };
  const paint = (s) => (whole || surfaces.includes(s) || (s === 'O' && surfaces.includes('I')) || (s === 'I' && surfaces.includes('O')))
    ? cond.fill : '#ffffff';
  const stroke = selected ? '#0f766e' : cond === CONDITIONS.healthy ? '#cbd5e1' : cond.stroke;
  const missing = state?.condition === 'missing';

  return (
    <button
      type="button"
      onClick={() => onClick(number)}
      title={`${number} · ${toothName(number)}${state ? ` · ${cond.label}` : ''}`}
      className={cx('group flex flex-col items-center gap-0.5 rounded-lg p-0.5 transition sm:p-1', selected ? 'bg-brand-50 ring-2 ring-brand-600' : 'hover:bg-slate-100')}
    >
      {upper && <span className={cx('text-[11px] font-semibold', selected ? 'text-brand-800' : 'text-slate-500')}>{number}</span>}
      <svg viewBox="0 0 40 40" className="h-7 w-7 sm:h-8 sm:w-8">
        <g stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" opacity={missing ? 0.45 : 1}>
          <polygon points="2,2 38,2 28,12 12,12" fill={paint(regions.top)} />
          <polygon points="12,28 28,28 38,38 2,38" fill={paint(regions.bottom)} />
          <polygon points="2,2 12,12 12,28 2,38" fill={paint(regions.left)} />
          <polygon points="28,12 38,2 38,38 28,28" fill={paint(regions.right)} />
          <rect x="12" y="12" width="16" height="16" fill={paint(regions.center)} />
        </g>
        {missing && <path d="M6 6 L34 34 M34 6 L6 34" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />}
        {state?.condition === 'extraction_needed' && (
          <rect x="1" y="1" width="38" height="38" fill="none" stroke="#e11d48" strokeWidth="1.5" strokeDasharray="3 2" />
        )}
      </svg>
      {!upper && <span className={cx('text-[11px] font-semibold', selected ? 'text-brand-800' : 'text-slate-500')}>{number}</span>}
    </button>
  );
}

/** teeth: [{ tooth_number, condition, surfaces }] — the latest record per tooth */
export default function Odontogram({ teeth = [], selected, onSelect }) {
  const byTooth = Object.fromEntries(teeth.map((t) => [t.tooth_number, t]));
  const row = (nums) => (
    <div className="flex justify-center">
      {nums.map((n, i) => (
        <div key={n} className={cx('flex', i === 7 && 'mr-1.5 border-r-2 border-dashed border-slate-300 pr-1.5 sm:mr-2 sm:pr-2')}>
          <Tooth number={n} state={byTooth[n]} selected={selected === n} onClick={onSelect} />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div className="mx-auto w-max">
          <p className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Upper · Maxilla</p>
          {row(UPPER)}
          <div className="my-2 flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-400">
            <span>Patient right</span>
            <span className="h-px flex-1 bg-slate-200" />
            <span>Patient left</span>
          </div>
          {row(LOWER)}
          <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Lower · Mandible</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {Object.entries(CONDITIONS).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-3 w-3 rounded-sm border" style={{ background: c.fill, borderColor: c.stroke }} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
