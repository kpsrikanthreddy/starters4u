-- ==========================================================
-- Migration 001: Multi-Tenant Core & Authorization Foundation
-- Starters4U Multi-Restaurant Engine
-- Idempotent DDL for Supabase / PostgreSQL
-- ==========================================================

-- Enable standard UUID and cryptography extensions if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================================
-- 1. RESTAURANT SETTINGS (Operational Tenant Configuration)
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

-- Ensure columns exist if table was previously partially defined
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS default_branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Kolkata';
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) DEFAULT 5.00;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{"open": "11:00", "close": "23:00", "days": ["mon","tue","wed","thu","fri","sat","sun"]}'::jsonb;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS is_delivery_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS is_takeaway_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS is_dine_in_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS is_counter_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ==========================================================
-- 2. RESTAURANT PAYMENT SETTINGS (Multi-Tenant Payment Gateways)
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

ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS is_cash_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS is_upi_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS upi_id VARCHAR(255);
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS is_online_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS is_razorpay_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS razorpay_key_id VARCHAR(255);
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS active_payment_mode VARCHAR(50) DEFAULT 'ALL';
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS accepted_currencies JSONB DEFAULT '["INR"]'::jsonb;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ==========================================================
-- 3. EXTEND ORDERS CONSTRAINTS FOR COUNTER ORDERING
-- ==========================================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check 
    CHECK (order_type IN ('delivery', 'takeaway', 'dine_in', 'counter'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_entry_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_entry_source_check 
    CHECK (entry_source IN ('table_qr', 'counter_qr', 'online_web', 'pos_counter', 'staff_app', 'customer_web', 'restaurant_admin'));

-- ==========================================================
-- 4. EXTEND USER ROLES FOR PLATFORM & TENANT HIERARCHY
-- ==========================================================
ALTER TABLE restaurant_users DROP CONSTRAINT IF EXISTS restaurant_users_role_check;
ALTER TABLE restaurant_users ADD CONSTRAINT restaurant_users_role_check 
    CHECK (LOWER(role) IN (
      'platform_admin', 'super_admin', 'superadmin',
      'restaurant_admin', 'restaurant_owner', 'owner', 'admin',
      'branch_manager', 'manager',
      'cashier',
      'kitchen', 'chef',
      'waiter', 'rider', 'staff'
    ));

-- ==========================================================
-- 5. SAFE BACKFILLS FOR TENANT DATA INTEGRITY
-- ==========================================================
-- Backfill order_items.restaurant_id from parent orders
UPDATE order_items oi
SET restaurant_id = o.restaurant_id
FROM orders o
WHERE oi.order_id = o.id AND oi.restaurant_id IS NULL;

-- Backfill payments.restaurant_id from parent orders
UPDATE payments p
SET restaurant_id = o.restaurant_id
FROM orders o
WHERE p.order_id = o.id AND p.restaurant_id IS NULL;

-- Backfill kots.restaurant_id from parent orders
UPDATE kots k
SET restaurant_id = o.restaurant_id
FROM orders o
WHERE k.order_id = o.id AND k.restaurant_id IS NULL;

-- Backfill orders.branch_id to default MOZZ branch if missing on MOZZ orders
UPDATE orders
SET branch_id = 'b0000000-0000-0000-0000-000000000001'
WHERE restaurant_id = 'a0000000-0000-0000-0000-000000000001' AND branch_id IS NULL;

-- ==========================================================
-- 6. MULTI-TENANT QUERY OPTIMIZATION INDEXES
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_branch ON orders(restaurant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON orders(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_branch ON menu_items(restaurant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_cat ON menu_items(restaurant_id, category);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(restaurant_id, phone);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_created ON payments(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kots_tenant_status ON kots(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_restaurant_settings_tenant ON restaurant_settings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_payment_settings_tenant ON restaurant_payment_settings(restaurant_id);

-- ==========================================================
-- 7. SEED MOZZ TENANT SETTINGS (Idempotent)
-- ==========================================================
INSERT INTO restaurant_settings (
    restaurant_id, default_branch_id, display_name, logo_url, phone, email, address,
    latitude, longitude, timezone, currency, is_delivery_enabled, is_takeaway_enabled, is_dine_in_enabled, is_counter_enabled
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'MOZZ Chinese & Pizzateria',
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200',
    '+918179620607',
    'contact@mozzpizzateria.com',
    'Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli, Hyderabad, Telangana',
    17.4425090,
    78.3539660,
    'Asia/Kolkata',
    'INR',
    TRUE, TRUE, TRUE, TRUE
) ON CONFLICT (restaurant_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    address = EXCLUDED.address,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = NOW();

INSERT INTO restaurant_payment_settings (
    restaurant_id, is_cash_enabled, is_upi_enabled, upi_id, is_online_enabled, is_razorpay_enabled, active_payment_mode
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    TRUE,
    TRUE,
    'mozz@upi',
    TRUE,
    TRUE,
    'ALL'
) ON CONFLICT (restaurant_id) DO NOTHING;

-- ==========================================================
-- 8. TEST/DEVELOPMENT TENANT FIXTURE (Tenant Isolation Testing)
-- Isolated secondary tenant to prove cross-tenant boundaries
-- ==========================================================
INSERT INTO restaurants (id, name, slug, phone, email, logo_url, tagline, currency, tax_rate, status)
VALUES (
    'a0000000-0000-0000-0000-000000000002',
    'Starters4U Test Kitchen',
    'test-restaurant',
    '+919876543210',
    'admin@testrestaurant.com',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200',
    'Experimental Craft Dishes & Starters',
    'INR',
    5.00,
    'active'
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    status = EXCLUDED.status,
    updated_at = NOW();

INSERT INTO restaurant_branches (id, restaurant_id, name, slug, address, latitude, longitude, delivery_radius_km, phone, is_active)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'Test Kitchen - Hitec City',
    'hitec-city',
    'Cyber Towers Rd, Hitec City, Hyderabad, Telangana',
    17.4504000,
    78.3811000,
    8.00,
    '+919876543210',
    TRUE
) ON CONFLICT (restaurant_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    updated_at = NOW();

INSERT INTO restaurant_settings (
    restaurant_id, default_branch_id, display_name, phone, email, address, latitude, longitude,
    currency, is_delivery_enabled, is_takeaway_enabled, is_dine_in_enabled, is_counter_enabled
) VALUES (
    'a0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    'Starters4U Test Kitchen',
    '+919876543210',
    'admin@testrestaurant.com',
    'Cyber Towers Rd, Hitec City, Hyderabad, Telangana',
    17.4504000,
    78.3811000,
    'INR',
    TRUE, TRUE, TRUE, TRUE
) ON CONFLICT (restaurant_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    updated_at = NOW();

INSERT INTO restaurant_payment_settings (
    restaurant_id, is_cash_enabled, is_upi_enabled, upi_id, is_online_enabled, is_razorpay_enabled, active_payment_mode
) VALUES (
    'a0000000-0000-0000-0000-000000000002',
    TRUE,
    TRUE,
    'testkitchen@upi',
    FALSE,
    FALSE,
    'CASH_UPI'
) ON CONFLICT (restaurant_id) DO NOTHING;

-- Test menu category for isolated tenant
INSERT INTO menu_categories (restaurant_id, slug, name, display_order, is_active)
VALUES
    ('a0000000-0000-0000-0000-000000000002', 'test_specialties', 'Test Specialties', 1, TRUE)
ON CONFLICT (restaurant_id, slug) DO NOTHING;

-- Test menu items exclusive to isolated tenant
INSERT INTO menu_items (restaurant_id, branch_id, item_code, category, name, description, dietary_type, price, in_stock)
VALUES
    ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'tst-01', 'test_specialties', 'Truffle Mushroom Sliders', 'Gourmet test sliders with wild mushrooms and truffle aioli.', 'veg', 249.00, TRUE),
    ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'tst-02', 'test_specialties', 'Crispy Wasabi Prawns', 'Tempura battered prawns glazed in mild wasabi honey.', 'non-veg', 299.00, TRUE)
ON CONFLICT (restaurant_id, item_code) DO NOTHING;
