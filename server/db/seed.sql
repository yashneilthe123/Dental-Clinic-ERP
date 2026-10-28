-- Demo data. __PASSWORD_HASH__ is replaced by seed.js with a bcrypt hash of the demo password.

UPDATE clinic_settings SET
  clinic_name = 'SmileCare Dental Clinic',
  address = '12 Gandhi Road, Katpadi, Vellore, Tamil Nadu 632007',
  phone = '+91 98765 43210',
  email = 'hello@smilecare.example',
  gstin = '33ABCDE1234F1Z5',
  default_tax_rate = 0,
  invoice_prefix = 'INV'
WHERE id = 1;

INSERT INTO users (name, email, password_hash, role, phone, specialization, color) VALUES
  ('Clinic Admin',      'admin@clinic.com',      '__PASSWORD_HASH__', 'admin',        '9000000001', NULL,             '#0f766e'),
  ('Dr. Priya Raman',   'priya@clinic.com',      '__PASSWORD_HASH__', 'dentist',      '9000000002', 'Endodontist',    '#0891b2'),
  ('Dr. Arjun Mehta',   'arjun@clinic.com',      '__PASSWORD_HASH__', 'dentist',      '9000000003', 'Orthodontist',   '#7c3aed'),
  ('Kavya (Reception)', 'reception@clinic.com',  '__PASSWORD_HASH__', 'receptionist', '9000000004', NULL,             '#0d9488'),
  ('Suresh (Accounts)', 'accounts@clinic.com',   '__PASSWORD_HASH__', 'accountant',   '9000000005', NULL,             '#0d9488');

INSERT INTO procedures (code, name, category, default_price, duration_minutes) VALUES
  ('CONS',  'Consultation',                    'Diagnostic',   300,   15),
  ('XRAY',  'Intraoral X-ray (IOPA)',          'Diagnostic',   250,   10),
  ('OPG',   'OPG (Panoramic X-ray)',           'Diagnostic',   800,   15),
  ('SCAL',  'Scaling & Polishing',             'Preventive',  1500,   45),
  ('FLUO',  'Fluoride Application',            'Preventive',   800,   20),
  ('COMP',  'Composite Filling',               'Restorative', 1800,   30),
  ('GIC',   'GIC Filling',                     'Restorative', 1000,   30),
  ('RCT',   'Root Canal Treatment',            'Endodontics', 6500,   60),
  ('CRPFM', 'PFM Crown',                       'Prosthodontics', 5500, 45),
  ('CRZR',  'Zirconia Crown',                  'Prosthodontics', 12000, 45),
  ('EXT',   'Simple Extraction',               'Oral Surgery', 1200,   30),
  ('SXT',   'Surgical Extraction (Wisdom)',    'Oral Surgery', 5000,   60),
  ('IMPL',  'Dental Implant',                  'Implantology', 35000,  90),
  ('BRCE',  'Metal Braces (full treatment)',   'Orthodontics', 40000,  60),
  ('WHTN',  'Teeth Whitening',                 'Cosmetic',     8000,   60);

INSERT INTO patients (first_name, last_name, gender, date_of_birth, phone, email, address, blood_group, allergies, medical_history, created_by) VALUES
  ('Ananya',  'Iyer',      'female', '1994-03-12', '9840011111', 'ananya@example.com', 'Katpadi, Vellore', 'B+',  'Penicillin', NULL, 4),
  ('Rahul',   'Sharma',    'male',   '1988-07-25', '9840022222', NULL,                  'Gandhi Nagar, Vellore', 'O+', NULL, 'Hypertension (on medication)', 4),
  ('Meera',   'Krishnan',  'female', '2001-11-02', '9840033333', 'meera.k@example.com', 'Sathuvachari, Vellore', 'A+', NULL, NULL, 4),
  ('Vikram',  'Singh',     'male',   '1975-01-30', '9840044444', NULL,                  'Bagayam, Vellore', 'AB+', 'Latex', 'Type 2 diabetes', 4),
  ('Fatima',  'Begum',     'female', '1990-06-18', '9840055555', NULL,                  'Katpadi, Vellore', 'O-', NULL, NULL, 4),
  ('Karthik', 'Subramani', 'male',   '2010-09-09', '9840066666', NULL,                  'Gandhi Nagar, Vellore', 'B+', NULL, NULL, 4),
  ('Sneha',   'Nair',      'female', '1998-12-21', '9840077777', 'sneha@example.com',   'Arcot Road, Vellore', 'A-', NULL, NULL, 4),
  ('Joseph',  'Thomas',    'male',   '1965-04-04', '9840088888', NULL,                  'Sainathapuram, Vellore', 'O+', 'Aspirin', 'Cardiac stent (2019)', 4);

