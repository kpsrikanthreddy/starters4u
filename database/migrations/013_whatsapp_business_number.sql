-- ==========================================================
-- Migration 013: Add WhatsApp Business Number to Coexistence Integration
-- Stores the restaurant's existing WhatsApp Business App mobile number
-- ==========================================================

ALTER TABLE restaurant_whatsapp_integrations
ADD COLUMN IF NOT EXISTS whatsapp_business_number VARCHAR(50);
