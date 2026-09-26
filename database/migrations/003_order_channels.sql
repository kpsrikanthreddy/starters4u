-- ==========================================================
-- Migration 003: Multi-Restaurant Order Channels & Service Modes
-- Phase 5 Order Engine Architecture
-- ==========================================================

-- 1. EXTEND ORDERS CONSTRAINTS & COLUMNS FOR ALL 4 CHANNELS
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check 
    CHECK (order_type IN ('delivery', 'takeaway', 'dine_in', 'counter'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_entry_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_entry_source_check 
    CHECK (entry_source IN ('table_qr', 'counter_qr', 'online_web', 'pos_counter', 'staff_app', 'customer_web', 'restaurant_admin'));

-- Ensure table_id foreign key column exists on orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number VARCHAR(50);

-- 2. EXTEND RESTAURANT TABLES
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS section VARCHAR(100);
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS qr_token TEXT;
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 3. EXTEND RESTAURANT SETTINGS FOR SERVICE MODES & DELIVERY RULES
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS is_dine_in_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS is_counter_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS is_takeaway_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS is_delivery_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS delivery_radius_km NUMERIC(6, 2) DEFAULT 10.00;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS minimum_order NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS base_delivery_fee NUMERIC(10, 2) DEFAULT 35.00;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10, 2) DEFAULT 299.00;

-- 4. EXTEND RESTAURANT BRANCHES FOR BRANCH-SPECIFIC SERVICE MODES
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS is_dine_in_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS is_counter_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS is_takeaway_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS is_delivery_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS delivery_radius_km NUMERIC(6, 2) DEFAULT 10.00;
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS minimum_order NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS base_delivery_fee NUMERIC(10, 2) DEFAULT 35.00;
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10, 2) DEFAULT 299.00;

-- 5. PERFORMANCE INDEXES FOR CHANNEL FILTERING & TABLES
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(restaurant_id, order_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(restaurant_id, table_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_active ON restaurant_tables(restaurant_id, branch_id, is_active);

-- 6. ATOMIC CONCURRENCY-SAFE ORDER NUMBER COUNTER TABLE
CREATE TABLE IF NOT EXISTS restaurant_order_counters (
    restaurant_id UUID PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
    last_seq INT NOT NULL DEFAULT 1000,
    prefix VARCHAR(20) NOT NULL DEFAULT 'REST',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