-- Appointments: a few today, some upcoming, some past
INSERT INTO appointments (patient_id, dentist_id, start_time, end_time, status, reason, created_by) VALUES
  (1, 2, date_trunc('day', now()) + interval '10 hours',              date_trunc('day', now()) + interval '11 hours',              'confirmed', 'RCT - sitting 2', 4),
  (2, 3, date_trunc('day', now()) + interval '10 hours 30 minutes',   date_trunc('day', now()) + interval '11 hours',              'scheduled', 'Braces review', 4),
  (3, 2, date_trunc('day', now()) + interval '12 hours',              date_trunc('day', now()) + interval '12 hours 45 minutes',   'scheduled', 'Scaling', 4),
  (5, 3, date_trunc('day', now()) + interval '16 hours',              date_trunc('day', now()) + interval '16 hours 30 minutes',   'scheduled', 'Consultation - crooked teeth', 4),
  (4, 2, date_trunc('day', now()) + interval '1 day 11 hours',        date_trunc('day', now()) + interval '1 day 12 hours',        'scheduled', 'Extraction 38', 4),
  (7, 2, date_trunc('day', now()) + interval '2 days 15 hours',       date_trunc('day', now()) + interval '2 days 16 hours',       'scheduled', 'Whitening', 4),
  (8, 3, date_trunc('day', now()) + interval '3 days 10 hours',       date_trunc('day', now()) + interval '3 days 10 hours 30 minutes', 'scheduled', 'Denture consult', 4),
  (1, 2, date_trunc('day', now()) - interval '7 days' + interval '10 hours', date_trunc('day', now()) - interval '7 days' + interval '11 hours', 'completed', 'RCT - sitting 1', 4),
  (2, 3, date_trunc('day', now()) - interval '14 days' + interval '11 hours', date_trunc('day', now()) - interval '14 days' + interval '12 hours', 'completed', 'Braces bonding', 4),
  (6, 2, date_trunc('day', now()) - interval '3 days' + interval '17 hours',  date_trunc('day', now()) - interval '3 days' + interval '17 hours 30 minutes', 'completed', 'Filling', 4),
  (4, 2, date_trunc('day', now()) - interval '5 days' + interval '9 hours',   date_trunc('day', now()) - interval '5 days' + interval '9 hours 30 minutes', 'no_show', 'Consultation', 4);

-- Dental chart
INSERT INTO tooth_records (patient_id, tooth_number, condition, surfaces, notes, recorded_by, recorded_at) VALUES
  (1, 36, 'caries',     'O',  'Deep caries, pulp involvement', 2, now() - interval '7 days'),
  (1, 36, 'root_canal', NULL, 'RCT started', 2, now() - interval '7 days' + interval '1 hour'),
  (1, 26, 'filled',     'MO', 'Old amalgam', 2, now() - interval '7 days'),
  (1, 18, 'missing',    NULL, NULL, 2, now() - interval '7 days'),
  (4, 38, 'extraction_needed', NULL, 'Impacted wisdom tooth', 2, now() - interval '5 days'),
  (4, 46, 'crown',      NULL, 'PFM crown, 2017', 2, now() - interval '5 days'),
  (6, 16, 'filled', 'O', 'Composite', 2, now() - interval '3 days'),
  (3, 11, 'healthy', NULL, NULL, 2, now() - interval '30 days');

-- Treatments (completed ones get billed below; planned ones form treatment plans)
INSERT INTO treatments (patient_id, procedure_id, dentist_id, tooth_number, surfaces, status, price, performed_at, notes, created_by) VALUES
  (1, 1,  2, NULL, NULL, 'completed',   300,  now() - interval '7 days', NULL, 2),                        -- 1
  (1, 2,  2, 36,   NULL, 'completed',   250,  now() - interval '7 days', NULL, 2),                        -- 2
  (1, 8,  2, 36,   NULL, 'in_progress', 6500, NULL, 'Sitting 1 of 3 done', 2),                           -- 3
  (1, 9,  2, 36,   NULL, 'planned',     5500, NULL, 'After RCT', 2),                                     -- 4
  (2, 14, 3, NULL, NULL, 'in_progress', 40000, NULL, 'Upper & lower arch', 3),                           -- 5
  (2, 1,  3, NULL, NULL, 'completed',   300,  now() - interval '14 days', NULL, 3),                       -- 6
  (6, 6,  2, 16,   'O',  'completed',   1800, now() - interval '3 days', NULL, 2),                        -- 7
  (4, 12, 2, 38,   NULL, 'planned',     5000, NULL, 'Needs OPG first', 2),                               -- 8
  (4, 3,  2, NULL, NULL, 'completed',   800,  now() - interval '1 day', NULL, 2),                         -- 9
  (3, 4,  2, NULL, NULL, 'planned',     1500, NULL, NULL, 2);                                            -- 10

