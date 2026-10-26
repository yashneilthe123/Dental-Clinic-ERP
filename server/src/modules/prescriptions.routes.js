import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();

const SELECT = `
  SELECT rx.*, u.name AS dentist_name, u.specialization AS dentist_specialization,
         p.first_name || COALESCE(' ' || p.last_name, '') AS patient_name,
         p.patient_code, p.date_of_birth, p.gender, p.phone AS patient_phone, p.allergies
  FROM prescriptions rx
  JOIN users u ON u.id = rx.dentist_id
  JOIN patients p ON p.id = rx.patient_id`;

router.get('/', asyncHandler(async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.patientId) { params.push(req.query.patientId); where = 'WHERE rx.patient_id = $1'; }
  const { rows } = await query(`${SELECT} ${where} ORDER BY rx.created_at DESC LIMIT 200`, params);
  res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`${SELECT} WHERE rx.id = $1`, [req.params.id]);
  if (!rows[0]) throw notFound('Prescription');
  res.json(rows[0]);
}));

const item = z.object({
  drug: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(100).optional().default(''),
  frequency: z.string().trim().max(100).optional().default(''),
  duration: z.string().trim().max(100).optional().default(''),
  instructions: z.string().trim().max(300).optional().default(''),
});
const schema = z.object({
  patient_id: z.coerce.number().int().positive(),
  items: z.array(item).min(1, 'Add at least one medicine'),
  notes: z.string().trim().max(2000).optional().nullable(),
});

router.post('/', authorize('dentist'), validate(schema), asyncHandler(async (req, res) => {
  const b = req.body;
  const dentistId = req.user.role === 'dentist' ? req.user.id : (req.body.dentist_id || req.user.id);
  const { rows } = await query(
    `INSERT INTO prescriptions (patient_id, dentist_id, items, notes) VALUES ($1, $2, $3, $4) RETURNING id`,
    [b.patient_id, dentistId, JSON.stringify(b.items), b.notes || null]
  );
  await audit(req, 'create', 'prescription', rows[0].id);
  const full = await query(`${SELECT} WHERE rx.id = $1`, [rows[0].id]);
  res.status(201).json(full.rows[0]);
}));

router.delete('/:id', authorize('dentist'), asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM prescriptions WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Prescription');
  await audit(req, 'delete', 'prescription', req.params.id);
  res.status(204).end();
}));

export default router;
