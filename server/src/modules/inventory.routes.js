import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound, badRequest, round2 } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();
const manage = authorize('receptionist');

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
const supplierSchema = z.object({
  name: z.string().trim().min(2).max(200),
  contact_person: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
  address: z.string().trim().max(500).optional().nullable(),
});

router.get('/suppliers', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT s.*, (SELECT count(*)::int FROM inventory_items i WHERE i.supplier_id = s.id AND i.is_active) AS item_count
     FROM suppliers s ORDER BY s.name`);
  res.json(rows);
}));

router.post('/suppliers', manage, validate(supplierSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.name, b.contact_person || null, b.phone || null, b.email || null, b.address || null]
  );
  await audit(req, 'create', 'supplier', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.put('/suppliers/:id', manage, validate(supplierSchema.partial()), asyncHandler(async (req, res) => {
  const keys = Object.keys(req.body).filter((k) => req.body[k] !== undefined);
  if (!keys.length) throw badRequest('Nothing to update');
  const { rows } = await query(
    `UPDATE suppliers SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => req.body[k]), req.params.id]
  );
  if (!rows[0]) throw notFound('Supplier');
  res.json(rows[0]);
}));

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
const ITEM_SELECT = `
  SELECT i.*, s.name AS supplier_name,
         (i.quantity <= i.reorder_level) AS low_stock,
         (i.expiry_date IS NOT NULL AND i.expiry_date <= current_date + 30) AS expiring_soon
  FROM inventory_items i LEFT JOIN suppliers s ON s.id = i.supplier_id`;

// GET /api/inventory?q=&category=&lowStock=1
router.get('/', asyncHandler(async (req, res) => {
  const where = ['i.is_active'];
  const params = [];
  if (req.query.q) {
    params.push(`%${String(req.query.q).toLowerCase()}%`);
    where.push(`(lower(i.name) LIKE $${params.length} OR lower(i.sku) LIKE $${params.length})`);
  }
  if (req.query.category) { params.push(req.query.category); where.push(`i.category = $${params.length}`); }
  if (req.query.lowStock === '1') where.push('i.quantity <= i.reorder_level');
  const { rows } = await query(`${ITEM_SELECT} WHERE ${where.join(' AND ')} ORDER BY i.name`, params);
  res.json(rows);
}));

const itemSchema = z.object({
  sku: z.string().trim().min(1).max(50).toUpperCase(),
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().max(100).optional(),
  unit: z.string().trim().max(30).optional(),
  reorder_level: z.coerce.number().min(0).optional(),
  unit_cost: z.coerce.number().min(0).optional(),
  supplier_id: z.coerce.number().int().positive().optional().nullable(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('').transform(() => null)),
});

router.post('/', manage, validate(itemSchema.extend({ quantity: z.coerce.number().min(0).optional() })),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const id = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO inventory_items (sku, name, category, unit, quantity, reorder_level, unit_cost, supplier_id, expiry_date)
         VALUES ($1,$2,COALESCE($3,'Consumables'),COALESCE($4,'pcs'),$5,COALESCE($6,0),COALESCE($7,0),$8,$9) RETURNING id`,
        [b.sku, b.name, b.category || null, b.unit || null, b.quantity || 0, b.reorder_level ?? null,
          b.unit_cost ?? null, b.supplier_id || null, b.expiry_date || null]
      );
      if (b.quantity > 0) {
        await db.query(
          `INSERT INTO stock_movements (item_id, type, quantity, reason, user_id) VALUES ($1,'in',$2,'Opening stock',$3)`,
          [rows[0].id, b.quantity, req.user.id]
        );
      }
      return rows[0].id;
    });
    await audit(req, 'create', 'inventory_item', id);
    res.status(201).json((await query(`${ITEM_SELECT} WHERE i.id = $1`, [id])).rows[0]);
  }));

// Quantity is intentionally NOT editable here - use stock movements so there's a trail
router.put('/:id', manage, validate(itemSchema.partial().extend({ is_active: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const keys = Object.keys(req.body).filter((k) => req.body[k] !== undefined);
    if (!keys.length) throw badRequest('Nothing to update');
    const { rowCount } = await query(
      `UPDATE inventory_items SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => req.body[k]), req.params.id]
    );
    if (!rowCount) throw notFound('Inventory item');
    await audit(req, 'update', 'inventory_item', req.params.id, { fields: keys });
    res.json((await query(`${ITEM_SELECT} WHERE i.id = $1`, [req.params.id])).rows[0]);
  }));

router.get('/:id/movements', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT m.*, u.name AS user_name FROM stock_movements m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.item_id = $1 ORDER BY m.created_at DESC LIMIT 200`, [req.params.id]);
  res.json(rows);
}));

const movementSchema = z.object({
  type: z.enum(['in', 'out', 'adjust']),
  quantity: z.coerce.number().refine((n) => n !== 0, 'Quantity cannot be zero'),
  reason: z.string().trim().max(300).optional().nullable(),
  unit_cost: z.coerce.number().min(0).optional(), // update cost when receiving stock
});

// POST /api/inventory/:id/movements  { type: in|out|adjust, quantity }
router.post('/:id/movements', authorize('receptionist', 'dentist'), validate(movementSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  if (b.type !== 'adjust' && b.quantity < 0) throw badRequest('Quantity must be positive for stock in/out');
  if (b.type === 'in' && req.user.role === 'dentist') throw badRequest('Only reception/admin can receive stock');
  await withTransaction(async (db) => {
    const item = (await db.query('SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!item) throw notFound('Inventory item');
    const delta = b.type === 'in' ? b.quantity : b.type === 'out' ? -b.quantity : b.quantity;
    const next = round2(item.quantity + delta);
    if (next < 0) throw badRequest(`Not enough stock. Only ${item.quantity} ${item.unit} available.`);
    await db.query(
      `UPDATE inventory_items SET quantity = $1, unit_cost = COALESCE($2, unit_cost) WHERE id = $3`,
      [next, b.type === 'in' && b.unit_cost !== undefined ? b.unit_cost : null, item.id]
    );
    await db.query(
      `INSERT INTO stock_movements (item_id, type, quantity, reason, user_id) VALUES ($1,$2,$3,$4,$5)`,
      [item.id, b.type, b.quantity, b.reason || null, req.user.id]
    );
    await audit(req, 'stock_' + b.type, 'inventory_item', item.id, { quantity: b.quantity }, db);
  });
  res.status(201).json((await query(`${ITEM_SELECT} WHERE i.id = $1`, [req.params.id])).rows[0]);
}));

export default router;
