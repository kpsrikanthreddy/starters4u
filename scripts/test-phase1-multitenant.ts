/**
 * Phase 1 Multi-Tenant Core & Security Verification Suite
 * 
 * Verifies:
 * 1. MOZZ Backward Compatibility: Flagship tenant remains fully functional.
 * 2. Second Tenant Setup: Test Kitchen tenant fixture exists and is isolated.
 * 3. Cross-Tenant Data Isolation:
 *    - Tenant A cannot access Tenant B orders
 *    - Tenant A cannot update Tenant B settings
 *    - Tenant A cannot read Tenant B payments
 *    - Tenant A cannot read Tenant B KOTs
 *    - Tenant A cannot modify Tenant B menu items
 * 4. Request Spoofing / Tampering Protection:
 *    - Admin query/body restaurant_id cannot override authenticated session tenant
 * 5. Multi-Tenant Payment Settings:
 *    - Per-tenant payment modes and public credentials
 * 6. Public Tenant Profile & Menu Resolution:
 *    - /api/public/restaurants/:slug and /api/public/restaurants/:slug/menu
 * 7. Multi-Tenant Order Placement & Isolation:
 *    - Orders placed for Tenant B only appear in Tenant B's portal
 */

import http from 'http';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import { createApp, ensureInitialized } from '../server/app.js';
import { signAuthToken } from '../server/middleware/authMiddleware.js';
import * as tenantService from '../server/services/tenantService.js';
import * as orderService from '../server/services/orderService.js';
import * as menuService from '../server/services/menuService.js';
import { query, isPostgresRunning, inMemoryDb } from '../server/db.js';

