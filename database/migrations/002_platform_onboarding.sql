-- ==========================================================
-- PHASE 2: STARTERS4U PLATFORM ADMIN & ONBOARDING SCHEMA
-- Idempotent Migration for Multi-Tenant Fleet Management
-- ==========================================================

-- 1. Ensure 'restaurants' has owner_name column and status supports suspended/pending
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255);

-- Ensure status values: 'active', 'suspended', 'pending', 'inactive'
ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_status_check;
ALTER TABLE restaurants ADD CONSTRAINT restaurants_status_check 
    CHECK (LOWER(status) IN ('active', 'suspended', 'pending', 'inactive'));

-- 2. Ensure 'restaurant_users' has invitation_status column
ALTER TABLE restaurant_users ADD COLUMN IF NOT EXISTS invitation_status VARCHAR(50) DEFAULT 'active';

-- 3. Dedicated Onboarding Checklist & Progress Tracking Table
CREATE TABLE IF NOT EXISTS restaurant_onboarding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    overall_status VARCHAR(50) DEFAULT 'IN_PROGRESS', -- NOT_STARTED, IN_PROGRESS, READY
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

-- 4. Seed initial onboarding status for existing tenants (MOZZ and Test Kitchen)
INSERT INTO restaurant_onboarding (
    restaurant_id, overall_status, business_details_status, menu_status, 
    business_hours_status, tables_qr_status, payments_status, printer_status, 
    delivery_status, completed_steps, total_steps, notes
)
VALUES 
(
    'a0000000-0000-0000-0000-000000000001',
    'READY',
    'READY',
    'READY',
    'READY',
    'READY',
    'READY',
    'READY',
    'READY',
    7,
    7,
    'Flagship MOZZ Chinese & Pizzateria fully configured and operational.'
),
(
    'a0000000-0000-0000-0000-000000000002',
    'IN_PROGRESS',
    'READY',
    'IN_PROGRESS',
    'READY',
    'READY',
    'READY',
    'NOT_STARTED',
    'READY',
    5,
    7,
    'Starters4U Test Kitchen experimental onboarding.'
)
ON CONFLICT (restaurant_id) DO NOTHING;
