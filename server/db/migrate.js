// Minimal migration runner: applies db/migrations/*.sql in order, once each.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function run() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✔ applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✖ failed ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }
  if (!process.exitCode) console.log('Migrations up to date.');
  await pool.end();
}

run().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