-- Invoices
SELECT setval('invoice_number_seq', 3);
INSERT INTO invoices (invoice_number, patient_id, issue_date, subtotal, discount, tax_rate, tax_amount, total, amount_paid, status, created_by) VALUES
  ('INV-' || extract(year from now())::int || '-00001', 1, current_date - 7, 550,  0, 0, 0, 550,  550,  'paid',    4),
  ('INV-' || extract(year from now())::int || '-00002', 2, current_date - 14, 20300, 300, 0, 0, 20000, 10000, 'partial', 4),
  ('INV-' || extract(year from now())::int || '-00003', 6, current_date - 3, 1800, 0, 0, 0, 1800, 0,    'unpaid',  4);

INSERT INTO invoice_items (invoice_id, treatment_id, description, quantity, unit_price, amount) VALUES
  (1, 1, 'Consultation', 1, 300, 300),
  (1, 2, 'Intraoral X-ray (IOPA) (tooth 36)', 1, 250, 250),
  (2, 6, 'Consultation', 1, 300, 300),
  (2, NULL, 'Metal Braces - first instalment', 1, 20000, 20000),
  (3, 7, 'Composite Filling (tooth 16)', 1, 1800, 1800);

INSERT INTO payments (invoice_id, amount, method, reference, paid_at, received_by) VALUES
  (1, 550,   'upi',  'UPI-8812', now() - interval '7 days', 4),
  (2, 10000, 'card', 'POS-2231', now() - interval '14 days', 4);

-- Inventory
INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES
  ('Dentsply Distributors Chennai', 'Ramesh K', '044-2345678', 'orders@dentdist.example', 'T. Nagar, Chennai'),
  ('MediSupply Vellore',            'Lakshmi',  '0416-222333', NULL, 'Officers Line, Vellore');

INSERT INTO inventory_items (sku, name, category, unit, quantity, reorder_level, unit_cost, supplier_id, expiry_date) VALUES
  ('GLV-M',   'Nitrile Gloves (M)',          'Consumables',  'box',    12, 5,   450, 2, current_date + 400),
  ('MSK-3P',  'Face Masks 3-ply',            'Consumables',  'box',     3, 5,   180, 2, current_date + 600),
  ('LIG-2',   'Lignocaine 2% with Adrenaline','Anesthetics', 'vial',   18, 20,  85,  1, current_date + 20),
  ('COMP-A2', 'Composite Resin A2',          'Restorative',  'syringe', 6, 4,   1200, 1, current_date + 300),
  ('GP-F2',   'Gutta Percha Points F2',      'Endodontics',  'box',     2, 3,   650, 1, NULL),
  ('NIF-25',  'NiTi Rotary Files 25mm',      'Endodontics',  'pack',    4, 2,   2400, 1, NULL),
  ('SUC-TIP', 'Suction Tips',                'Consumables',  'pack',   25, 10,  120, 2, NULL),
  ('ALG-1',   'Alginate Impression Material','Prosthodontics','pack',    1, 2,   550, 1, current_date + 90);

INSERT INTO stock_movements (item_id, type, quantity, reason, user_id)
SELECT id, 'in', quantity, 'Opening stock', 1 FROM inventory_items;

-- Expenses: two stock purchases received last month plus some other clinic spending
WITH m AS (
  INSERT INTO stock_movements (item_id, type, quantity, reason, user_id, created_at)
  SELECT id, 'in', q, 'Monthly order', 4, now() - d
  FROM (VALUES ('GLV-M', 10, interval '20 days'), ('COMP-A2', 4, interval '9 days')) v(sku, q, d)
  JOIN inventory_items i ON i.sku = v.sku
  RETURNING id, item_id, quantity, created_at
)
INSERT INTO expenses (expense_date, category, description, amount, payment_method, reference, supplier_id, item_id,
                      quantity, unit_cost, movement_id, source, created_by, created_at)
SELECT m.created_at::date, i.category, 'Stock purchase: ' || i.name, m.quantity * i.unit_cost, 'upi',
       'BILL-' || (1040 + m.id), i.supplier_id, i.id, m.quantity, i.unit_cost, m.id, 'stock', 4, m.created_at
FROM m JOIN inventory_items i ON i.id = m.item_id;

INSERT INTO expenses (expense_date, category, description, amount, payment_method, reference, created_by) VALUES
  (current_date - 15, 'Repairs & maintenance', 'Dental chair compressor service', 3500, 'cash', 'SRV-118', 4),
  (current_date - 6,  'Lab charges',           'Crown fabrication - City Dental Lab', 6800, 'bank_transfer', 'CDL-5521', 4),
  (current_date - 2,  'Sterilisation',         'Autoclave pouches and indicator strips', 1250, 'upi', NULL, 4);

-- Keep each item's movement history summing to its current quantity
UPDATE stock_movements o SET quantity = o.quantity - p.quantity
FROM stock_movements p
WHERE p.item_id = o.item_id AND p.reason = 'Monthly order' AND o.reason = 'Opening stock';
