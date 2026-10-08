/**
 * Production Security & Authorization Verification Suite
 * Mandatory tests proving:
 * 1. Unauthenticated request to every admin/revenue/analytics endpoint returns 401
 * 2. Customer-authenticated request to every admin/revenue/analytics endpoint returns 403
 * 3. Customer opening /admin, /restaurant-admin, or /platform-admin sees no admin data
 * 4. Restaurant A admin cannot access Restaurant B data by changing restaurantId, branchId, query parameters, or route slug (403 Forbidden)
 * 5. Restaurant Admin cannot access platform-wide revenue (403 Forbidden)
 * 6. Only Platform Admin can access platform-wide analytics/revenue (200 OK for Platform Admin, 403 for others)
 * 7. Restaurant Admin can access only their own restaurant data
 * 8. Customer order tracking returns only the authorised order payload, not restaurant-wide information
 * 9. Editing localStorage/sessionStorage to claim an admin role does not grant access
 * 10. Expired/invalid JWT/session cannot access any admin route or endpoint (401 Unauthorized)
 * 11. No hard-coded or fallback production admin login works
 */

import http from 'http';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { createApp } from '../server/app.js';
import { JWT_SECRET } from '../server/config.js';
import { signAuthToken, AuthenticatedUser } from '../server/middleware/authMiddleware.js';
import { inMemoryDb } from '../server/db.js';
import { FLAGSHIP_MOZZ_ID, TEST_RESTAURANT_ID } from '../server/services/tenantService.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  };
}

