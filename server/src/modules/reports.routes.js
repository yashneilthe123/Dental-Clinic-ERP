import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, badRequest } from '../utils/http.js';
import { audit } from '../utils/audit.js';

// ---------------------------------------------------------------------------
// Dashboard  (GET /api/dashboard)
// ---------------------------------------------------------------------------
export const dashboardRouter = Router();

dashboardRouter.get('/', asyncHandler(async (req, res) => {
  const isDentist = req.user.role === 'dentist';
  const dentistFilter = isDentist ? 'AND a.dentist_id = $1' : '';
  const dParams = isDentist ? [req.user.id] : [];

  const [stats, today, revenue, topProcedures, lowStock] = await Promise.all([
    query(`
      SELECT
        (SELECT count(*)::int FROM appointments a
          WHERE a.start_time >= date_trunc('day', now()) AND a.start_time < date_trunc('day', now()) + interval '1 day'
            AND a.status NOT IN ('cancelled','no_show') ${dentistFilter}) AS appointments_today,
        (SELECT count(*)::int FROM patients WHERE is_active) AS total_patients,
        (SELECT count(*)::int FROM patients WHERE created_at >= date_trunc('month', now())) AS new_patients_month,
        (SELECT COALESCE(sum(amount),0) FROM payments WHERE paid_at >= date_trunc('day', now())) AS collected_today,
        (SELECT COALESCE(sum(amount),0) FROM payments WHERE paid_at >= date_trunc('month', now())) AS collected_month,
        (SELECT COALESCE(sum(total - amount_paid),0) FROM invoices WHERE status IN ('unpaid','partial')) AS outstanding,
        (SELECT count(*)::int FROM inventory_items WHERE is_active AND quantity <= reorder_level) AS low_stock_count
    `, dParams),
    query(`
      SELECT a.id, a.start_time, a.end_time, a.status, a.reason, a.patient_id,
             p.first_name || COALESCE(' ' || p.last_name, '') AS patient_name, p.phone AS patient_phone,
             u.name AS dentist_name, u.color AS dentist_color
      FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN users u ON u.id = a.dentist_id
      WHERE a.start_time >= date_trunc('day', now()) AND a.start_time < date_trunc('day', now()) + interval '1 day'
        ${dentistFilter}
      ORDER BY a.start_time`, dParams),
    query(`
      SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(sum(py.amount), 0) AS amount
      FROM generate_series(current_date - 29, current_date, interval '1 day') d
      LEFT JOIN payments py ON py.paid_at >= d AND py.paid_at < d + interval '1 day'
      GROUP BY d ORDER BY d`),
    query(`
      SELECT pr.name, count(*)::int AS count, COALESCE(sum(t.price),0) AS revenue
      FROM treatments t JOIN procedures pr ON pr.id = t.procedure_id
      WHERE t.status = 'completed' AND t.performed_at >= date_trunc('month', now())
      GROUP BY pr.name ORDER BY count DESC LIMIT 5`),
    query(`
      SELECT id, name, sku, quantity, reorder_level, unit FROM inventory_items
      WHERE is_active AND quantity <= reorder_level ORDER BY (quantity / NULLIF(reorder_level,0)) NULLS FIRST LIMIT 8`),
  ]);

  res.json({
    stats: stats.rows[0],
    todayAppointments: today.rows,
    revenueLast30Days: revenue.rows,
    topProcedures: topProcedures.rows,
    lowStock: lowStock.rows,
  });
}));

// ---------------------------------------------------------------------------
// Reports  (GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD)
// ---------------------------------------------------------------------------
export const reportsRouter = Router();
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

