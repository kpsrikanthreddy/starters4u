import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import { MenuItem } from '../../src/types.js';
import { INITIAL_MENU } from '../../src/data/menuData.js';
import crypto from 'crypto';

export const DEFAULT_RESTAURANT_ID = 'a0000000-0000-0000-0000-000000000001';
export const DEFAULT_BRANCH_ID = 'b0000000-0000-0000-0000-000000000001';

// Helper to map DB row to frontend MenuItem
export function mapRowToMenuItem(row: any): MenuItem {
  const itemCode = row.item_code || row.itemCode || row.id;
  const item: MenuItem = {
    id: row.id || itemCode,
    itemCode: itemCode,
    name: row.name,
    category: row.category,
    dietary: row.dietary_type || row.dietary || 'veg',
    description: row.description || '',
    isPocketPizza: Boolean(row.is_pocket_pizza),
    inStock: Boolean(row.in_stock),
    restaurantId: row.restaurant_id || row.restaurantId,
    branchId: row.branch_id || row.branchId,
  };

  if (row.is_pocket_pizza) {
    item.prices = {
      R: Number(row.price_r || row.prices?.R || 149),
      C: Number(row.price_c || row.prices?.C || 179),
      S: Number(row.price_s || row.prices?.S || 199),
    };
  } else {
    item.price = Number(row.price !== null && row.price !== undefined ? row.price : 149);
  }

  if (row.is_popular) item.isPopular = true;
  if (row.is_chef_special) item.isChefSpecial = true;
  if (row.spicy_level !== undefined && row.spicy_level !== null) item.spicyLevel = Number(row.spicy_level) as any;
  if (row.image_url || row.image) item.image = row.image_url || row.image;
  if (row.badge) item.badge = row.badge;

  return item;
}

export async function getMenu(
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  branchId?: string,
  onlyInStock: boolean = false
): Promise<MenuItem[]> {
  if (isPostgresRunning()) {
    try {
      let sql: string;
      let params: any[];

      if (branchId && branchId !== 'all') {
        sql = onlyInStock
          ? `SELECT * FROM menu_items WHERE restaurant_id = $1 AND (branch_id = $2 OR branch_id IS NULL) AND in_stock = true ORDER BY category, item_code, name`
          : `SELECT * FROM menu_items WHERE restaurant_id = $1 AND (branch_id = $2 OR branch_id IS NULL) ORDER BY category, item_code, name`;
        params = [restaurantId, branchId];
      } else {
        sql = onlyInStock
          ? `SELECT * FROM menu_items WHERE restaurant_id = $1 AND in_stock = true ORDER BY category, item_code, name`
          : `SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY category, item_code, name`;
        params = [restaurantId];
      }

      const res = await query(sql, params);
      return res.rows.map(mapRowToMenuItem);
    } catch (err) {
      console.error('[MenuService] Error fetching menu from PostgreSQL, fallback to in-memory:', err);
    }
  }

  // In-Memory Fallback
  const items = inMemoryDb.menu_items.filter(
    (item) =>
      item.restaurant_id === restaurantId &&
      (!branchId || branchId === 'all' || item.branch_id === branchId || !item.branch_id) &&
      (!onlyInStock || item.in_stock !== false)
  );
  return items.map(mapRowToMenuItem);
}

export interface MenuDiagnosticResult {
  diagnostic: boolean;
  resolvedRestaurantId: string;
  resolvedBranchId: string;
  totalRestaurantItems: number;
  visibleForBranch?: number;
  availableForCustomer?: number;
  returnedCount: number;
  excludedCount: number;
  allCategories?: string[];
  excludedItems: Array<{
    id: string;
    itemCode?: string;
    name: string;
    category: string;
    branchId: string | null;
    inStock: boolean;
    reason: string;
  }>;
  categoriesSummary: Record<string, number>;
}

