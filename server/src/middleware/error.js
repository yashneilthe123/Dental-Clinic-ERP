import { HttpError } from '../utils/http.js';

// Map common PostgreSQL error codes to friendly HTTP responses
const PG_ERRORS = {
  '23505': [409, 'A record with this value already exists'],
  '23503': [409, 'This record is linked to other records'],
  '23514': [400, 'A value is outside the allowed range'],
  '23P01': [409, 'This time slot overlaps another appointment for the same dentist'],
  '22P02': [400, 'Invalid input format'],
};

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err && PG_ERRORS[err.code]) {
    const [status, message] = PG_ERRORS[err.code];
    return res.status(status).json({ error: message, detail: err.detail });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
