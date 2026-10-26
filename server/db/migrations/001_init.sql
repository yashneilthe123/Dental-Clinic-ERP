-- Dental Clinic ERP - initial schema
-- PostgreSQL 13+

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Clinic settings (single row)
-- ---------------------------------------------------------------------------
CREATE TABLE clinic_settings (
  id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  clinic_name    text NOT NULL DEFAULT 'My Dental Clinic',
  address        text,
  phone          text,
  email          text,
  gstin          text,
  currency       text NOT NULL DEFAULT 'INR',
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (default_tax_rate >= 0),
  invoice_prefix text NOT NULL DEFAULT 'INV',
  slot_minutes   integer NOT NULL DEFAULT 30 CHECK (slot_minutes BETWEEN 5 AND 240),
  opening_hour   smallint NOT NULL DEFAULT 9  CHECK (opening_hour BETWEEN 0 AND 23),
  closing_hour   smallint NOT NULL DEFAULT 20 CHECK (closing_hour BETWEEN 1 AND 24),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO clinic_settings (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- Users / staff
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             serial PRIMARY KEY,
  name           text NOT NULL,
  email          text NOT NULL,
  password_hash  text NOT NULL,
  role           text NOT NULL CHECK (role IN ('admin','dentist','receptionist','accountant')),
  phone          text,
  specialization text,
  color          text NOT NULL DEFAULT '#0d9488',
  is_active      boolean NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------
CREATE SEQUENCE patient_code_seq START 1;

CREATE TABLE patients (
  id               serial PRIMARY KEY,
  patient_code     text NOT NULL UNIQUE DEFAULT ('P' || lpad(nextval('patient_code_seq')::text, 6, '0')),
  first_name       text NOT NULL,
  last_name        text,
  gender           text CHECK (gender IN ('male','female','other')),
  date_of_birth    date,
  phone            text NOT NULL,
  email            text,
  address          text,
  blood_group      text,
  allergies        text,
  medical_history  text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  notes            text,
  is_active        boolean NOT NULL DEFAULT true,
  created_by       integer REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patients_phone_idx ON patients (phone);
CREATE INDEX patients_name_idx  ON patients (lower(first_name), lower(last_name));
CREATE TRIGGER patients_updated BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Appointments (double-booking prevented by exclusion constraint)
-- ---------------------------------------------------------------------------
CREATE TABLE appointments (
  id          serial PRIMARY KEY,
  patient_id  integer NOT NULL REFERENCES patients(id),
  dentist_id  integer NOT NULL REFERENCES users(id),
  start_time  timestamptz NOT NULL,
  end_time    timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled','confirmed','arrived','in_progress','completed','cancelled','no_show')),
  reason      text,
  notes       text,
  created_by  integer REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    dentist_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status NOT IN ('cancelled','no_show'))
);
CREATE INDEX appointments_start_idx   ON appointments (start_time);
CREATE INDEX appointments_patient_idx ON appointments (patient_id);
CREATE TRIGGER appointments_updated BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Procedure catalogue (price list)
-- ---------------------------------------------------------------------------
CREATE TABLE procedures (
  id               serial PRIMARY KEY,
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  category         text NOT NULL DEFAULT 'General',
  default_price    numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_price >= 0),
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER procedures_updated BEFORE UPDATE ON procedures FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Dental chart: history of tooth conditions (FDI numbering 11-48)
-- ---------------------------------------------------------------------------
CREATE TABLE tooth_records (
  id           serial PRIMARY KEY,
  patient_id   integer NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_number smallint NOT NULL CHECK (
                 (tooth_number / 10) BETWEEN 1 AND 4 AND (tooth_number % 10) BETWEEN 1 AND 8),
  condition    text NOT NULL CHECK (condition IN
                 ('healthy','caries','filled','crown','root_canal','missing','implant','bridge','fractured','extraction_needed','sensitive')),
  surfaces     text,             -- e.g. "MOD" (Mesial, Occlusal, Distal, Buccal, Lingual)
  notes        text,
  recorded_by  integer REFERENCES users(id),
  recorded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tooth_records_patient_idx ON tooth_records (patient_id, tooth_number, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- Treatments (planned / done procedures; "planned" rows form the treatment plan)
-- ---------------------------------------------------------------------------
CREATE TABLE treatments (
  id             serial PRIMARY KEY,
  patient_id     integer NOT NULL REFERENCES patients(id),
  procedure_id   integer NOT NULL REFERENCES procedures(id),
  dentist_id     integer REFERENCES users(id),
  appointment_id integer REFERENCES appointments(id) ON DELETE SET NULL,
  tooth_number   smallint CHECK (tooth_number IS NULL OR
                   ((tooth_number / 10) BETWEEN 1 AND 4 AND (tooth_number % 10) BETWEEN 1 AND 8)),
  surfaces       text,
  status         text NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned','in_progress','completed','cancelled')),
  price          numeric(12,2) NOT NULL CHECK (price >= 0),
  notes          text,
  performed_at   timestamptz,
  created_by     integer REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX treatments_patient_idx ON treatments (patient_id);
CREATE TRIGGER treatments_updated BEFORE UPDATE ON treatments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Prescriptions
-- ---------------------------------------------------------------------------
CREATE TABLE prescriptions (
  id          serial PRIMARY KEY,
  patient_id  integer NOT NULL REFERENCES patients(id),
  dentist_id  integer NOT NULL REFERENCES users(id),
  items       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{drug, dosage, frequency, duration, instructions}]
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prescriptions_patient_idx ON prescriptions (patient_id);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------
CREATE SEQUENCE invoice_number_seq START 1;

CREATE TABLE invoices (
  id              serial PRIMARY KEY,
  invoice_number  text NOT NULL UNIQUE,
  patient_id      integer NOT NULL REFERENCES patients(id),
  issue_date      date NOT NULL DEFAULT current_date,
  due_date        date,
  subtotal        numeric(12,2) NOT NULL DEFAULT 0,
  discount        numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax_rate        numeric(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  tax_amount      numeric(12,2) NOT NULL DEFAULT 0,
  total           numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  amount_paid     numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status          text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','void')),
  notes           text,
  created_by      integer REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (amount_paid <= total)
);
CREATE INDEX invoices_patient_idx ON invoices (patient_id);
CREATE INDEX invoices_status_idx  ON invoices (status);
CREATE TRIGGER invoices_updated BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_items (
  id            serial PRIMARY KEY,
  invoice_id    integer NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  treatment_id  integer REFERENCES treatments(id),
  description   text NOT NULL,
  quantity      numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price    numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  amount        numeric(12,2) NOT NULL
);
-- A treatment can only be billed on one live invoice (enforced in app; voided invoices release it)
CREATE INDEX invoice_items_treatment_idx ON invoice_items (treatment_id);

CREATE TABLE payments (
  id          serial PRIMARY KEY,
  invoice_id  integer NOT NULL REFERENCES invoices(id),
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  method      text NOT NULL CHECK (method IN ('cash','card','upi','bank_transfer','insurance','other')),
  reference   text,
  paid_at     timestamptz NOT NULL DEFAULT now(),
  received_by integer REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_invoice_idx ON payments (invoice_id);
CREATE INDEX payments_paid_at_idx ON payments (paid_at);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
CREATE TABLE suppliers (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  contact_person text,
  phone       text,
  email       text,
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_items (
  id            serial PRIMARY KEY,
  sku           text NOT NULL UNIQUE,
  name          text NOT NULL,
  category      text NOT NULL DEFAULT 'Consumables',
  unit          text NOT NULL DEFAULT 'pcs',
  quantity      numeric(12,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_level numeric(12,2) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  unit_cost     numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  supplier_id   integer REFERENCES suppliers(id) ON DELETE SET NULL,
  expiry_date   date,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER inventory_items_updated BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE stock_movements (
  id          serial PRIMARY KEY,
  item_id     integer NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('in','out','adjust')),
  quantity    numeric(12,2) NOT NULL,   -- positive for in/out; signed delta for adjust
  reason      text,
  user_id     integer REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_item_idx ON stock_movements (item_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  user_id     integer REFERENCES users(id),
  action      text NOT NULL,     -- create / update / delete / login / view ...
  entity      text NOT NULL,
  entity_id   text,
  details     jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
