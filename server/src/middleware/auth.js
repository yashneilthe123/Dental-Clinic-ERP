import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { unauthorized, forbidden } from '../utils/http.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/** Verifies the Bearer token and loads the (still active) user onto req.user. */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('Session expired, please log in again');
    }

    const { rows } = await query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) throw unauthorized('Account disabled');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Role guard: authorize('admin', 'dentist') */
export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
  return next(forbidden());
};
