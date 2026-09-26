import { query, inMemoryDb, isPostgresRunning, getClient } from '../db.js';
import crypto from 'crypto';
import * as XLSX from 'xlsx';

export interface RawMenuRow {
  category?: string;
  Category?: string;
  item_name?: string;
  'Item Name'?: string;
  name?: string;
  Name?: string;
  description?: string;
  Description?: string;
  price?: string | number;
  Price?: string | number;
  food_type?: string;
  'Food Type'?: string;
  dietary?: string;
  Dietary?: string;
  available?: string | boolean | number;
  Available?: string | boolean | number;
  in_stock?: string | boolean | number;
  'In Stock'?: string | boolean | number;
  sort_order?: string | number;
  'Sort Order'?: string | number;
  image_url?: string;
  'Image URL'?: string;
  image?: string;
  sku?: string;
  SKU?: string;
  subcategory?: string;
  tax_rate?: string | number;
  preparation_time?: string | number;
  is_bestseller?: string | boolean;
  spice_level?: string | number;
  [key: string]: any;
}

export interface ValidatedMenuRow {
  index: number;
  category: string;
  item_name: string;
  description: string;
  price: number;
  raw_price: string;
  food_type: 'veg' | 'non-veg' | 'egg' | 'dessert';
  available: boolean;
  sort_order: number;
  image_url?: string;
  sku?: string;
  is_bestseller: boolean;
  spice_level: number;
  isValid: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
  validationError?: string;
}

export interface ValidationSummary {
  isValid: boolean;
  totalRows: number;
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  categoriesDetected: string[];
  items: ValidatedMenuRow[];
  errors: Array<{ row: number; item: string; error: string }>;
}

export interface MenuImportPayload {
  restaurantId: string;
  branchId?: string;
  duplicateAction: 'skip' | 'update' | 'cancel';
  items: Array<{
    category: string;
    item_name: string;
    description?: string;
    price: number;
    food_type?: 'veg' | 'non-veg' | 'egg' | 'dessert';
    available?: boolean;
    sort_order?: number;
    image_url?: string;
    sku?: string;
    is_bestseller?: boolean;
    spice_level?: number;
  }>;
}

export interface MenuImportResult {
  success: boolean;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  categoriesCreated: number;
  itemsImported: number;
  itemsSkipped: number;
  itemsUpdated: number;
  errors: number;
  totalProcessed: number;
}

export const MAX_IMPORT_ITEMS = 1000;

/**
 * Normalizes Food / Dietary Type safely into allowed Postgres enum values.
 */
export function normalizeFoodType(raw: any): { type: 'veg' | 'non-veg' | 'egg' | 'dessert'; isValid: boolean } {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { type: 'veg', isValid: true };
  }
  const clean = String(raw).trim().toLowerCase().replace(/[_\s-]+/g, '');
  if (['veg', 'vegetarian', 'pureveg', 'green'].includes(clean)) {
    return { type: 'veg', isValid: true };
  }
  if (['nonveg', 'nonvegetarian', 'chicken', 'meat', 'red'].includes(clean)) {
    return { type: 'non-veg', isValid: true };
  }
  if (['egg', 'eggetarian', 'yellow'].includes(clean)) {
    return { type: 'egg', isValid: true };
  }
  if (['dessert', 'sweet', 'bakery'].includes(clean)) {
    return { type: 'dessert', isValid: true };
  }
  return { type: 'veg', isValid: false };
}

/**
 * Safely parses availability boolean from diverse spreadsheet formats.
 */
export function parseAvailability(raw: any): boolean {
  if (raw === undefined || raw === null || raw === '') return true;
  if (typeof raw === 'boolean') return raw;
  const str = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'in stock', 'instock', 'available', 'active'].includes(str)) return true;
  if (['false', '0', 'no', 'n', 'out of stock', 'outofstock', 'unavailable', 'inactive'].includes(str)) return false;
  return true;
}

/**
 * Validates raw rows from CSV or XLSX.
 * Scoped strictly to the authenticated restaurantId to detect duplicates within the tenant.
 */
