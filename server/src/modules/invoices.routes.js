import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, notFound, badRequest, conflict, paginate, round2 } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { renderInvoicePdf } from '../utils/invoicePdf.js';

const router = Router();
const billing = authorize('receptionist', 'accountant');
const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'insurance', 'other'];

const statusFor = (total, paid) => (paid <= 0 ? 'unpaid' : paid + 0.001 >= total ? 'paid' : 'partial');

async function loadInvoice(id, db = { query }) {
  const inv = await db.query(
    `SELECT i.*, p.first_name || COALESCE(' ' || p.last_name, '') AS patient_name,
            p.patient_code, p.phone AS patient_phone, p.address AS patient_address, p.email AS patient_email,
            u.name AS created_by_name
     FROM invoices i JOIN patients p ON p.id = i.patient_id
     LEFT JOIN users u ON u.id = i.created_by
     WHERE i.id = $1`, [id]);
  if (!inv.rows[0]) return null;
  const [items, payments] = await Promise.all([
    db.query(
      `SELECT ii.*, t.tooth_number FROM invoice_items ii
       LEFT JOIN treatments t ON t.id = ii.treatment_id
       WHERE ii.invoice_id = $1 ORDER BY ii.id`, [id]),
    db.query(
      `SELECT py.*, u.name AS received_by_name FROM payments py
       LEFT JOIN users u ON u.id = py.received_by
       WHERE py.invoice_id = $1 ORDER BY py.paid_at`, [id]),
  ]);
  return { ...inv.rows[0], items: items.rows, payments: payments.rows };
}

