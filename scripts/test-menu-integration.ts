/**
 * Automated Test Suite for MOZZ Menu Management & Customer Menu Read Path
 * 
 * Verifies:
 * 1. POST /api/admin/menu item creation and immediate persistence
 * 2. Item created via POST /api/admin/menu appears in public GET /api/menu
 * 3. Branch filtering: branch-specific item only appears when branch_id matches, 
 *    and branch_id=NULL restaurant-wide items appear across branches
 * 4. in_stock filtering: in_stock=false items are excluded when in_stock=true is requested
 * 5. Category normalization: verify normalizeCategorySlug and isCategoryMatch allow items 
 *    to match across variations like "Momo's", "momos", "Chinese Starters", "pocket_pizza_veg"
 * 6. Diagnostics endpoint: GET /api/admin/menu/diagnostics accurately reports item status
 */

import http from 'http';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import { createApp, ensureInitialized } from '../server/app.js';
import { signAuthToken } from '../server/middleware/authMiddleware.js';
import { DEFAULT_RESTAURANT_ID, DEFAULT_BRANCH_ID } from '../server/services/menuService.js';
import { query, isPostgresRunning, inMemoryDb } from '../server/db.js';
import {
  normalizeCategorySlug,
  isCategoryMatch,
  getCategoryDisplayName,
  getActiveCategoryTabs,
} from '../src/utils/categoryUtils.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

