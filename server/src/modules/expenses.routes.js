import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound, badRequest, paginate } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(authorize('receptionist', 'accountant'));

export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'credit', 'other'];
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const SELECT = `
  SELECT e.*, s.name AS supplier_name, i.name AS item_name, i.sku AS item_sku, i.unit AS item_unit, u.name AS created_by_name
  FROM expenses e
  LEFT JOIN suppliers s ON s.id = e.supplier_id
  LEFT JOIN inventory_items i ON i.id = e.item_id
  LEFT JOIN users u ON u.id = e.created_by`;

/** Builds the WHERE clause shared by the list and the summary queries. */
function filters(q) {
  const from = q.from || null;
  const to = q.to || null;
  if ((from && !dateRe.test(from)) || (to && !dateRe.test(to))) throw badRequest('from/to must be YYYY-MM-DD');
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (from) add('e.expense_date >= ?', from);
  if (to) add('e.expense_date <= ?', to);
  if (q.category) add('e.category = ?', q.category);
  if (q.supplierId) add('e.supplier_id = ?', Number(q.supplierId));
  if (q.source === 'stock' || q.source === 'manual') add('e.source = ?', q.source);
  if (q.q) add(`(lower(e.description) LIKE ? OR lower(COALESCE(e.reference,'')) LIKE ?)`, `%${String(q.q).toLowerCase()}%`);
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

// GET /api/expenses?from=&to=&category=&supplierId=&source=&q=&page=
router.get('/', asyncHandler(async (req, res) => {
  const { where, params } = filters(req.query);
  const { page, pageSize, limit, offset } = paginate(req.query);
  const n = params.length;

  const [list, totals, byCategory, bySupplier, byMonth] = await Promise.all([
    query(`${SELECT} ${where} ORDER BY e.expense_date DESC, e.id DESC LIMIT $${n + 1} OFFSET $${n + 2}`, [...params, limit, offset]),
    query(`
      SELECT count(*)::int AS count, COALESCE(sum(amount),0) AS total,
             COALESCE(sum(amount) FILTER (WHERE source = 'stock'),0) AS stock_total,
             COALESCE(sum(amount) FILTER (WHERE source = 'manual'),0) AS other_total
      FROM expenses e ${where}`, params),
    query(`SELECT category, count(*)::int AS count, sum(amount) AS amount FROM expenses e ${where}
           GROUP BY category ORDER BY amount DESC`, params),
    query(`SELECT COALESCE(s.name, 'No supplier') AS supplier, count(*)::int AS count, sum(e.amount) AS amount
           FROM expenses e LEFT JOIN suppliers s ON s.id = e.supplier_id ${where}
           GROUP BY 1 ORDER BY amount DESC LIMIT 10`, params),
    query(`SELECT to_char(date_trunc('month', expense_date), 'YYYY-MM') AS month, sum(amount) AS amount
           FROM expenses e ${where} GROUP BY 1 ORDER BY 1`, params),
  ]);

  res.json({
    data: list.rows,
    total: totals.rows[0].count,
    page, pageSize,
    totals: totals.rows[0],
    byCategory: byCategory.rows,
    bySupplier: bySupplier.rows,
    byMonth: byMonth.rows,
  });
}));

// Categories already used, so the form can suggest them
router.get('/categories', asyncHandler(async (_req, res) => {
  const { rows } = await query('SELECT DISTINCT category FROM expenses ORDER BY category');
  res.json(rows.map((r) => r.category));
}));

const schema = z.object({
  expense_date: z.string().regex(dateRe),
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(300),
  amount: z.coerce.number().positive().max(1e9),
  payment_method: z.enum(PAYMENT_METHODS).optional().nullable().or(z.literal('').transform(() => null)),
  reference: z.string().trim().max(100).optional().nullable(),
  supplier_id: z.coerce.number().int().positive().optional().nullable().or(z.literal('').transform(() => null)),
  notes: z.string().trim().max(1000).optional().nullable(),
});

router.post('/', validate(schema), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO expenses (expense_date, category, description, amount, payment_method, reference, supplier_id, notes, source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9) RETURNING id`,
    [b.expense_date, b.category, b.description, b.amount, b.payment_method || null, b.reference || null,
      b.supplier_id || null, b.notes || null, req.user.id]
  );
  await audit(req, 'create', 'expense', rows[0].id, { amount: b.amount, category: b.category });
  res.status(201).json((await query(`${SELECT} WHERE e.id = $1`, [rows[0].id])).rows[0]);
}));

// Stock purchases can be corrected (e.g. the supplier bill differed) but stay linked to their stock entry
router.put('/:id', validate(schema.partial()), asyncHandler(async (req, res) => {
  const keys = Object.keys(req.body).filter((k) => req.body[k] !== undefined);
  if (!keys.length) throw badRequest('Nothing to update');
  const { rowCount } = await query(
    `UPDATE expenses SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1}`,
    [...keys.map((k) => req.body[k]), req.params.id]
  );
  if (!rowCount) throw notFound('Expense');
  await audit(req, 'update', 'expense', req.params.id, { fields: keys });
  res.json((await query(`${SELECT} WHERE e.id = $1`, [req.params.id])).rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const e = (await query('SELECT source FROM expenses WHERE id = $1', [req.params.id])).rows[0];
  if (!e) throw notFound('Expense');
  if (e.source === 'stock') throw badRequest('Stock purchases are linked to inventory. Adjust the stock instead of deleting the expense.');
  await query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
  await audit(req, 'delete', 'expense', req.params.id);
  res.status(204).end();
}));

export default router;
