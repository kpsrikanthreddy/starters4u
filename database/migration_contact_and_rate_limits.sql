-- ==========================================================
-- Starters4U Idempotent Migration: Contact Inquiries & Distributed Rate Limits
-- Multi-Tenant scoped by restaurant_id and branch_id
-- Fully Idempotent DDL for Supabase / PostgreSQL
-- ==========================================================

-- Enable pgcrypto / uuid extensions if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================================
-- 1. CUSTOMER INQUIRIES (Multi-Tenant Support & Audit)
-- ==========================================================
CREATE TABLE IF NOT EXISTS customer_inquiries (
    id VARCHAR(64) PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    order_id VARCHAR(50),
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'in_review', 'resolved', 'spam')),
    ip_hash VARCHAR(64) NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist if table was previously created with fewer columns
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS order_id VARCHAR(50);
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'new';
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(64);
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Status constraint
ALTER TABLE customer_inquiries DROP CONSTRAINT IF EXISTS customer_inquiries_status_check;
ALTER TABLE customer_inquiries ADD CONSTRAINT customer_inquiries_status_check
    CHECK (status IN ('new', 'in_review', 'resolved', 'spam'));

-- Indexes for efficient multi-tenant queries, status filters, and security audit lookups
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_tenant ON customer_inquiries(restaurant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_tenant_status ON customer_inquiries(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_order_id ON customer_inquiries(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_ip_hash ON customer_inquiries(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_created_at ON customer_inquiries(created_at DESC);

-- ==========================================================
-- 2. DISTRIBUTED RATE LIMITS (Atomic Sliding-Window Table)
-- ==========================================================
CREATE TABLE IF NOT EXISTS distributed_rate_limits (
    key VARCHAR(128) PRIMARY KEY,
    hit_count INT NOT NULL DEFAULT 1,
    reset_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE distributed_rate_limits ADD COLUMN IF NOT EXISTS hit_count INT DEFAULT 1;
ALTER TABLE distributed_rate_limits ADD COLUMN IF NOT EXISTS reset_at TIMESTAMPTZ;
ALTER TABLE distributed_rate_limits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE distributed_rate_limits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON distributed_rate_limits(reset_at);
