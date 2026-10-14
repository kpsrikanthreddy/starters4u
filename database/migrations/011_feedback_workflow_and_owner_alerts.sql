-- Migration 011: Complete Starters4U WhatsApp Customer Feedback Response Workflow & Owner Alerts
-- Safe additive migration for customer_feedback_requests and restaurant_settings

-- 1. Add feedback comment and owner alert tracking columns to customer_feedback_requests
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS customer_comment TEXT;
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS comment_received_at TIMESTAMPTZ;
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS owner_alert_status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS owner_alert_sent_at TIMESTAMPTZ;
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS owner_alert_whatsapp_message_id VARCHAR(255);
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS owner_alert_error TEXT;
ALTER TABLE customer_feedback_requests ADD COLUMN IF NOT EXISTS acknowledgement_message_id VARCHAR(255);

-- 2. Add feedback alert settings to restaurant_settings
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS feedback_alert_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS feedback_alert_phone VARCHAR(50);
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS feedback_alert_on_bad BOOLEAN DEFAULT TRUE;

-- 3. Configure MOZZ flagship settings with official Google Review URL and feedback alert preferences
UPDATE restaurant_settings
SET google_review_url = COALESCE(google_review_url, 'https://g.page/r/CXG91tSNJZSDEBE/review'),
    feedback_alert_enabled = COALESCE(feedback_alert_enabled, TRUE),
    feedback_alert_on_bad = COALESCE(feedback_alert_on_bad, TRUE),
    feedback_alert_phone = COALESCE(feedback_alert_phone, phone, '+918179620607')
WHERE restaurant_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE restaurants
SET google_review_url = COALESCE(google_review_url, 'https://g.page/r/CXG91tSNJZSDEBE/review')
WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- 4. Fast lookup indexes for feedback response & comment correlation
CREATE INDEX IF NOT EXISTS idx_feedback_owner_alert ON customer_feedback_requests(owner_alert_status);
CREATE INDEX IF NOT EXISTS idx_feedback_ack_msg_id ON customer_feedback_requests(acknowledgement_message_id);
