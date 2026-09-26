-- ==============================================================================
-- Migration 008: Multi-Tenant Restaurant Inventory & Stock Management Ledger
-- Starters4U Multi-Tenant Platform
-- ==============================================================================
-- Applicable to: MOZZ, Lollywaffle, all onboarded & future restaurants and branches
-- 
-- Summary of Production Hardening & Safety Constraints:
-- 1. `inventory_items`: Tracks ingredient/material stock quantities, units,
--    minimum thresholds, cost per unit, and active status per restaurant/branch.
--    - Constraints: current_quantity >= 0, minimum_stock_level >= 0, cost_per_unit >= 0.
--    - Unit validation: strict standard units.
--    - SKU uniqueness: scoped per restaurant and branch (allowing NULL SKUs).
--    - Composite constraint (id, restaurant_id) for relational tenant isolation.
--    - Automatic updated_at trigger for timestamp tracking.
-- 2. `inventory_transactions`: Immutable transaction ledger recording every
--    stock movement (OPENING, PURCHASE, ADD, CONSUMPTION, WASTAGE, ADJUSTMENT_IN,
--    ADJUSTMENT_OUT, RETURN) with before/after audit trail.
--    - ON DELETE RESTRICT on inventory_item_id to preserve complete audit history.
--    - Composite foreign key (inventory_item_id, restaurant_id) preventing cross-tenant leakage.
--    - Constraints: quantity > 0, quantity_before >= 0, quantity_after >= 0.
--    - Database-level Immutability Trigger: rejects UPDATE and DELETE on historical ledger rows.
-- 3. Row-level multi-tenant indexing for high-performance stock lookups.
-- 4. Authoritative restaurant timezone boundary guarantee.
-- ==============================================================================

-- 0. Ensure restaurant_settings.timezone exists for authoritative business-day boundaries
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Kolkata';

-- 1. Create inventory_items table
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    unit VARCHAR(50) NOT NULL DEFAULT 'pieces',
    current_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    minimum_stock_level NUMERIC(12, 3) NOT NULL DEFAULT 5.000,
    cost_per_unit NUMERIC(10, 2) DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Quantity & Threshold Non-Negative Constraints
    CONSTRAINT chk_inventory_items_current_qty CHECK (current_quantity >= 0),
    CONSTRAINT chk_inventory_items_min_stock CHECK (minimum_stock_level >= 0),
    CONSTRAINT chk_inventory_items_cost CHECK (cost_per_unit IS NULL OR cost_per_unit >= 0),
    
    -- Standard Restaurant Unit Constraint
    CONSTRAINT chk_inventory_items_unit CHECK (
        unit IN ('kg', 'g', 'litre', 'ml', 'pieces', 'packets', 'boxes', 'bottles', 'cans', 'portions', 'plates', 'cups', 'units')
    ),
    
    -- Relational Multi-Tenant Isolation: composite uniqueness so transactions can reference (id, restaurant_id)
    CONSTRAINT uq_inventory_items_id_restaurant UNIQUE (id, restaurant_id)
);

-- Indexes for inventory items
CREATE INDEX IF NOT EXISTS idx_inventory_items_restaurant ON inventory_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_branch ON inventory_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_low_stock ON inventory_items(restaurant_id, current_quantity, minimum_stock_level);
CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items(restaurant_id, is_active);

-- Per-Tenant / Per-Branch SKU Uniqueness (Permits NULL SKUs without collision)
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_sku_branch 
    ON inventory_items(restaurant_id, branch_id, LOWER(TRIM(sku))) 
    WHERE sku IS NOT NULL AND branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_sku_nobranch 
    ON inventory_items(restaurant_id, LOWER(TRIM(sku))) 
    WHERE sku IS NOT NULL AND branch_id IS NULL;

-- 2. Create immutable inventory_transactions ledger
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES restaurant_branches(id) ON DELETE SET NULL,
    inventory_item_id UUID NOT NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN (
        'OPENING',
        'PURCHASE',
        'ADD',
        'CONSUMPTION',
        'WASTAGE',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'RETURN'
    )),
    quantity NUMERIC(12, 3) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    quantity_before NUMERIC(12, 3) NOT NULL,
    quantity_after NUMERIC(12, 3) NOT NULL,
    reference_type VARCHAR(50), -- 'MANUAL', 'ORDER', 'SUPPLIER_INVOICE', 'DAILY_AUDIT', 'INITIAL_SETUP', 'KITCHEN_USAGE', 'AUDIT_CORRECTION'
    reference_id VARCHAR(255),
    notes TEXT,
    created_by_user_id UUID REFERENCES restaurant_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Quantity Integrity Constraints
    CONSTRAINT chk_inventory_tx_qty CHECK (quantity > 0),
    CONSTRAINT chk_inventory_tx_qty_before CHECK (quantity_before >= 0),
    CONSTRAINT chk_inventory_tx_qty_after CHECK (quantity_after >= 0),
    
    -- Standard Restaurant Unit Constraint
    CONSTRAINT chk_inventory_tx_unit CHECK (
        unit IN ('kg', 'g', 'litre', 'ml', 'pieces', 'packets', 'boxes', 'bottles', 'cans', 'portions', 'plates', 'cups', 'units')
    ),
    
    -- Multi-Tenant Database-Level Isolation: Composite Foreign Key guarantees that an inventory
    -- transaction cannot reference an item from a different restaurant, and preserves audit history (RESTRICT).
    CONSTRAINT fk_inventory_tx_item_tenant 
        FOREIGN KEY (inventory_item_id, restaurant_id) 
        REFERENCES inventory_items(id, restaurant_id) 
        ON DELETE RESTRICT
);

-- Indexes for transaction ledger
CREATE INDEX IF NOT EXISTS idx_inventory_tx_item ON inventory_transactions(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_restaurant_date ON inventory_transactions(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_branch ON inventory_transactions(branch_id);

-- 3. Automatic updated_at trigger for inventory_items
CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at
BEFORE UPDATE ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION update_inventory_updated_at();

-- 4. Database-Level Ledger Immutability: Rejects any UPDATE or DELETE against inventory_transactions
CREATE OR REPLACE FUNCTION prevent_inventory_transactions_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Immutability Violation: inventory_transactions is an immutable append-only ledger. Historical transaction rows cannot be modified or deleted. Create a compensating transaction (ADJUSTMENT_IN or ADJUSTMENT_OUT) instead.'
        USING ERRCODE = '20001';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_transactions_immutable ON inventory_transactions;
CREATE TRIGGER trg_inventory_transactions_immutable
BEFORE UPDATE OR DELETE ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_inventory_transactions_mutation();
