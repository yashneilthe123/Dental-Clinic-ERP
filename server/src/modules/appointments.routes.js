import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound, badRequest } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();
const canBook = authorize('dentist', 'receptionist');

export const APPOINTMENT_STATUSES = ['scheduled', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show'];

const SELECT = `
  SELECT a.*,
         p.first_name || COALESCE(' ' || p.last_name, '') AS patient_name,
         p.patient_code, p.phone AS patient_phone,
         u.name AS dentist_name, u.color AS dentist_color
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  JOIN users u ON u.id = a.dentist_id`;

// GET /api/appointments?from=ISO&to=ISO&dentistId=&status=&patientId=
router.get('/', asyncHandler(async (req, res) => {
  const { from, to, dentistId, status, patientId } = req.query;
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (from) add('a.end_time > ?', from);
  if (to) add('a.start_time < ?', to);
  if (dentistId) add('a.dentist_id = ?', dentistId);
  if (patientId) add('a.patient_id = ?', patientId);
  if (status) add('a.status = ANY(?)', String(status).split(','));
  if (!from && !to && !patientId) where.push(`a.start_time >= date_trunc('day', now())`);
  // Dentists only see their own schedule unless they ask for everyone (?all=1)
  if (req.user.role === 'dentist' && !req.query.all && !dentistId && !patientId) add('a.dentist_id = ?', req.user.id);

  const { rows } = await query(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.start_time LIMIT 1000`,
    params
  );
  res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`${SELECT} WHERE a.id = $1`, [req.params.id]);
  if (!rows[0]) throw notFound('Appointment');
  res.json(rows[0]);
}));

const baseSchema = z.object({
  patient_id: z.coerce.number().int().positive(),
  dentist_id: z.coerce.number().int().positive(),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
});
const checkTimes = (v) => !v.start_time || !v.end_time || new Date(v.end_time) > new Date(v.start_time);

async function assertDentist(id) {
  const { rows } = await query(`SELECT 1 FROM users WHERE id = $1 AND role = 'dentist' AND is_active`, [id]);
  if (!rows[0]) throw badRequest('Selected dentist does not exist or is inactive');
}

router.post('/', canBook, validate(baseSchema.refine(checkTimes, 'End time must be after start time')),
  asyncHandler(async (req, res) => {
    const b = req.body;
    await assertDentist(b.dentist_id);
    const { rows } = await query(
      `INSERT INTO appointments (patient_id, dentist_id, start_time, end_time, reason, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'scheduled'), $8) RETURNING id`,
      [b.patient_id, b.dentist_id, b.start_time, b.end_time, b.reason || null, b.notes || null, b.status || null, req.user.id]
    );
    await audit(req, 'create', 'appointment', rows[0].id);
    const full = await query(`${SELECT} WHERE a.id = $1`, [rows[0].id]);
    res.status(201).json(full.rows[0]);
  }));

router.put('/:id', canBook, validate(baseSchema.partial().refine(checkTimes, 'End time must be after start time')),
  asyncHandler(async (req, res) => {
    const b = req.body;
    if (b.dentist_id) await assertDentist(b.dentist_id);
    const keys = ['patient_id', 'dentist_id', 'start_time', 'end_time', 'reason', 'notes', 'status'].filter((k) => b[k] !== undefined);
    if (!keys.length) throw badRequest('Nothing to update');
    const { rowCount } = await query(
      `UPDATE appointments SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}
       WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => b[k]), req.params.id]
    );
    if (!rowCount) throw notFound('Appointment');
    const full = await query(`${SELECT} WHERE a.id = $1`, [req.params.id]);
    if (full.rows[0].end_time <= full.rows[0].start_time) throw badRequest('End time must be after start time');
    await audit(req, 'update', 'appointment', req.params.id, { fields: keys });
    res.json(full.rows[0]);
  }));

router.patch('/:id/status', canBook, validate(z.object({ status: z.enum(APPOINTMENT_STATUSES) })),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('UPDATE appointments SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
    if (!rowCount) throw notFound('Appointment');
    await audit(req, 'status', 'appointment', req.params.id, { status: req.body.status });
    const full = await query(`${SELECT} WHERE a.id = $1`, [req.params.id]);
    res.json(full.rows[0]);
  }));

router.delete('/:id', authorize('receptionist'), asyncHandler(async (req, res) => {
  const { rowCount } = await query(
    `DELETE FROM appointments WHERE id = $1 AND status IN ('scheduled','confirmed','cancelled','no_show')`,
    [req.params.id]
  );
  if (!rowCount) throw badRequest('Appointment not found or already in progress/completed (cancel it instead)');
  await audit(req, 'delete', 'appointment', req.params.id);
  res.status(204).end();
}));

export default router;