export async function validateMenuRows(
  rawRows: RawMenuRow[],
  restaurantId: string,
  branchId?: string
): Promise<ValidationSummary> {
  // 1. Fetch existing items for this restaurant to identify duplicates
  let existingItems: Array<{ id: string; name: string; item_code: string; category: string }> = [];

  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT id, name, item_code, category FROM menu_items WHERE restaurant_id = $1`,
        [restaurantId]
      );
      existingItems = res.rows;
    } catch (err) {
      console.error('[MenuImportService] Error fetching existing items from Postgres:', err);
    }
  } else {
    existingItems = inMemoryDb.menu_items
      .filter((i) => i.restaurant_id === restaurantId)
      .map((i) => ({ id: i.id, name: i.name, item_code: i.item_code, category: i.category }));
  }

  const existingMap = new Map<string, { id: string; name: string }>();
  for (const it of existingItems) {
    existingMap.set(it.name.trim().toLowerCase(), it);
    if (it.item_code) {
      existingMap.set(it.item_code.trim().toLowerCase(), it);
    }
  }

  const seenInFile = new Set<string>();
  const validatedItems: ValidatedMenuRow[] = [];
  const errorsList: Array<{ row: number; item: string; error: string }> = [];
  const categoriesDetected = new Set<string>();

  let validCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;

  for (let idx = 0; idx < rawRows.length; idx++) {
    const raw = rawRows[idx];
    const rowNum = idx + 1; // 1-indexed for human readability

    // Extract fields with lenient header casing
    const categoryRaw = raw.category || raw.Category || '';
    const itemNameRaw = raw.item_name || raw['Item Name'] || raw.name || raw.Name || '';
    const descRaw = raw.description || raw.Description || '';
    const priceRaw = raw.price !== undefined ? raw.price : raw.Price;
    const foodTypeRaw = raw.food_type || raw['Food Type'] || raw.dietary || raw.Dietary || 'VEG';
    const availRaw = raw.available !== undefined ? raw.available : (raw.Available !== undefined ? raw.Available : (raw.in_stock !== undefined ? raw.in_stock : raw['In Stock']));
    const sortOrderRaw = raw.sort_order || raw['Sort Order'] || idx + 1;
    const imageUrlRaw = raw.image_url || raw['Image URL'] || raw.image || '';
    const skuRaw = raw.sku || raw.SKU || '';
    const isBestsellerRaw = raw.is_bestseller || false;
    const spiceLevelRaw = raw.spice_level || 0;

    // Check if entire row is empty/blank (ignore empty rows at end of file)
    const isRowEmpty =
      !categoryRaw &&
      !itemNameRaw &&
      !descRaw &&
      (priceRaw === undefined || priceRaw === '' || priceRaw === null);

    if (isRowEmpty) {
      continue;
    }

    const category = String(categoryRaw).trim();
    const itemName = String(itemNameRaw).trim();
    const description = String(descRaw).trim();
    const rawPriceStr = priceRaw !== undefined && priceRaw !== null ? String(priceRaw).trim() : '';

    const rowErrors: string[] = [];

    // Validation 1: Category required & length
    if (!category) {
      rowErrors.push('Category is required.');
    } else if (category.length > 100) {
      rowErrors.push('Category name exceeds 100 characters.');
    } else {
      categoriesDetected.add(category);
    }

    // Validation 2: Item name required & length
    if (!itemName) {
      rowErrors.push('Item name is required.');
    } else if (itemName.length > 200) {
      rowErrors.push('Item name exceeds 200 characters.');
    }

    // Validation 3: Description length limit
    if (description.length > 1000) {
      rowErrors.push('Description exceeds 1000 characters.');
    }

    // Validation 4: Price numeric and >= 0
    let parsedPrice = 0;
    if (rawPriceStr === '') {
      rowErrors.push('Price is required.');
    } else {
      // Remove any currency symbols e.g. ₹ or $ or Rs.
      const sanitizedPrice = rawPriceStr.replace(/[₹$,\sA-Za-z]/g, '');
      const num = Number(sanitizedPrice);
      if (isNaN(num) || !isFinite(num) || num < 0 || num > 100000) {
        rowErrors.push(`Price "${rawPriceStr}" is invalid. Must be a non-negative number.`);
      } else {
        parsedPrice = Math.round(num * 100) / 100;
      }
    }

    // Validation 5: Food type allowed values
    const foodTypeCheck = normalizeFoodType(foodTypeRaw);
    if (!foodTypeCheck.isValid) {
      rowErrors.push(
        `Food type "${String(foodTypeRaw)}" is invalid. Allowed: VEG, NON-VEG, EGG, DESSERT.`
      );
    }

    // Validation 6: Duplicate detection (both inside file and existing in restaurant)
    let isDuplicate = false;
    let duplicateReason: string | undefined;

    const normalizedNameKey = itemName.toLowerCase();
    const fileKey = `${category.toLowerCase()}::${normalizedNameKey}`;

    if (itemName) {
      if (seenInFile.has(fileKey)) {
        isDuplicate = true;
        duplicateReason = `Duplicate item within this import file: "${itemName}" (Row ${rowNum})`;
      } else {
        seenInFile.add(fileKey);
      }

      if (!isDuplicate && existingMap.has(normalizedNameKey)) {
        isDuplicate = true;
        duplicateReason = `Item "${itemName}" already exists in ${category || 'restaurant'} menu`;
      }
      if (!isDuplicate && skuRaw && existingMap.has(String(skuRaw).trim().toLowerCase())) {
        isDuplicate = true;
        duplicateReason = `Item with SKU "${skuRaw}" already exists in menu`;
      }
    }

    if (isDuplicate) {
      duplicateCount++;
    }

    // Sort order & spice level
    const parsedSortOrder = Number(sortOrderRaw) || idx + 1;
    const parsedSpiceLevel = Math.min(3, Math.max(0, Number(spiceLevelRaw) || 0));

    const isValid = rowErrors.length === 0;
    if (isValid) {
      validCount++;
    } else {
      errorCount++;
      errorsList.push({
        row: rowNum,
        item: itemName || '(Unnamed Item)',
        error: rowErrors.join(' '),
      });
    }

    validatedItems.push({
      index: rowNum,
      category: category || 'Uncategorized',
      item_name: itemName || '',
      description,
      price: parsedPrice,
      raw_price: rawPriceStr,
      food_type: foodTypeCheck.type,
      available: parseAvailability(availRaw),
      sort_order: parsedSortOrder,
      image_url: imageUrlRaw ? String(imageUrlRaw).trim() : undefined,
      sku: skuRaw ? String(skuRaw).trim() : undefined,
      is_bestseller: Boolean(isBestsellerRaw),
      spice_level: parsedSpiceLevel,
      isValid,
      isDuplicate,
      duplicateReason,
      validationError: rowErrors.length > 0 ? rowErrors.join(' ') : undefined,
    });
  }

  return {
    isValid: errorCount === 0,
    totalRows: validatedItems.length,
    validCount,
    errorCount,
    duplicateCount,
    categoriesDetected: Array.from(categoriesDetected),
    items: validatedItems,
    errors: errorsList,
  };
}

/**
 * Creates clean category slug unique for the restaurant.
 */
function generateCategorySlug(categoryName: string): string {
  const base = categoryName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || `category_${Date.now().toString(36)}`;
}

/**
 * Executes the Atomic Bulk Menu Import transaction.
 * Strictly scoped to `restaurantId` from authenticated tenant context.
 */
export async function executeMenuImport(payload: MenuImportPayload): Promise<MenuImportResult> {
  const { restaurantId, branchId, duplicateAction = 'skip', items } = payload;

  if (!restaurantId) {
    throw new Error('Tenant context missing: restaurantId is required');
  }

  if (!items || items.length === 0) {
    throw new Error('No items provided for import');
  }

  if (items.length > MAX_IMPORT_ITEMS) {
    throw new Error(`Import payload exceeds maximum limit of ${MAX_IMPORT_ITEMS} items`);
  }

  // 1. Resolve Restaurant Name for reporting
  let restaurantName = 'Restaurant';
  let restaurantSlug = '';
  if (isPostgresRunning()) {
    try {
      const rRes = await query(`SELECT name, slug FROM restaurants WHERE id = $1`, [restaurantId]);
      if (rRes.rows.length > 0) {
        restaurantName = rRes.rows[0].name;
        restaurantSlug = rRes.rows[0].slug;
      }
    } catch {}
  } else {
    const inMemR = inMemoryDb.restaurants.find((r) => r.id === restaurantId);
    if (inMemR) {
      restaurantName = inMemR.name;
      restaurantSlug = inMemR.slug;
    }
  }

  // 2. Resolve default branch if not supplied
  let resolvedBranchId = branchId;
  if (!resolvedBranchId) {
    if (isPostgresRunning()) {
      try {
        const bRes = await query(
          `SELECT id FROM restaurant_branches WHERE restaurant_id = $1 ORDER BY created_at ASC LIMIT 1`,
          [restaurantId]
        );
        if (bRes.rows.length > 0) {
          resolvedBranchId = bRes.rows[0].id;
        }
      } catch {}
    } else {
      const bInMem = inMemoryDb.restaurant_branches.find((b: any) => b.restaurant_id === restaurantId);
      if (bInMem) resolvedBranchId = bInMem.id;
    }
  }

  // ==========================================================
  // ATOMIC DATABASE TRANSACTION (POSTGRESQL)
  // ==========================================================
  if (isPostgresRunning()) {
    const client = await getClient();
    if (!client) {
      throw new Error('Database connection required for restaurant menu import.');
    }

    try {
      await client.query('BEGIN');

      // A. Fetch existing categories for this restaurant
      const existingCatRes = await client.query(
        `SELECT id, slug, name FROM menu_categories WHERE restaurant_id = $1`,
        [restaurantId]
      );
      const categoryMap = new Map<string, string>(); // categoryName.toLowerCase() -> slug
      const knownSlugs = new Set<string>();

      existingCatRes.rows.forEach((c) => {
        categoryMap.set(c.name.trim().toLowerCase(), c.slug);
        knownSlugs.add(c.slug);
      });

      // B. Create missing categories
      let categoriesCreated = 0;
      const uniqueCategories = Array.from(new Set(items.map((i) => i.category.trim()).filter(Boolean)));

      for (let i = 0; i < uniqueCategories.length; i++) {
        const catName = uniqueCategories[i];
        const lowerName = catName.toLowerCase();
        if (!categoryMap.has(lowerName)) {
          let slug = generateCategorySlug(catName);
          let counter = 1;
          while (knownSlugs.has(slug)) {
            slug = `${generateCategorySlug(catName)}_${counter++}`;
          }
          knownSlugs.add(slug);

          await client.query(
            `INSERT INTO menu_categories (restaurant_id, slug, name, display_order, is_active, created_at)
             VALUES ($1, $2, $3, $4, true, NOW())`,
            [restaurantId, slug, catName, existingCatRes.rows.length + categoriesCreated + 1]
          );
          categoryMap.set(lowerName, slug);
          categoriesCreated++;
        }
      }

      // C. Fetch existing items for duplicate comparison within this tenant
      const existingItemsRes = await client.query(
        `SELECT id, name, item_code FROM menu_items WHERE restaurant_id = $1`,
        [restaurantId]
      );
      const existingNameMap = new Map<string, any>();
      const existingCodeMap = new Map<string, any>();
      existingItemsRes.rows.forEach((it) => {
        existingNameMap.set(it.name.trim().toLowerCase(), it);
        if (it.item_code) existingCodeMap.set(it.item_code.trim().toLowerCase(), it);
      });

      let itemsImported = 0;
      let itemsSkipped = 0;
      let itemsUpdated = 0;

      // D. Process each item
      for (const item of items) {
        const lowerName = item.item_name.trim().toLowerCase();
        const skuKey = item.sku ? item.sku.trim().toLowerCase() : undefined;

        const existing = existingNameMap.get(lowerName) || (skuKey ? existingCodeMap.get(skuKey) : undefined);

        if (existing) {
          if (duplicateAction === 'cancel') {
            throw new Error(`Import cancelled: Duplicate item "${item.item_name}" already exists.`);
          }
          if (duplicateAction === 'skip') {
            itemsSkipped++;
            continue;
          }
          if (duplicateAction === 'update') {
            // Update existing item
            await client.query(
              `UPDATE menu_items SET
                 category = $1,
                 name = $2,
                 description = $3,
                 dietary_type = $4,
                 price = $5,
                 in_stock = $6,
                 image_url = COALESCE($7, image_url),
                 is_popular = $8,
                 spicy_level = $9,
                 updated_at = NOW()
               WHERE id = $10 AND restaurant_id = $11`,
              [
                item.category.trim(),
                item.item_name.trim(),
                item.description ? item.description.trim() : '',
                item.food_type || 'veg',
                item.price,
                item.available !== false,
                item.image_url ? item.image_url.trim() : null,
                Boolean(item.is_bestseller),
                item.spice_level || 0,
                existing.id,
                restaurantId,
              ]
            );
            itemsUpdated++;
            continue;
          }
        }

        // Generate unique item code
        const itemCode =
          item.sku && item.sku.trim()
            ? item.sku.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
            : `it-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

        await client.query(
          `INSERT INTO menu_items (
             restaurant_id, branch_id, item_code, category, name, description,
             dietary_type, price, in_stock, image_url, is_popular, spicy_level,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11, $12,
             NOW(), NOW()
           )`,
          [
            restaurantId,
            resolvedBranchId || null,
            itemCode,
            item.category.trim(),
            item.item_name.trim(),
            item.description ? item.description.trim() : '',
            item.food_type || 'veg',
            item.price,
            item.available !== false,
            item.image_url ? item.image_url.trim() : null,
            Boolean(item.is_bestseller),
            item.spice_level || 0,
          ]
        );

        itemsImported++;
        // Track locally so subsequent duplicates in same batch are caught
        existingNameMap.set(lowerName, { id: 'new', name: item.item_name, item_code: itemCode });
      }

      await client.query('COMMIT');

      return {
        success: true,
        restaurantId,
        restaurantName,
        restaurantSlug,
        categoriesCreated,
        itemsImported,
        itemsSkipped,
        itemsUpdated,
        errors: 0,
        totalProcessed: items.length,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[MenuImportService] Postgres transaction rolled back due to error:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================
  // ATOMIC IN-MEMORY FALLBACK (TRANSACTION SNAPSHOT & ROLLBACK)
  // ==========================================================
  const categoriesSnapshot = JSON.parse(JSON.stringify(inMemoryDb.menu_categories));
  const itemsSnapshot = JSON.parse(JSON.stringify(inMemoryDb.menu_items));

  try {
    // A. Existing categories
    const existingCats = inMemoryDb.menu_categories.filter((c) => c.restaurant_id === restaurantId);
    const categoryMap = new Map<string, string>();
    const knownSlugs = new Set<string>();

    existingCats.forEach((c) => {
      categoryMap.set(c.name.trim().toLowerCase(), c.slug);
      knownSlugs.add(c.slug);
    });

    let categoriesCreated = 0;
    const uniqueCategories = Array.from(new Set(items.map((i) => i.category.trim()).filter(Boolean)));

    for (const catName of uniqueCategories) {
      const lowerName = catName.toLowerCase();
      if (!categoryMap.has(lowerName)) {
        let slug = generateCategorySlug(catName);
        let counter = 1;
        while (knownSlugs.has(slug)) {
          slug = `${generateCategorySlug(catName)}_${counter++}`;
        }
        knownSlugs.add(slug);

        inMemoryDb.menu_categories.push({
          id: crypto.randomUUID(),
          restaurant_id: restaurantId,
          slug,
          name: catName,
          display_order: existingCats.length + categoriesCreated + 1,
          is_active: true,
          created_at: new Date().toISOString(),
        });
        categoryMap.set(lowerName, slug);
        categoriesCreated++;
      }
    }

    // B. Items
    const existingItems = inMemoryDb.menu_items.filter((i) => i.restaurant_id === restaurantId);
    const existingNameMap = new Map<string, any>();
    const existingCodeMap = new Map<string, any>();
    existingItems.forEach((it) => {
      existingNameMap.set(it.name.trim().toLowerCase(), it);
      if (it.item_code) existingCodeMap.set(it.item_code.trim().toLowerCase(), it);
    });

    let itemsImported = 0;
    let itemsSkipped = 0;
    let itemsUpdated = 0;

    for (const item of items) {
      const lowerName = item.item_name.trim().toLowerCase();
      const skuKey = item.sku ? item.sku.trim().toLowerCase() : undefined;

      const existing = existingNameMap.get(lowerName) || (skuKey ? existingCodeMap.get(skuKey) : undefined);

      if (existing) {
        if (duplicateAction === 'cancel') {
          throw new Error(`Import cancelled: Duplicate item "${item.item_name}" already exists.`);
        }
        if (duplicateAction === 'skip') {
          itemsSkipped++;
          continue;
        }
        if (duplicateAction === 'update') {
          // Update existing item in in-memory array
          const idx = inMemoryDb.menu_items.findIndex((i) => i.id === existing.id);
          if (idx !== -1) {
            inMemoryDb.menu_items[idx] = {
              ...inMemoryDb.menu_items[idx],
              category: item.category.trim(),
              name: item.item_name.trim(),
              description: item.description ? item.description.trim() : '',
              dietary_type: item.food_type || 'veg',
              price: item.price,
              in_stock: item.available !== false,
              image_url: item.image_url ? item.image_url.trim() : inMemoryDb.menu_items[idx].image_url,
              is_popular: Boolean(item.is_bestseller),
              spicy_level: item.spice_level || 0,
              updated_at: new Date().toISOString(),
            };
            itemsUpdated++;
          }
          continue;
        }
      }

      const itemCode =
        item.sku && item.sku.trim()
          ? item.sku.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
          : `it-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

      const newItemObj = {
        id: crypto.randomUUID(),
        item_code: itemCode,
        restaurant_id: restaurantId,
        branch_id: resolvedBranchId || null,
        category: item.category.trim(),
        name: item.item_name.trim(),
        description: item.description ? item.description.trim() : '',
        dietary_type: item.food_type || 'veg',
        price: item.price,
        price_r: null,
        price_c: null,
        price_s: null,
        is_pocket_pizza: false,
        is_popular: Boolean(item.is_bestseller),
        is_chef_special: false,
        spicy_level: item.spice_level || 0,
        in_stock: item.available !== false,
        image_url: item.image_url ? item.image_url.trim() : null,
        badge: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      inMemoryDb.menu_items.push(newItemObj);
      itemsImported++;
      existingNameMap.set(lowerName, newItemObj);
    }

    return {
      success: true,
      restaurantId,
      restaurantName,
      restaurantSlug,
      categoriesCreated,
      itemsImported,
      itemsSkipped,
      itemsUpdated,
      errors: 0,
      totalProcessed: items.length,
    };
  } catch (err: any) {
    // Rollback in-memory state to snapshot
    inMemoryDb.menu_categories = categoriesSnapshot;
    inMemoryDb.menu_items = itemsSnapshot;
    console.error('[MenuImportService] In-memory transaction rolled back:', err);
    throw err;
  }
}

/**
 * Executes Bulk Actions (mark in/out of stock, change category, delete) on selected items.
 * Strictly scoped to authenticated restaurantId.
 */
export async function executeBulkMenuAction(params: {
  restaurantId: string;
  action: 'mark_available' | 'mark_out_of_stock' | 'change_category' | 'delete';
  itemIds: string[];
  targetCategory?: string;
}): Promise<{ success: boolean; affectedCount: number }> {
  const { restaurantId, action, itemIds, targetCategory } = params;

  if (!itemIds || itemIds.length === 0) {
    return { success: true, affectedCount: 0 };
  }

  if (isPostgresRunning()) {
    try {
      let sql = '';
      let queryParams: any[] = [];

      if (action === 'mark_available') {
        sql = `UPDATE menu_items SET in_stock = true, updated_at = NOW() WHERE restaurant_id = $1 AND id::text = ANY($2)`;
        queryParams = [restaurantId, itemIds];
      } else if (action === 'mark_out_of_stock') {
        sql = `UPDATE menu_items SET in_stock = false, updated_at = NOW() WHERE restaurant_id = $1 AND id::text = ANY($2)`;
        queryParams = [restaurantId, itemIds];
      } else if (action === 'change_category') {
        if (!targetCategory || !targetCategory.trim()) {
          throw new Error('targetCategory is required for change_category action');
        }
        sql = `UPDATE menu_items SET category = $1, updated_at = NOW() WHERE restaurant_id = $2 AND id::text = ANY($3)`;
        queryParams = [targetCategory.trim(), restaurantId, itemIds];
      } else if (action === 'delete') {
        sql = `DELETE FROM menu_items WHERE restaurant_id = $1 AND id::text = ANY($2)`;
        queryParams = [restaurantId, itemIds];
      }

      const res = await query(sql, queryParams);
      return { success: true, affectedCount: res.rowCount ?? 0 };
    } catch (err: any) {
      console.error('[MenuImportService] Bulk action error in Postgres:', err);
      throw err;
    }
  }

  // In-Memory Bulk Action
  let affected = 0;
  const idSet = new Set(itemIds);

  if (action === 'delete') {
    const initialLen = inMemoryDb.menu_items.length;
    inMemoryDb.menu_items = inMemoryDb.menu_items.filter(
      (item) => !(item.restaurant_id === restaurantId && idSet.has(item.id))
    );
    affected = initialLen - inMemoryDb.menu_items.length;
  } else {
    for (let i = 0; i < inMemoryDb.menu_items.length; i++) {
      const it = inMemoryDb.menu_items[i];
      if (it.restaurant_id === restaurantId && idSet.has(it.id)) {
        if (action === 'mark_available') {
          it.in_stock = true;
          it.updated_at = new Date().toISOString();
          affected++;
        } else if (action === 'mark_out_of_stock') {
          it.in_stock = false;
          it.updated_at = new Date().toISOString();
          affected++;
        } else if (action === 'change_category' && targetCategory) {
          it.category = targetCategory.trim();
          it.updated_at = new Date().toISOString();
          affected++;
        }
      }
    }
  }

  return { success: true, affectedCount: affected };
}

/**
 * Generates official template data for download in CSV or XLSX format.
 */
export function getTemplateSampleData() {
  return [
    {
      category: 'Bubble Bites',
      item_name: 'Milk Chocolate Fantasy',
      description: 'Crunchy bubble waffle bites drizzled with creamy Belgian milk chocolate',
      price: 99,
      food_type: 'VEG',
      available: 'true',
      sort_order: 1,
      image_url: '',
      sku: '',
      spice_level: 0,
      is_bestseller: 'true',
    },
    {
      category: 'Bubble Bites',
      item_name: 'Belgian Triple Chocolate',
      description: 'Loaded with milk, dark, and white chocolate ganache',
      price: 129,
      food_type: 'VEG',
      available: 'true',
      sort_order: 2,
      image_url: '',
      sku: '',
      spice_level: 0,
      is_bestseller: 'true',
    },
    {
      category: 'Mini Pancakes',
      item_name: 'Belgian Triple Chocolate',
      description: 'Fluffy coin pancakes smothered in triple Belgian chocolate',
      price: 99,
      food_type: 'VEG',
      available: 'true',
      sort_order: 1,
      image_url: '',
      sku: '',
      spice_level: 0,
      is_bestseller: 'false',
    },
    {
      category: 'Lolly Waffle',
      item_name: 'Example Waffle',
      description: 'Classic on-a-stick waffle served warm with chocolate sauce',
      price: 149,
      food_type: 'VEG',
      available: 'true',
      sort_order: 1,
      image_url: '',
      sku: '',
      spice_level: 0,
      is_bestseller: 'false',
    },
  ];
}

export function generateCsvTemplate(): string {
  const headers = [
    'category',
    'item_name',
    'description',
    'price',
    'food_type',
    'available',
    'sort_order',
    'image_url',
    'sku',
    'spice_level',
    'is_bestseller',
  ];

  const sampleRows = getTemplateSampleData();
  const rows = [headers.join(',')];

  sampleRows.forEach((row) => {
    const values = headers.map((h) => {
      const val = (row as any)[h] !== undefined ? String((row as any)[h]) : '';
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    rows.push(values.join(','));
  });

  return rows.join('\n');
}

export function generateXlsxTemplateBuffer(): Buffer {
  const sampleRows = getTemplateSampleData();
  const worksheet = XLSX.utils.json_to_sheet(sampleRows, {
    header: [
      'category',
      'item_name',
      'description',
      'price',
      'food_type',
      'available',
      'sort_order',
      'image_url',
      'sku',
      'spice_level',
      'is_bestseller',
    ],
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu Template');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
