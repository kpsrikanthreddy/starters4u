-- ==========================================================
-- MOZZ Chinese & Pizzateria - PostgreSQL Multi-Tenant Schema
-- Idempotent DDL: Creates or Modifies All Database Objects Safely
-- ==========================================================

-- Enable standard UUID and cryptography extensions if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================================
-- 1. RESTAURANTS (Root Multi-Tenant Table)
-- ==========================================================
CREATE TABLE IF NOT EXISTS restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    logo_url TEXT,
    tagline VARCHAR(255),
    currency VARCHAR(10) DEFAULT 'INR',
    tax_rate NUMERIC(5, 2) DEFAULT 5.00,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modify/Add columns if upgrading existing table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS tagline VARCHAR(255);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) DEFAULT 5.00;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ==========================================================
-- 2. RESTAURANT BRANCHES (Multi-Location Support)
-- ==========================================================
CREATE TABLE IF NOT EXISTS restaurant_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100),
    address TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    delivery_radius_km NUMERIC(6, 2) DEFAULT 10.00,
    phone VARCHAR(50),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_branch_slug UNIQUE (restaurant_id, slug)
);

-- Modify/Add columns if upgrading existing table
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS delivery_radius_km NUMERIC(6, 2) DEFAULT 10.00;
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_branches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ==========================================================
-- 3. RESTAURANT USERS & STAFF (Bcrypt Hashed Credentials Only)
-- ==========================================================
CREATE TABLE IF NOT EXISTS restaurant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'staff',
    pin_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_user_email UNIQUE (restaurant_id, email)
);

-- Modify/Add columns and update constraints on existing table
ALTER TABLE restaurant_users ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL;
ALTER TABLE restaurant_users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE restaurant_users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'staff';
ALTER TABLE restaurant_users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);
ALTER TABLE restaurant_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE restaurant_users DROP CONSTRAINT IF EXISTS restaurant_users_role_check;
ALTER TABLE restaurant_users ADD CONSTRAINT restaurant_users_role_check 
    CHECK (LOWER(role) IN ('platform_admin', 'super_admin', 'superadmin', 'restaurant_admin', 'restaurant_owner', 'owner', 'admin', 'branch_manager', 'manager', 'cashier', 'kitchen', 'chef', 'waiter', 'rider', 'staff'));

-- ==========================================================
-- 4. RESTAURANT TABLES (For Dine-In & Table QR Ordering)
-- ==========================================================
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    table_number VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    capacity INT DEFAULT 4,
    qr_token_id VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_table UNIQUE (restaurant_id, branch_id, table_number)
);

-- Modify/Add columns on existing table
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL;
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS table_name VARCHAR(100);
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS capacity INT DEFAULT 4;
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS qr_token_id VARCHAR(255);
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ==========================================================
-- 5. CUSTOMERS (Tenant-Scoped & Unique by Phone)
-- ==========================================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    landmark TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_customer_phone UNIQUE (restaurant_id, phone)
);

-- Modify/Add columns on existing table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS landmark TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ==========================================================
-- 6. MENU CATEGORIES
-- ==========================================================
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_category_slug UNIQUE (restaurant_id, slug)
);

-- Modify/Add columns on existing table
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ==========================================================
-- 7. MENU ITEMS (Multi-Tenant Item Code Unique per Restaurant)
-- ==========================================================
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    item_code VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    dietary_type VARCHAR(50) NOT NULL DEFAULT 'veg' CHECK (dietary_type IN ('veg', 'non-veg', 'egg', 'dessert')),
    price NUMERIC(10, 2),
    price_r NUMERIC(10, 2),
    price_c NUMERIC(10, 2),
    price_s NUMERIC(10, 2),
    is_pocket_pizza BOOLEAN DEFAULT FALSE,
    is_popular BOOLEAN DEFAULT FALSE,
    is_chef_special BOOLEAN DEFAULT FALSE,
    spicy_level INT DEFAULT 0 CHECK (spicy_level BETWEEN 0 AND 3),
    in_stock BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    badge VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_item_code UNIQUE (restaurant_id, item_code)
);

