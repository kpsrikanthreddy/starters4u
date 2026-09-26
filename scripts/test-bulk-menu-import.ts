/**
 * Comprehensive Automated Verification Suite for Bulk Menu Import & Bulk Actions
 * 
 * Verifies:
 * 1. Template Download: CSV & XLSX endpoints return valid files with headers
 * 2. Pre-Import Validation:
 *    - Valid rows parsed and normalized
 *    - Invalid rows flagged (missing required fields, negative prices)
 *    - In-tenant duplicate detection against existing menu items
 * 3. Atomic Menu Import:
 *    - Transactional commit: all valid items inserted safely
 *    - Duplicate strategy 'skip': keeps original, imports new
 *    - Duplicate strategy 'update': updates existing item price/info
 *    - Duplicate strategy 'cancel': rejects entire batch if duplicate exists
 * 4. Strict Tenant Isolation:
 *    - Tenant identity strictly extracted from auth context
 *    - Restaurant A's import does NOT mutate or leak into Restaurant B
 * 5. Bulk Actions:
 *    - 'mark_out_of_stock' and 'mark_available'
 *    - 'change_category'
 *    - 'delete'
 * 6. High-volume Menu Simulation (LOLLYWAFFLE complete catalog)
 */

import http from 'http';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import * as XLSX from 'xlsx';
import { createApp, ensureInitialized } from '../server/app.js';
import { signAuthToken } from '../server/middleware/authMiddleware.js';
import { inMemoryDb } from '../server/db.js';

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
    expectBinary?: boolean;
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
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const fullBuffer = Buffer.concat(chunks);
        let parsedBody: any;
        if (options.expectBinary) {
          parsedBody = fullBuffer;
        } else {
          const str = fullBuffer.toString('utf-8');
          try {
            parsedBody = JSON.parse(str);
          } catch {
            parsedBody = str;
          }
        }
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: parsedBody,
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
  console.log('====================================================');
  console.log('🧪 Starting Starters4U Bulk Menu Import Verification Suite');
  console.log('====================================================\n');

  await ensureInitialized();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    // 1. Setup Auth Tokens for two distinct tenants to verify isolation
    const tenantA_Id = 'a0000000-0000-0000-0000-000000000002'; // Seeded second restaurant (Test Kitchen / Lollywaffle)
    const tenantA_Token = signAuthToken({
      userId: 'u0000000-0000-0000-0000-000000000003',
      name: 'Lollywaffle Admin',
      email: 'admin@lollywaffle.in',
      role: 'RESTAURANT_ADMIN',
      restaurantId: tenantA_Id,
    });

    const tenantB_Id = 'a0000000-0000-0000-0000-000000000001'; // MOZZ
    const tenantB_Token = signAuthToken({
      userId: 'u0000000-0000-0000-0000-000000000002',
      name: 'MOZZ Store Manager',
      email: 'mozz.admin@starters4u.in',
      role: 'RESTAURANT_ADMIN',
      restaurantId: tenantB_Id,
    });

    const runId = Math.random().toString(36).substring(2, 7);
    const dish1 = `Milk Choc Fantasy ${runId}`;
    const dish2 = `Belgian Triple Choc ${runId}`;
    const dish3 = `Dark Choc Overload ${runId}`;
    const dish4 = `Hot Choc Delight ${runId}`;

    console.log('--- 1. TEMPLATE DOWNLOAD TESTS ---');
    await test('GET /api/admin/menu/template (CSV format)', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/menu/template?format=csv',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(typeof res.body === 'string');
      assert.ok(res.body.includes('category,item_name,description,price,food_type,available'));
      assert.ok(res.body.includes('Bubble Bites'));
    });

    await test('GET /api/admin/menu/template (XLSX format)', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/menu/template?format=xlsx',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        expectBinary: true,
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Buffer.isBuffer(res.body));
      // Read with XLSX to verify valid spreadsheet structure
      const workbook = XLSX.read(res.body, { type: 'buffer' });
      assert.ok(workbook.SheetNames.length > 0);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);
      assert.ok(json.length > 0);
      assert.ok((json[0] as any).item_name !== undefined);
    });

    console.log('\n--- 2. PRE-IMPORT VALIDATION TESTS ---');
    await test('POST /api/admin/menu/validate-import detects valid rows and flags errors', async () => {
      const payload = {
        rows: [
          {
            category: 'Bubble Bites',
            item_name: `Nutella Blast ${runId}`,
            description: 'Delicious waffle bites with Nutella',
            price: '139',
            food_type: 'VEG',
            available: 'true',
          },
          {
            // Invalid: missing item_name and negative price
            category: 'Bubble Bites',
            item_name: '',
            price: '-50',
          },
          {
            // Invalid: missing category
            category: '',
            item_name: `Ghost Waffle ${runId}`,
            price: '100',
          },
        ],
      };

      const res = await makeRequest(server, {
        path: '/api/admin/menu/validate-import',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        body: payload,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.totalRows, 3);
      assert.strictEqual(res.body.validCount, 1);
      assert.strictEqual(res.body.errorCount, 2);
      assert.strictEqual(res.body.items[0].isValid, true);
      assert.strictEqual(res.body.items[1].isValid, false);
      assert.strictEqual(res.body.items[2].isValid, false);
      assert.ok(res.body.categoriesDetected.includes('Bubble Bites'));
    });

    console.log('\n--- 3. ATOMIC MENU IMPORT & DUPLICATE STRATEGIES ---');
    await test('POST /api/admin/menu/import inserts new items into Tenant A', async () => {
      const itemsToImport = [
        {
          category: 'Bubble Bites',
          item_name: dish1,
          description: 'Crunchy bubble bites',
          price: 99,
          food_type: 'veg',
          available: true,
          sort_order: 1,
        },
        {
          category: 'Mini Pancakes',
          item_name: dish2,
          description: 'Fluffy coin pancakes',
          price: 119,
          food_type: 'veg',
          available: true,
          sort_order: 2,
        },
      ];

      const res = await makeRequest(server, {
        path: '/api/admin/menu/import',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        body: { duplicateAction: 'skip', items: itemsToImport },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.itemsImported, 2);
      assert.ok(typeof res.body.categoriesCreated === 'number');
    });

    await test('Duplicate handling: "skip" ignores existing items and imports new ones', async () => {
      const itemsToImport = [
        {
          category: 'Bubble Bites',
          item_name: dish1, // duplicate
          price: 199,
        },
        {
          category: 'Lolly Waffle',
          item_name: dish3, // new item
          price: 149,
        },
      ];

      const res = await makeRequest(server, {
        path: '/api/admin/menu/import',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        body: { duplicateAction: 'skip', items: itemsToImport },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.itemsImported, 1);
      assert.strictEqual(res.body.itemsSkipped, 1);
    });

    await test('Duplicate handling: "update" updates price and description of existing dish', async () => {
      const itemsToImport = [
        {
          category: 'Bubble Bites',
          item_name: dish1,
          description: 'Updated description: even crispier',
          price: 109, // updated from 99
        },
      ];

      const res = await makeRequest(server, {
        path: '/api/admin/menu/import',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        body: { duplicateAction: 'update', items: itemsToImport },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.itemsUpdated, 1);

      // Verify updated values via GET /api/admin/menu
      const menuRes = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
      });
      const updatedItem = menuRes.body.find((i: any) => i.name === dish1);
      assert.ok(updatedItem);
      assert.strictEqual(Number(updatedItem.price), 109);
      assert.strictEqual(updatedItem.description, 'Updated description: even crispier');
    });

    await test('Duplicate handling: "cancel" aborts transaction when duplicate is found', async () => {
      const itemsToImport = [
        {
          category: 'Bubble Bites',
          item_name: dish1, // duplicate
          price: 99,
        },
        {
          category: 'Beverages',
          item_name: dish4, // should NOT be inserted due to abort
          price: 120,
        },
      ];

      const res = await makeRequest(server, {
        path: '/api/admin/menu/import',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        body: { duplicateAction: 'cancel', items: itemsToImport },
      });

      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('cancelled') || res.body.error.includes('Duplicate'));

      // Verify dish4 was NOT inserted
      const menuRes = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
      });
      const uninserted = menuRes.body.find((i: any) => i.name === dish4);
      assert.strictEqual(uninserted, undefined);
    });

    console.log('\n--- 4. STRICT TENANT ISOLATION TESTS ---');
    await test('Tenant B cannot see Tenant A items, and Tenant B imports stay strictly isolated', async () => {
      // Tenant B queries menu
      const tenantBMenuRes = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantB_Token}` },
      });
      // Should not contain Lollywaffle's dish1
      const leakedItem = tenantBMenuRes.body.find(
        (i: any) => i.name === dish1
      );
      assert.strictEqual(leakedItem, undefined);

      // Now Tenant B imports an item with same name as Tenant A
      const tenantBImport = await makeRequest(server, {
        path: '/api/admin/menu/import',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantB_Token}` },
        body: {
          duplicateAction: 'skip',
          items: [
            {
              category: 'Shakes',
              item_name: dish1,
              price: 180, // Different price in Tenant B
            },
          ],
        },
      });
      assert.strictEqual(tenantBImport.status, 201);
      assert.strictEqual(tenantBImport.body.itemsImported, 1);

      // Verify Tenant A's price is still 109 and Tenant B's is 180
      const resA = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
      });
      const resB = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantB_Token}` },
      });

      const itemA = resA.body.find((i: any) => i.name === dish1);
      const itemB = resB.body.find((i: any) => i.name === dish1);
      assert.strictEqual(Number(itemA.price), 109);
      assert.strictEqual(Number(itemB.price), 180);
    });

    console.log('\n--- 5. BULK ACTIONS TESTS ---');
    await test('POST /api/admin/menu/bulk-action (mark_out_of_stock, mark_available, change_category, delete)', async () => {
      // Fetch Tenant A items to get IDs
      const menuRes = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
      });
      assert.ok(menuRes.body.length >= 2);
      const itemIds = menuRes.body.map((i: any) => i.id);

      // 1. Bulk mark out of stock
      const stockRes1 = await makeRequest(server, {
        path: '/api/admin/menu/bulk-action',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        body: { action: 'mark_out_of_stock', itemIds },
      });
      assert.strictEqual(stockRes1.status, 200);

      const check1 = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
      });
      assert.ok(check1.body.every((i: any) => i.inStock === false));

      // 2. Bulk mark available
      const stockRes2 = await makeRequest(server, {
        path: '/api/admin/menu/bulk-action',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        body: { action: 'mark_available', itemIds },
      });
      assert.strictEqual(stockRes2.status, 200);

      const check2 = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
      });
      assert.ok(check2.body.every((i: any) => i.inStock === true));

      // 3. Bulk change category
      const catRes = await makeRequest(server, {
        path: '/api/admin/menu/bulk-action',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        body: {
          action: 'change_category',
          itemIds: [itemIds[0]],
          targetCategory: 'Premium Specials',
        },
      });
      assert.strictEqual(catRes.status, 200);

      const check3 = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
      });
      const movedItem = check3.body.find((i: any) => i.id === itemIds[0]);
      assert.strictEqual(movedItem.category, 'Premium Specials');

      // 4. Bulk delete
      const delRes = await makeRequest(server, {
        path: '/api/admin/menu/bulk-action',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        body: { action: 'delete', itemIds: [itemIds[0]] },
      });
      assert.strictEqual(delRes.status, 200);

      const check4 = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
      });
      assert.strictEqual(check4.body.find((i: any) => i.id === itemIds[0]), undefined);
    });

    console.log('\n--- 6. COMPLETE LOLLYWAFFLE CATALOG IMPORT STRESS TEST ---');
    await test('Atomic batch import of complete Lollywaffle 10-item menu', async () => {
      const lollywaffleCatalog = [
        { category: 'Bubble Bites', item_name: `Belgian Triple Chocolate Bites ${runId}`, price: 129, food_type: 'veg' },
        { category: 'Bubble Bites', item_name: `Nutella Blast Bites ${runId}`, price: 139, food_type: 'veg' },
        { category: 'Mini Pancakes', item_name: `Maple Butter Bliss Pancakes ${runId}`, price: 99, food_type: 'veg' },
        { category: 'Mini Pancakes', item_name: `Nutella Hazelnut Pancakes ${runId}`, price: 129, food_type: 'veg' },
        { category: 'Lolly Waffle', item_name: `White Chocolate & Berry Lolly ${runId}`, price: 149, food_type: 'veg' },
        { category: 'Lolly Waffle', item_name: `Cookie Crumble Stick ${runId}`, price: 149, food_type: 'veg' },
        { category: 'Waffle Cakes', item_name: `Death by Chocolate Cake ${runId}`, price: 299, food_type: 'veg' },
        { category: 'Waffle Cakes', item_name: `Red Velvet Waffle Cake ${runId}`, price: 319, food_type: 'veg' },
        { category: 'Beverages', item_name: `Belgian Thick Chocolate Shake ${runId}`, price: 159, food_type: 'veg' },
        { category: 'Beverages', item_name: `Hazelnut Cold Coffee ${runId}`, price: 139, food_type: 'veg' },
      ];

      const res = await makeRequest(server, {
        path: '/api/admin/menu/import',
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
        body: { duplicateAction: 'skip', items: lollywaffleCatalog },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.itemsImported, 10);
      assert.ok(typeof res.body.categoriesCreated === 'number');

      // Verify all items are queryable by restaurant admin
      const menuRes = await makeRequest(server, {
        path: '/api/admin/menu',
        headers: { Authorization: `Bearer ${tenantA_Token}` },
      });
      assert.ok(menuRes.body.length >= 10);
      assert.ok(menuRes.body.some((i: any) => i.name === `Death by Chocolate Cake ${runId}`));
    });

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`📊 Suite Results: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runSuite().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
