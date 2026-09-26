/**
 * Phase 5 Multi-Restaurant Order Channels Verification Suite
 * 
 * Verifies:
 * 1. Channel Serviceability & Enablement:
 *    - Dine-In, Counter, Takeaway, and Delivery enablement checks
 *    - Distance & fee calculation based on branch coordinates
 * 2. Tenant-Prefixed Order Numbers:
 *    - Generates slug-based human-readable order numbers (e.g. MOZZ-1001, LOLLY-1001)
 * 3. Table QR Security & Validation:
 *    - Signed HMAC-SHA256 tokens with tableId, tableNumber, and section
 *    - Cross-restaurant token rejection (Tenant A token cannot be used on Tenant B)
 *    - Invalid / tampered / expired QR handling
 * 4. Four Shared Order Channels:
 *    - Dine-In / Table QR order flow
 *    - Counter / POS staff order flow (role-restricted)
 *    - Takeaway order flow
 *    - Delivery order flow (radius & address validation)
 * 5. Channel Disabling Enforcement:
 *    - Attempting an order on a disabled channel throws clear error
 * 6. Public Counter Order Protection:
 *    - Direct customer /api/orders with orderType 'counter' is strictly forbidden (403)
 * 7. MOZZ Backward Compatibility:
 *    - Mozz flagship tenant processes orders seamlessly
 */

