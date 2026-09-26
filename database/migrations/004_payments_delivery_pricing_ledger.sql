-- ==========================================================
-- Migration 004: Multi-Restaurant Payments, Delivery Pricing & Split Ledger
-- Phase 6 Architecture
-- ==========================================================

-- 1. EXTEND RESTAURANT PAYMENT SETTINGS
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS direct_upi_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS direct_upi_provider VARCHAR(50) DEFAULT 'gpay_phonepe';
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS merchant_upi_id VARCHAR(255);
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS merchant_display_name VARCHAR(255);
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS dine_in_direct_upi_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS takeaway_direct_upi_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS delivery_marketplace_payment_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS marketplace_vendor_id VARCHAR(255);
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS marketplace_vendor_status VARCHAR(50) DEFAULT 'NOT_STARTED';
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS settlement_method VARCHAR(50) DEFAULT 'bank_transfer';
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS settlement_account_masked VARCHAR(50);
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS settlement_upi_masked VARCHAR(100);
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS payment_settings_status VARCHAR(50) DEFAULT 'ACTIVE';

-- 2. EXTEND ORDER ITEMS FOR PRICING SNAPSHOTS (Integer paise & numeric)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS base_unit_price_paise INT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS platform_markup_unit_paise INT DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customer_unit_price_paise INT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS base_line_total_paise INT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS platform_markup_line_total_paise INT DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customer_line_total_paise INT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS base_unit_price NUMERIC(10, 2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS platform_markup_unit NUMERIC(10, 2) DEFAULT 0.00;

-- 3. EXTEND ORDERS FOR SPLIT ACCOUNTING & ORDER PAYMENT SUMMARY
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_subtotal NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_markup_total NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_items_total NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_share NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_share NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_fee NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_total NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- 4. PLATFORM PRICING CONFIGURATION TABLE
CREATE TABLE IF NOT EXISTS platform_pricing_config (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    price_band_size_rupees INT NOT NULL DEFAULT 100,
    markup_step_rupees INT NOT NULL DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO platform_pricing_config (id, price_band_size_rupees, markup_step_rupees, is_active)
VALUES ('default', 100, 10, TRUE)
ON CONFLICT (id) DO UPDATE
SET price_band_size_rupees = 100, markup_step_rupees = 10, updated_at = NOW();

-- 5. PAYMENT WEBHOOK EVENTS (Idempotency & Audit Table)
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
    payload JSONB NOT NULL,
    signature VARCHAR(512),
    status VARCHAR(50) DEFAULT 'PROCESSED',
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event ON payment_webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON payment_webhook_events(order_id);

-- 6. AUDITABLE INTERNAL PAYMENT LEDGER: TRANSACTIONS
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL,
    provider_order_id VARCHAR(255),
    provider_payment_id VARCHAR(255),
    customer_paid_amount NUMERIC(10, 2) NOT NULL,
    restaurant_share NUMERIC(10, 2) NOT NULL,
    platform_share NUMERIC(10, 2) NOT NULL,
    gateway_fee NUMERIC(10, 2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'INR',
    payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant ON payment_transactions(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(payment_status);

-- 7. AUDITABLE INTERNAL PAYMENT LEDGER: SPLITS
CREATE TABLE IF NOT EXISTS payment_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_transaction_id UUID NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
    beneficiary_type VARCHAR(50) NOT NULL,
    beneficiary_id VARCHAR(255) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    provider_split_id VARCHAR(255),
    split_status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_splits_tx ON payment_splits(payment_transaction_id);

-- 8. AUDITABLE INTERNAL PAYMENT LEDGER: SETTLEMENTS
CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
    provider_settlement_id VARCHAR(255),
    amount NUMERIC(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    expected_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settlements ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS provider_transfer_id VARCHAR(255);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS utr VARCHAR(255);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_settlements_tenant ON settlements(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_settlements_created ON settlements(created_at DESC);
