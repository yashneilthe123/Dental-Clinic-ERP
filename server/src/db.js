import pg from 'pg';
import { config } from './config.js';

// Return NUMERIC as JS numbers (amounts are numeric(12,2), safe for clinic-scale values)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// Return DATE columns as plain 'YYYY-MM-DD' strings (avoid timezone shifts)
pg.types.setTypeParser(1082, (v) => v);
// bigint counts -> number
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  options: `-c timezone=${config.timezone}`,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

export const query = (text, params) => pool.query(text, params);

/** Run `fn(client)` inside a transaction. Rolls back on any error. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