-- Modify/Add columns on existing table
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS item_code VARCHAR(100);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price_r NUMERIC(10, 2);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price_c NUMERIC(10, 2);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price_s NUMERIC(10, 2);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_pocket_pizza BOOLEAN DEFAULT FALSE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT FALSE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_chef_special BOOLEAN DEFAULT FALSE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS spicy_level INT DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT TRUE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS badge VARCHAR(100);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ==========================================================
-- 8. ORDERS (UUID Internal Primary Key + Tenant Unique Order Number)
-- ==========================================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(100) NOT NULL,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    order_type VARCHAR(50) NOT NULL CHECK (order_type IN ('delivery', 'takeaway', 'dine_in', 'counter')),
    entry_source VARCHAR(50) NOT NULL CHECK (entry_source IN ('table_qr', 'counter_qr', 'online_web', 'pos_counter', 'staff_app', 'customer_web', 'restaurant_admin')),
    table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    table_number VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'pending', 'confirmed', 'accepted', 'baking', 'preparing', 'packing', 'out_for_delivery', 'ready_for_pickup', 'ready', 'delivered', 'completed', 'settled', 'cancelled', 'rejected')),
    payment_method VARCHAR(50) NOT NULL,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'cod_pending', 'failed')),
    payment_id VARCHAR(255),
    item_total NUMERIC(10, 2) NOT NULL,
    tax NUMERIC(10, 2) NOT NULL,
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    coupon_code VARCHAR(100),
    grand_total NUMERIC(10, 2) NOT NULL,
    estimated_delivery_time_minutes INT DEFAULT 25,
    kot_number VARCHAR(50),
    kot_station VARCHAR(100),
    waiter_name VARCHAR(100),
    kot_print_count INT DEFAULT 0,
    receipt_print_count INT DEFAULT 0,
    driver_name VARCHAR(100),
    driver_phone VARCHAR(50),
    driver_vehicle VARCHAR(100),
    customer_snapshot JSONB,
    customer_latitude NUMERIC(10, 7),
    customer_longitude NUMERIC(10, 7),
    customer_location_accuracy NUMERIC(10, 2),
    customer_location_captured_at TIMESTAMP,
    customer_location_source VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_order_number UNIQUE (restaurant_id, order_number)
);

-- Modify/Add columns on existing table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS entry_source VARCHAR(50) DEFAULT 'online_web';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_time_minutes INT DEFAULT 25;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kot_number VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kot_station VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kot_print_count INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_print_count INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_vehicle VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_snapshot JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_latitude NUMERIC(10, 7);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_longitude NUMERIC(10, 7);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_location_accuracy NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_location_captured_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_location_source VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ==========================================================
-- 9. ORDER ITEMS (UUID Foreign Key to menu_items ON DELETE SET NULL)
-- ==========================================================
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL,
    selected_shape VARCHAR(10) CHECK (selected_shape IN ('R', 'C', 'S') OR selected_shape IS NULL),
    selected_crust VARCHAR(100),
    spice_level VARCHAR(50),
    addons JSONB DEFAULT '[]'::jsonb,
    special_instructions TEXT,
    item_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modify/Add columns on existing table
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_shape VARCHAR(10);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_crust VARCHAR(100);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS spice_level VARCHAR(50);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS special_instructions TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_metadata JSONB DEFAULT '{}'::jsonb;

-- ==========================================================
-- 10. ORDER STATUS HISTORY (Audit Trail)
-- ==========================================================
CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_order_counters (
    restaurant_id UUID PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
    last_seq INT NOT NULL DEFAULT 1000,
    prefix VARCHAR(20) NOT NULL DEFAULT 'REST',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- 11. PAYMENTS (Secure Audit - No Raw Card or UPI PIN Storage)
-- ==========================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'razorpay',
    provider_order_id VARCHAR(255),
    provider_payment_id VARCHAR(255),
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    payment_method VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modify/Add columns on existing table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'razorpay';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_order_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ==========================================================
-- 12. KOTS (Kitchen Order Tickets)
-- ==========================================================
CREATE TABLE IF NOT EXISTS kots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    kot_number VARCHAR(50) NOT NULL,
    station VARCHAR(100) NOT NULL,
    print_count INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modify/Add columns on existing table
ALTER TABLE kots ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL;
ALTER TABLE kots ADD COLUMN IF NOT EXISTS print_count INT DEFAULT 0;
ALTER TABLE kots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ==========================================================
-- 13. QR CODES (Unique QR Tokens & Anti-Tamper Registry)
-- ==========================================================
CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    code_type VARCHAR(50) NOT NULL CHECK (code_type IN ('table_qr', 'counter_qr', 'online_web')),
    token TEXT NOT NULL,
    target_url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_qr_token UNIQUE (token)
);

