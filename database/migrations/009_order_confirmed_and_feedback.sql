-- Migration 009: Order Confirmed Timestamp and WhatsApp Feedback Scheduling
-- Adds confirmed_at and completed_at to orders
-- Creates customer_feedback_requests table with unique constraint on order_id for idempotency

ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS customer_feedback_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_phone VARCHAR(50) NOT NULL,
    template_name VARCHAR(100) NOT NULL DEFAULT 'starters4u_order_feedback',
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    whatsapp_message_id VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent updates for existing tables
DO $$
BEGIN
    ALTER TABLE customer_feedback_requests ALTER COLUMN template_name SET DEFAULT 'starters4u_order_feedback';
    ALTER TABLE customer_feedback_requests DROP CONSTRAINT IF EXISTS customer_feedback_requests_status_check;
    ALTER TABLE customer_feedback_requests ADD CONSTRAINT customer_feedback_requests_status_check
        CHECK (status IN ('SCHEDULED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_feedback_due ON customer_feedback_requests(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_feedback_order ON customer_feedback_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_feedback_restaurant ON customer_feedback_requests(restaurant_id);
