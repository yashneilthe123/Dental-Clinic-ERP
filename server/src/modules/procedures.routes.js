import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound, badRequest } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const all = req.query.all === '1';
  const { rows } = await query(
    `SELECT * FROM procedures ${all ? '' : 'WHERE is_active'} ORDER BY category, name`
  );
  res.json(rows);
}));

const schema = z.object({
  code: z.string().trim().min(1).max(20).toUpperCase(),
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().max(100).optional(),
  default_price: z.coerce.number().min(0),
  duration_minutes: z.coerce.number().int().positive().optional(),
  is_active: z.boolean().optional(),
});

router.post('/', authorize('admin'), validate(schema), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO procedures (code, name, category, default_price, duration_minutes)
     VALUES ($1, $2, COALESCE($3, 'General'), $4, COALESCE($5, 30)) RETURNING *`,
    [b.code, b.name, b.category || null, b.default_price, b.duration_minutes || null]
  );
  await audit(req, 'create', 'procedure', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.put('/:id', authorize('admin'), validate(schema.partial()), asyncHandler(async (req, res) => {
  const keys = Object.keys(req.body).filter((k) => req.body[k] !== undefined);
  if (!keys.length) throw badRequest('Nothing to update');
  const { rows } = await query(
    `UPDATE procedures SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}
     WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => req.body[k]), req.params.id]
  );
  if (!rows[0]) throw notFound('Procedure');
  await audit(req, 'update', 'procedure', req.params.id, req.body);
  res.json(rows[0]);
}));

export default router;
