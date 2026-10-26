import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound, paginate, badRequest } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();
const clinical = authorize('dentist', 'receptionist');

const optStr = z.string().trim().max(2000).optional().nullable().transform((v) => (v === undefined ? undefined : v || null));
const patientSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  last_name: optStr,
  gender: z.enum(['male', 'female', 'other']).optional().nullable(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('').transform(() => null)),
  phone: z.string().trim().min(5, 'Phone is required').max(20),
  email: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
  address: optStr,
  blood_group: optStr,
  allergies: optStr,
  medical_history: optStr,
  emergency_contact_name: optStr,
  emergency_contact_phone: optStr,
  notes: optStr,
});
const FIELDS = Object.keys(patientSchema.shape);

// GET /api/patients?q=&page=&pageSize=
router.get('/', asyncHandler(async (req, res) => {
  const { limit, offset, page, pageSize } = paginate(req.query);
  const q = (req.query.q || '').trim();
  const params = [];
  let where = 'WHERE p.is_active';
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where += ` AND (lower(p.first_name || ' ' || coalesce(p.last_name,'')) LIKE $1
                 OR p.phone LIKE $1 OR lower(p.patient_code) LIKE $1)`;
  }
  const total = await query(`SELECT count(*)::int AS n FROM patients p ${where}`, params);
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT p.id, p.patient_code, p.first_name, p.last_name, p.gender, p.date_of_birth, p.phone, p.email, p.created_at,
            (SELECT max(a.start_time) FROM appointments a WHERE a.patient_id = p.id AND a.start_time <= now()) AS last_visit,
            COALESCE((SELECT sum(i.total - i.amount_paid) FROM invoices i
                      WHERE i.patient_id = p.id AND i.status IN ('unpaid','partial')), 0) AS balance_due
     FROM patients p ${where}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ data: rows, page, pageSize, total: total.rows[0].n });
}));

router.post('/', clinical, validate(patientSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const cols = [...FIELDS, 'created_by'];
  const vals = [...FIELDS.map((f) => b[f] ?? null), req.user.id];
  const { rows } = await query(
    `INSERT INTO patients (${cols.join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    vals
  );
  await audit(req, 'create', 'patient', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM patients WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Patient');
  await audit(req, 'view', 'patient', req.params.id);
  res.json(rows[0]);
}));

router.put('/:id', clinical, validate(patientSchema.partial()), asyncHandler(async (req, res) => {
  const b = req.body;
  const keys = FIELDS.filter((f) => b[f] !== undefined);
  if (!keys.length) throw badRequest('Nothing to update');
  const { rows } = await query(
    `UPDATE patients SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}
     WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => b[k]), req.params.id]
  );
  if (!rows[0]) throw notFound('Patient');
  await audit(req, 'update', 'patient', req.params.id, { fields: keys });
  res.json(rows[0]);
}));

// Soft delete (archive) - clinical records must be retained
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await query('UPDATE patients SET is_active = false WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Patient');
  await audit(req, 'archive', 'patient', req.params.id);
  res.status(204).end();
}));

// GET /api/patients/:id/summary - everything the patient profile page needs
router.get('/:id/summary', asyncHandler(async (req, res) => {
  const id = req.params.id;
  const [appts, treatments, invoices, totals] = await Promise.all([
    query(
      `SELECT a.id, a.start_time, a.end_time, a.status, a.reason, u.name AS dentist_name
       FROM appointments a JOIN users u ON u.id = a.dentist_id
       WHERE a.patient_id = $1 ORDER BY a.start_time DESC LIMIT 50`, [id]),
    query(
      `SELECT t.*, pr.name AS procedure_name, pr.code AS procedure_code, u.name AS dentist_name,
              EXISTS (SELECT 1 FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
                      WHERE ii.treatment_id = t.id AND i.status <> 'void') AS invoiced
       FROM treatments t
       JOIN procedures pr ON pr.id = t.procedure_id
       LEFT JOIN users u ON u.id = t.dentist_id
       WHERE t.patient_id = $1 ORDER BY t.created_at DESC`, [id]),
    query(
      `SELECT id, invoice_number, issue_date, total, amount_paid, status
       FROM invoices WHERE patient_id = $1 ORDER BY issue_date DESC, id DESC`, [id]),
    query(
      `SELECT
         COALESCE(sum(total) FILTER (WHERE status <> 'void'), 0) AS billed,
         COALESCE(sum(amount_paid) FILTER (WHERE status <> 'void'), 0) AS paid,
         COALESCE(sum(total - amount_paid) FILTER (WHERE status IN ('unpaid','partial')), 0) AS due
       FROM invoices WHERE patient_id = $1`, [id]),
  ]);
  res.json({
    appointments: appts.rows,
    treatments: treatments.rows,
    invoices: invoices.rows,
    totals: totals.rows[0],
  });
}));

// ---------------------------------------------------------------------------
// Dental chart
// ---------------------------------------------------------------------------
const CONDITIONS = ['healthy', 'caries', 'filled', 'crown', 'root_canal', 'missing', 'implant',
  'bridge', 'fractured', 'extraction_needed', 'sensitive'];
const toothNumber = z.coerce.number().int().refine(
  (n) => Math.floor(n / 10) >= 1 && Math.floor(n / 10) <= 4 && n % 10 >= 1 && n % 10 <= 8,
  'Invalid FDI tooth number (11-48)'
);

// Current state of every charted tooth + full history
router.get('/:id/chart', asyncHandler(async (req, res) => {
  const [current, history] = await Promise.all([
    query(
      `SELECT DISTINCT ON (tooth_number) tooth_number, condition, surfaces, notes, recorded_at
       FROM tooth_records WHERE patient_id = $1
       ORDER BY tooth_number, recorded_at DESC, id DESC`, [req.params.id]),
    query(
      `SELECT tr.*, u.name AS recorded_by_name FROM tooth_records tr
       LEFT JOIN users u ON u.id = tr.recorded_by
       WHERE tr.patient_id = $1 ORDER BY tr.recorded_at DESC LIMIT 200`, [req.params.id]),
  ]);
  res.json({ teeth: current.rows, history: history.rows });
}));

const chartSchema = z.object({
  tooth_number: toothNumber,
  condition: z.enum(CONDITIONS),
  surfaces: z.string().trim().toUpperCase().regex(/^[MODBLI]*$/, 'Surfaces: M, O, D, B, L, I').optional().nullable(),
  notes: optStr,
});

router.post('/:id/chart', authorize('dentist'), validate(chartSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO tooth_records (patient_id, tooth_number, condition, surfaces, notes, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.params.id, b.tooth_number, b.condition, b.surfaces || null, b.notes, req.user.id]
  );
  await audit(req, 'chart', 'patient', req.params.id, { tooth: b.tooth_number, condition: b.condition });
  res.status(201).json(rows[0]);
}));

export default router;
export { toothNumber, optStr };
