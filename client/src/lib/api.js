// Thin fetch wrapper: adds the JWT, parses JSON, throws readable errors.
const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'dental_erp_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, body, { raw = false } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
  if (raw && res.ok) return res;
  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const details = data?.details;
    const msg = details?.length
      ? details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join(', ')
      : data?.error || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, details);
  }
  return data;
}

/** Build a query string, skipping empty values. */
export const qs = (params = {}) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
  /** Open an authenticated PDF (e.g. invoice) in a new tab. */
  openPdf: async (path) => {
    const win = window.open('', '_blank');
    try {
      const res = await request('GET', path, undefined, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      if (win) win.location.href = url; else window.location.href = url;
    } catch (e) {
      win?.close();
      throw e;
    }
  },
};