function makeRequest(
  server: http.Server,
  options: {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  }
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const address = server.address() as AddressInfo;
    const reqOptions: http.RequestOptions = {
      host: '127.0.0.1',
      port: address.port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch {}
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: parsed,
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runSuite() {
  console.log('\n======================================================');
  console.log('STARTING MENU INTEGRATION & READ-PATH TEST SUITE');
  console.log('======================================================\n');

  await ensureInitialized();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const secondaryBranchId = 'b0000000-0000-0000-0000-000000000002';

  // Seed secondary branch in DB for branch isolation test
  if (isPostgresRunning()) {
    await query(
      `INSERT INTO restaurant_branches (id, restaurant_id, name, slug, address, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (id) DO NOTHING`,
      [secondaryBranchId, DEFAULT_RESTAURANT_ID, 'MOZZ Hitec City Branch', 'hitec-city', 'Hitec City, Hyderabad']
    );
  }
  if (!inMemoryDb.restaurant_branches.some((b) => b.id === secondaryBranchId)) {
    inMemoryDb.restaurant_branches.push({
      id: secondaryBranchId,
      restaurant_id: DEFAULT_RESTAURANT_ID,
      name: 'MOZZ Hitec City Branch',
      slug: 'hitec-city',
      address: 'Hitec City, Hyderabad',
      is_active: true,
    });
  }

  const adminToken = signAuthToken({
    userId: 'u0000000-0000-0000-0000-000000000001',
    name: 'MOZZ Store Manager',
    email: 'admin@mozzpizzateria.com',
    role: 'RESTAURANT_OWNER',
    restaurantId: DEFAULT_RESTAURANT_ID,
    branchId: DEFAULT_BRANCH_ID,
  });

  try {
    // -------------------------------------------------------------
    // Test 1: Category Normalization Unit Tests
    // -------------------------------------------------------------
    console.log('--- SECTION 1: Category Normalization Logic ---');
    await test('normalizeCategorySlug handles diverse variations consistently', () => {
      assert.strictEqual(normalizeCategorySlug("Momo's"), 'momos');
      assert.strictEqual(normalizeCategorySlug('momos'), 'momos');
      assert.strictEqual(normalizeCategorySlug('MOMOS'), 'momos');
      assert.strictEqual(normalizeCategorySlug('Chinese Starters'), 'chinese_starters');
      assert.strictEqual(normalizeCategorySlug('chinese-starters'), 'chinese_starters');
      assert.strictEqual(normalizeCategorySlug('chinese_starters'), 'chinese_starters');
      assert.strictEqual(normalizeCategorySlug('Veg Pocket Pizzas'), 'pocket_pizza_veg');
      assert.strictEqual(normalizeCategorySlug('pocket_pizza_veg'), 'pocket_pizza_veg');
      assert.strictEqual(normalizeCategorySlug('Non-Veg Pocket Pizzas'), 'pocket_pizza_nonveg');
      assert.strictEqual(normalizeCategorySlug('Dessert Pizzas'), 'dessert_pizza');
      assert.strictEqual(normalizeCategorySlug('Fried Rice'), 'fried_rice');
      assert.strictEqual(normalizeCategorySlug('Hakka Noodles'), 'noodles');
    });

    await test('isCategoryMatch matches item categories to selected filter tabs correctly', () => {
      assert.strictEqual(isCategoryMatch("Momo's", 'momos'), true);
      assert.strictEqual(isCategoryMatch('momos', "Momo's"), true);
      assert.strictEqual(isCategoryMatch('pocket_pizza_veg', 'pocket_pizzas'), true);
      assert.strictEqual(isCategoryMatch('pocket_pizza_nonveg', 'pocket_pizzas'), true);
      assert.strictEqual(isCategoryMatch('chinese_starters', 'chinese-starters'), true);
      assert.strictEqual(isCategoryMatch('drinks', 'fried_rice'), false);
    });

    await test('getActiveCategoryTabs includes newly added categories dynamically', () => {
      const sampleMenu: any[] = [
        { id: '1', name: 'Veg Momo', category: "Momo's", inStock: true },
        { id: '2', name: 'Spring Roll', category: 'Chinese Starters', inStock: true },
        { id: '3', name: 'Custom Shake', category: 'shakes', inStock: true },
        { id: '4', name: 'Sold Out Item', category: 'shakes', inStock: false },
      ];
      const tabs = getActiveCategoryTabs(sampleMenu, true);
      const shakeTab = tabs.find((t) => t.id === 'shakes');
      assert.ok(shakeTab, 'Custom category tab should be generated');
      assert.strictEqual(shakeTab?.count, 1, 'Only in-stock item should count');
    });

    // -------------------------------------------------------------
    // Test 2: Admin Creation -> Public Menu Read Path
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: Admin Creation & Public Visibility ---');
    const uniqueSuffix = Date.now();
    const testItemName = `Special Test Paneer Momo ${uniqueSuffix}`;
    let createdItemId = '';

    await test('POST /api/admin/menu creates item with inStock: true', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/menu',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: {
          name: testItemName,
          category: 'momos',
          dietary: 'veg',
          description: 'Steamed paneer momo with special herb blend',
          price: 159,
          inStock: true,
          isPocketPizza: false,
        },
      });

      assert.strictEqual(res.status, 201, `Expected status 201, got ${res.status}`);
      assert.ok(res.body && res.body.id, 'Expected returned item to have an id');
      assert.strictEqual(res.body.name, testItemName);
      assert.strictEqual(res.body.inStock, true);
      createdItemId = res.body.id;
    });

    await test('GET /api/menu returns newly created item immediately', async () => {
      const res = await makeRequest(server, {
        path: `/api/menu?restaurant_id=${DEFAULT_RESTAURANT_ID}&branch_id=${DEFAULT_BRANCH_ID}`,
        method: 'GET',
      });

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body), 'Response must be an array');
      const found = res.body.find((item: any) => item.id === createdItemId || item.name === testItemName);
      assert.ok(found, `Newly created item "${testItemName}" must be in GET /api/menu`);
      assert.strictEqual(found.inStock, true);
    });

    // -------------------------------------------------------------
    // Test 3: Branch Isolation & Branch Filtering
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: Branch Context & Filtering ---');
    const branchSpecificName = `Branch-2 Exclusive Item ${uniqueSuffix}`;
    let branchItemId = '';

    // Create item directly tied to secondaryBranchId
    const superAdminToken = signAuthToken({
      userId: 'u0000000-0000-0000-0000-000000000002',
      name: 'Super Admin',
      email: 'superadmin@mozz.com',
      role: 'SUPER_ADMIN',
      restaurantId: DEFAULT_RESTAURANT_ID,
      branchId: secondaryBranchId,
    });

    await test('Create branch-specific item for secondary branch', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/menu',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: {
          name: branchSpecificName,
          category: 'chinese_starters',
          dietary: 'veg',
          price: 199,
          inStock: true,
          branch_id: secondaryBranchId,
        },
      });

      assert.strictEqual(res.status, 201);
      branchItemId = res.body.id;
    });

    await test('Branch-specific item appears for its own branch', async () => {
      const res = await makeRequest(server, {
        path: `/api/menu?restaurant_id=${DEFAULT_RESTAURANT_ID}&branch_id=${secondaryBranchId}`,
        method: 'GET',
      });

      assert.strictEqual(res.status, 200);
      const found = res.body.find((item: any) => item.id === branchItemId);
      assert.ok(found, 'Branch-specific item must appear in its own branch query');
    });

    await test('Branch-specific item is excluded from default branch menu', async () => {
      const res = await makeRequest(server, {
        path: `/api/menu?restaurant_id=${DEFAULT_RESTAURANT_ID}&branch_id=${DEFAULT_BRANCH_ID}`,
        method: 'GET',
      });

      assert.strictEqual(res.status, 200);
      const found = res.body.find((item: any) => item.id === branchItemId);
      assert.strictEqual(found, undefined, 'Branch-specific item must NOT appear in other branches');
    });

    // -------------------------------------------------------------
    // Test 4: in_stock Logic & Availability Filtering
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: in_stock Availability Filtering ---');
    await test('PATCH /api/admin/menu/:id/stock marks item as out of stock', async () => {
      const res = await makeRequest(server, {
        path: `/api/admin/menu/${encodeURIComponent(createdItemId)}/stock`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: {
          inStock: false,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.inStock, false);
    });

    await test('Out-of-stock item is excluded when only in_stock=true is requested', async () => {
      const res = await makeRequest(server, {
        path: `/api/menu?restaurant_id=${DEFAULT_RESTAURANT_ID}&branch_id=${DEFAULT_BRANCH_ID}&in_stock=true`,
        method: 'GET',
      });

      assert.strictEqual(res.status, 200);
      const found = res.body.find((item: any) => item.id === createdItemId);
      assert.strictEqual(found, undefined, 'Out-of-stock item must be excluded when in_stock=true');
    });

    await test('Restoring inStock: true makes item visible again in available menu', async () => {
      const toggleRes = await makeRequest(server, {
        path: `/api/admin/menu/${encodeURIComponent(createdItemId)}/stock`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: {
          inStock: true,
        },
      });
      assert.strictEqual(toggleRes.status, 200);
      assert.strictEqual(toggleRes.body.inStock, true);

      const menuRes = await makeRequest(server, {
        path: `/api/menu?restaurant_id=${DEFAULT_RESTAURANT_ID}&branch_id=${DEFAULT_BRANCH_ID}&in_stock=true`,
        method: 'GET',
      });
      const found = menuRes.body.find((item: any) => item.id === createdItemId);
      assert.ok(found, 'Restored item must be visible in available menu');
    });

    // -------------------------------------------------------------
    // Test 5: Menu Diagnostics Endpoint
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: Menu Diagnostics Endpoint ---');
    await test('GET /api/admin/menu/diagnostics returns detailed branch & stock metrics', async () => {
      const res = await makeRequest(server, {
        path: `/api/admin/menu/diagnostics?restaurant_id=${DEFAULT_RESTAURANT_ID}&branch_id=${DEFAULT_BRANCH_ID}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body, 'Expected diagnostics object');
      assert.strictEqual(typeof res.body.totalRestaurantItems, 'number');
      assert.strictEqual(typeof res.body.visibleForBranch, 'number');
      assert.strictEqual(typeof res.body.availableForCustomer, 'number');
      assert.ok(Array.isArray(res.body.allCategories), 'Diagnostics should list all categories');
      assert.strictEqual(typeof res.body.categoriesSummary, 'object', 'Diagnostics should contain categoriesSummary');
      assert.ok(Array.isArray(res.body.excludedItems), 'Diagnostics should contain excludedItems');
    });

    // -------------------------------------------------------------
    // Test 5.5: Restaurant Admin "Add Menu Item" Flow & Validations
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5.5: Restaurant Admin Add Menu Item & Tenant Safety ---');
    let phase6ItemId = '';
    const otherRestaurantId = 'a0000000-0000-0000-0000-000000000002';
    const otherCatId = 'c0000000-0000-0000-0000-000000000099';

    // Ensure clean state: purge any accidental cross category under MOZZ
    if (isPostgresRunning()) {
      try {
        await query(`DELETE FROM menu_categories WHERE slug = 'lollywaffle_waffles' AND restaurant_id = $1`, [DEFAULT_RESTAURANT_ID]);
        await query(
          `INSERT INTO menu_categories (id, restaurant_id, slug, name, display_order, is_active, created_at)
           VALUES ($1, $2, 'lollywaffle_waffles', 'Lolly Waffles Exclusive', 1, TRUE, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [otherCatId, otherRestaurantId]
        );
      } catch (e: any) {
        console.error('Setup error for other restaurant category:', e.message);
      }
    }
    if (!inMemoryDb.menu_categories) inMemoryDb.menu_categories = [];
    inMemoryDb.menu_categories = inMemoryDb.menu_categories.filter(
      (c) => !(c.slug === 'lollywaffle_waffles' && c.restaurant_id === DEFAULT_RESTAURANT_ID)
    );
    inMemoryDb.menu_categories.push({
      id: otherCatId,
      restaurant_id: otherRestaurantId,
      slug: 'lollywaffle_waffles',
      name: 'Lolly Waffles Exclusive',
      display_order: 1,
    });

    await test('POST /api/admin/menu succeeds with minimum fields and clean base price (₹178)', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/menu',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: {
          name: 'Phase 6 Menu Test Item',
          category: 'momos',
          isVegetarian: true,
          price: 178,
          inStock: true,
        },
      });

      assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.id, 'Item must have an id');
      assert.strictEqual(res.body.name, 'Phase 6 Menu Test Item');
      assert.strictEqual(res.body.price, 178, 'Base price must be stored as clean ₹178 without markup');
      assert.strictEqual(res.body.dietary, 'veg', 'Dietary must be normalized to "veg"');
      assert.strictEqual(res.body.restaurantId, DEFAULT_RESTAURANT_ID, 'Must belong to MOZZ');
      phase6ItemId = res.body.id;
    });

    await test('POST /api/admin/menu rejects unauthenticated request with 401', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/menu',
        method: 'POST',
        body: {
          name: 'Unauth Item',
          category: 'momos',
          price: 100,
        },
      });
      assert.strictEqual(res.status, 401);
    });

    await test('POST /api/admin/menu rejects missing name with 400', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/menu',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: {
          name: '   ',
          category: 'momos',
          price: 178,
          isVegetarian: true,
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('name'));
    });

    await test('POST /api/admin/menu rejects missing category with 400', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/menu',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: {
          name: 'No Category Item',
          category: '',
          price: 178,
          isVegetarian: true,
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('Category'));
    });

    await test('POST /api/admin/menu rejects negative price with 400', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/menu',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: {
          name: 'Negative Price Item',
          category: 'momos',
          price: -50,
          isVegetarian: true,
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('Price'));
    });

    await test('POST /api/admin/menu rejects cross-tenant category with 403', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/menu',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: {
          name: 'Cross Tenant Attempt',
          category: 'lollywaffle_waffles',
          price: 150,
          isVegetarian: true,
        },
      });
      assert.strictEqual(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
      assert.ok(res.body.error.includes('Cross-tenant'));
    });

    await test('PATCH /api/admin/menu/:id updates item name and price', async () => {
      const res = await makeRequest(server, {
        path: `/api/admin/menu/${encodeURIComponent(phase6ItemId)}`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: {
          name: 'Phase 6 Menu Test Item (Updated)',
          price: 199,
          dietary: 'non-veg',
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.name, 'Phase 6 Menu Test Item (Updated)');
      assert.strictEqual(res.body.price, 199);
      assert.strictEqual(res.body.dietary, 'non-veg');
    });

    await test('PATCH /api/admin/menu/:id/stock toggles stock status', async () => {
      const res = await makeRequest(server, {
        path: `/api/admin/menu/${encodeURIComponent(phase6ItemId)}/stock`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: {
          inStock: false,
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.inStock, false);
    });

    await test('Multi-tenant isolation: MOZZ item does not appear in other restaurant menu', async () => {
      const res = await makeRequest(server, {
        path: `/api/menu?restaurant_id=${otherRestaurantId}`,
        method: 'GET',
      });
      assert.strictEqual(res.status, 200);
      const existsInOther = res.body.some((i: any) => i.id === phase6ItemId);
      assert.strictEqual(existsInOther, false, 'MOZZ item must not appear in other restaurant');
    });

    await test('GET /api/admin/categories returns MOZZ categories', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/categories',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length > 0);
      const hasOther = res.body.some((c: any) => c.slug === 'lollywaffle_waffles');
      assert.strictEqual(hasOther, false, 'MOZZ category list must not contain other restaurant categories');
    });

    // -------------------------------------------------------------
    // Test 6: Clean up test items
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: Cleanup ---');
    await test('DELETE /api/admin/menu/:id removes test items cleanly', async () => {
      if (createdItemId) {
        const del1 = await makeRequest(server, {
          path: `/api/admin/menu/${encodeURIComponent(createdItemId)}`,
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });
        assert.strictEqual(del1.status, 200);
      }
      if (phase6ItemId) {
        const delP6 = await makeRequest(server, {
          path: `/api/admin/menu/${encodeURIComponent(phase6ItemId)}`,
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });
        assert.strictEqual(delP6.status, 200);
      }
      if (branchItemId) {
        const del2 = await makeRequest(server, {
          path: `/api/admin/menu/${encodeURIComponent(branchItemId)}`,
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${superAdminToken}`,
          },
        });
        assert.strictEqual(del2.status, 200);
      }

      // Cleanup secondary branch
      if (isPostgresRunning()) {
        await query(`DELETE FROM restaurant_branches WHERE id = $1`, [secondaryBranchId]);
      }
      const bIdx = inMemoryDb.restaurant_branches.findIndex((b) => b.id === secondaryBranchId);
      if (bIdx !== -1) inMemoryDb.restaurant_branches.splice(bIdx, 1);
    });

  } finally {
    server.close();
  }

  console.log('\n======================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