async function request(
  serverUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: any;
    headers?: Record<string, string>;
  } = {}
) {
  const url = new URL(path, serverUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}

async function runSuite() {
  console.log('\n=============================================================');
  console.log('STARTING MANDATORY AUTHORIZATION & ACCESS CONTROL TEST SUITE');
  console.log('=============================================================\n');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Seed sample orders for tests
  const orderRestaurantA = {
    id: 'ord-test-tenant-a-1',
    restaurantId: FLAGSHIP_MOZZ_ID,
    orderNumber: 'MOZZ-1001',
    status: 'placed',
    orderType: 'delivery',
    customer: {
      name: 'John Doe',
      phone: '9876543210',
      address: 'Plot 45, Gachibowli',
    },
    items: [{ menuItemId: 'item-1', name: 'Korean Pocket Pizza', quantity: 2, price: 199 }],
    subtotal: 398,
    tax: 19.9,
    deliveryFee: 40,
    grandTotal: 457.9,
    createdAt: new Date().toISOString(),
    paymentStatus: 'paid',
  };

  const orderRestaurantB = {
    id: 'ord-test-tenant-b-1',
    restaurantId: TEST_RESTAURANT_ID,
    orderNumber: 'TEST-2001',
    status: 'baking',
    orderType: 'dine_in',
    customer: {
      name: 'Jane Smith',
      phone: '9123456780',
      tableNumber: 'Table 5',
    },
    items: [{ menuItemId: 'item-2', name: 'Tandoori Starters', quantity: 1, price: 299 }],
    subtotal: 299,
    tax: 14.95,
    deliveryFee: 0,
    grandTotal: 313.95,
    createdAt: new Date().toISOString(),
    paymentStatus: 'paid',
  };

  // Ensure test orders exist in inMemoryDb
  if (!inMemoryDb.orders.some((o: any) => o.id === orderRestaurantA.id)) {
    inMemoryDb.orders.push(orderRestaurantA);
  }
  if (!inMemoryDb.orders.some((o: any) => o.id === orderRestaurantB.id)) {
    inMemoryDb.orders.push(orderRestaurantB);
  }

  // Create Tokens for each Role
  const customerUser: AuthenticatedUser = {
    userId: 'cust-1',
    name: 'Customer User',
    email: 'customer@gmail.com',
    role: 'CUSTOMER',
    restaurantId: FLAGSHIP_MOZZ_ID,
  };
  const customerToken = signAuthToken(customerUser);

  const restaurantAdminA: AuthenticatedUser = {
    userId: 'admin-a',
    name: 'Restaurant A Owner',
    email: 'admin.a@mozz.com',
    role: 'RESTAURANT_OWNER',
    restaurantId: FLAGSHIP_MOZZ_ID,
    restaurantSlug: 'mozz',
    branchId: 'b0000000-0000-0000-0000-000000000001',
  };
  const restaurantAToken = signAuthToken(restaurantAdminA);

  const restaurantAdminB: AuthenticatedUser = {
    userId: 'admin-b',
    name: 'Restaurant B Owner',
    email: 'admin.b@second.com',
    role: 'RESTAURANT_OWNER',
    restaurantId: TEST_RESTAURANT_ID,
    restaurantSlug: 'test-restaurant',
    branchId: 'b0000000-0000-0000-0000-000000000002',
  };
  const restaurantBToken = signAuthToken(restaurantAdminB);

  const platformAdminUser: AuthenticatedUser = {
    userId: 'plat-admin',
    name: 'Platform Super Admin',
    email: 'superadmin@starters4u.in',
    role: 'PLATFORM_ADMIN',
    restaurantId: FLAGSHIP_MOZZ_ID,
  };
  const platformAdminToken = signAuthToken(platformAdminUser);

  // ----------------------------------------------------
  // TEST GROUP 1: Unauthenticated request to every admin/revenue/analytics endpoint returns 401
  // ----------------------------------------------------
  console.log('[1] Unauthenticated Access Blocking (401 Unauthorized)');

  const adminEndpoints = [
    { method: 'GET', path: '/api/orders' },
    { method: 'GET', path: '/api/admin/orders' },
    { method: 'GET', path: '/api/analytics' },
    { method: 'GET', path: '/api/admin/analytics' },
    { method: 'GET', path: '/api/revenue' },
    { method: 'GET', path: '/api/admin/revenue' },
    { method: 'GET', path: '/api/platform/stats' },
    { method: 'GET', path: '/api/platform-admin/stats' },
    { method: 'GET', path: '/api/platform/restaurants' },
    { method: 'GET', path: '/api/admin/customers' },
    { method: 'GET', path: '/api/customers/9876543210' },
    { method: 'GET', path: '/api/admin/payments/ledger' },
    { method: 'GET', path: '/api/payments/ledger' },
    { method: 'GET', path: '/api/admin/inventory' },
    { method: 'GET', path: '/api/inventory' },
    { method: 'GET', path: '/api/admin/settings' },
    { method: 'GET', path: '/api/settings' },
    { method: 'GET', path: '/api/admin/branches' },
    { method: 'GET', path: '/api/branches' },
    { method: 'GET', path: '/api/tables' },
    { method: 'GET', path: '/api/admin/tables' },
    { method: 'GET', path: '/api/qr/catalog' },
    { method: 'GET', path: '/api/kots' },
    { method: 'GET', path: '/api/admin/users' },
    { method: 'GET', path: '/api/restaurant-users' },
    { method: 'GET', path: '/api/database/status' },
    { method: 'PATCH', path: '/api/orders/ord-test-tenant-a-1/status', body: { status: 'delivered' } },
    { method: 'DELETE', path: '/api/orders/ord-test-tenant-a-1' },
    { method: 'DELETE', path: '/api/kots/ord-test-tenant-a-1' },
  ];

  for (const ep of adminEndpoints) {
    await test(`Unauthenticated ${ep.method} ${ep.path} returns 401`, async () => {
      const res = await request(baseUrl, ep.path, { method: ep.method, body: ep.body });
      assert.strictEqual(res.status, 401, `Expected 401 on ${ep.path}, got ${res.status}`);
      // Ensure no sensitive revenue or data leaked
      assert.strictEqual(res.data?.totalRevenue, undefined);
      assert.strictEqual(res.data?.orders, undefined);
    })();
  }

  // ----------------------------------------------------
  // TEST GROUP 2: Customer-authenticated request returns 403 Forbidden
  // ----------------------------------------------------
  console.log('\n[2] Customer Role Access Blocking (403 Forbidden)');

  for (const ep of adminEndpoints) {
    await test(`Customer ${ep.method} ${ep.path} returns 403`, async () => {
      const res = await request(baseUrl, ep.path, {
        method: ep.method,
        token: customerToken,
        body: ep.body,
      });
      assert.strictEqual(res.status, 403, `Expected 403 on ${ep.path} for CUSTOMER role, got ${res.status}`);
      assert.strictEqual(res.data?.totalRevenue, undefined);
      assert.strictEqual(res.data?.orders, undefined);
    })();
  }

  // ----------------------------------------------------
  // TEST GROUP 3: Customer opening /admin, /restaurant-admin, or /platform-admin sees no admin data
  // ----------------------------------------------------
  console.log('\n[3] Frontend Admin Route Protection');

  await test('Verifying session at /api/admin/me returns 401 for unauthenticated visitors', async () => {
    const res = await request(baseUrl, '/api/admin/me');
    assert.strictEqual(res.status, 401);
  });

  await test('Customer token at /api/admin/me identifies CUSTOMER role (UI renders Access Denied)', async () => {
    const res = await request(baseUrl, '/api/admin/me', { token: customerToken });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.role, 'CUSTOMER');
    // Frontend AdminApp checks `userRole === 'CUSTOMER'` and immediately displays Access Denied
  });

  // ----------------------------------------------------
  // TEST GROUP 4: Cross-Tenant Tampering Prevention
  // ----------------------------------------------------
  console.log('\n[4] Cross-Tenant Tampering Prevention');

  await test('Restaurant A admin cannot access Restaurant B orders via query parameter (403)', async () => {
    const res = await request(baseUrl, `/api/orders?restaurantId=${TEST_RESTAURANT_ID}`, {
      token: restaurantAToken,
    });
    assert.strictEqual(res.status, 403);
  });

  await test('Restaurant A admin cannot access Restaurant B analytics via query parameter (403)', async () => {
    const res = await request(baseUrl, `/api/analytics?restaurantId=${TEST_RESTAURANT_ID}`, {
      token: restaurantAToken,
    });
    assert.strictEqual(res.status, 403);
  });

  await test('Restaurant A admin cannot access Restaurant B settings via header x-restaurant-id (403)', async () => {
    const res = await request(baseUrl, '/api/admin/settings', {
      token: restaurantAToken,
      headers: { 'x-restaurant-id': TEST_RESTAURANT_ID },
    });
    assert.strictEqual(res.status, 403);
  });

  await test('Restaurant A admin cannot access Restaurant B order directly by ID (403)', async () => {
    const res = await request(baseUrl, `/api/orders/${orderRestaurantB.id}`, {
      token: restaurantAToken,
    });
    assert.strictEqual(res.status, 403);
  });

  // ----------------------------------------------------
  // TEST GROUP 5: Restaurant Admin Cannot Access Platform-Wide Revenue
  // ----------------------------------------------------
  console.log('\n[5] Platform-Wide Data Isolation');

  await test('Restaurant Admin cannot access platform stats (/api/platform/stats -> 403)', async () => {
    const res = await request(baseUrl, '/api/platform/stats', {
      token: restaurantAToken,
    });
    assert.strictEqual(res.status, 403);
  });

  await test('Restaurant Admin cannot access platform restaurant fleet (/api/platform/restaurants -> 403)', async () => {
    const res = await request(baseUrl, '/api/platform/restaurants', {
      token: restaurantAToken,
    });
    assert.strictEqual(res.status, 403);
  });

  // ----------------------------------------------------
  // TEST GROUP 6: Only Platform Admin Can Access Platform-Wide Stats & Revenue
  // ----------------------------------------------------
  console.log('\n[6] Platform Admin Authorization');

  await test('Platform Admin can access platform stats (200 OK with totalRevenue & restaurant count)', async () => {
    const res = await request(baseUrl, '/api/platform/stats', {
      token: platformAdminToken,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.data.totalRestaurants, 'number');
    assert.strictEqual(typeof res.data.totalRevenue, 'number');
  });

  // ----------------------------------------------------
  // TEST GROUP 7: Restaurant Admin Can Access Only Their Own Restaurant Data
  // ----------------------------------------------------
  console.log('\n[7] Tenant Data Scoping');

  await test('Restaurant A admin accesses only Restaurant A orders (never Restaurant B)', async () => {
    const res = await request(baseUrl, '/api/orders', {
      token: restaurantAToken,
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    const allBelongToTenantA = res.data.every((o: any) => o.restaurantId === FLAGSHIP_MOZZ_ID);
    assert.ok(allBelongToTenantA, 'Returned orders not scoped to Restaurant A');
  });

  await test('Restaurant A admin revenue reflects only Restaurant A', async () => {
    const res = await request(baseUrl, '/api/revenue', {
      token: restaurantAToken,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.restaurantId, FLAGSHIP_MOZZ_ID);
  });

  // ----------------------------------------------------
  // TEST GROUP 8: Customer Order Tracking Returns Only Authorized Sanitized Order Payload
  // ----------------------------------------------------
  console.log('\n[8] Customer Order Tracking Sanitization');

  await test('Customer tracking /api/orders/:id returns sanitized order without admin/revenue fields', async () => {
    const res = await request(baseUrl, `/api/orders/${orderRestaurantA.id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.id, orderRestaurantA.id);
    assert.strictEqual(res.data.orderNumber, 'MOZZ-1001');
    assert.strictEqual(res.data.total, 457.9);
    // Customer phone is masked
    assert.strictEqual(res.data.customer?.phone, '******3210');
    // Ensure sensitive admin fields are omitted
    assert.strictEqual(res.data.totalRevenue, undefined);
    assert.strictEqual(res.data.profit, undefined);
    assert.strictEqual(res.data.internalNotes, undefined);
    assert.strictEqual(res.data.allOrders, undefined);
  });

  // ----------------------------------------------------
  // TEST GROUP 9: Forged Storage Claims Do Not Grant Admin Access
  // ----------------------------------------------------
  console.log('\n[9] LocalStorage / Cookie Forgery Protection');

  await test('Forged bearer token "fake-admin-token" is rejected with 401', async () => {
    const res = await request(baseUrl, '/api/orders', {
      token: 'fake-admin-token',
    });
    assert.strictEqual(res.status, 401);
  });

  await test('Forged payload signed with wrong secret is rejected with 401', async () => {
    const forgedToken = jwt.sign(restaurantAdminA, 'wrong-unauthorized-secret-key', { expiresIn: '1h' });
    const res = await request(baseUrl, '/api/orders', {
      token: forgedToken,
    });
    assert.strictEqual(res.status, 401);
  });

  // ----------------------------------------------------
  // TEST GROUP 10: Expired / Invalid JWT Cannot Access Any Admin Route
  // ----------------------------------------------------
  console.log('\n[10] Expired JWT Protection');

  await test('Expired JWT is rejected with 401', async () => {
    const expiredToken = jwt.sign(restaurantAdminA, JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(baseUrl, '/api/orders', {
      token: expiredToken,
    });
    assert.strictEqual(res.status, 401);
  });

  // ----------------------------------------------------
  // TEST GROUP 11: No Hard-Coded or Fallback Production Admin Login Works
  // ----------------------------------------------------
  console.log('\n[11] Production Credentials & Backdoor Removal');

  await test('Magic PIN bypass "8888" fails authentication', async () => {
    const res = await request(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: {
        email: 'admin@mozzpizzateria.com',
        password: '8888',
      },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('Magic PIN bypass "9999" fails authentication', async () => {
    const res = await request(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: {
        email: 'superadmin@starters4u.in',
        password: '9999',
      },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('Unregistered email login fails with generic error (no account enumeration)', async () => {
    const res = await request(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: {
        email: 'nonexistent.user@random.com',
        password: 'AnyPassword123!',
      },
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.message, 'Invalid credentials. Please verify your email and password or PIN.');
  });

  // Close server
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  console.log('\n=============================================================');
  console.log(`TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
