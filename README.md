# 🦷 SmileCare — Dental Clinic ERP

A full-stack clinic management system for dental practices.

- **Backend:** Node.js + Express REST API, PostgreSQL (raw SQL with `pg`), JWT auth, role-based access, zod validation, audit log, PDF invoices
- **Frontend:** React 19 + Vite + Tailwind CSS v4, React Router

## Features

| Module | What it does |
|---|---|
| **Patients** | Registration with auto IDs (`P000001`), search by name/phone/ID, medical history and allergy alerts, balance due |
| **Dental chart** | Interactive FDI odontogram (11–48) with 5-surface teeth (M/O/D/B/L/I), 11 conditions, full history per tooth |
| **Treatments** | Treatment plans (planned → in progress → completed) from the price list, per tooth/surface |
| **Appointments** | Week/day calendar per dentist, click-to-book, status flow (scheduled → confirmed → arrived → in progress → completed / no-show / cancelled). **Double-booking is blocked by a PostgreSQL exclusion constraint.** |
| **Prescriptions** | Quick-add common dental drugs, allergy warning, printable A4 prescription |
| **Billing** | Invoice completed treatments + custom items, discount, tax/GST, partial payments (cash/UPI/card/…), void, **PDF invoice** |
| **Inventory** | Items, suppliers, stock in / usage / adjust with movement history, low-stock and expiry alerts |
| **Expenses** | Every stock-in is logged as a purchase expense (quantity × unit cost, supplier, bill no., paid via); add other spending such as equipment, repairs or lab charges; filter by date, category and type; totals by category and supplier; CSV export |
| **Reports** | Collections by day and payment method, expenses and net (collected − expenses), revenue by procedure and dentist, CSV export |
| **Admin** | Staff and roles, price list, clinic settings, audit log of views and changes |

### Roles

| Role | Can do |
|---|---|
| Admin | Everything |
| Dentist | Patients, dental chart, treatments, prescriptions, own schedule, record stock usage |
| Receptionist | Patients, appointments, invoices and payments, inventory, expenses |
| Accountant | Invoices, payments, voids, expenses, reports |

---

## Getting started

### 1. Requirements
- Node.js 18 or newer
- PostgreSQL 13+ (installed locally, or via Docker)

### 2. Start PostgreSQL
**With Docker** (easiest):
```bash
docker compose up -d
```
**Or with a local install**, create the database:
```bash
psql -U postgres -c "CREATE DATABASE dental_erp;"
```

### 3. Configure the API
```bash
cd server
cp .env.example .env        # Windows: copy .env.example .env
```
Edit `.env` and set `DATABASE_URL` to your Postgres user/password, and `JWT_SECRET` to a long random string.

### 4. Install, create tables and load demo data
```bash
# from the project root
npm run install:all
npm run db:setup            # runs migrations + seeds demo data
```

### 5. Run it (two terminals)
```bash
npm run dev:server          # API on http://localhost:4000
npm run dev:client          # App on http://localhost:5173
```
Open **http://localhost:5173** and sign in.

**Demo logins** (password `Password@123`):

| Role | Email |
|---|---|
| Admin | admin@clinic.com |
| Dentist | priya@clinic.com / arjun@clinic.com |
| Receptionist | reception@clinic.com |
| Accountant | accounts@clinic.com |

> Change these passwords (Staff page) before using with real patients. To reset demo data: `npm run seed --prefix server -- --force`

---

## Project structure

```
dental-erp/
├── docker-compose.yml          PostgreSQL for development
├── server/
│   ├── db/
│   │   ├── migrations/001_init.sql   full schema (tables, constraints, indexes)
│   │   ├── migrate.js                migration runner (tracks applied files)
│   │   ├── seed.sql / seed.js        demo data
│   └── src/
│       ├── app.js                    Express app, route mounting
│       ├── server.js                 entry point
│       ├── config.js, db.js          env config, pg pool + transactions
│       ├── middleware/               auth (JWT + roles), validation, errors
│       ├── utils/                    http helpers, audit log, invoice PDF
│       └── modules/                  one router per module
│           ├── auth, users, patients (+ dental chart)
│           ├── appointments, procedures, treatments, prescriptions
│           ├── invoices (+ payments, PDF), inventory (+ suppliers), expenses
│           └── reports (dashboard, reports, settings, audit)
└── client/
    └── src/
        ├── lib/            api client, auth context, hooks, formatters
        ├── components/     UI kit, layout, odontogram, forms, charts
        └── pages/          Dashboard, Patients, PatientDetail, Appointments,
                            Billing, InvoiceNew, InvoiceDetail, Inventory, Expenses,
                            Procedures, Staff, Reports, Settings, AuditLog
```

