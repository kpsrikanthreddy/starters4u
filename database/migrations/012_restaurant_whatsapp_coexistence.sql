-- ==========================================================
-- Migration 012: Restaurant WhatsApp Business App Coexistence Onboarding
-- Stores tenant-isolated WhatsApp Business Platform configuration
-- Mode: COEXISTENCE (Preserves merchant's existing WhatsApp Business App)
-- ==========================================================

CREATE TABLE IF NOT EXISTS restaurant_whatsapp_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'META',
    connection_mode VARCHAR(50) NOT NULL DEFAULT 'COEXISTENCE',
    waba_id VARCHAR(100),
    phone_number_id VARCHAR(100),
    business_id VARCHAR(100),
    display_phone_number VARCHAR(50),
    verified_name VARCHAR(255),
    quality_rating VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'PENDING')),
    encrypted_access_token TEXT,
    token_iv TEXT,
    token_auth_tag TEXT,
    raw_setup_data JSONB DEFAULT '{}'::jsonb,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_whatsapp_integration UNIQUE (restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_whatsapp_restaurant ON restaurant_whatsapp_integrations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_whatsapp_status ON restaurant_whatsapp_integrations(status);
CREATE INDEX IF NOT EXISTS idx_restaurant_whatsapp_waba ON restaurant_whatsapp_integrations(waba_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_whatsapp_phone ON restaurant_whatsapp_integrations(phone_number_id);
