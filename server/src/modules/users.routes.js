import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound, badRequest } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();
const ROLES = ['admin', 'dentist', 'receptionist', 'accountant'];
const COLS = 'id, name, email, role, phone, specialization, color, is_active, last_login_at, created_at';

// Any logged-in user can list dentists (needed for appointment booking)
router.get('/dentists', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, specialization, color FROM users
     WHERE role = 'dentist' AND is_active ORDER BY name`
  );
  res.json(rows);
}));

router.get('/', authorize('admin'), asyncHandler(async (_req, res) => {
  const { rows } = await query(`SELECT ${COLS} FROM users ORDER BY is_active DESC, name`);
  res.json(rows);
}));

const createSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(ROLES),
  phone: z.string().trim().optional().nullable(),
  specialization: z.string().trim().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

router.post('/', authorize('admin'), validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const hash = await bcrypt.hash(b.password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, phone, specialization, color)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, '#0d9488')) RETURNING ${COLS}`,
    [b.name, b.email, hash, b.role, b.phone || null, b.specialization || null, b.color || null]
  );
  await audit(req, 'create', 'user', rows[0].id, { email: b.email, role: b.role });
  res.status(201).json(rows[0]);
}));

const updateSchema = createSchema.partial().extend({ is_active: z.boolean().optional() });

router.put('/:id', authorize('admin'), validate(updateSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body;
  if (id === req.user.id && (b.is_active === false || (b.role && b.role !== 'admin'))) {
    throw badRequest('You cannot deactivate or demote your own account');
  }
  const fields = [];
  const values = [];
  const set = (col, val) => { values.push(val); fields.push(`${col} = $${values.length}`); };
  for (const key of ['name', 'email', 'role', 'phone', 'specialization', 'color', 'is_active']) {
    if (b[key] !== undefined) set(key, b[key]);
  }
  if (b.password) set('password_hash', await bcrypt.hash(b.password, 10));
  if (!fields.length) throw badRequest('Nothing to update');
  values.push(id);
  const { rows } = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING ${COLS}`,
    values
  );
  if (!rows[0]) throw notFound('User');
  await audit(req, 'update', 'user', id, { ...b, password: b.password ? '***' : undefined });
  res.json(rows[0]);
}));

export default router;