To add a schema change, create `server/db/migrations/002_whatever.sql` and run `npm run migrate --prefix server`.

---

## API reference

All routes are under `/api` and need `Authorization: Bearer <token>` except login and health.

| Method & path | Description |
|---|---|
| `POST /auth/login` | `{ email, password }` → `{ token, user }` |
| `GET /auth/me` · `POST /auth/change-password` | Current user · change password |
| `GET /users/dentists` · `GET/POST/PUT /users` | Dentist list · staff management (admin) |
| `GET /patients?q=&page=` · `POST /patients` | List/search · create |
| `GET/PUT/DELETE /patients/:id` | Read · update · archive (admin) |
| `GET /patients/:id/summary` | Appointments, treatments, invoices, totals |
| `GET/POST /patients/:id/chart` | Dental chart (current + history) · record finding |
| `GET /appointments?from=&to=&dentistId=&status=` | Calendar range |
| `POST/PUT/DELETE /appointments/:id` · `PATCH /appointments/:id/status` | Book · edit · delete · change status |
| `GET/POST/PUT /procedures` | Price list |
| `GET /treatments?patientId=&unbilled=1` · `POST/PUT/DELETE /treatments/:id` | Treatments / plans |
| `GET/POST /prescriptions` · `GET/DELETE /prescriptions/:id` | Prescriptions |
| `GET /invoices?status=&q=` · `POST /invoices` | List with totals · create (with optional first payment) |
| `GET /invoices/:id` · `GET /invoices/:id/pdf` | Invoice · PDF |
| `POST /invoices/:id/payments` · `DELETE /invoices/:id/payments/:pid` | Add · remove payment |
| `POST /invoices/:id/void` | Void an unpaid invoice |
| `GET/POST/PUT /inventory` · `POST /inventory/:id/movements` | Items · stock in/out/adjust |
| `GET/POST/PUT /inventory/suppliers` | Suppliers |
| `GET /expenses?from=&to=&category=&source=&q=` · `POST/PUT/DELETE /expenses` | Expenses with totals by category, supplier and month · add / edit / delete (manual entries only) |
| `GET /dashboard` · `GET /reports?from=&to=` | Dashboard stats · reports |
| `GET/PUT /settings` · `GET /audit` | Clinic settings · audit log |
| `GET /health` | Health check (no auth) |

Errors come back as `{ "error": "message", "details": [...] }` with a proper status code (400, 401, 403, 404, 409).

---

## How key things work

- **No double-booking:** `appointments` has an `EXCLUDE USING gist (dentist_id WITH =, tstzrange(start_time, end_time) WITH &&)` constraint (ignoring cancelled / no-show), so two bookings for the same dentist can never overlap, even with simultaneous requests.
- **Inventory expenses:** receiving stock (`POST /inventory/:id/movements` with `type: in`) writes the stock movement and a linked `expenses` row in the same transaction. Opening stock is not counted as a purchase. Stock-linked expenses can be edited (e.g. if the supplier bill differs) but not deleted; adjust the stock instead.
- **Billing integrity:** creating an invoice locks the selected treatments (`SELECT … FOR UPDATE`) inside a transaction, so a treatment can't be billed twice. Payments lock the invoice row and can't exceed the balance. Voiding releases treatments for re-billing. Money is stored as `numeric(12,2)`.
- **Audit trail:** every create/update/delete, patient record view and login is written to `audit_logs`.
- **Time zone:** "today" and daily reports use the `TIMEZONE` env var (default `Asia/Kolkata`).

---

## Deploying to production

1. Set `NODE_ENV=production`, a strong `JWT_SECRET` (32+ chars), and your production `DATABASE_URL`.
2. Build the frontend: `npm run build` (outputs `client/dist`).
3. Start the API: `npm start`. It serves the built app from `client/dist`, so one Node process serves both on one port.
4. Put it behind HTTPS (Nginx/Caddy, or a platform like Render/Railway with managed Postgres).
5. Schedule daily backups: `pg_dump dental_erp > backup_$(date +%F).sql`.

This handles personal health data, so in India the **DPDP Act 2023** applies: get patient consent, restrict access by role (already built in), keep the audit log, use HTTPS, and back up securely.

---

## Ideas for next steps

- SMS / WhatsApp appointment reminders (e.g. Twilio, Gupshup, MSG91)
- X-ray and document uploads per patient (S3 or local storage)
- Primary (milk) teeth chart (FDI 51–85) for paediatric patients
- Refunds and credit notes; insurance claims
- Multi-branch support (`clinic_id` on each table)
- Online booking page for patients
- Automated tests (Jest + Supertest against a test database)
