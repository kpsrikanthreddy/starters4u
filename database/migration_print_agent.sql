-- ==========================================================
-- Starters4U Print Agent Migration
-- Adds tables: print_devices, printer_configurations, print_jobs, print_job_attempts
-- Multi-Tenant scoped by restaurant_id and branch_id
-- ==========================================================

-- 1. PRINT DEVICES (Windows desktop computers running Starters4U Print Agent)
CREATE TABLE IF NOT EXISTS print_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES restaurant_branches(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    platform VARCHAR(50) DEFAULT 'win32',
    app_version VARCHAR(50) DEFAULT '1.0.0',
    is_active BOOLEAN DEFAULT TRUE,
    last_heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_restaurant_branch_device UNIQUE (restaurant_id, branch_id, device_id)
);

-- 2. PRINTER CONFIGURATIONS (Installed Windows printers mapped to stations)
CREATE TABLE IF NOT EXISTS printer_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES restaurant_branches(id) ON DELETE CASCADE,
    device_id UUID REFERENCES print_devices(id) ON DELETE CASCADE,
    station VARCHAR(50) NOT NULL, -- 'billing', 'kitchen_master', 'kitchen_pizza', 'kitchen_chinese', 'beverage'
    printer_name VARCHAR(255) NOT NULL,
    paper_width_mm INT NOT NULL DEFAULT 80, -- 58 or 80
    copies INT NOT NULL DEFAULT 1,
    is_auto_print BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_device_station_printer UNIQUE (device_id, station)
);

-- 3. PRINT JOBS (Thermal ticket queue for KOT and Bills)
CREATE TABLE IF NOT EXISTS print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES restaurant_branches(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    job_type VARCHAR(20) NOT NULL CHECK (job_type IN ('KOT', 'BILL')),
    station VARCHAR(50) NOT NULL DEFAULT 'kitchen_master',
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'CLAIMED', 'PRINTING', 'PRINTED', 'FAILED', 'CANCELLED')),
    is_reprint BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_by_device_id UUID REFERENCES print_devices(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    printed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRINT JOB ATTEMPTS (Audit log for hardware/driver attempts and troubleshooting)
CREATE TABLE IF NOT EXISTS print_job_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
    device_id UUID REFERENCES print_devices(id) ON DELETE SET NULL,
    attempt_number INT NOT NULL DEFAULT 1,
    status VARCHAR(30) NOT NULL,
    error_message TEXT,
    duration_ms INT,
    attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lightning fast querying and strict multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_print_devices_lookup ON print_devices(restaurant_id, branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_print_devices_token ON print_devices(token_hash);
CREATE INDEX IF NOT EXISTS idx_printer_configs_device ON printer_configurations(device_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_branch_status ON print_jobs(restaurant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_order_id ON print_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_idempotency ON print_jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created_at ON print_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_job_attempts_job_id ON print_job_attempts(job_id);
