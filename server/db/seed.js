// Loads demo data. Refuses to run if users already exist (pass --force to wipe & reseed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const DEMO_PASSWORD = 'Password@123';
const here = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const force = process.argv.includes('--force');
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0 && !force) {
    console.log('Database already has users - skipping seed. Use `npm run seed -- --force` to wipe and reseed.');
    return;
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const sql = fs.readFileSync(path.join(here, 'seed.sql'), 'utf8').replaceAll('__PASSWORD_HASH__', hash);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (force) {
      await client.query(`TRUNCATE audit_logs, stock_movements, inventory_items, suppliers, payments, invoice_items,
        invoices, prescriptions, treatments, tooth_records, appointments, procedures, patients, users
        RESTART IDENTITY CASCADE`);
      await client.query(`ALTER SEQUENCE patient_code_seq RESTART WITH 1; ALTER SEQUENCE invoice_number_seq RESTART WITH 1`);
    }
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('✔ Demo data loaded. Log in with any of these (password: %s):', DEMO_PASSWORD);
  console.table([
    { role: 'admin', email: 'admin@clinic.com' },
    { role: 'dentist', email: 'priya@clinic.com' },
    { role: 'dentist', email: 'arjun@clinic.com' },
    { role: 'receptionist', email: 'reception@clinic.com' },
    { role: 'accountant', email: 'accounts@clinic.com' },
  ]);
}

run()
  .catch((err) => { console.error('Seed failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
