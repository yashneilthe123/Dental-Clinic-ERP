import { query } from '../db.js';

/**
 * Record an audit entry. Never throws: auditing must not break the request.
 * @param {import('express').Request} req
 */
export async function audit(req, action, entity, entityId, details = null, db = { query }) {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user?.id ?? null, action, entity, entityId == null ? null : String(entityId), details, req.ip]
    );
  } catch (err) {
    console.error('audit log failed', err.message);
  }
}
