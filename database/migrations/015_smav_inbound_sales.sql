-- Starters4U/MOZZ PostgreSQL: native SMAV order reconciliation.
CREATE TABLE IF NOT EXISTS smav_inbound_sales (
 source_key text PRIMARY KEY, outlet_id uuid NOT NULL, restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 branch_id uuid NOT NULL REFERENCES restaurant_branches(id), native_order_id uuid NOT NULL REFERENCES orders(id),
 bill_number text NOT NULL, feedback_claimed_at timestamptz, feedback_sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS smav_inbound_order_unique ON smav_inbound_sales(restaurant_id,native_order_id);