reportsRouter.get('/', authorize('accountant'), asyncHandler(async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  if (!dateRe.test(from) || !dateRe.test(to)) throw badRequest('from/to must be YYYY-MM-DD');
  const p = [from, to];
  // payments/appointments use [from, to+1 day)
  const range = `>= $1::date AND %s < $2::date + 1`;

  const [summary, daily, byMethod, byProcedure, byDentist, appts] = await Promise.all([
    query(`
      SELECT
        (SELECT COALESCE(sum(amount),0) FROM payments WHERE paid_at ${range.replace('%s', 'paid_at')}) AS collected,
        (SELECT COALESCE(sum(total),0) FROM invoices WHERE status <> 'void' AND issue_date BETWEEN $1 AND $2) AS billed,
        (SELECT count(*)::int FROM invoices WHERE status <> 'void' AND issue_date BETWEEN $1 AND $2) AS invoice_count,
        (SELECT count(*)::int FROM patients WHERE created_at ${range.replace('%s', 'created_at')}) AS new_patients,
        (SELECT count(*)::int FROM treatments WHERE status = 'completed' AND performed_at ${range.replace('%s', 'performed_at')}) AS treatments_done
    `, p),
    query(`
      SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(sum(py.amount),0) AS amount
      FROM generate_series($1::date, $2::date, interval '1 day') d
      LEFT JOIN payments py ON py.paid_at >= d AND py.paid_at < d + interval '1 day'
      GROUP BY d ORDER BY d`, p),
    query(`
      SELECT method, count(*)::int AS count, sum(amount) AS amount FROM payments
      WHERE paid_at ${range.replace('%s', 'paid_at')} GROUP BY method ORDER BY amount DESC`, p),
    query(`
      SELECT pr.name, pr.category, count(*)::int AS count, sum(t.price) AS revenue
      FROM treatments t JOIN procedures pr ON pr.id = t.procedure_id
      WHERE t.status = 'completed' AND t.performed_at ${range.replace('%s', 't.performed_at')}
      GROUP BY pr.name, pr.category ORDER BY revenue DESC`, p),
    query(`
      SELECT u.id, u.name,
        count(t.id)::int AS treatments,
        COALESCE(sum(t.price),0) AS revenue
      FROM users u LEFT JOIN treatments t ON t.dentist_id = u.id AND t.status = 'completed'
        AND t.performed_at ${range.replace('%s', 't.performed_at')}
      WHERE u.role = 'dentist'
      GROUP BY u.id, u.name ORDER BY revenue DESC`, p),
    query(`
      SELECT status, count(*)::int AS count FROM appointments
      WHERE start_time ${range.replace('%s', 'start_time')} GROUP BY status`, p),
  ]);

  res.json({
    from, to,
    summary: summary.rows[0],
    daily: daily.rows,
    byMethod: byMethod.rows,
    byProcedure: byProcedure.rows,
    byDentist: byDentist.rows,
    appointmentsByStatus: appts.rows,
  });
}));

// ---------------------------------------------------------------------------
// Settings  (GET/PUT /api/settings)
// ---------------------------------------------------------------------------
export const settingsRouter = Router();

settingsRouter.get('/', asyncHandler(async (_req, res) => {
  res.json((await query('SELECT * FROM clinic_settings WHERE id = 1')).rows[0]);
}));

const settingsSchema = z.object({
  clinic_name: z.string().trim().min(2).max(200),
  address: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.string().trim().max(200).optional().nullable(),
  gstin: z.string().trim().max(30).optional().nullable(),
  currency: z.string().trim().length(3).toUpperCase(),
  default_tax_rate: z.coerce.number().min(0).max(100),
  invoice_prefix: z.string().trim().min(1).max(10).toUpperCase(),
  slot_minutes: z.coerce.number().int().min(5).max(240),
  opening_hour: z.coerce.number().int().min(0).max(23),
  closing_hour: z.coerce.number().int().min(1).max(24),
}).partial();

settingsRouter.put('/', authorize('admin'), validate(settingsSchema), asyncHandler(async (req, res) => {
  const keys = Object.keys(req.body).filter((k) => req.body[k] !== undefined);
  if (!keys.length) throw badRequest('Nothing to update');
  const { rows } = await query(
    `UPDATE clinic_settings SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now()
     WHERE id = 1 RETURNING *`,
    keys.map((k) => req.body[k])
  );
  await audit(req, 'update', 'settings', 1, req.body);
  res.json(rows[0]);
}));

// ---------------------------------------------------------------------------
// Audit log  (GET /api/audit)
// ---------------------------------------------------------------------------
export const auditRouter = Router();

auditRouter.get('/', authorize('admin'), asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.entity) { params.push(req.query.entity); where.push(`a.entity = $${params.length}`); }
  if (req.query.userId) { params.push(req.query.userId); where.push(`a.user_id = $${params.length}`); }
  const { rows } = await query(
    `SELECT a.*, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.created_at DESC LIMIT 300`, params);
  res.json(rows);
}));
