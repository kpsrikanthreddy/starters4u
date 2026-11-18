-- ==========================================================
-- Migration 014: Central SMAV Sync Reliability, Idempotency & Retry Queue
-- Local MOZZ operational tables for SMAV user sync tracking
-- ==========================================================

CREATE TABLE IF NOT EXISTS smav_identity_links (
    local_user_id VARCHAR(255) PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    outlet_code VARCHAR(50) NOT NULL,
    central_user_id VARCHAR(255),
    last_sync_hash VARCHAR(64),
    last_sync_direction VARCHAR(20),
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smav_identity_links_restaurant
    ON smav_identity_links(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_smav_identity_links_central_user
    ON smav_identity_links(central_user_id);

CREATE TABLE IF NOT EXISTS smav_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    outlet_code VARCHAR(50) NOT NULL,
    local_user_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL DEFAULT 'UPSERT',
    payload JSONB NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCEEDED', 'DEAD_LETTER')),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    central_user_id VARCHAR(255),
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smav_sync_jobs_pending
    ON smav_sync_jobs(status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_smav_sync_jobs_user
    ON smav_sync_jobs(restaurant_id, local_user_id);

CREATE TABLE IF NOT EXISTS smav_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100),
    outlet_code VARCHAR(50),
    payload JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'PROCESSED' CHECK (status IN ('PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED')),
    error_message TEXT,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_smav_webhook_events_key
    ON smav_webhook_events(event_key);