export async function getMenuDiagnostics(
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  branchId: string = DEFAULT_BRANCH_ID
): Promise<MenuDiagnosticResult> {
  let allRows: any[] = [];
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY category, item_code, name`,
        [restaurantId]
      );
      allRows = res.rows;
    } catch (e) {
      console.error('[MenuService] Error fetching all items for diagnostics:', e);
    }
  } else {
    allRows = inMemoryDb.menu_items.filter((item) => item.restaurant_id === restaurantId);
  }

  const returnedItems: any[] = [];
  const excludedItems: Array<{
    id: string;
    itemCode?: string;
    name: string;
    category: string;
    branchId: string | null;
    inStock: boolean;
    reason: string;
  }> = [];

  const categoriesSummary: Record<string, number> = {};

  for (const row of allRows) {
    const itemBranchId = row.branch_id;
    const inStock = Boolean(row.in_stock);
    const branchMatch = !itemBranchId || itemBranchId === branchId;

    if (!branchMatch) {
      excludedItems.push({
        id: row.id,
        itemCode: row.item_code,
        name: row.name,
        category: row.category,
        branchId: itemBranchId,
        inStock,
        reason: `Branch mismatch: Item belongs to branch ${itemBranchId}, but requested branch is ${branchId}`,
      });
    } else if (!inStock) {
      excludedItems.push({
        id: row.id,
        itemCode: row.item_code,
        name: row.name,
        category: row.category,
        branchId: itemBranchId,
        inStock,
        reason: 'Out of stock: in_stock flag is false (hidden from public customer menu view)',
      });
      returnedItems.push(row);
    } else {
      returnedItems.push(row);
      categoriesSummary[row.category] = (categoriesSummary[row.category] || 0) + 1;
    }
  }

  const allCategories = Array.from(new Set(allRows.map((r: any) => r.category)));
  const availableForCustomer = returnedItems.filter((r: any) => Boolean(r.in_stock)).length;

  return {
    diagnostic: true,
    resolvedRestaurantId: restaurantId,
    resolvedBranchId: branchId,
    totalRestaurantItems: allRows.length,
    visibleForBranch: returnedItems.length,
    availableForCustomer,
    returnedCount: returnedItems.length,
    excludedCount: excludedItems.length,
    allCategories,
    categoriesSummary,
    excludedItems,
  };
}

export async function getMenuItem(identifier: string, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<MenuItem | null> {
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT * FROM menu_items WHERE (id::text = $1 OR item_code = $1) AND restaurant_id = $2 LIMIT 1`,
        [identifier, restaurantId]
      );
      if (res.rows.length > 0) {
        return mapRowToMenuItem(res.rows[0]);
      }
      return null;
    } catch (err) {
      console.error('[MenuService] Error fetching menu item:', err);
    }
  }

  const found = inMemoryDb.menu_items.find(
    (item) => (item.id === identifier || item.item_code === identifier) && item.restaurant_id === restaurantId
  );
  return found ? mapRowToMenuItem(found) : null;
}

// Normalize dietary inputs to valid DB enum values ('veg' | 'non-veg' | 'egg' | 'dessert')
export function normalizeDietaryType(input?: any): 'veg' | 'non-veg' | 'egg' | 'dessert' {
  if (typeof input === 'boolean') {
    return input ? 'veg' : 'non-veg';
  }
  const str = String(input || '').toLowerCase().trim();
  if (str === 'non-veg' || str === 'nonveg' || str === 'non-vegetarian' || str === 'non_veg') {
    return 'non-veg';
  }
  if (str === 'egg' || str === 'eggetarian') {
    return 'egg';
  }
  if (str === 'dessert') {
    return 'dessert';
  }
  return 'veg';
}