// GET /api/invoices?status=&patientId=&q=&from=&to=&page=
router.get('/', asyncHandler(async (req, res) => {
  const { limit, offset, page, pageSize } = paginate(req.query);
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (req.query.status) add('i.status = ANY(?)', String(req.query.status).split(','));
  if (req.query.patientId) add('i.patient_id = ?', req.query.patientId);
  if (req.query.from) add('i.issue_date >= ?', req.query.from);
  if (req.query.to) add('i.issue_date <= ?', req.query.to);
  if (req.query.q) {
    add(`(lower(i.invoice_number) LIKE ? OR lower(p.first_name || ' ' || coalesce(p.last_name,'')) LIKE ? OR p.phone LIKE ?)`,
      `%${String(req.query.q).toLowerCase()}%`);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const base = `FROM invoices i JOIN patients p ON p.id = i.patient_id ${w}`;
  const [count, sums] = await Promise.all([
    query(`SELECT count(*)::int AS n ${base}`, params),
    query(`SELECT COALESCE(sum(i.total) FILTER (WHERE i.status <> 'void'),0) AS total,
                  COALESCE(sum(i.amount_paid) FILTER (WHERE i.status <> 'void'),0) AS paid,
                  COALESCE(sum(i.total - i.amount_paid) FILTER (WHERE i.status IN ('unpaid','partial')),0) AS due
           ${base}`, params),
  ]);
  const { rows } = await query(
    `SELECT i.id, i.invoice_number, i.issue_date, i.due_date, i.total, i.amount_paid, i.status, i.patient_id,
            p.first_name || COALESCE(' ' || p.last_name, '') AS patient_name, p.patient_code
     ${base} ORDER BY i.issue_date DESC, i.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  res.json({ data: rows, page, pageSize, total: count.rows[0].n, sums: sums.rows[0] });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const invoice = await loadInvoice(req.params.id);
  if (!invoice) throw notFound('Invoice');
  res.json(invoice);
}));

router.get('/:id/pdf', asyncHandler(async (req, res) => {
  const invoice = await loadInvoice(req.params.id);
  if (!invoice) throw notFound('Invoice');
  const settings = (await query('SELECT * FROM clinic_settings WHERE id = 1')).rows[0];
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
  renderInvoicePdf(invoice, settings, res);
}));

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(200).optional().nullable(),
  paid_at: z.string().datetime({ offset: true }).optional(),
});

const createSchema = z.object({
  patient_id: z.coerce.number().int().positive(),
  treatment_ids: z.array(z.coerce.number().int().positive()).default([]),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(300),
    quantity: z.coerce.number().positive().default(1),
    unit_price: z.coerce.number().min(0),
  })).default([]),
  discount: z.coerce.number().min(0).default(0),
  tax_rate: z.coerce.number().min(0).max(100).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  payment: paymentSchema.optional().nullable(),
}).refine((v) => v.treatment_ids.length + v.items.length > 0, 'Add at least one treatment or line item');

router.post('/', billing, validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const id = await withTransaction(async (db) => {
    const settings = (await db.query('SELECT default_tax_rate, invoice_prefix FROM clinic_settings WHERE id = 1')).rows[0];

    // Lock the treatments being billed so two invoices can't claim the same treatment
    const lines = [];
    if (b.treatment_ids.length) {
      const t = await db.query(
        `SELECT t.id, t.price, t.tooth_number, t.status, t.patient_id, pr.name
         FROM treatments t JOIN procedures pr ON pr.id = t.procedure_id
         WHERE t.id = ANY($1) FOR UPDATE OF t`, [b.treatment_ids]);
      if (t.rows.length !== new Set(b.treatment_ids).size) throw badRequest('Some treatments were not found');
      for (const row of t.rows) {
        if (row.patient_id !== b.patient_id) throw badRequest('All treatments must belong to the selected patient');
        if (row.status === 'cancelled') throw badRequest(`Treatment #${row.id} is cancelled`);
      }
      const billed = await db.query(
        `SELECT ii.treatment_id FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
         WHERE ii.treatment_id = ANY($1) AND i.status <> 'void'`, [b.treatment_ids]);
      if (billed.rows.length) throw conflict(`Treatment #${billed.rows[0].treatment_id} is already invoiced`);
      for (const row of t.rows) {
        lines.push({
          treatment_id: row.id,
          description: row.tooth_number ? `${row.name} (tooth ${row.tooth_number})` : row.name,
          quantity: 1,
          unit_price: row.price,
        });
      }
    }
    for (const it of b.items) lines.push({ treatment_id: null, ...it });

    const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
    if (b.discount > subtotal) throw badRequest('Discount cannot exceed the subtotal');
    const taxRate = b.tax_rate ?? settings.default_tax_rate;
    const taxAmount = round2(((subtotal - b.discount) * taxRate) / 100);
    const total = round2(subtotal - b.discount + taxAmount);

    const seq = (await db.query(`SELECT nextval('invoice_number_seq') AS n`)).rows[0].n;
    const number = `${settings.invoice_prefix}-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;

    const inv = await db.query(
      `INSERT INTO invoices (invoice_number, patient_id, due_date, subtotal, discount, tax_rate, tax_amount, total, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [number, b.patient_id, b.due_date || null, subtotal, b.discount, taxRate, taxAmount, total, b.notes || null, req.user.id]
    );
    const invoiceId = inv.rows[0].id;
    for (const l of lines) {
      await db.query(
        `INSERT INTO invoice_items (invoice_id, treatment_id, description, quantity, unit_price, amount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [invoiceId, l.treatment_id, l.description, l.quantity, l.unit_price, round2(l.quantity * l.unit_price)]
      );
    }

    if (b.payment) {
      if (b.payment.amount > total + 0.001) throw badRequest('Payment cannot exceed the invoice total');
      await db.query(
        `INSERT INTO payments (invoice_id, amount, method, reference, paid_at, received_by)
         VALUES ($1,$2,$3,$4,COALESCE($5, now()),$6)`,
        [invoiceId, b.payment.amount, b.payment.method, b.payment.reference || null, b.payment.paid_at || null, req.user.id]
      );
      await db.query('UPDATE invoices SET amount_paid = $1, status = $2 WHERE id = $3',
        [b.payment.amount, statusFor(total, b.payment.amount), invoiceId]);
    } else if (total === 0) {
      await db.query(`UPDATE invoices SET status = 'paid' WHERE id = $1`, [invoiceId]);
    }
    await audit(req, 'create', 'invoice', invoiceId, { number, total }, db);
    return invoiceId;
  });
  res.status(201).json(await loadInvoice(id));
}));

// Record a payment against an invoice
router.post('/:id/payments', billing, validate(paymentSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [req.params.id]);
    const inv = rows[0];
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'void') throw badRequest('Cannot add a payment to a void invoice');
    const balance = round2(inv.total - inv.amount_paid);
    if (b.amount > balance + 0.001) throw badRequest(`Payment exceeds the balance due (${balance.toFixed(2)})`);
    await db.query(
      `INSERT INTO payments (invoice_id, amount, method, reference, paid_at, received_by)
       VALUES ($1,$2,$3,$4,COALESCE($5, now()),$6)`,
      [inv.id, b.amount, b.method, b.reference || null, b.paid_at || null, req.user.id]
    );
    const paid = round2(inv.amount_paid + b.amount);
    await db.query('UPDATE invoices SET amount_paid = $1, status = $2 WHERE id = $3',
      [paid, statusFor(inv.total, paid), inv.id]);
    await audit(req, 'payment', 'invoice', inv.id, { amount: b.amount, method: b.method }, db);
  });
  res.status(201).json(await loadInvoice(req.params.id));
}));

// Remove a payment entered by mistake (admin/accountant)
router.delete('/:id/payments/:paymentId', authorize('accountant'), asyncHandler(async (req, res) => {
  await withTransaction(async (db) => {
    const inv = (await db.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!inv) throw notFound('Invoice');
    const del = await db.query('DELETE FROM payments WHERE id = $1 AND invoice_id = $2 RETURNING amount',
      [req.params.paymentId, inv.id]);
    if (!del.rows[0]) throw notFound('Payment');
    const paid = round2(inv.amount_paid - del.rows[0].amount);
    const status = inv.status === 'void' ? 'void' : statusFor(inv.total, paid);
    await db.query('UPDATE invoices SET amount_paid = $1, status = $2 WHERE id = $3', [Math.max(0, paid), status, inv.id]);
    await audit(req, 'delete_payment', 'invoice', inv.id, { paymentId: req.params.paymentId, amount: del.rows[0].amount }, db);
  });
  res.json(await loadInvoice(req.params.id));
}));

// Void an invoice (only when nothing has been paid; refunds should be handled first)
router.post('/:id/void', authorize('accountant'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE invoices SET status = 'void' WHERE id = $1 AND amount_paid = 0 AND status <> 'void' RETURNING id`,
    [req.params.id]
  );
  if (!rows[0]) throw badRequest('Only unpaid invoices can be voided. Remove payments first.');
  await audit(req, 'void', 'invoice', req.params.id);
  res.json(await loadInvoice(req.params.id));
}));

export default router;