-- Modify/Add columns on existing table
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ==========================================================
-- 14. SUBSCRIPTIONS (SaaS Plan & Idempotent Multi-Run Safe)
-- ==========================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    plan_name VARCHAR(100) NOT NULL DEFAULT 'growth',
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
    billing_cycle VARCHAR(50) NOT NULL DEFAULT 'monthly',
    amount NUMERIC(10, 2) DEFAULT 0.00,
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_subscription UNIQUE (restaurant_id)
);

-- Modify/Add columns on existing table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_name VARCHAR(100) DEFAULT 'growth';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(50) DEFAULT 'monthly';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2) DEFAULT 0.00;

-- ==========================================================
-- 15. AUTOMATIC UPDATED_AT TRIGGER FUNCTION
-- ==========================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Safely attach triggers to tables if they don't already exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_restaurants_updated_at') THEN
        CREATE TRIGGER set_restaurants_updated_at BEFORE UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_branches_updated_at') THEN
        CREATE TRIGGER set_branches_updated_at BEFORE UPDATE ON restaurant_branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_users_updated_at') THEN
        CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON restaurant_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_customers_updated_at') THEN
        CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_menu_items_updated_at') THEN
        CREATE TRIGGER set_menu_items_updated_at BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_orders_updated_at') THEN
        CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_payments_updated_at') THEN
        CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_kots_updated_at') THEN
        CREATE TRIGGER set_kots_updated_at BEFORE UPDATE ON kots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ==========================================================
-- 16. PERFORMANCE INDEXES & TENANT SECURITY FILTERS
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_branches_restaurant_id ON restaurant_branches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_branches_rest_branch ON restaurant_branches(restaurant_id, id);

