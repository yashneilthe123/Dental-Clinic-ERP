-- ---------------------------------------------------------------------------
-- Expenses: inventory purchases (logged automatically on "stock in") plus
-- manual entries such as equipment, repairs or lab charges.
-- ---------------------------------------------------------------------------
CREATE TABLE expenses (
  id              serial PRIMARY KEY,
  expense_date    date NOT NULL DEFAULT current_date,
  category        text NOT NULL,
  description     text NOT NULL,
  amount          numeric(12,2) NOT NULL CHECK (amount >= 0),
  payment_method  text CHECK (payment_method IN ('cash','upi','card','bank_transfer','cheque','credit','other')),
  reference       text,                  -- supplier bill / invoice number
  supplier_id     integer REFERENCES suppliers(id) ON DELETE SET NULL,
  item_id         integer REFERENCES inventory_items(id) ON DELETE SET NULL,
  quantity        numeric(12,2),
  unit_cost       numeric(12,2),
  movement_id     integer UNIQUE REFERENCES stock_movements(id) ON DELETE SET NULL,
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('stock','manual')),
  notes           text,
  created_by      integer REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_date_idx ON expenses (expense_date DESC);
CREATE INDEX expenses_category_idx ON expenses (category);
CREATE TRIGGER expenses_updated BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backfill purchases already received (opening stock is existing stock, not a purchase)
INSERT INTO expenses (expense_date, category, description, amount, reference, supplier_id, item_id,
                      quantity, unit_cost, movement_id, source, created_by, created_at)
SELECT m.created_at::date, i.category, 'Stock purchase: ' || i.name, round(m.quantity * i.unit_cost, 2),
       m.reason, i.supplier_id, i.id, m.quantity, i.unit_cost, m.id, 'stock', m.user_id, m.created_at
FROM stock_movements m JOIN inventory_items i ON i.id = m.item_id
WHERE m.type = 'in' AND COALESCE(m.reason, '') <> 'Opening stock' AND m.quantity * i.unit_cost > 0;
