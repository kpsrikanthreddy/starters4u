-- Migration 010: Starters4U WhatsApp Feedback schema enhancement
-- Safe additive migration for customer_feedback_requests and restaurant settings

-- 1. Add feedback response columns to customer_feedback_requests
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS feedback_rating VARCHAR(20);
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS feedback_received_at TIMESTAMPTZ;
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS feedback_reply_message_id VARCHAR(255);
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Update constraints and default template name
DO $$
BEGIN
    ALTER TABLE customer_feedback_requests ALTER COLUMN template_name SET DEFAULT 'starters4u_order_feedback';
    
    -- Update status check constraint to include 'RESPONDED'
    ALTER TABLE customer_feedback_requests DROP CONSTRAINT IF EXISTS customer_feedback_requests_status_check;
    ALTER TABLE customer_feedback_requests ADD CONSTRAINT customer_feedback_requests_status_check
        CHECK (status IN ('SCHEDULED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RESPONDED'));

    -- Add check constraint for feedback_rating
    ALTER TABLE customer_feedback_requests DROP CONSTRAINT IF EXISTS customer_feedback_requests_rating_check;
    ALTER TABLE customer_feedback_requests ADD CONSTRAINT customer_feedback_requests_rating_check
        CHECK (feedback_rating IN ('GOOD', 'AVERAGE', 'BAD') OR feedback_rating IS NULL);
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 3. Add google_review_url to restaurant_settings and restaurants if not exists
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS google_review_url VARCHAR(500);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_review_url VARCHAR(500);

-- 4. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_feedback_wamid ON customer_feedback_requests(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_feedback_phone ON customer_feedback_requests(customer_phone);
