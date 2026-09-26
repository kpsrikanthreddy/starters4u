import { query, getClient, inMemoryDb, isPostgresRunning } from '../db.js';
import { randomUUID } from 'crypto';

export const VALID_INVENTORY_UNITS = [
  'kg',
  'g',
  'litre',
  'ml',
  'pieces',
  'packets',
  'boxes',
  'bottles',
  'cans',
  'portions',
  'plates',
  'cups',
  'units',
] as const;

export type ValidInventoryUnit = (typeof VALID_INVENTORY_UNITS)[number];

export interface InventoryItem {
  id: string;
  restaurant_id: string;
  branch_id?: string | null;
  name: string;
  sku?: string | null;
  category: string;
  unit: string;
  current_quantity: number;
  minimum_stock_level: number;
  cost_per_unit?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Computed fields for daily report
  opening_stock?: number;
  added_today?: number;
  used_today?: number;
  wastage_today?: number;
  is_low_stock?: boolean;
}

export type InventoryTransactionType =
  | 'OPENING'
  | 'PURCHASE'
  | 'ADD'
  | 'CONSUMPTION'
  | 'WASTAGE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'RETURN';

export interface InventoryTransaction {
  id: string;
  restaurant_id: string;
  branch_id?: string | null;
  inventory_item_id: string;
  item_name?: string;
  item_sku?: string | null;
  transaction_type: InventoryTransactionType;
  quantity: number;
  unit: string;
  quantity_before: number;
  quantity_after: number;
  reference_type?: string | null;
  reference_id?: string | null;
  notes?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
}

export interface StockMutationParams {
  itemId: string;
  quantity: number;
  transactionType: InventoryTransactionType;
  notes?: string;
  referenceType?: string;
  referenceId?: string;
  userId?: string;
}

// Ensure inMemoryDb collections exist
function ensureInMemoryCollections() {
  if (!inMemoryDb.inventory_items) {
    inMemoryDb.inventory_items = [];
  }
  if (!inMemoryDb.inventory_transactions) {
    inMemoryDb.inventory_transactions = [];
  }
}

/**
 * Resolves the operational timezone for a restaurant (default Asia/Kolkata)
 */
