-- ==============================================================================
-- Migration 006: Payment Settings Audit Trail, Destination Snapshots & Restaurant Lifecycle
-- Starters4U Multi-Tenant Platform
-- ==============================================================================
-- Summary:
-- 1. Creates `payment_settings_audit` table to record all UPI destination/provider changes.
-- 2. Adds `merchant_upi_snapshot`, `merchant_name_snapshot`, and `payment_destination_snapshot`
--    to `payment_transactions` and `payments` to ensure historical payments are immutable.
-- 3. Updates `restaurants_status_check` constraint to support 'archived' lifecycle status.
-- ==============================================================================

-- 1. Create Payment Settings Audit Log Table
CREATE TABLE IF NOT EXISTS payment_settings_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    changed_by_user_id UUID REFERENCES restaurant_users(id) ON DELETE SET NULL,
    changed_by_role VARCHAR(50) NOT NULL,
    previous_provider VARCHAR(50),
    new_provider VARCHAR(50),
    previous_upi_id VARCHAR(255),
    new_upi_id VARCHAR(255),
    previous_merchant_name VARCHAR(255),
    new_merchant_name VARCHAR(255),
    change_reason VARCHAR(255),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast tenant audit history queries (ordered by most recent first)
CREATE INDEX IF NOT EXISTS idx_payment_settings_audit_restaurant 
    ON payment_settings_audit(restaurant_id, changed_at DESC);

-- 2. Payment Destination Snapshots (Immutable Audit Reconciliation for Historical Transactions)
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS merchant_upi_snapshot VARCHAR(255);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS merchant_name_snapshot VARCHAR(255);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS payment_destination_snapshot JSONB;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS merchant_upi_snapshot VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS merchant_name_snapshot VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_destination_snapshot JSONB;

-- 3. Support 'archived' Restaurant Status in addition to active, suspended, pending, inactive
ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_status_check;
ALTER TABLE restaurants ADD CONSTRAINT restaurants_status_check 
    CHECK (LOWER(status) IN ('active', 'suspended', 'pending', 'inactive', 'archived'));

-- 4. Restaurant Payment Settings Direct UPI & Provider columns
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS direct_upi_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS direct_upi_provider VARCHAR(50) DEFAULT 'GOOGLE_PAY_BUSINESS';
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS merchant_upi_id VARCHAR(255);
ALTER TABLE restaurant_payment_settings ADD COLUMN IF NOT EXISTS merchant_display_name VARCHAR(255);

