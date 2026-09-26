/**
 * Phase 2 Platform Admin & Onboarding Automated Test Suite
 * 
 * Tests:
 * 1. Platform Admin Security & Authorization Separation:
 *    - Unauthenticated access blocked (401)
 *    - Restaurant Admin (role RESTAURANT_ADMIN) blocked with 403 Forbidden from Platform APIs
 *    - Super Admin (role SUPER_ADMIN) authorized for Platform APIs
 * 2. New Restaurant Onboarding Flow:
 *    - Input validation (rejects missing required fields)
 *    - Unique SEO-safe slug generation and collision handling
 *    - Automated atomic provisioning (Restaurant, Main Branch, Owner Admin, Settings, Payment, Subscription, Onboarding)
 * 3. Onboarding Checklist Tracking & Step Updates:
 *    - Step retrieval and progress tracking
 *    - Step status patch and overall status recalculation
 * 4. Tenant Suspension & Activation Lifecycle:
 *    - Platform Admin can suspend an active restaurant
 *    - Suspended restaurants reject order creation
 *    - Platform Admin can reactivate the suspended restaurant
 * 5. Menu Isolation & Cross-Restaurant Cart Protection:
 *    - Tenant menus are isolated
 *    - Orders containing foreign restaurant items are rejected
 * 6. MOZZ Flagship Regression Verification:
 *    - MOZZ tenant remains intact and active
 */

import http from 'http';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import { createApp, ensureInitialized } from '../server/app.js';
import { signAuthToken } from '../server/middleware/authMiddleware.js';
import * as onboardingService from '../server/services/onboardingService.js';
import * as orderService from '../server/services/orderService.js';
import * as menuService from '../server/services/menuService.js';
import { query, isPostgresRunning, inMemoryDb } from '../server/db.js';