// Check category belongs to this restaurant and prevent cross-tenant leakage
export async function validateAndResolveCategory(
  categoryInput: string,
  restaurantId: string
): Promise<{ valid: boolean; category: string; error?: string; status?: number }> {
  if (!categoryInput || !categoryInput.trim()) {
    return { valid: false, category: '', error: 'Category is required', status: 400 };
  }

  const trimmed = categoryInput.trim();

  // 1. PostgreSQL checks if active
  if (isPostgresRunning()) {
    try {
      // Check if this category ID or slug belongs to a DIFFERENT restaurant
      const crossRes = await query(
        `SELECT id, restaurant_id, slug, name FROM menu_categories 
         WHERE (id::text = $1 OR slug = $1) AND restaurant_id != $2`,
        [trimmed, restaurantId]
      );

      // Check if this category exists for this restaurant
      const ownRes = await query(
        `SELECT id, restaurant_id, slug, name FROM menu_categories 
         WHERE (id::text = $1 OR slug = $1 OR LOWER(name) = LOWER($1)) AND restaurant_id = $2 LIMIT 1`,
        [trimmed, restaurantId]
      );

      if (ownRes.rows.length > 0) {
        return { valid: true, category: ownRes.rows[0].slug };
      }

      if (crossRes.rows.length > 0) {
        return {
          valid: false,
          category: '',
          error: 'Category belongs to another restaurant. Cross-tenant category usage is forbidden.',
          status: 403,
        };
      }

      // If new category name for this restaurant, create it in menu_categories
      const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'general';
      await query(
        `INSERT INTO menu_categories (restaurant_id, slug, name, display_order, is_active, created_at)
         VALUES ($1, $2, $3, 99, TRUE, NOW())
         ON CONFLICT (restaurant_id, slug) DO NOTHING`,
        [restaurantId, slug, trimmed]
      );
      return { valid: true, category: slug };
    } catch (err) {
      console.error('[MenuService] Error resolving category in PG:', err);
    }
  }

  // 2. In-Memory fallback checks
  const ownCat = (inMemoryDb.menu_categories || []).find(
    (c) => (c.id === trimmed || c.slug === trimmed || c.name?.toLowerCase() === trimmed.toLowerCase()) && c.restaurant_id === restaurantId
  );
  if (ownCat) {
    return { valid: true, category: ownCat.slug };
  }

  const crossCat = (inMemoryDb.menu_categories || []).find(
    (c) => (c.id === trimmed || c.slug === trimmed) && c.restaurant_id !== restaurantId
  );
  if (crossCat) {
    return {
      valid: false,
      category: '',
      error: 'Category belongs to another restaurant. Cross-tenant category usage is forbidden.',
      status: 403,
    };
  }

  // Add new category to inMemoryDb
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'general';
  if (!inMemoryDb.menu_categories) inMemoryDb.menu_categories = [];
  inMemoryDb.menu_categories.push({
    id: `cat-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    restaurant_id: restaurantId,
    slug,
    name: trimmed,
    display_order: 99,
  });

  return { valid: true, category: slug };
}

// Get categories for a restaurant
export async function getCategoriesForRestaurant(
  restaurantId: string
): Promise<Array<{ id: string; slug: string; name: string }>> {
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT id, slug, name FROM menu_categories WHERE restaurant_id = $1 AND is_active = TRUE ORDER BY display_order ASC, name ASC`,
        [restaurantId]
      );
      if (res.rows.length > 0) {
        return res.rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name }));
      }
    } catch (e) {
      console.error('[MenuService] Error fetching categories in PG:', e);
    }
  }

  const fromDb = (inMemoryDb.menu_categories || []).filter((c) => c.restaurant_id === restaurantId);
  if (fromDb.length > 0) {
    return fromDb.map((c) => ({ id: c.id, slug: c.slug, name: c.name }));
  }

  // Derive from existing items
  const items = inMemoryDb.menu_items.filter((i) => i.restaurant_id === restaurantId);
  const distinct = Array.from(new Set(items.map((i) => i.category || 'General')));
  return distinct.map((d) => ({ id: d, slug: d, name: d.replace(/_/g, ' ') }));
}

