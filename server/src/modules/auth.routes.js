import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, unauthorized, badRequest } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();

// Very small in-memory rate limiter for login (per IP). Use Redis-backed limiting in production clusters.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
function tooManyAttempts(ip) {
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, first: now };
  if (now - entry.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now });
    return false;
  }
  entry.count += 1;
  attempts.set(ip, entry);
  return entry.count > MAX_ATTEMPTS;
}

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  if (tooManyAttempts(req.ip)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  }
  const { email, password } = req.body;
  const { rows } = await query(
    'SELECT id, name, email, role, password_hash, is_active FROM users WHERE lower(email) = lower($1)',
    [email]
  );
  const user = rows[0];
  const ok = user && user.is_active && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw unauthorized('Invalid email or password');

  attempts.delete(req.ip);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  req.user = user;
  await audit(req, 'login', 'user', user.id);

  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}));

router.get('/me', authenticate, (req, res) => {
  const { id, name, email, role } = req.user;
  res.json({ id, name, email, role });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

router.post('/change-password', authenticate, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const valid = await bcrypt.compare(req.body.currentPassword, rows[0].password_hash);
  if (!valid) throw badRequest('Current password is incorrect');
  const hash = await bcrypt.hash(req.body.newPassword, 10);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
  await audit(req, 'change_password', 'user', req.user.id);
  res.json({ ok: true });
}));

export default router;