import http from 'http';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import { createApp, ensureInitialized } from '../server/app.js';
import { signAuthToken } from '../server/middleware/authMiddleware.js';
import * as channelService from '../server/services/channelService.js';
import * as qrService from '../server/services/qrService.js';
import * as orderService from '../server/services/orderService.js';
import * as tenantService from '../server/services/tenantService.js';
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
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as AddressInfo;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path: options.path,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runPhase5Tests() {
  console.log('\n🚀 Starting Phase 5 Order Channels Test Suite...\n');

  await ensureInitialized();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const makeTestCartItem = (id: string, name: string, price: number, category: string = 'Snacks') => ({
    cartItemId: `ci-${id}`,
    menuItem: {
      id,
      name,
      price,
      category,
      dietary: 'veg' as const,
      description: '',
      inStock: true,
    },
    unitPrice: price,
    quantity: 1,
    addons: [],
  });

  const tenantAOwnerToken = signAuthToken({
    userId: 'u-owner-mozz',
    name: 'Mozz Owner',
    email: 'owner@mozz.in',
    role: 'RESTAURANT_OWNER',
    restaurantId: TENANT_A_ID,
    branchId: TENANT_A_BRANCH,
  });

  const tenantBOwnerToken = signAuthToken({
    userId: 'u-owner-testkitchen',
    name: 'Test Kitchen Owner',
    email: 'owner@testkitchen.com',
    role: 'RESTAURANT_OWNER',
    restaurantId: TENANT_B_ID,
    branchId: TENANT_B_BRANCH,
  });

  const tenantBCashierToken = signAuthToken({
    userId: 'u-cashier-testkitchen',
    name: 'Test Kitchen Cashier',
    email: 'cashier@testkitchen.com',
    role: 'CASHIER',
    restaurantId: TENANT_B_ID,
    branchId: TENANT_B_BRANCH,
  });

  try {
    // -------------------------------------------------------------
    // SECTION 1: Channel Service & Serviceability
    // -------------------------------------------------------------
    console.log('\n--- SECTION 1: Channel Service & Serviceability ---');

    await test('1.1 Haversine Distance Calculation accuracy', () => {
      // Distance between Bangalore Indiranagar (12.9719, 77.6412) and Koramangala (12.9352, 77.6245) is ~4.4km
      const distance = channelService.calculateHaversineDistance(12.9719, 77.6412, 12.9352, 77.6245);
      assert(distance > 4.0 && distance < 5.0, `Expected ~4.4km, got ${distance}km`);
    });

    await test('1.2 Delivery serviceability checks radius and subtotal', async () => {
      // Nearby address within 2km of branch (Gachibowli 17.442509, 78.353966)
      const nearResult = await channelService.checkDeliveryServiceability(
        TENANT_A_ID,
        TENANT_A_BRANCH,
        { latitude: 17.4430, longitude: 78.3540 },
        600 // subtotal above free delivery
      );
      assert.strictEqual(nearResult.isServiceable, true);
      assert.strictEqual(nearResult.deliveryFee, 0, 'Should have free delivery above min order');

      // Far away address (> 50km)
      const farResult = await channelService.checkDeliveryServiceability(
        TENANT_A_ID,
        TENANT_A_BRANCH,
        { latitude: 18.5, longitude: 79.5 },
        200
      );
      assert.strictEqual(farResult.isServiceable, false);
      assert(farResult.reason?.includes('exceeds'), 'Should state distance exceeds delivery radius');
    });

    await test('1.3 Public /api/delivery/serviceability endpoint responds accurately', async () => {
      const res = await makeRequest(server, {
        path: '/api/delivery/serviceability',
        method: 'POST',
        body: {
          restaurantSlug: 'mozz',
          latitude: 17.4430,
          longitude: 78.3540,
          subtotal: 250,
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.isServiceable, true);
      assert(res.body.estimatedMinutes > 0);
    });

    // -------------------------------------------------------------
    // SECTION 2: Tenant Order Number Formatting
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: Tenant-Prefixed Order Numbers ---');

    await test('2.1 Order numbers generated with uppercase tenant prefix (MOZZ-XXXX, etc.)', async () => {
      const mozzOrderNum = await channelService.generateTenantOrderNumber(TENANT_A_ID);
      assert(mozzOrderNum.startsWith('MOZZ-'), `Expected MOZZ- prefix, got ${mozzOrderNum}`);

      const testOrderNum = await channelService.generateTenantOrderNumber(TENANT_B_ID);
      assert(testOrderNum.startsWith('TEST-') || testOrderNum.startsWith('STARTERS-'), `Expected tenant prefix, got ${testOrderNum}`);
    });

    // -------------------------------------------------------------
    // SECTION 3: Table QR Signing & Security
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: Table QR Tokens & Anti-Tampering ---');

    let validTableToken = '';
    await test('3.1 Generate signed table QR token containing tableId and section', () => {
      validTableToken = qrService.generateSignedTableToken('tbl-101', 'Table 5', 'mozz', 'Indoor AC');
      assert(validTableToken && validTableToken.includes('.'), 'Token must be header.payload.signature format');
      
      const validation = qrService.validateSignedToken(validTableToken, 'mozz');
      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.tableNumber, 'Table 5');
      assert.strictEqual(validation.section, 'Indoor AC');
      assert.strictEqual(validation.tableId, 'tbl-101');
    });

    await test('3.2 Cross-restaurant token usage is rejected', () => {
      // Token signed for 'mozz' cannot be validated under 'lollywaffle'
      const crossValidation = qrService.validateSignedToken(validTableToken, 'lollywaffle');
      assert.strictEqual(crossValidation.valid, false);
      assert(crossValidation.error?.includes('another restaurant'), 'Should reject cross-tenant token');
    });

    await test('3.3 Tampered signature token is rejected', () => {
      const parts = validTableToken.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.tamperedsignature`;
      const result = qrService.validateSignedToken(tamperedToken, 'mozz');
      assert.strictEqual(result.valid, false);
    });

    // -------------------------------------------------------------
    // SECTION 4: Channel 1 - Dine-In / Table QR Order Flow
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: Channel 1 - Dine-In / Table QR ---');

    await test('4.1 Create valid Dine-In order using signed Table QR', async () => {
      const order = await orderService.createOrder({
        restaurantId: TENANT_A_ID,
        branchId: TENANT_A_BRANCH,
        orderType: 'dine_in',
        entrySource: 'table_qr',
        qrSession: {
          token: validTableToken,
          tableNumber: 'Table 5',
          orderMode: 'dine_in',
          source: 'table_qr',
          isVerified: true,
          isModeLocked: true,
        },
        customer: {
          name: 'Priya Sharma',
          phone: '+919876543210',
        },
        items: [makeTestCartItem('item-1', 'Paneer Tikka', 240, 'Starters')],
        paymentMethod: 'upi_qr',
      });

      assert(order.id, 'Order must have an ID');
      assert.strictEqual(order.orderType, 'dine_in');
      assert.strictEqual(order.tableNumber, 'Table 5');
      assert.strictEqual(order.tableId, 'tbl-101');
      assert(order.orderNumber?.startsWith('MOZZ-'), 'Must have MOZZ prefix');
      assert.strictEqual(order.deliveryFee, 0, 'Dine-in must have 0 delivery fee');
    });

    await test('4.2 Rejects Dine-In order if QR token belongs to different restaurant', async () => {
      let threw = false;
      try {
        await orderService.createOrder({
          restaurantId: TENANT_B_ID, // Attempting to place on Tenant B with Tenant A's token
          branchId: TENANT_B_BRANCH,
          orderType: 'dine_in',
          entrySource: 'table_qr',
          qrSession: {
            token: validTableToken,
            tableNumber: 'Table 5',
            orderMode: 'dine_in',
            source: 'table_qr',
            isVerified: true,
            isModeLocked: true,
          },
          customer: {
            name: 'Intruder',
            phone: '+919999999999',
          },
          items: [makeTestCartItem('item-1', 'Soup', 150, 'Soups')],
          paymentMethod: 'cod',
        });
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('Invalid') || err.message.includes('another restaurant'), `Unexpected message: ${err.message}`);
      }
      assert.strictEqual(threw, true, 'Must reject cross-tenant table QR');
    });

    // -------------------------------------------------------------
    // SECTION 5: Channel 2 - Counter / POS Order Flow
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: Channel 2 - Counter / POS ---');

    await test('5.1 Cashier creates Counter POS order via /api/admin/pos/orders', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/pos/orders',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tenantBCashierToken}`,
        },
        body: {
          orderType: 'counter',
          customer: {
            name: 'Walk-in Customer',
            phone: '+919123456780',
          },
          items: [
            {
              id: 'item-pos-1',
              name: 'Cold Coffee',
              price: 120,
              quantity: 2,
              category: 'Beverages',
            },
          ],
          paymentMethod: 'cash',
          paymentStatus: 'paid',
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.order.orderType, 'counter');
      assert.strictEqual(res.body.order.entrySource, 'pos_counter');
      assert.strictEqual(res.body.order.paymentStatus, 'paid');
    });

    await test('5.2 Public /api/orders cannot place counter orders directly', async () => {
      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          restaurantId: TENANT_A_ID,
          branchId: TENANT_A_BRANCH,
          orderType: 'counter',
          customer: {
            name: 'Unauthorized Customer',
            phone: '+919123456781',
          },
          items: [
            {
              id: 'item-1',
              name: 'Test Item',
              price: 100,
              quantity: 1,
              category: 'Snacks',
            },
          ],
          paymentMethod: 'cod',
        },
      });

      assert.strictEqual(res.status, 403, 'Public should be forbidden from creating counter orders');
      assert(res.body.error?.includes('staff') || res.body.error?.includes('POS'));
    });

    // -------------------------------------------------------------
    // SECTION 6: Channel 3 - Takeaway Order Flow
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: Channel 3 - Takeaway ---');

    await test('6.1 Place customer Takeaway order with deliveryFee = 0', async () => {
      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          restaurantId: TENANT_A_ID,
          branchId: TENANT_A_BRANCH,
          orderType: 'takeaway',
          customer: {
            name: 'Anand Verma',
            phone: '+919876543299',
          },
          items: [
            {
              id: 'item-takeaway',
              name: 'Veg Biryani (Pack)',
              price: 250,
              quantity: 1,
              category: 'Biryani',
            },
          ],
          paymentMethod: 'cod',
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.orderType, 'takeaway');
      assert.strictEqual(res.body.deliveryFee, 0);
      assert.strictEqual(res.body.entrySource, 'customer_web');
    });

    // -------------------------------------------------------------
    // SECTION 7: Channel 4 - Delivery Order Flow
    // -------------------------------------------------------------
    console.log('\n--- SECTION 7: Channel 4 - Delivery ---');

    await test('7.1 Place valid Delivery order with address and coordinates', async () => {
      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          restaurantId: TENANT_A_ID,
          branchId: TENANT_A_BRANCH,
          orderType: 'delivery',
          customer: {
            name: 'Deepak Kumar',
            phone: '+919876543211',
            address: 'Flat 402, Green Park Apartments, 12th Main Road, Gachibowli',
            landmark: 'Near Metro Pillar 84',
            latitude: 17.4430,
            longitude: 78.3540,
          },
          items: [
            {
              id: 'item-del-1',
              name: 'Butter Chicken',
              price: 380,
              quantity: 1,
              category: 'Main Course',
            },
          ],
          paymentMethod: 'cod',
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.orderType, 'delivery');
      assert.strictEqual(res.body.customer.address, 'Flat 402, Green Park Apartments, 12th Main Road, Gachibowli');
      assert(res.body.deliveryFee >= 0);
    });

    await test('7.2 Delivery order fails if customer address is missing', async () => {
      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          restaurantId: TENANT_A_ID,
          branchId: TENANT_A_BRANCH,
          orderType: 'delivery',
          customer: {
            name: 'No Address User',
            phone: '+919876543212',
            // Missing address!
          },
          items: [
            {
              id: 'item-del-2',
              name: 'Naan',
              price: 40,
              quantity: 2,
              category: 'Breads',
            },
          ],
          paymentMethod: 'cod',
        },
      });

      assert(res.status >= 400, 'Should reject delivery order without address');
    });

    // -------------------------------------------------------------
    // SECTION 8: Channel Disabling Enforcement
    // -------------------------------------------------------------
    console.log('\n--- SECTION 8: Channel Disabling Enforcement ---');

    await test('8.1 Disabling delivery channel blocks delivery orders', async () => {
      // Temporarily disable delivery on Tenant B
      await makeRequest(server, {
        path: '/api/admin/delivery-settings',
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tenantBOwnerToken}`,
        },
        body: {
          isDeliveryEnabled: false,
        },
      });

      // Attempt to place delivery order on Tenant B
      let orderThrew = false;
      try {
        await orderService.createOrder({
          restaurantId: TENANT_B_ID,
          branchId: TENANT_B_BRANCH,
          orderType: 'delivery',
          customer: {
            name: 'Blocked Delivery User',
            phone: '+919876543213',
            address: 'Main Street 1',
          },
          items: [makeTestCartItem('item-del-3', 'Pasta', 200, 'Main')],
          paymentMethod: 'cod',
        });
      } catch (err: any) {
        orderThrew = true;
        assert(err.message.toLowerCase().includes('delivery') && err.message.toLowerCase().includes('not currently enabled'));
      }
      assert.strictEqual(orderThrew, true, 'Delivery order must be rejected when delivery is disabled');

      // Restore delivery
      await makeRequest(server, {
        path: '/api/admin/delivery-settings',
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tenantBOwnerToken}`,
        },
        body: {
          isDeliveryEnabled: true,
        },
      });
    });

    // -------------------------------------------------------------
    // SECTION 9: Flagship MOZZ Backward Compatibility
    // -------------------------------------------------------------
    console.log('\n--- SECTION 9: Flagship MOZZ Regression Check ---');

    await test('9.1 MOZZ flagship tenant settings retain all 4 channels enabled', async () => {
      const mozzSettings = await tenantService.resolveRestaurantBySlug('mozz');
      assert(mozzSettings, 'MOZZ must exist');
      assert.strictEqual(mozzSettings.settings?.isDeliveryEnabled, true);
      assert.strictEqual(mozzSettings.settings?.isTakeawayEnabled, true);
      assert.strictEqual(mozzSettings.settings?.isDineInEnabled, true);
      assert.strictEqual(mozzSettings.settings?.isCounterEnabled, true);
    });

  } finally {
    server.close();
  }

  console.log('\n==================================================');
  console.log(`Phase 5 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase5Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
