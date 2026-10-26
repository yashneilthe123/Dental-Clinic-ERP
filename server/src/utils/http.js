export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Not authenticated') => new HttpError(401, msg);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (msg) => new HttpError(409, msg);

/** Wrap async route handlers so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parse ?page & ?pageSize into limit/offset with sane bounds. */
export function paginate(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 20));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
