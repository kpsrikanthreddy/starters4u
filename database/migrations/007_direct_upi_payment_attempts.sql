-- ==============================================================================
-- Migration 007: Direct UPI Payment Attempts & Status Verification
-- Starters4U Multi-Tenant Platform
-- ==============================================================================
-- Summary:
-- 1. Creates `payment_attempts` table to securely track every Direct UPI payment attempt.
-- 2. Records payment_id, order_id, restaurant_id, amount, merchant_upi_id, provider,
--    status ('pending', 'paid', 'failed', 'expired', 'cancelled'),
--    provider_transaction_id (UTR), created_at, verified_at, failure_reason.
-- 3. Enables authoritative status polling (GET /api/payments/:paymentId/status)
--    and prevents unverified customer confirmation.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS payment_attempts (
    id VARCHAR(100) PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    order_number VARCHAR(100),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    merchant_upi_id VARCHAR(255) NOT NULL,
    merchant_display_name VARCHAR(255),
    provider VARCHAR(50) NOT NULL DEFAULT 'DIRECT_UPI',
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
    provider_transaction_id VARCHAR(255),
    failure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON payment_attempts(status);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_restaurant ON payment_attempts(restaurant_id, created_at DESC);