async function resolveRestaurantTimezone(restaurantId: string): Promise<string> {
  const DEFAULT_TZ = 'Asia/Kolkata';
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT timezone FROM restaurant_settings WHERE restaurant_id = $1 LIMIT 1`,
        [restaurantId]
      );
      if (res.rows.length > 0 && res.rows[0].timezone) {
        return res.rows[0].timezone;
      }
    } catch {}
  }
  const memSettings = (inMemoryDb.restaurant_settings || []).find(
    (s: any) => s.restaurant_id === restaurantId || s.id === restaurantId
  );
  return memSettings?.timezone || DEFAULT_TZ;
}

/**
 * Validates inventory unit against standard restaurant inventory units
 */
export function validateInventoryUnit(unit: string): boolean {
  if (!unit) return false;
  const clean = unit.trim().toLowerCase();
  return VALID_INVENTORY_UNITS.includes(clean as ValidInventoryUnit);
}

export class InventoryService {
  /**
   * Fetch all active inventory items with computed today's stock metrics
   * Computed using restaurant-local business date boundaries.
   */
  async getInventoryItems(
    restaurantId: string,
    branchId?: string,
    category?: string
  ): Promise<InventoryItem[]> {
    ensureInMemoryCollections();
    const tz = await resolveRestaurantTimezone(restaurantId);

    if (isPostgresRunning()) {
      try {
        let sql = `
          SELECT 
            i.*,
            -- Added Today: PURCHASE, ADD, ADJUSTMENT_IN, RETURN within restaurant timezone business day
            COALESCE(SUM(CASE 
              WHEN t.created_at >= (NOW() AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2
               AND t.transaction_type IN ('PURCHASE', 'ADD', 'ADJUSTMENT_IN', 'RETURN') 
              THEN t.quantity ELSE 0 END), 0) AS added_today,
            
            -- Used Today: CONSUMPTION, ADJUSTMENT_OUT within restaurant timezone business day
            COALESCE(SUM(CASE 
              WHEN t.created_at >= (NOW() AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2
               AND t.transaction_type IN ('CONSUMPTION', 'ADJUSTMENT_OUT') 
              THEN t.quantity ELSE 0 END), 0) AS used_today,
            
            -- Wastage Today: WASTAGE within restaurant timezone business day
            COALESCE(SUM(CASE 
              WHEN t.created_at >= (NOW() AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2
               AND t.transaction_type = 'WASTAGE' 
              THEN t.quantity ELSE 0 END), 0) AS wastage_today,

            -- Opening transactions entered today (if item was initialized today, do not double-count in added)
            COALESCE(SUM(CASE 
              WHEN t.created_at >= (NOW() AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2
               AND t.transaction_type = 'OPENING' 
              THEN t.quantity ELSE 0 END), 0) AS opening_today
          FROM inventory_items i
          LEFT JOIN inventory_transactions t ON t.inventory_item_id = i.id
          WHERE i.restaurant_id = $1 AND i.is_active = true
        `;
        const params: any[] = [restaurantId, tz];

        if (branchId) {
          params.push(branchId);
          sql += ` AND (i.branch_id = $${params.length} OR i.branch_id IS NULL)`;
        }
        if (category && category !== 'all') {
          params.push(category);
          sql += ` AND i.category ILIKE $${params.length}`;
        }

        sql += ` GROUP BY i.id ORDER BY i.name ASC`;

        const res = await query(sql, params);
        return res.rows.map((row) => {
          const current = parseFloat(row.current_quantity || 0);
          const added = parseFloat(row.added_today || 0);
          const used = parseFloat(row.used_today || 0);
          const wastage = parseFloat(row.wastage_today || 0);
          const openingToday = parseFloat(row.opening_today || 0);

          // Opening stock calculation:
          // If the item had an initial OPENING today, start-of-day opening is that initial quantity.
          // Otherwise, Opening = Current - Added + Used + Wastage.
          let opening = Math.max(0, current - added + used + wastage);
          if (openingToday > 0 && Math.abs(current - (openingToday + added - used - wastage)) < 0.001) {
            opening = openingToday;
          }
          const minStock = parseFloat(row.minimum_stock_level || 0);

          return {
            id: row.id,
            restaurant_id: row.restaurant_id,
            branch_id: row.branch_id,
            name: row.name,
            sku: row.sku,
            category: row.category,
            unit: row.unit,
            current_quantity: current,
            minimum_stock_level: minStock,
            cost_per_unit: row.cost_per_unit ? parseFloat(row.cost_per_unit) : null,
            is_active: row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at,
            opening_stock: parseFloat(opening.toFixed(3)),
            added_today: parseFloat(added.toFixed(3)),
            used_today: parseFloat(used.toFixed(3)),
            wastage_today: parseFloat(wastage.toFixed(3)),
            is_low_stock: current <= minStock,
          };
        });
      } catch (err: any) {
        console.warn('[InventoryService] Postgres getInventoryItems error:', err.message);
      }
    }

    // In-memory fallback
    let items = (inMemoryDb.inventory_items || []).filter(
      (item) => item.restaurant_id === restaurantId && item.is_active !== false
    );

    if (branchId) {
      items = items.filter((item) => !item.branch_id || item.branch_id === branchId);
    }
    if (category && category !== 'all') {
      items = items.filter((item) => item.category.toLowerCase() === category.toLowerCase());
    }

    const txs = inMemoryDb.inventory_transactions || [];
    // Calculate start of day in restaurant timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const localDateStr = formatter.format(now); // 'YYYY-MM-DD'

    return items.map((item) => {
      const itemTxsToday = txs.filter((t) => {
        if (t.inventory_item_id !== item.id) return false;
        const txDateStr = formatter.format(new Date(t.created_at));
        return txDateStr === localDateStr;
      });

      let added = 0;
      let used = 0;
      let wastage = 0;
      let openingToday = 0;

      for (const t of itemTxsToday) {
        const q = parseFloat(String(t.quantity || 0));
        if (['PURCHASE', 'ADD', 'ADJUSTMENT_IN', 'RETURN'].includes(t.transaction_type)) {
          added += q;
        } else if (['CONSUMPTION', 'ADJUSTMENT_OUT'].includes(t.transaction_type)) {
          used += q;
        } else if (t.transaction_type === 'WASTAGE') {
          wastage += q;
        } else if (t.transaction_type === 'OPENING') {
          openingToday += q;
        }
      }

      const current = parseFloat(String(item.current_quantity || 0));
      let opening = Math.max(0, current - added + used + wastage);
      if (openingToday > 0) {
        opening = openingToday;
      }
      const minStock = parseFloat(String(item.minimum_stock_level || 0));

      return {
        ...item,
        current_quantity: current,
        minimum_stock_level: minStock,
        opening_stock: parseFloat(opening.toFixed(3)),
        added_today: parseFloat(added.toFixed(3)),
        used_today: parseFloat(used.toFixed(3)),
        wastage_today: parseFloat(wastage.toFixed(3)),
        is_low_stock: current <= minStock,
      };
    });
  }

  /**
   * Fetch single item by ID
   */
  async getInventoryItemById(restaurantId: string, itemId: string): Promise<InventoryItem | null> {
    ensureInMemoryCollections();

    if (isPostgresRunning()) {
      try {
        const res = await query(
          `SELECT * FROM inventory_items WHERE id = $1 AND restaurant_id = $2`,
          [itemId, restaurantId]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            ...row,
            current_quantity: parseFloat(row.current_quantity || 0),
            minimum_stock_level: parseFloat(row.minimum_stock_level || 0),
            cost_per_unit: row.cost_per_unit ? parseFloat(row.cost_per_unit) : null,
          };
        }
        return null;
      } catch (err: any) {
        console.warn('[InventoryService] Postgres getInventoryItemById error:', err.message);
      }
    }

    const found = (inMemoryDb.inventory_items || []).find(
      (i) => i.id === itemId && i.restaurant_id === restaurantId
    );
    return found || null;
  }

  /**
   * Create new inventory item
   * Enforces unit constraint, per-tenant/branch SKU uniqueness, and non-negative stock.
   */
  async createInventoryItem(
    restaurantId: string,
    branchId: string | undefined,
    data: {
      name: string;
      sku?: string;
      category?: string;
      unit: string;
      initialQuantity?: number;
      minimumStockLevel?: number;
      costPerUnit?: number;
    },
    userId?: string
  ): Promise<InventoryItem> {
    ensureInMemoryCollections();

    const name = data.name.trim();
    if (!name) throw new Error('Item name is required');

    const cleanUnit = data.unit.trim().toLowerCase();
    if (!validateInventoryUnit(cleanUnit)) {
      throw new Error(
        `Invalid inventory unit "${data.unit}". Supported units are: ${VALID_INVENTORY_UNITS.join(', ')}.`
      );
    }

    const cleanSku = data.sku && data.sku.trim() ? data.sku.trim() : null;
    const initialQty = Math.max(0, parseFloat(String(data.initialQuantity || 0)));
    const minStock = Math.max(0, parseFloat(String(data.minimumStockLevel ?? 5)));
    const cost = data.costPerUnit != null ? Math.max(0, parseFloat(String(data.costPerUnit))) : 0;
    const category = data.category && data.category.trim() ? data.category.trim() : 'General';

    // Check SKU Uniqueness within restaurant/branch scope
    if (cleanSku) {
      if (isPostgresRunning()) {
        const skuCheckSql = branchId
          ? `SELECT id FROM inventory_items WHERE restaurant_id = $1 AND branch_id = $2 AND LOWER(sku) = LOWER($3) LIMIT 1`
          : `SELECT id FROM inventory_items WHERE restaurant_id = $1 AND branch_id IS NULL AND LOWER(sku) = LOWER($2) LIMIT 1`;
        const skuCheckParams = branchId ? [restaurantId, branchId, cleanSku] : [restaurantId, cleanSku];
        const skuRes = await query(skuCheckSql, skuCheckParams);
        if (skuRes.rows.length > 0) {
          throw new Error(`SKU "${cleanSku}" is already in use by another item in this inventory scope.`);
        }
      } else {
        const dup = (inMemoryDb.inventory_items || []).find(
          (i) =>
            i.restaurant_id === restaurantId &&
            (!branchId ? !i.branch_id : i.branch_id === branchId) &&
            i.sku &&
            i.sku.toLowerCase() === cleanSku.toLowerCase()
        );
        if (dup) {
          throw new Error(`SKU "${cleanSku}" is already in use by another item in this inventory scope.`);
        }
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    if (isPostgresRunning()) {
      const client = await getClient();
      if (client) {
        try {
          await client.query('BEGIN');

          const insertItemSql = `
            INSERT INTO inventory_items (
              id, restaurant_id, branch_id, name, sku, category, unit,
              current_quantity, minimum_stock_level, cost_per_unit, is_active,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $11)
            RETURNING *;
          `;
          const itemRes = await client.query(insertItemSql, [
            id,
            restaurantId,
            branchId || null,
            name,
            cleanSku,
            category,
            cleanUnit,
            initialQty,
            minStock,
            cost,
            now,
          ]);

          // If initial stock > 0, record OPENING transaction in immutable ledger
          if (initialQty > 0) {
            const txId = randomUUID();
            const insertTxSql = `
              INSERT INTO inventory_transactions (
                id, restaurant_id, branch_id, inventory_item_id, transaction_type,
                quantity, unit, quantity_before, quantity_after, reference_type,
                notes, created_by_user_id, created_at
              ) VALUES ($1, $2, $3, $4, 'OPENING', $5, $6, 0, $5, 'INITIAL_SETUP', 'Initial opening stock setup', $7, $8);
            `;
            await client.query(insertTxSql, [
              txId,
              restaurantId,
              branchId || null,
              id,
              initialQty,
              cleanUnit,
              userId || null,
              now,
            ]);
          }

          await client.query('COMMIT');
          const row = itemRes.rows[0];
          return {
            ...row,
            current_quantity: initialQty,
            minimum_stock_level: minStock,
            cost_per_unit: cost,
            opening_stock: initialQty,
            added_today: 0,
            used_today: 0,
            wastage_today: 0,
            is_low_stock: initialQty <= minStock,
          };
        } catch (err: any) {
          await client.query('ROLLBACK');
          console.error('[InventoryService] Atomic item creation error:', err.message);
          throw err;
        } finally {
          client.release();
        }
      }
    }

    // In-memory fallback
    const newItem: InventoryItem = {
      id,
      restaurant_id: restaurantId,
      branch_id: branchId || null,
      name,
      sku: cleanSku,
      category,
      unit: cleanUnit,
      current_quantity: initialQty,
      minimum_stock_level: minStock,
      cost_per_unit: cost,
      is_active: true,
      created_at: now,
      updated_at: now,
      opening_stock: initialQty,
      added_today: 0,
      used_today: 0,
      wastage_today: 0,
      is_low_stock: initialQty <= minStock,
    };

    inMemoryDb.inventory_items!.push(newItem);

    if (initialQty > 0) {
      inMemoryDb.inventory_transactions!.push({
        id: randomUUID(),
        restaurant_id: restaurantId,
        branch_id: branchId || null,
        inventory_item_id: id,
        item_name: name,
        item_sku: cleanSku,
        transaction_type: 'OPENING',
        quantity: initialQty,
        unit: cleanUnit,
        quantity_before: 0,
        quantity_after: initialQty,
        reference_type: 'INITIAL_SETUP',
        notes: 'Initial opening stock setup',
        created_by_user_id: userId || null,
        created_at: now,
      });
    }

    return newItem;
  }

  /**
   * Update item details (name, sku, category, unit, min threshold, cost, active)
   * Touches updated_at and verifies SKU uniqueness within restaurant/branch scope.
   */
  async updateInventoryItem(
    restaurantId: string,
    itemId: string,
    updates: Partial<{
      name: string;
      sku: string;
      category: string;
      unit: string;
      minimumStockLevel: number;
      costPerUnit: number;
      isActive: boolean;
    }>
  ): Promise<InventoryItem | null> {
    ensureInMemoryCollections();
    const now = new Date().toISOString();

    if (updates.unit !== undefined) {
      const cleanUnit = updates.unit.trim().toLowerCase();
      if (!validateInventoryUnit(cleanUnit)) {
        throw new Error(
          `Invalid inventory unit "${updates.unit}". Supported units are: ${VALID_INVENTORY_UNITS.join(', ')}.`
        );
      }
      updates.unit = cleanUnit;
    }

    if (updates.sku !== undefined && updates.sku.trim()) {
      const cleanSku = updates.sku.trim();
      if (isPostgresRunning()) {
        const skuRes = await query(
          `SELECT id FROM inventory_items WHERE restaurant_id = $1 AND LOWER(sku) = LOWER($2) AND id != $3 LIMIT 1`,
          [restaurantId, cleanSku, itemId]
        );
        if (skuRes.rows.length > 0) {
          throw new Error(`SKU "${cleanSku}" is already in use by another item in this restaurant.`);
        }
      } else {
        const dup = (inMemoryDb.inventory_items || []).find(
          (i) => i.restaurant_id === restaurantId && i.id !== itemId && i.sku && i.sku.toLowerCase() === cleanSku.toLowerCase()
        );
        if (dup) {
          throw new Error(`SKU "${cleanSku}" is already in use by another item in this restaurant.`);
        }
      }
      updates.sku = cleanSku;
    }

    if (isPostgresRunning()) {
      try {
        const fields: string[] = ['updated_at = NOW()'];
        const values: any[] = [];
        let idx = 1;

        if (updates.name !== undefined) {
          fields.push(`name = $${idx++}`);
          values.push(updates.name.trim());
        }
        if (updates.sku !== undefined) {
          fields.push(`sku = $${idx++}`);
          values.push(updates.sku.trim() || null);
        }
        if (updates.category !== undefined) {
          fields.push(`category = $${idx++}`);
          values.push(updates.category.trim());
        }
        if (updates.unit !== undefined) {
          fields.push(`unit = $${idx++}`);
          values.push(updates.unit);
        }
        if (updates.minimumStockLevel !== undefined) {
          fields.push(`minimum_stock_level = $${idx++}`);
          values.push(Math.max(0, Number(updates.minimumStockLevel)));
        }
        if (updates.costPerUnit !== undefined) {
          fields.push(`cost_per_unit = $${idx++}`);
          values.push(Math.max(0, Number(updates.costPerUnit)));
        }
        if (updates.isActive !== undefined) {
          fields.push(`is_active = $${idx++}`);
          values.push(Boolean(updates.isActive));
        }

        values.push(itemId, restaurantId);
        const sql = `UPDATE inventory_items SET ${fields.join(', ')} WHERE id = $${idx++} AND restaurant_id = $${idx} RETURNING *`;
        const res = await query(sql, values);
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            ...row,
            current_quantity: parseFloat(row.current_quantity || 0),
            minimum_stock_level: parseFloat(row.minimum_stock_level || 0),
            cost_per_unit: row.cost_per_unit ? parseFloat(row.cost_per_unit) : null,
          };
        }
        return null;
      } catch (err: any) {
        console.error('[InventoryService] Postgres updateInventoryItem error:', err.message);
        throw err;
      }
    }

    const item = (inMemoryDb.inventory_items || []).find(
      (i) => i.id === itemId && i.restaurant_id === restaurantId
    );
    if (!item) return null;

    if (updates.name !== undefined) item.name = updates.name.trim();
    if (updates.sku !== undefined) item.sku = updates.sku.trim() || null;
    if (updates.category !== undefined) item.category = updates.category.trim();
    if (updates.unit !== undefined) item.unit = updates.unit;
    if (updates.minimumStockLevel !== undefined) item.minimum_stock_level = Math.max(0, Number(updates.minimumStockLevel));
    if (updates.costPerUnit !== undefined) item.cost_per_unit = Math.max(0, Number(updates.costPerUnit));
    if (updates.isActive !== undefined) item.is_active = updates.isActive;
    item.updated_at = now;

    return item;
  }

  /**
   * Preserve Inventory History:
   * Sets is_active = false (Archival / Soft Deletion).
   * Does NOT physically delete rows, ensuring complete transaction audit preservation
   * and strict compatibility with ON DELETE RESTRICT foreign keys.
   */
  async deleteInventoryItem(restaurantId: string, itemId: string): Promise<boolean> {
    ensureInMemoryCollections();

    if (isPostgresRunning()) {
      try {
        const res = await query(
          `UPDATE inventory_items 
           SET is_active = false, updated_at = NOW() 
           WHERE id = $1 AND restaurant_id = $2 
           RETURNING id`,
          [itemId, restaurantId]
        );
        return (res.rowCount || 0) > 0;
      } catch (err: any) {
        console.error('[InventoryService] Postgres deleteInventoryItem (archive) error:', err.message);
        throw err;
      }
    }

    const item = (inMemoryDb.inventory_items || []).find(
      (i) => i.id === itemId && i.restaurant_id === restaurantId
    );
    if (item) {
      item.is_active = false;
      item.updated_at = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * ATOMIC STOCK TRANSACTION MUTATION ENGINE
   * 
   * Strict Concurrency & Multi-Tenant Safety Architecture:
   * 1. Acquires dedicated database client from connection pool.
   * 2. Issues BEGIN to establish atomic transaction boundary.
   * 3. Executes `SELECT ... FOR UPDATE` row-level exclusive lock on inventory_items.
   *    Concurrent mutations on this item are serialized and blocked until COMMIT.
   * 4. Validates tenant isolation, branch scope, and active item status.
   * 5. Validates positive quantity (quantity > 0).
   * 6. Calculates quantity_after.
   *    Strict Non-Negative Stock: Throws Error if negative quantity would occur.
   * 7. Atomically UPDATEs inventory_items.current_quantity and updated_at.
   * 8. Atomically INSERTs immutable audit row into inventory_transactions.
   * 9. Issues COMMIT.
   * 10. In case of any error: issues ROLLBACK and releases client to pool.
   */
  async recordStockTransaction(
    restaurantId: string,
    branchId: string | undefined,
    params: StockMutationParams
  ): Promise<{ item: InventoryItem; transaction: InventoryTransaction }> {
    ensureInMemoryCollections();

    const qty = parseFloat(String(params.quantity));
    if (isNaN(qty) || qty <= 0) {
      throw new Error(`Transaction quantity must be greater than zero (received ${params.quantity})`);
    }

    const validTypes: InventoryTransactionType[] = [
      'OPENING',
      'PURCHASE',
      'ADD',
      'CONSUMPTION',
      'WASTAGE',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'RETURN',
    ];
    if (!validTypes.includes(params.transactionType)) {
      throw new Error(`Invalid transaction type "${params.transactionType}". Supported types: ${validTypes.join(', ')}`);
    }

    const txId = randomUUID();
    const now = new Date().toISOString();

    // 1. PostgreSQL Atomic Transaction with FOR UPDATE Row Lock
    if (isPostgresRunning()) {
      const client = await getClient();
      if (!client) {
        throw new Error('Database client pool unavailable for atomic stock mutation');
      }

      try {
        await client.query('BEGIN');

        // Exclusive row lock on inventory item
        const lockSql = `
          SELECT * FROM inventory_items 
          WHERE id = $1 AND restaurant_id = $2 
          FOR UPDATE
        `;
        const lockRes = await client.query(lockSql, [params.itemId, restaurantId]);

        if (lockRes.rows.length === 0) {
          throw new Error('Inventory item not found or does not belong to this restaurant');
        }

        const currentItem = lockRes.rows[0];
        if (currentItem.is_active === false) {
          throw new Error(`Cannot record transaction for deactivated inventory item "${currentItem.name}".`);
        }

        const qtyBefore = parseFloat(currentItem.current_quantity || 0);
        let qtyAfter = qtyBefore;

        // Determine stock calculation based on direction
        const positiveTypes: InventoryTransactionType[] = ['PURCHASE', 'ADD', 'ADJUSTMENT_IN', 'RETURN'];
        const negativeTypes: InventoryTransactionType[] = ['CONSUMPTION', 'WASTAGE', 'ADJUSTMENT_OUT'];

        if (positiveTypes.includes(params.transactionType)) {
          qtyAfter = parseFloat((qtyBefore + qty).toFixed(3));
        } else if (negativeTypes.includes(params.transactionType)) {
          if (qtyBefore < qty) {
            throw new Error(
              `Insufficient stock for "${currentItem.name}". Current available is ${qtyBefore} ${currentItem.unit}, cannot remove ${qty} ${currentItem.unit}.`
            );
          }
          qtyAfter = parseFloat((qtyBefore - qty).toFixed(3));
        } else if (params.transactionType === 'OPENING') {
          qtyAfter = parseFloat(qty.toFixed(3));
        }

        // Prevent negative stock
        if (qtyAfter < 0) {
          throw new Error(`Stock mutation would result in negative quantity (${qtyAfter} ${currentItem.unit}).`);
        }

        // 1. Atomically UPDATE item current_quantity and updated_at
        const updateSql = `
          UPDATE inventory_items 
          SET current_quantity = $1, updated_at = NOW() 
          WHERE id = $2 AND restaurant_id = $3 
          RETURNING *;
        `;
        const updateRes = await client.query(updateSql, [qtyAfter, params.itemId, restaurantId]);

        // 2. Atomically INSERT immutable ledger record
        const insertTxSql = `
          INSERT INTO inventory_transactions (
            id, restaurant_id, branch_id, inventory_item_id, transaction_type,
            quantity, unit, quantity_before, quantity_after,
            reference_type, reference_id, notes, created_by_user_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          RETURNING *;
        `;
        const txRes = await client.query(insertTxSql, [
          txId,
          restaurantId,
          branchId || currentItem.branch_id,
          params.itemId,
          params.transactionType,
          qty,
          currentItem.unit,
          qtyBefore,
          qtyAfter,
          params.referenceType || 'STOCK_MUTATION',
          params.referenceId || null,
          params.notes || null,
          params.userId || null,
        ]);

        await client.query('COMMIT');

        const updatedRow = updateRes.rows[0];
        const txRow = txRes.rows[0];

        return {
          item: {
            ...updatedRow,
            current_quantity: qtyAfter,
            minimum_stock_level: parseFloat(updatedRow.minimum_stock_level || 0),
          },
          transaction: {
            ...txRow,
            item_name: currentItem.name,
            item_sku: currentItem.sku,
            quantity: qty,
            quantity_before: qtyBefore,
            quantity_after: qtyAfter,
          },
        };
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[InventoryService] Atomic transaction failed, rolled back:', err.message);
        throw err;
      } finally {
        client.release();
      }
    }

    // 2. In-Memory Atomic Fallback Simulator
    const item = (inMemoryDb.inventory_items || []).find(
      (i) => i.id === params.itemId && i.restaurant_id === restaurantId
    );
    if (!item) {
      throw new Error('Inventory item not found or does not belong to this restaurant');
    }
    if (item.is_active === false) {
      throw new Error(`Cannot record transaction for deactivated inventory item "${item.name}".`);
    }

    const qtyBefore = parseFloat(String(item.current_quantity || 0));
    let qtyAfter = qtyBefore;

    const positiveTypes: InventoryTransactionType[] = ['PURCHASE', 'ADD', 'ADJUSTMENT_IN', 'RETURN'];
    const negativeTypes: InventoryTransactionType[] = ['CONSUMPTION', 'WASTAGE', 'ADJUSTMENT_OUT'];

    if (positiveTypes.includes(params.transactionType)) {
      qtyAfter = parseFloat((qtyBefore + qty).toFixed(3));
    } else if (negativeTypes.includes(params.transactionType)) {
      if (qtyBefore < qty) {
        throw new Error(
          `Insufficient stock for "${item.name}". Current available is ${qtyBefore} ${item.unit}, cannot remove ${qty} ${item.unit}.`
        );
      }
      qtyAfter = parseFloat((qtyBefore - qty).toFixed(3));
    } else if (params.transactionType === 'OPENING') {
      qtyAfter = parseFloat(qty.toFixed(3));
    }

    if (qtyAfter < 0) {
      throw new Error(`Stock mutation would result in negative quantity (${qtyAfter} ${item.unit}).`);
    }

    item.current_quantity = qtyAfter;
    item.updated_at = now;

    const tx: InventoryTransaction = {
      id: txId,
      restaurant_id: restaurantId,
      branch_id: branchId || item.branch_id,
      inventory_item_id: item.id,
      item_name: item.name,
      item_sku: item.sku,
      transaction_type: params.transactionType,
      quantity: qty,
      unit: item.unit,
      quantity_before: qtyBefore,
      quantity_after: qtyAfter,
      reference_type: params.referenceType || 'STOCK_MUTATION',
      reference_id: params.referenceId || null,
      notes: params.notes || null,
      created_by_user_id: params.userId || null,
      created_at: now,
    };

    inMemoryDb.inventory_transactions!.push(tx);

    return { item, transaction: tx };
  }

  /**
   * Add Stock [+ Add Stock]
   * Transaction type: PURCHASE, ADD, ADJUSTMENT_IN, RETURN
   */
  async addStock(
    restaurantId: string,
    branchId: string | undefined,
    data: {
      itemId: string;
      quantity: number;
      transactionType?: 'PURCHASE' | 'ADD' | 'ADJUSTMENT_IN' | 'OPENING' | 'RETURN';
      notes?: string;
      referenceType?: string;
      referenceId?: string;
      userId?: string;
    }
  ): Promise<{ item: InventoryItem; transaction: InventoryTransaction }> {
    return this.recordStockTransaction(restaurantId, branchId, {
      itemId: data.itemId,
      quantity: data.quantity,
      transactionType: data.transactionType || 'PURCHASE',
      notes: data.notes,
      referenceType: data.referenceType || 'PURCHASE_ENTRY',
      referenceId: data.referenceId,
      userId: data.userId,
    });
  }

  /**
   * Record Usage [- Record Usage]
   * Transaction type: CONSUMPTION, ADJUSTMENT_OUT
   */
  async recordUsage(
    restaurantId: string,
    branchId: string | undefined,
    data: {
      itemId: string;
      quantity: number;
      transactionType?: 'CONSUMPTION' | 'ADJUSTMENT_OUT';
      notes?: string;
      referenceType?: string;
      referenceId?: string;
      userId?: string;
    }
  ): Promise<{ item: InventoryItem; transaction: InventoryTransaction }> {
    return this.recordStockTransaction(restaurantId, branchId, {
      itemId: data.itemId,
      quantity: data.quantity,
      transactionType: data.transactionType || 'CONSUMPTION',
      notes: data.notes,
      referenceType: data.referenceType || 'KITCHEN_USAGE',
      referenceId: data.referenceId,
      userId: data.userId,
    });
  }

  /**
   * Record Wastage [Record Wastage]
   * Transaction type: WASTAGE
   */
  async recordWastage(
    restaurantId: string,
    branchId: string | undefined,
    data: {
      itemId: string;
      quantity: number;
      reason?: string;
      notes?: string;
      userId?: string;
    }
  ): Promise<{ item: InventoryItem; transaction: InventoryTransaction }> {
    const combinedNotes = data.notes
      ? `${data.reason ? `[${data.reason}] ` : ''}${data.notes}`
      : data.reason || 'Preparation wastage / spoilage';

    return this.recordStockTransaction(restaurantId, branchId, {
      itemId: data.itemId,
      quantity: data.quantity,
      transactionType: 'WASTAGE',
      notes: combinedNotes,
      referenceType: 'WASTAGE_LOG',
      referenceId: data.reason || 'SPOILED',
      userId: data.userId,
    });
  }

  /**
   * Fetch immutable transaction ledger history
   */
  async getTransactions(
    restaurantId: string,
    branchId?: string,
    itemId?: string,
    limit = 100
  ): Promise<InventoryTransaction[]> {
    ensureInMemoryCollections();

    if (isPostgresRunning()) {
      try {
        let sql = `
          SELECT 
            t.*,
            i.name AS item_name,
            i.sku AS item_sku
          FROM inventory_transactions t
          JOIN inventory_items i ON i.id = t.inventory_item_id
          WHERE t.restaurant_id = $1
        `;
        const params: any[] = [restaurantId];

        if (branchId) {
          params.push(branchId);
          sql += ` AND (t.branch_id = $${params.length} OR t.branch_id IS NULL)`;
        }
        if (itemId) {
          params.push(itemId);
          sql += ` AND t.inventory_item_id = $${params.length}`;
        }

        sql += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const res = await query(sql, params);
        return res.rows.map((row) => ({
          ...row,
          quantity: parseFloat(row.quantity || 0),
          quantity_before: parseFloat(row.quantity_before || 0),
          quantity_after: parseFloat(row.quantity_after || 0),
        }));
      } catch (err: any) {
        console.warn('[InventoryService] Postgres getTransactions error:', err.message);
      }
    }

    // In-memory fallback
    const itemsMap = new Map((inMemoryDb.inventory_items || []).map((i) => [i.id, i]));
    let txs = (inMemoryDb.inventory_transactions || []).filter(
      (t) => t.restaurant_id === restaurantId
    );

    if (branchId) {
      txs = txs.filter((t) => !t.branch_id || t.branch_id === branchId);
    }
    if (itemId) {
      txs = txs.filter((t) => t.inventory_item_id === itemId);
    }

    return txs
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
      .map((t) => {
        const item = itemsMap.get(t.inventory_item_id);
        return {
          ...t,
          item_name: item?.name || t.item_name || 'Item',
          item_sku: item?.sku || t.item_sku || null,
          quantity: parseFloat(String(t.quantity || 0)),
          quantity_before: parseFloat(String(t.quantity_before || 0)),
          quantity_after: parseFloat(String(t.quantity_after || 0)),
        };
      });
  }

  /**
   * Seed default realistic restaurant inventory items if none exist
   */
  async seedDefaultInventoryIfEmpty(restaurantId: string): Promise<void> {
    ensureInMemoryCollections();
    const existing = await this.getInventoryItems(restaurantId);
    if (existing.length > 0) return;

    const defaultItems = [
      { name: 'Chicken', sku: 'RAW-CHK-01', category: 'Poultry', unit: 'kg', initialQuantity: 20, minimumStockLevel: 5, costPerUnit: 220 },
      { name: 'Paneer (Cottage Cheese)', sku: 'DAIRY-PAN-01', category: 'Dairy', unit: 'kg', initialQuantity: 10, minimumStockLevel: 3, costPerUnit: 340 },
      { name: 'Mozzarella Cheese', sku: 'DAIRY-MOZ-01', category: 'Dairy', unit: 'kg', initialQuantity: 8, minimumStockLevel: 2.5, costPerUnit: 480 },
      { name: 'Pizza Flour (Maida)', sku: 'DRY-FLR-01', category: 'Dry Goods', unit: 'kg', initialQuantity: 35, minimumStockLevel: 10, costPerUnit: 45 },
      { name: 'Basmati Rice', sku: 'DRY-RCE-01', category: 'Dry Goods', unit: 'kg', initialQuantity: 25, minimumStockLevel: 8, costPerUnit: 95 },
      { name: 'Refined Cooking Oil', sku: 'OIL-REF-01', category: 'Oils & Sauces', unit: 'litre', initialQuantity: 15, minimumStockLevel: 4, costPerUnit: 140 },
      { name: 'Schezwan Sauce', sku: 'SAUCE-SCH-01', category: 'Oils & Sauces', unit: 'litre', initialQuantity: 6, minimumStockLevel: 2, costPerUnit: 190 },
      { name: 'Pizza Pocket Craft Boxes', sku: 'PKG-BOX-01', category: 'Packaging', unit: 'pieces', initialQuantity: 250, minimumStockLevel: 50, costPerUnit: 8 },
      { name: 'Takeaway Meal Bags', sku: 'PKG-BAG-01', category: 'Packaging', unit: 'pieces', initialQuantity: 300, minimumStockLevel: 60, costPerUnit: 5 },
      { name: 'Coca-Cola (300ml Glass)', sku: 'BEV-COKE-01', category: 'Beverages', unit: 'bottles', initialQuantity: 48, minimumStockLevel: 12, costPerUnit: 35 },
      { name: 'Steamed Momos (Pre-rolled)', sku: 'PREP-MOM-01', category: 'Prep Items', unit: 'pieces', initialQuantity: 80, minimumStockLevel: 20, costPerUnit: 12 },
    ];

    for (const item of defaultItems) {
      await this.createInventoryItem(restaurantId, undefined, item);
    }
  }
}

export const inventoryService = new InventoryService();