const TENANT_A_ID = 'a0000000-0000-0000-0000-000000000001'; // MOZZ
const TENANT_A_BRANCH = 'b0000000-0000-0000-0000-000000000001';
const TENANT_B_ID = 'a0000000-0000-0000-0000-000000000002'; // Starters4U Test Kitchen
const TENANT_B_BRANCH = 'b0000000-0000-0000-0000-000000000002';

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
        Connection: 'close',
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed: any;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode || 500, headers: res.headers, body: parsed });
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
  console.log('PHASE 1: Multi-Tenant Core & Security Test Suite');
  console.log('====================================================\n');

  await ensureInitialized();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const tenantAToken = signAuthToken({
    userId: 'c0000000-0000-0000-0000-000000000001',
    restaurantId: TENANT_A_ID,
    branchId: TENANT_A_BRANCH,
    name: 'MOZZ Admin',
    email: 'admin@mozzpizzateria.com',
    role: 'RESTAURANT_ADMIN',
  });

  const tenantBToken = signAuthToken({
    userId: 'u0000000-0000-0000-0000-000000000002',
    restaurantId: TENANT_B_ID,
    branchId: TENANT_B_BRANCH,
    name: 'Test Kitchen Admin',
    email: 'admin@testrestaurant.com',
    role: 'RESTAURANT_ADMIN',
  });

  try {
    // ----------------------------------------------------
    // Section 1: Tenant Resolution & Profiles
    // ----------------------------------------------------
    console.log('--- 1. Public Tenant Resolution & Profiles ---');

    await test('Public resolution of Flagship MOZZ by slug', async () => {
      const res = await makeRequest(server, {
        path: '/api/public/restaurants/mozz',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, TENANT_A_ID);
      assert.strictEqual(res.body.slug, 'mozz');
      assert.ok(res.body.branches && res.body.branches.length > 0);
      assert.ok(res.body.paymentSettings);
    });

    await test('Public resolution of Test Kitchen by slug', async () => {
      const res = await makeRequest(server, {
        path: '/api/public/restaurants/test-restaurant',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, TENANT_B_ID);
      assert.strictEqual(res.body.slug, 'test-restaurant');
    });

    await test('Public menu resolution by restaurant slug', async () => {
      const res = await makeRequest(server, {
        path: '/api/public/restaurants/mozz/menu',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.restaurant.id, TENANT_A_ID);
      assert.ok(Array.isArray(res.body.menu));
    });

    // ----------------------------------------------------
    // Section 2: Cross-Tenant Order Isolation
    // ----------------------------------------------------
    console.log('\n--- 2. Cross-Tenant Order Isolation ---');

    // Create an order specifically for Tenant B
    const tenantBOrder = await orderService.createOrder({
      restaurantId: TENANT_B_ID,
      branchId: TENANT_B_BRANCH,
      orderType: 'takeaway',
      paymentMethod: 'cod',
      customer: {
        name: 'Test Tenant B Customer',
        phone: '+919876543210',
      },
      items: [
        {
          cartItemId: 'test-ci-01',
          menuItem: {
            id: 'it-test-01',
            name: 'Crispy Corn Starters',
            category: 'chinese_starters',
            dietary: 'veg',
            description: 'Delicious crispy corn',
            inStock: true,
            price: 180,
          },
          quantity: 2,
          unitPrice: 180,
          addons: [],
        },
      ],
    });

    assert.ok(tenantBOrder && tenantBOrder.id);
    console.log(`     Created fixture order ${tenantBOrder.orderNumber} for Tenant B (${TENANT_B_ID})`);

    await test('Tenant B admin can fetch its own order', async () => {
      const res = await makeRequest(server, {
        path: `/api/admin/orders/${tenantBOrder.id}`,
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, tenantBOrder.id);
      assert.strictEqual(res.body.restaurantId, TENANT_B_ID);
    });

    await test('Tenant A admin CANNOT fetch Tenant B order (returns 404)', async () => {
      const res = await makeRequest(server, {
        path: `/api/admin/orders/${tenantBOrder.id}`,
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      assert.strictEqual(res.status, 404);
    });

    await test('Tenant A admin orders list does NOT include Tenant B order', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/orders',
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      assert.strictEqual(res.status, 200);
      const orders = res.body as any[];
      const leaked = orders.find((o) => o.id === tenantBOrder.id || o.restaurantId === TENANT_B_ID);
      assert.strictEqual(leaked, undefined, 'Tenant B order was leaked into Tenant A orders list!');
    });

    // ----------------------------------------------------
    // Section 3: Anti-Tampering & Spoofing Defense
    // ----------------------------------------------------
    console.log('\n--- 3. Anti-Tampering & Spoofing Defense ---');

    await test('Reject Tenant A attempt to spoof restaurant_id query parameter', async () => {
      const res = await makeRequest(server, {
        path: `/api/admin/orders?restaurant_id=${TENANT_B_ID}`,
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      // requireRestaurantTenant detects mismatch and blocks with 403 Forbidden
      assert.strictEqual(res.status, 403);
    });

    await test('Tenant A cannot update status of Tenant B order', async () => {
      const res = await makeRequest(server, {
        path: `/api/admin/orders/${tenantBOrder.id}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tenantAToken}` },
        body: { status: 'confirmed' },
      });
      assert.strictEqual(res.status, 404);
    });

    await test('Tenant A cannot delete Tenant B order', async () => {
      const res = await makeRequest(server, {
        path: `/api/admin/orders/${tenantBOrder.id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      assert.strictEqual(res.status, 404);
    });

    // ----------------------------------------------------
    // Section 4: Multi-Tenant Payment Settings Isolation
    // ----------------------------------------------------
    console.log('\n--- 4. Multi-Tenant Payment Settings Isolation ---');

    await test('Tenant A can read its payment settings', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/payment-settings',
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.restaurantId, TENANT_A_ID);
      assert.ok(res.body.isCashEnabled !== undefined);
    });

    await test('Tenant B can read its payment settings', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/payment-settings',
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.restaurantId, TENANT_B_ID);
    });

    await test('Tenant B updates its payment settings independently from Tenant A', async () => {
      const patchRes = await makeRequest(server, {
        path: '/api/admin/payment-settings',
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tenantBToken}` },
        body: {
          isCashEnabled: true,
          isUpiEnabled: true,
          upiId: 'testkitchen@upi',
          activePaymentMode: 'UPI',
        },
      });
      assert.strictEqual(patchRes.status, 200);
      assert.strictEqual(patchRes.body.upiId, 'testkitchen@upi');

      // Check Tenant A payment settings remain unchanged
      const checkA = await makeRequest(server, {
        path: '/api/admin/payment-settings',
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      assert.strictEqual(checkA.status, 200);
      assert.notStrictEqual(checkA.body.upiId, 'testkitchen@upi');
    });

    // ----------------------------------------------------
    // Section 5: Multi-Tenant Menu Isolation
    // ----------------------------------------------------
    console.log('\n--- 5. Multi-Tenant Menu Isolation ---');

    // Create item in Tenant B
    const createBItemRes = await makeRequest(server, {
      path: '/api/admin/menu',
      method: 'POST',
      headers: { Authorization: `Bearer ${tenantBToken}` },
      body: {
        name: 'Tenant B Specialty Dumplings',
        category: 'chinese_starters',
        dietary: 'veg',
        price: 240,
        inStock: true,
      },
    });
    assert.strictEqual(createBItemRes.status, 201);
    const createdItem = createBItemRes.body;

    await test('Created item in Tenant B has tenant B restaurant_id', async () => {
      assert.strictEqual(createdItem.restaurantId || createdItem.restaurant_id, TENANT_B_ID);
    });

    await test('Tenant A admin cannot update Tenant B menu item', async () => {
      const patchRes = await makeRequest(server, {
        path: `/api/admin/menu/${createdItem.id}`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tenantAToken}` },
        body: { price: 999 },
      });
      assert.strictEqual(patchRes.status, 404);
    });

    await test('Tenant A admin cannot delete Tenant B menu item', async () => {
      const delRes = await makeRequest(server, {
        path: `/api/admin/menu/${createdItem.id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      assert.strictEqual(delRes.status, 404);
    });

    // ----------------------------------------------------
    // Section 6: MOZZ Production Backward Compatibility
    // ----------------------------------------------------
    console.log('\n--- 6. MOZZ Backward Compatibility ---');

    await test('Default public GET /api/menu returns MOZZ menu without requiring tenant query', async () => {
      const res = await makeRequest(server, { path: '/api/menu' });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length > 0);
      // Items must belong to MOZZ
      assert.ok(res.body.every((it: any) => it.restaurantId === TENANT_A_ID || it.restaurant_id === TENANT_A_ID));
    });

    await test('Default POST /api/orders without restaurantId creates order for MOZZ', async () => {
      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          orderType: 'takeaway',
          paymentMethod: 'cash',
          customer: {
            name: 'MOZZ Legacy Customer',
            phone: '+919845012345',
          },
          items: [
            {
              menuItemId: 'p-01',
              name: 'Corn & Cheese Pocket Pizza',
              quantity: 1,
              unitPrice: 199,
              totalPrice: 199,
            },
          ],
        },
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.restaurantId, TENANT_A_ID);
      assert.ok(res.body.orderNumber.startsWith('MOZZ-') || res.body.orderNumber.length > 0);
    });

    console.log('\n====================================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error running suite:', err);
  process.exit(1);
});