export async function createMenuItem(
  item: Partial<MenuItem> & { name: string; category: string; dietary?: string; isVegetarian?: boolean; itemCode?: string },
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  branchId?: string | null
): Promise<MenuItem> {
  const itemCode = item.itemCode || item.id || `item-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const isPocket = Boolean(item.isPocketPizza);
  const priceR = item.prices?.R ?? (isPocket ? 149 : null);
  const priceC = item.prices?.C ?? (isPocket ? 179 : null);
  const priceS = item.prices?.S ?? (isPocket ? 199 : null);
  const price = !isPocket ? (item.price ?? 149) : null;
  const inStock = item.inStock !== false;

  // Safe multi-tenant branch resolution: never leak MOZZ branch to another restaurant
  const resolvedBranchId = branchId !== undefined && branchId !== null
    ? branchId
    : (restaurantId === DEFAULT_RESTAURANT_ID ? DEFAULT_BRANCH_ID : null);

  const dietaryType = normalizeDietaryType(item.dietary ?? item.isVegetarian);

  if (isPostgresRunning()) {
    try {
      const sql = `
        INSERT INTO menu_items (
          restaurant_id, branch_id, item_code, category, name, description, dietary_type,
          price, price_r, price_c, price_s, is_pocket_pizza, is_popular, is_chef_special,
          spicy_level, in_stock, image_url, badge, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, NOW(), NOW()
        )
        ON CONFLICT (restaurant_id, item_code) DO UPDATE SET
          branch_id = EXCLUDED.branch_id,
          category = EXCLUDED.category,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          dietary_type = EXCLUDED.dietary_type,
          price = EXCLUDED.price,
          price_r = EXCLUDED.price_r,
          price_c = EXCLUDED.price_c,
          price_s = EXCLUDED.price_s,
          is_pocket_pizza = EXCLUDED.is_pocket_pizza,
          is_popular = EXCLUDED.is_popular,
          is_chef_special = EXCLUDED.is_chef_special,
          spicy_level = EXCLUDED.spicy_level,
          in_stock = EXCLUDED.in_stock,
          image_url = EXCLUDED.image_url,
          badge = EXCLUDED.badge,
          updated_at = NOW()
        RETURNING *;
      `;
      const params = [
        restaurantId,
        resolvedBranchId,
        itemCode,
        item.category,
        item.name,
        item.description || '',
        dietaryType,
        price,
        priceR,
        priceC,
        priceS,
        isPocket,
        Boolean(item.isPopular),
        Boolean(item.isChefSpecial),
        item.spicyLevel ?? 0,
        inStock,
        item.image || null,
        item.badge || null,
      ];
      const res = await query(sql, params);
      return mapRowToMenuItem(res.rows[0]);
    } catch (err: any) {
      console.error('[MenuService] Error inserting menu item in PG:', err);
      throw err;
    }
  }

  // In-Memory
  const generatedId = crypto.randomUUID();
  const existingIdx = inMemoryDb.menu_items.findIndex(
    (it) => (it.item_code === itemCode || it.id === item.id) && it.restaurant_id === restaurantId
  );

  const newObj = {
    id: existingIdx >= 0 ? inMemoryDb.menu_items[existingIdx].id : generatedId,
    item_code: itemCode,
    restaurant_id: restaurantId,
    branch_id: resolvedBranchId,
    category: item.category,
    name: item.name,
    description: item.description || '',
    dietary_type: dietaryType,
    price,
    price_r: priceR,
    price_c: priceC,
    price_s: priceS,
    is_pocket_pizza: isPocket,
    is_popular: Boolean(item.isPopular),
    is_chef_special: Boolean(item.isChefSpecial),
    spicy_level: item.spicyLevel ?? 0,
    in_stock: inStock,
    image_url: item.image || null,
    badge: item.badge || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    inMemoryDb.menu_items[existingIdx] = newObj;
  } else {
    inMemoryDb.menu_items.push(newObj);
  }

  return mapRowToMenuItem(newObj);
}

export async function updateMenuItem(
  identifier: string,
  updates: Partial<MenuItem>,
  restaurantId: string = DEFAULT_RESTAURANT_ID
): Promise<MenuItem | null> {
  const isPocket = updates.isPocketPizza !== undefined ? Boolean(updates.isPocketPizza) : undefined;
  
  if (isPostgresRunning()) {
    try {
      const existing = await query(
        `SELECT * FROM menu_items WHERE (id::text = $1 OR item_code = $1) AND restaurant_id = $2`,
        [identifier, restaurantId]
      );
      if (existing.rows.length === 0) return null;
      const current = existing.rows[0];

      const newCategory = updates.category !== undefined ? updates.category : current.category;
      const newName = updates.name !== undefined ? updates.name : current.name;
      const newDesc = updates.description !== undefined ? updates.description : current.description;
      const newDietary = updates.dietary !== undefined
        ? normalizeDietaryType(updates.dietary)
        : ((updates as any).isVegetarian !== undefined
            ? normalizeDietaryType((updates as any).isVegetarian)
            : current.dietary_type);
      const newIsPocket = isPocket !== undefined ? isPocket : current.is_pocket_pizza;
      
      const newPrice = !newIsPocket && updates.price !== undefined ? updates.price : (!newIsPocket ? current.price : null);
      const newPriceR = newIsPocket && updates.prices?.R !== undefined ? updates.prices.R : (newIsPocket ? current.price_r : null);
      const newPriceC = newIsPocket && updates.prices?.C !== undefined ? updates.prices.C : (newIsPocket ? current.price_c : null);
      const newPriceS = newIsPocket && updates.prices?.S !== undefined ? updates.prices.S : (newIsPocket ? current.price_s : null);

      const newPopular = updates.isPopular !== undefined ? updates.isPopular : current.is_popular;
      const newChef = updates.isChefSpecial !== undefined ? updates.isChefSpecial : current.is_chef_special;
      const newSpicy = updates.spicyLevel !== undefined ? updates.spicyLevel : current.spicy_level;
      const newStock = updates.inStock !== undefined ? updates.inStock : current.in_stock;
      const newImage = updates.image !== undefined ? updates.image : current.image_url;
      const newBadge = updates.badge !== undefined ? updates.badge : current.badge;

      const sql = `
        UPDATE menu_items SET
          category = $1,
          name = $2,
          description = $3,
          dietary_type = $4,
          price = $5,
          price_r = $6,
          price_c = $7,
          price_s = $8,
          is_pocket_pizza = $9,
          is_popular = $10,
          is_chef_special = $11,
          spicy_level = $12,
          in_stock = $13,
          image_url = $14,
          badge = $15,
          updated_at = NOW()
        WHERE id = $16 AND restaurant_id = $17
        RETURNING *;
      `;
      const params = [
        newCategory,
        newName,
        newDesc,
        newDietary,
        newPrice,
        newPriceR,
        newPriceC,
        newPriceS,
        newIsPocket,
        newPopular,
        newChef,
        newSpicy,
        newStock,
        newImage,
        newBadge,
        current.id,
        restaurantId,
      ];
      const res = await query(sql, params);
      return res.rows.length > 0 ? mapRowToMenuItem(res.rows[0]) : null;
    } catch (err: any) {
      console.error('[MenuService] Error updating menu item in PG:', err);
      throw err;
    }
  }

  // In Memory
  const idx = inMemoryDb.menu_items.findIndex(
    (item) => (item.id === identifier || item.item_code === identifier) && item.restaurant_id === restaurantId
  );
  if (idx === -1) return null;

  const cur = inMemoryDb.menu_items[idx];
  const updatedObj = {
    ...cur,
    category: updates.category ?? cur.category,
    name: updates.name ?? cur.name,
    description: updates.description ?? cur.description,
    dietary_type: updates.dietary !== undefined
      ? normalizeDietaryType(updates.dietary)
      : ((updates as any).isVegetarian !== undefined
          ? normalizeDietaryType((updates as any).isVegetarian)
          : cur.dietary_type),
    is_pocket_pizza: updates.isPocketPizza ?? cur.is_pocket_pizza,
    price: updates.price !== undefined ? updates.price : cur.price,
    price_r: updates.prices?.R !== undefined ? updates.prices.R : cur.price_r,
    price_c: updates.prices?.C !== undefined ? updates.prices.C : cur.price_c,
    price_s: updates.prices?.S !== undefined ? updates.prices.S : cur.price_s,
    is_popular: updates.isPopular !== undefined ? updates.isPopular : cur.is_popular,
    is_chef_special: updates.isChefSpecial !== undefined ? updates.isChefSpecial : cur.is_chef_special,
    spicy_level: updates.spicyLevel !== undefined ? updates.spicyLevel : cur.spicy_level,
    in_stock: updates.inStock !== undefined ? updates.inStock : cur.in_stock,
    image_url: updates.image !== undefined ? updates.image : cur.image_url,
    badge: updates.badge !== undefined ? updates.badge : cur.badge,
    updated_at: new Date().toISOString(),
  };

  inMemoryDb.menu_items[idx] = updatedObj;
  return mapRowToMenuItem(updatedObj);
}

export async function toggleStock(
  identifier: string,
  explicitInStock?: boolean,
  restaurantId: string = DEFAULT_RESTAURANT_ID
): Promise<MenuItem | null> {
  if (isPostgresRunning()) {
    try {
      let sql: string;
      let params: any[];
      if (explicitInStock !== undefined) {
        sql = `UPDATE menu_items SET in_stock = $1, updated_at = NOW() WHERE (id::text = $2 OR item_code = $2) AND restaurant_id = $3 RETURNING *`;
        params = [explicitInStock, identifier, restaurantId];
      } else {
        sql = `UPDATE menu_items SET in_stock = NOT in_stock, updated_at = NOW() WHERE (id::text = $1 OR item_code = $1) AND restaurant_id = $2 RETURNING *`;
        params = [identifier, restaurantId];
      }
      const res = await query(sql, params);
      return res.rows.length > 0 ? mapRowToMenuItem(res.rows[0]) : null;
    } catch (err: any) {
      console.error('[MenuService] Error toggling stock in PG:', err);
      throw err;
    }
  }

  // In-Memory
  const idx = inMemoryDb.menu_items.findIndex(
    (item) => (item.id === identifier || item.item_code === identifier) && item.restaurant_id === restaurantId
  );
  if (idx === -1) return null;

  const current = inMemoryDb.menu_items[idx];
  const newStock = explicitInStock !== undefined ? explicitInStock : !current.in_stock;
  inMemoryDb.menu_items[idx] = {
    ...current,
    in_stock: newStock,
    updated_at: new Date().toISOString(),
  };

  return mapRowToMenuItem(inMemoryDb.menu_items[idx]);
}

export async function updateItemPrice(
  identifier: string,
  newPrice: number | { R: number; C: number; S: number },
  restaurantId: string = DEFAULT_RESTAURANT_ID
): Promise<MenuItem | null> {
  if (typeof newPrice === 'object' && newPrice !== null) {
    return updateMenuItem(identifier, { prices: newPrice, isPocketPizza: true }, restaurantId);
  } else {
    return updateMenuItem(identifier, { price: Number(newPrice), isPocketPizza: false }, restaurantId);
  }
}

export async function deleteMenuItem(identifier: string, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<boolean> {
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `DELETE FROM menu_items WHERE (id::text = $1 OR item_code = $1) AND restaurant_id = $2`,
        [identifier, restaurantId]
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err: any) {
      console.error('[MenuService] Error deleting menu item from PG:', err);
      throw err;
    }
  }

  const initialLen = inMemoryDb.menu_items.length;
  inMemoryDb.menu_items = inMemoryDb.menu_items.filter(
    (item) => !((item.id === identifier || item.item_code === identifier) && item.restaurant_id === restaurantId)
  );
  return inMemoryDb.menu_items.length < initialLen;
}

export async function resetMenuToDefault(
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  branchId: string = DEFAULT_BRANCH_ID
): Promise<MenuItem[]> {
  if (isPostgresRunning()) {
    try {
      await query(`DELETE FROM menu_items WHERE restaurant_id = $1`, [restaurantId]);
      for (const item of INITIAL_MENU) {
        await createMenuItem({ ...item, itemCode: item.id }, restaurantId, branchId);
      }
      return getMenu(restaurantId, branchId);
    } catch (err) {
      console.error('[MenuService] Error resetting menu in PG:', err);
    }
  }

  inMemoryDb.menu_items = INITIAL_MENU.map((item) => ({
    id: crypto.randomUUID(),
    item_code: item.id,
    restaurant_id: restaurantId,
    branch_id: branchId,
    category: item.category,
    name: item.name,
    description: item.description,
    dietary_type: item.dietary,
    price: item.price ?? null,
    price_r: item.prices?.R ?? null,
    price_c: item.prices?.C ?? null,
    price_s: item.prices?.S ?? null,
    is_pocket_pizza: !!item.isPocketPizza,
    is_popular: !!item.isPopular,
    is_chef_special: !!item.isChefSpecial,
    spicy_level: item.spicyLevel ?? 0,
    in_stock: item.inStock !== false,
    image_url: item.image ?? null,
    badge: item.badge ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  return inMemoryDb.menu_items.map(mapRowToMenuItem);
}