CREATE INDEX IF NOT EXISTS idx_users_restaurant_id ON restaurant_users(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON restaurant_users(email);

CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON restaurant_tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_branch_id ON restaurant_tables(branch_id);
CREATE INDEX IF NOT EXISTS idx_tables_rest_branch ON restaurant_tables(restaurant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_customers_restaurant_id ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_rest_phone ON customers(restaurant_id, phone);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_branch_id ON menu_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_item_code ON menu_items(restaurant_id, item_code);
CREATE INDEX IF NOT EXISTS idx_menu_items_in_stock ON menu_items(in_stock);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_rest_branch ON orders(restaurant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_rest_order_num ON orders(restaurant_id, order_number);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_restaurant_id ON order_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

CREATE INDEX IF NOT EXISTS idx_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_kots_order_id ON kots(order_id);
CREATE INDEX IF NOT EXISTS idx_kots_restaurant_id ON kots(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_token ON qr_codes(token);

-- ==========================================================
-- 15. STARTERS4U PRINT AGENT & THERMAL PRINTING
-- ==========================================================
CREATE TABLE IF NOT EXISTS print_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES restaurant_branches(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    platform VARCHAR(50) DEFAULT 'win32',
    app_version VARCHAR(50) DEFAULT '1.0.0',
    is_active BOOLEAN DEFAULT TRUE,
    last_heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_branch_device UNIQUE (restaurant_id, branch_id, device_id)
);

CREATE TABLE IF NOT EXISTS device_pairing_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(6) NOT NULL,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES restaurant_branches(id) ON DELETE CASCADE,
    created_by_user_id UUID REFERENCES restaurant_users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    used_by_device_id UUID REFERENCES print_devices(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS printer_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES restaurant_branches(id) ON DELETE CASCADE,
    device_id UUID REFERENCES print_devices(id) ON DELETE CASCADE,
    station VARCHAR(50) NOT NULL,
    printer_name VARCHAR(255) NOT NULL,
    paper_width_mm INT NOT NULL DEFAULT 80,
    copies INT NOT NULL DEFAULT 1,
    is_auto_print BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_device_station_printer UNIQUE (device_id, station)
);

CREATE TABLE IF NOT EXISTS print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES restaurant_branches(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    job_type VARCHAR(20) NOT NULL CHECK (job_type IN ('KOT', 'BILL')),
    station VARCHAR(50) NOT NULL DEFAULT 'kitchen_master',
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'CLAIMED', 'PRINTING', 'PRINTED', 'FAILED', 'CANCELLED')),
    is_reprint BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_by_device_id UUID REFERENCES print_devices(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    printed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS print_job_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
    device_id UUID REFERENCES print_devices(id) ON DELETE SET NULL,
    attempt_number INT NOT NULL DEFAULT 1,
    status VARCHAR(30) NOT NULL,
    error_message TEXT,
    duration_ms INT,
    attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_devices_lookup ON print_devices(restaurant_id, branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_print_devices_token ON print_devices(token_hash);
CREATE INDEX IF NOT EXISTS idx_printer_configs_device ON printer_configurations(device_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_branch_status ON print_jobs(restaurant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_order_id ON print_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_idempotency ON print_jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created_at ON print_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_job_attempts_job_id ON print_job_attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_lookup ON device_pairing_codes(code, is_used, expires_at);

-- ==========================================================
-- 20. CUSTOMER INQUIRIES & MULTI-TENANT PERSISTENCE
-- ==========================================================
CREATE TABLE IF NOT EXISTS customer_inquiries (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    order_id VARCHAR(50),
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'resolved', 'spam')),
    ip_hash VARCHAR(64) NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS order_id VARCHAR(50);
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'new';
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(64);
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_customer_inquiries_tenant ON customer_inquiries(restaurant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_tenant_status ON customer_inquiries(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_created_at ON customer_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_ip_hash ON customer_inquiries(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_order_id ON customer_inquiries(order_id);

-- ==========================================================
-- 21. DURABLE DISTRIBUTED RATE LIMITS
-- ==========================================================
CREATE TABLE IF NOT EXISTS distributed_rate_limits (
    key VARCHAR(128) PRIMARY KEY,
    hit_count INT NOT NULL DEFAULT 1,
    reset_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON distributed_rate_limits(reset_at);

-- ==========================================================
-- 22. RESTAURANT SETTINGS (Operational Tenant Configuration)
-- ==========================================================
CREATE TABLE IF NOT EXISTS restaurant_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    default_branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    display_name VARCHAR(255),
    logo_url TEXT,
    banner_url TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    currency VARCHAR(10) DEFAULT 'INR',
    tax_rate NUMERIC(5, 2) DEFAULT 5.00,
    business_hours JSONB DEFAULT '{"open": "11:00", "close": "23:00", "days": ["mon","tue","wed","thu","fri","sat","sun"]}'::jsonb,
    is_delivery_enabled BOOLEAN DEFAULT TRUE,
    is_takeaway_enabled BOOLEAN DEFAULT TRUE,
    is_dine_in_enabled BOOLEAN DEFAULT TRUE,
    is_counter_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_settings_restaurant UNIQUE (restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_settings_tenant ON restaurant_settings(restaurant_id);

-- ==========================================================
-- 23. RESTAURANT PAYMENT SETTINGS (Multi-Tenant Payment Gateways)
-- ==========================================================
CREATE TABLE IF NOT EXISTS restaurant_payment_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    is_cash_enabled BOOLEAN DEFAULT TRUE,
    is_upi_enabled BOOLEAN DEFAULT TRUE,
    upi_id VARCHAR(255),
    is_online_enabled BOOLEAN DEFAULT TRUE,
    is_razorpay_enabled BOOLEAN DEFAULT TRUE,
    razorpay_key_id VARCHAR(255),
    active_payment_mode VARCHAR(50) DEFAULT 'ALL' CHECK (active_payment_mode IN ('CASH', 'UPI', 'CASH_UPI', 'ONLINE', 'ALL', 'LATER')),
    accepted_currencies JSONB DEFAULT '["INR"]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_payment_settings UNIQUE (restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_payment_settings_tenant ON restaurant_payment_settings(restaurant_id);

-- ==========================================================
-- 24. RESTAURANT ONBOARDING CHECKLIST & PROGRESS
-- ==========================================================
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255);
ALTER TABLE restaurant_users ADD COLUMN IF NOT EXISTS invitation_status VARCHAR(50) DEFAULT 'active';

CREATE TABLE IF NOT EXISTS restaurant_onboarding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    overall_status VARCHAR(50) DEFAULT 'IN_PROGRESS',
    business_details_status VARCHAR(50) DEFAULT 'READY',
    menu_status VARCHAR(50) DEFAULT 'NOT_STARTED',
    business_hours_status VARCHAR(50) DEFAULT 'READY',
    tables_qr_status VARCHAR(50) DEFAULT 'READY',
    payments_status VARCHAR(50) DEFAULT 'READY',
    printer_status VARCHAR(50) DEFAULT 'NOT_STARTED',
    delivery_status VARCHAR(50) DEFAULT 'NOT_STARTED',
    completed_steps INT DEFAULT 4,
    total_steps INT DEFAULT 7,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_onboarding UNIQUE (restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_onboarding_restaurant ON restaurant_onboarding(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_onboarding_status ON restaurant_onboarding(overall_status);