const MOZZ_RESTAURANT_ID = 'a0000000-0000-0000-0000-000000000001';
const MOZZ_BRANCH_ID = 'b0000000-0000-0000-0000-000000000001';

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
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as AddressInfo;
    const reqOptions: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: addr.port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        let parsedData: any = rawData;
        try {
          parsedData = JSON.parse(rawData);
        } catch {
          // keep as string
        }
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          data: parsedData,
        });
      });
    });

    req.on('error', (e) => reject(e));

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runSuite() {
  console.log('========================================================');
  console.log('  PHASE 2: PLATFORM ADMIN & RESTAURANT ONBOARDING TESTS');
  console.log('========================================================\n');

  await ensureInitialized();
  const app = await createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  // Auth tokens for test roles
  const superAdminToken = signAuthToken({
    userId: 'u0000000-0000-0000-0000-000000000001',
    name: 'Platform Super Admin',
    email: 'admin@starters4u.in',
    role: 'SUPER_ADMIN',
    restaurantId: MOZZ_RESTAURANT_ID,
    branchId: MOZZ_BRANCH_ID,
  });

  const restaurantAdminToken = signAuthToken({
    userId: 'u0000000-0000-0000-0000-000000000002',
    name: 'MOZZ Store Manager',
    email: 'mozz.admin@starters4u.in',
    role: 'RESTAURANT_ADMIN',
    restaurantId: MOZZ_RESTAURANT_ID,
    branchId: MOZZ_BRANCH_ID,
  });

  let provisionedRestaurantId: string = '';
  let provisionedSlug: string = '';

  try {
    // ----------------------------------------------------
    // 1. Platform Admin Security & Authorization
    // ----------------------------------------------------
    console.log('1. Platform Admin Security & Backend Authorization:');

    await test('Unauthenticated requests to /api/platform/stats are rejected with 401', async () => {
      const res = await makeRequest(server, { path: '/api/platform/stats' });
      assert.strictEqual(res.status, 401);
    });

    await test('Restaurant Admin (role RESTAURANT_ADMIN) is rejected with 403 from /api/platform/stats', async () => {
      const res = await makeRequest(server, {
        path: '/api/platform/stats',
        headers: { Authorization: `Bearer ${restaurantAdminToken}` },
      });
      assert.strictEqual(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
      assert.ok(res.data.error || res.data.message);
    });

    await test('Restaurant Admin is rejected with 403 from /api/platform/restaurants', async () => {
      const res = await makeRequest(server, {
        path: '/api/platform/restaurants',
        headers: { Authorization: `Bearer ${restaurantAdminToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    await test('Super Admin (role SUPER_ADMIN) successfully accesses /api/platform/stats', async () => {
      const res = await makeRequest(server, {
        path: '/api/platform/stats',
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(typeof res.data.totalRestaurants === 'number');
      assert.ok(typeof res.data.totalOrders === 'number');
    });

    await test('Super Admin successfully accesses /api/platform/restaurants', async () => {
      const res = await makeRequest(server, {
        path: '/api/platform/restaurants',
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.length >= 1, 'Should include at least MOZZ flagship tenant');
    });

    // ----------------------------------------------------
    // 2. New Restaurant Onboarding Flow
    // ----------------------------------------------------
    console.log('\n2. New Restaurant Onboarding & Provisioning:');

    await test('Onboarding rejects invalid requests with missing required fields (400)', async () => {
      const res = await makeRequest(server, {
        path: '/api/platform/restaurants',
        method: 'POST',
        headers: { Authorization: `Bearer ${superAdminToken}` },
        body: {
          name: '', // missing
          ownerName: 'Test Owner',
          phone: '', // missing
        },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.data.error);
    });

    const runId = Math.floor(1000 + Math.random() * 9000);
    const testRestaurantName = `Royal Spice Kitchen ${runId}`;
    const expectedBaseSlug = `royal-spice-kitchen-${runId}`;

    await test('Platform Admin provisions new restaurant atomically', async () => {
      const payload = {
        name: testRestaurantName,
        ownerName: 'Vikram Malhotra',
        phone: '+91 98111 22334',
        address: 'Shop 4, Jubilee Hills, Hyderabad',
        email: 'vikram@royalspice.in',
        subscriptionPlan: 'growth',
        paymentMode: 'CASH_UPI',
        serviceModes: {
          dineIn: true,
          counter: true,
          takeaway: true,
          delivery: true,
        },
      };

      const res = await makeRequest(server, {
        path: '/api/platform/restaurants',
        method: 'POST',
        headers: { Authorization: `Bearer ${superAdminToken}` },
        body: payload,
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.restaurantId);
      assert.ok(res.data.slug);
      assert.strictEqual(res.data.slug, expectedBaseSlug);

      provisionedRestaurantId = res.data.restaurantId;
      provisionedSlug = res.data.slug;

      // Verify profile composite returned
      assert.strictEqual(res.data.profile.restaurant.name, testRestaurantName);
      assert.strictEqual(res.data.profile.branches.length, 1);
      assert.strictEqual(res.data.profile.branches[0].name, `${testRestaurantName} - Main Branch`);
      assert.strictEqual(res.data.profile.adminUser.role, 'RESTAURANT_ADMIN');
      assert.strictEqual(res.data.profile.subscription.planName, 'growth');
      assert.strictEqual(res.data.profile.onboarding.overallStatus, 'IN_PROGRESS');
    });

    await test('Slug collision handling: provisioning another restaurant with same name generates unique suffix', async () => {
      const payload = {
        name: testRestaurantName,
        ownerName: 'Amit Shah',
        phone: '+91 98222 33445',
        address: 'Banjara Hills, Hyderabad',
      };

      const res = await makeRequest(server, {
        path: '/api/platform/restaurants',
        method: 'POST',
        headers: { Authorization: `Bearer ${superAdminToken}` },
        body: payload,
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.slug, `${expectedBaseSlug}-2`);
    });

    await test('Platform Admin retrieves detailed restaurant profile', async () => {
      const res = await makeRequest(server, {
        path: `/api/platform/restaurants/${provisionedRestaurantId}`,
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.restaurant.id, provisionedRestaurantId);
      assert.strictEqual(res.data.restaurant.status, 'active');
      assert.strictEqual(res.data.branches[0].name, `${testRestaurantName} - Main Branch`);
      assert.strictEqual(res.data.paymentSettings.activePaymentMode, 'CASH_UPI');
      assert.strictEqual(res.data.paymentSettings.isCashEnabled, true);
      assert.strictEqual(res.data.paymentSettings.isUpiEnabled, true);
    });

    // ----------------------------------------------------
    // 3. Onboarding Checklist Tracking
    // ----------------------------------------------------
    console.log('\n3. Onboarding Checklist Management:');

    await test('Get onboarding checklist for newly provisioned restaurant', async () => {
      const res = await makeRequest(server, {
        path: `/api/platform/restaurants/${provisionedRestaurantId}/onboarding`,
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.businessDetailsStatus, 'READY');
      assert.strictEqual(res.data.menuStatus, 'NOT_STARTED');
      assert.ok(res.data.completedSteps >= 1);
    });

    await test('Update onboarding step (menu: READY) updates progress and checklist', async () => {
      const res = await makeRequest(server, {
        path: `/api/platform/restaurants/${provisionedRestaurantId}/onboarding`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${superAdminToken}` },
        body: { step: 'menu', status: 'READY' },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.onboarding.menuStatus, 'READY');
      assert.ok(res.data.onboarding.completedSteps >= 2);
    });

    // ----------------------------------------------------
    // 4. Tenant Suspension & Activation Lifecycle
    // ----------------------------------------------------
    console.log('\n4. Tenant Suspension & Reactivation Lifecycle:');

    await test('Platform Admin suspends restaurant tenant', async () => {
      const res = await makeRequest(server, {
        path: `/api/platform/restaurants/${provisionedRestaurantId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${superAdminToken}` },
        body: { status: 'suspended' },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.status, 'suspended');
    });

    await test('Order creation on suspended restaurant is rejected', async () => {
      let threw = false;
      try {
        await orderService.createOrder({
          restaurantId: provisionedRestaurantId,
          orderType: 'takeaway',
          paymentMethod: 'cod',
          customer: {
            name: 'Test Customer',
            phone: '+91 99999 88888',
          },
          items: [
            {
              id: 'dummy-item-1',
              name: 'Sample Item',
              price: 150,
              quantity: 1,
              unitPrice: 150,
            } as any,
          ],
        });
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.toLowerCase().includes('suspended'));
      }
      assert.ok(threw, 'Expected order on suspended restaurant to throw an error');
    });

    await test('Platform Admin reactivates restaurant tenant', async () => {
      const res = await makeRequest(server, {
        path: `/api/platform/restaurants/${provisionedRestaurantId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${superAdminToken}` },
        body: { status: 'active' },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'active');
    });

    // ----------------------------------------------------
    // 5. Menu Isolation & Cross-Restaurant Cart Protection
    // ----------------------------------------------------
    console.log('\n5. Menu Isolation & Cart Protection:');

    await test('Public menu for newly provisioned restaurant does NOT contain MOZZ items', async () => {
      const res = await makeRequest(server, {
        path: `/api/public/restaurants/${provisionedSlug}/menu`,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.restaurant.slug, provisionedSlug);
      // New restaurant has no menu items yet
      assert.ok(Array.isArray(res.data.menu));
      assert.strictEqual(res.data.menu.length, 0);
    });

    await test('Cross-restaurant cart tamper: ordering with another restaurant item is blocked', async () => {
      // Find a MOZZ menu item
      const mozzMenu = await menuService.getMenu(MOZZ_RESTAURANT_ID);
      assert.ok(mozzMenu.length > 0, 'MOZZ should have menu items');
      const mozzItem = mozzMenu[0];

      let threw = false;
      try {
        await orderService.createOrder({
          restaurantId: provisionedRestaurantId,
          orderType: 'takeaway',
          paymentMethod: 'cod',
          customer: {
            name: 'Test Customer',
            phone: '+91 99999 88888',
          },
          items: [
            {
              id: mozzItem.id,
              menuItem: mozzItem,
              quantity: 1,
              unitPrice: mozzItem.price,
            } as any,
          ],
        });
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('Cross-restaurant') || err.message.includes('another restaurant'));
      }
      assert.ok(threw, 'Cross-restaurant item in cart should have been rejected');
    });

    // ----------------------------------------------------
    // 6. MOZZ Flagship Regression Verification
    // ----------------------------------------------------
    console.log('\n6. MOZZ Flagship Regression Verification:');

    await test('MOZZ flagship restaurant is active and accessible via public endpoint', async () => {
      const res = await makeRequest(server, { path: '/api/public/restaurants/mozz' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.id, MOZZ_RESTAURANT_ID);
      assert.strictEqual(res.data.status, 'active');
    });

    await test('MOZZ public menu returns its dishes unchanged', async () => {
      const res = await makeRequest(server, { path: '/api/public/restaurants/mozz/menu' });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.menu.length >= 10);
    });

    console.log('\n========================================================');
    console.log(`  PHASE 2 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================\n');

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
  console.error('Fatal test error:', err);
  process.exit(1);
});
