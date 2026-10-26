import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound, badRequest, conflict } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { toothNumber } from './patients.routes.js';

const router = Router();
const STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];

const SELECT = `
  SELECT t.*, pr.name AS procedure_name, pr.code AS procedure_code, u.name AS dentist_name,
         p.first_name || COALESCE(' ' || p.last_name, '') AS patient_name,
         EXISTS (SELECT 1 FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
                 WHERE ii.treatment_id = t.id AND i.status <> 'void') AS invoiced
  FROM treatments t
  JOIN procedures pr ON pr.id = t.procedure_id
  JOIN patients p ON p.id = t.patient_id
  LEFT JOIN users u ON u.id = t.dentist_id`;

// GET /api/treatments?patientId=&status=&unbilled=1
router.get('/', asyncHandler(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.patientId) { params.push(req.query.patientId); where.push(`t.patient_id = $${params.length}`); }
  if (req.query.status) { params.push(String(req.query.status).split(',')); where.push(`t.status = ANY($${params.length})`); }
  if (req.query.unbilled === '1') {
    where.push(`t.status = 'completed' AND NOT EXISTS (SELECT 1 FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
                WHERE ii.treatment_id = t.id AND i.status <> 'void')`);
  }
  const { rows } = await query(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.created_at DESC LIMIT 500`,
    params
  );
  res.json(rows);
}));

const schema = z.object({
  patient_id: z.coerce.number().int().positive(),
  procedure_id: z.coerce.number().int().positive(),
  dentist_id: z.coerce.number().int().positive().optional().nullable(),
  appointment_id: z.coerce.number().int().positive().optional().nullable(),
  tooth_number: toothNumber.optional().nullable(),
  surfaces: z.string().trim().toUpperCase().regex(/^[MODBLI]*$/).optional().nullable(),
  status: z.enum(STATUSES).optional(),
  price: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

router.post('/', authorize('dentist'), validate(schema), asyncHandler(async (req, res) => {
  const b = req.body;
  const proc = await query('SELECT default_price FROM procedures WHERE id = $1 AND is_active', [b.procedure_id]);
  if (!proc.rows[0]) throw badRequest('Unknown procedure');
  const status = b.status || 'planned';
  const dentistId = b.dentist_id || (req.user.role === 'dentist' ? req.user.id : null);
  const { rows } = await query(
    `INSERT INTO treatments (patient_id, procedure_id, dentist_id, appointment_id, tooth_number, surfaces,
                             status, price, notes, performed_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $7 = 'completed' THEN now() END, $10) RETURNING id`,
    [b.patient_id, b.procedure_id, dentistId, b.appointment_id || null, b.tooth_number || null, b.surfaces || null,
      status, b.price ?? proc.rows[0].default_price, b.notes || null, req.user.id]
  );
  await audit(req, 'create', 'treatment', rows[0].id);
  const full = await query(`${SELECT} WHERE t.id = $1`, [rows[0].id]);
  res.status(201).json(full.rows[0]);
}));

router.put('/:id', authorize('dentist'), validate(schema.partial()), asyncHandler(async (req, res) => {
  const current = await query(`${SELECT} WHERE t.id = $1`, [req.params.id]);
  if (!current.rows[0]) throw notFound('Treatment');
  const b = req.body;
  if (current.rows[0].invoiced && (b.price !== undefined || b.status === 'cancelled')) {
    throw conflict('This treatment is already invoiced. Void the invoice before changing price or cancelling.');
  }
  const keys = ['procedure_id', 'dentist_id', 'tooth_number', 'surfaces', 'status', 'price', 'notes'].filter((k) => b[k] !== undefined);
  if (!keys.length) throw badRequest('Nothing to update');
  const params = [...keys.map((k) => b[k]), req.params.id];
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  if (b.status === 'completed') sets.push('performed_at = COALESCE(performed_at, now())');
  await query(`UPDATE treatments SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  await audit(req, 'update', 'treatment', req.params.id, { fields: keys });
  const full = await query(`${SELECT} WHERE t.id = $1`, [req.params.id]);
  res.json(full.rows[0]);
}));

router.delete('/:id', authorize('dentist'), asyncHandler(async (req, res) => {
  const { rowCount } = await query(
    `DELETE FROM treatments t WHERE t.id = $1 AND t.status = 'planned'
       AND NOT EXISTS (SELECT 1 FROM invoice_items ii WHERE ii.treatment_id = t.id)`,
    [req.params.id]
  );
  if (!rowCount) throw badRequest('Only planned, un-invoiced treatments can be deleted (cancel it instead)');
  await audit(req, 'delete', 'treatment', req.params.id);
  res.status(204).end();
}));

export default router;
