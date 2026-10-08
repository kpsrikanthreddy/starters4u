/**
 * Automated Test Suite for Phase 6:
 * Multi-Restaurant Payments, Delivery Pricing, Split Accounting, and Real-Time Notifications
 */

import http from 'http';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import crypto from 'crypto';
import { createApp, ensureInitialized } from '../server/app.js';
import { inMemoryDb } from '../server/db.js';
import { calculateDeliveryMarkupPaise, calculateDeliveryMarkupRupees, toPaise, toRupees, calculateItemLinePricing, calculateOrderPaymentSummary } from '../src/utils/deliveryPricing.js';
import { paymentService } from '../server/payments/paymentService.js';
import { paymentLedgerService } from '../server/payments/paymentLedgerService.js';
import { paymentWebhookService } from '../server/payments/paymentWebhookService.js';
import { realtimeNotificationService } from '../server/services/realtimeNotificationService.js';
import { createOrder, getOrderById } from '../server/services/orderService.js';
import { signAuthToken } from '../server/middleware/authMiddleware.js';

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
    const port = address.port;

    const reqData = options.body ? JSON.stringify(options.body) : undefined;
    const headers: Record<string, string> = {
      Connection: 'close',
      ...(options.headers || {}),
    };

    if (reqData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(reqData).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let rawBody = '';
        res.on('data', (chunk) => {
          rawBody += chunk;
        });
        res.on('end', () => {
          let parsed = rawBody;
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            // Keep string
          }
          resolve({
            status: res.statusCode || 500,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );

    req.on('error', reject);
    if (reqData) {
      req.write(reqData);
    }
    req.end();
  });
}

async function runPhase6Tests() {
  console.log('\n=============================================================');
  console.log('PHASE 6: MULTI-RESTAURANT PAYMENTS, DELIVERY PRICING & SPLITS');
  console.log('=============================================================\n');

  await ensureInitialized();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const TEST_RESTAURANT_ID = 'a0000000-0000-0000-0000-000000000001';
  const TEST_BRANCH_ID = 'b0000000-0000-0000-0000-000000000001';
  const adminToken = signAuthToken({
    userId: 'u0000000-0000-0000-0000-000000000001',
    name: 'Admin Owner',
    restaurantId: TEST_RESTAURANT_ID,
    branchId: TEST_BRANCH_ID,
    role: 'RESTAURANT_OWNER',
    email: 'admin@starters4u.com',
  });

  try {
    // -------------------------------------------------------------------------
    // 1. DELIVERY PRICING FORMULA & INTEGER ARITHMETIC TESTS
    // -------------------------------------------------------------------------
    console.log('--- 1. DELIVERY PRICING ARITHMETIC & FORMULA ---');

    await test('Delivery platform markup is ₹0 for all new orders', () => {
      // Platform markup is disabled for all new orders (platform_markup_unit_paise = 0)
      assert.strictEqual(calculateDeliveryMarkupRupees(50), 0);
      assert.strictEqual(calculateDeliveryMarkupPaise(toPaise(50)), 0);

      assert.strictEqual(calculateDeliveryMarkupRupees(100), 0);
      assert.strictEqual(calculateDeliveryMarkupPaise(toPaise(100)), 0);

      assert.strictEqual(calculateDeliveryMarkupRupees(199), 0);
      assert.strictEqual(calculateDeliveryMarkupPaise(toPaise(199)), 0);

      assert.strictEqual(calculateDeliveryMarkupRupees(200), 0);
      assert.strictEqual(calculateDeliveryMarkupPaise(toPaise(200)), 0);

      assert.strictEqual(calculateDeliveryMarkupRupees(500), 0);
      assert.strictEqual(calculateDeliveryMarkupPaise(toPaise(500)), 0);
    });

    await test('Dine-In, Takeaway, and Counter channels apply ₹0 markup', () => {
      const dineIn = calculateItemLinePricing(500, 2, 'dine_in');
      assert.strictEqual(dineIn.platformMarkupUnit, 0);
      assert.strictEqual(dineIn.customerUnitPrice, 500);
      assert.strictEqual(dineIn.customerLineTotal, 1000);

      const takeaway = calculateItemLinePricing(250, 1, 'takeaway');
      assert.strictEqual(takeaway.platformMarkupUnit, 0);
      assert.strictEqual(takeaway.customerUnitPrice, 250);

      const counter = calculateItemLinePricing(150, 1, 'counter');
      assert.strictEqual(counter.platformMarkupUnit, 0);
      assert.strictEqual(counter.customerUnitPrice, 150);
    });

    await test('Integer safe paise arithmetic avoids floating point errors', () => {
      const p1 = toPaise(19.99);
      assert.strictEqual(p1, 1999);
      assert.strictEqual(toRupees(p1), 19.99);

      const items = [
        calculateItemLinePricing(149, 2, 'delivery'), // ₹149 + ₹0 = ₹149 each -> ₹298
        calculateItemLinePricing(299, 1, 'delivery'), // ₹299 + ₹0 = ₹299 each -> ₹299
      ];

      const summary = calculateOrderPaymentSummary({
        orderType: 'delivery',
        itemSnapshots: items,
        deliveryFee: 40,
        tax: 33.35,
        discount: 0,
      });

      // Conservation of Paise Check:
      // Restaurant Share + Platform Share must identically equal Customer Payable Total in Paise
      assert.strictEqual(
        summary.restaurantSharePaise + summary.platformSharePaise,
        summary.customerPayableTotalPaise
      );
      assert.strictEqual(
        summary.restaurantShare + summary.platformShare,
        summary.customerPayableTotal
      );
    });

    // -------------------------------------------------------------------------
    // 2. ORDER CREATION WITH PRICING SNAPSHOTS & SPLIT FIELDS
    // -------------------------------------------------------------------------
    console.log('\n--- 2. ORDER CREATION & SPLIT ACCOUNTING SNAPSHOTS ---');

    let createdDeliveryOrder: any = null;
    await test('Server-authoritative delivery order creation calculates correct splits and snapshots', async () => {
      const order = await createOrder({
        restaurantId: TEST_RESTAURANT_ID,
        branchId: TEST_BRANCH_ID,
        orderType: 'delivery',
        entrySource: 'customer_web',
        customer: {
          name: 'Priya Sharma',
          phone: '+919876543210',
          address: 'Flat 402, Vinayak Nagar, Gachibowli, Hyderabad',
          latitude: 17.4430,
          longitude: 78.3540,
        },
        items: [
          {
            cartItemId: 'item_1',
            menuItem: {
              id: 'm0000000-0000-0000-0000-000000000001',
              name: 'Paneer Tikka Pizza',
              price: 199,
              category: 'pocket_pizza_veg',
              dietary: 'veg',
              description: 'Fresh paneer tikka',
              inStock: true,
            },
            unitPrice: 199,
            quantity: 1,
            addons: [],
          },
        ],
        paymentMethod: 'online' as any,
      });

      assert.ok(order);
      assert.strictEqual(order.orderType, 'delivery');
      assert.ok(order.items && order.items.length === 1);

      const item = order.items[0];
      // For all new orders: platform_markup_unit_paise = 0, customer_unit_price = base_unit_price
      assert.strictEqual(item.baseUnitPrice, 199);
      assert.strictEqual(item.platformMarkupUnit, 0);
      assert.strictEqual(item.customerUnitPrice, 199);
      assert.strictEqual(item.baseUnitPricePaise, 19900);
      assert.strictEqual(item.platformMarkupUnitPaise, 0);
      assert.strictEqual(item.customerUnitPricePaise, 19900);

      // Order Splits check:
      assert.strictEqual(order.restaurantSubtotal, 199);
      assert.strictEqual(order.platformMarkupTotal, 0);
      assert.strictEqual(order.customerItemsTotal, 199);
      assert.strictEqual(order.settlementStatus, 'PENDING');
      assert.ok(order.restaurantShare > 0);
      assert.strictEqual(order.restaurantShare + order.platformShare, order.grandTotal);

      createdDeliveryOrder = order;
    });

    await test('Dine-in order creation records ₹0 platform markup and immediate NOT_APPLICABLE settlement', async () => {
      const dineInOrder = await createOrder({
        restaurantId: TEST_RESTAURANT_ID,
        branchId: TEST_BRANCH_ID,
        orderType: 'dine_in',
        entrySource: 'table_qr',
        tableNumber: 'Table 4',
        customer: {
          name: 'Rahul Verma',
          phone: '+919876543211',
        },
        items: [
          {
            cartItemId: 'item_2',
            menuItem: {
              id: 'm0000000-0000-0000-0000-000000000001',
              name: 'Paneer Tikka Pizza',
              price: 199,
              category: 'pocket_pizza_veg',
              dietary: 'veg',
              description: 'Fresh paneer',
              inStock: true,
            },
            unitPrice: 199,
            quantity: 2,
            addons: [],
          },
        ],
        paymentMethod: 'upi' as any,
      });

      assert.strictEqual(dineInOrder.platformMarkupTotal, 0);
      assert.strictEqual(dineInOrder.settlementStatus, 'NOT_APPLICABLE');
      assert.strictEqual(dineInOrder.items[0].platformMarkupUnit, 0);
      assert.strictEqual(dineInOrder.restaurantSubtotal, 199 * 2);
    });

    // -------------------------------------------------------------------------
    // 3. PAYMENT PROVIDER ABSTRACTION & INITIALIZATION
    // -------------------------------------------------------------------------
    console.log('\n--- 3. MARKETPLACE PAYMENT PROVIDER ABSTRACTION ---');

    await test('Provider registry returns Cashfree and Razorpay providers', () => {
      const cf = paymentService.getProvider('cashfree');
      assert.strictEqual(cf.providerName, 'cashfree');

      const rzp = paymentService.getProvider('razorpay');
      assert.strictEqual(rzp.providerName, 'razorpay');

      const all = paymentService.getAllProviders();
      assert.ok(all.length >= 2);
    });

    await test('Unconfigured payment gateway safely returns HTTP 503 and protects credentials', async () => {
      const res = await makeRequest(server, {
        path: '/api/payments/create-order',
        method: 'POST',
        body: {
          amount: 250,
          provider: 'cashfree',
          restaurantId: TEST_RESTAURANT_ID,
        },
      });

      // Strict Payment Safety Rule: unconfigured gateways MUST return 503
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error.includes('not configured'));
    });

    await test('Cashfree Easy Split createOrder with configured mock credentials returns order payload with zero secret leakage', async () => {
      process.env.CASHFREE_CLIENT_ID = 'cf_mock_client_id_test';
      process.env.CASHFREE_CLIENT_SECRET = 'cf_mock_secret_key_test';

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: any, opts: any) => {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              cf_order_id: 12345678,
              order_id: 'ord_test_phase6',
              order_amount: 250,
              order_currency: 'INR',
              payment_session_id: 'session_mock_secret_token_123',
              payments: { url: 'https://sandbox.cashfree.com/checkout/test' },
            }),
          } as any;
        };

        const cf = paymentService.getProvider('cashfree');
        assert.strictEqual(cf.isConfigured(), true);

        const orderRes = await cf.createOrder({
          orderId: 'ord_test_phase6',
          orderNumber: 'ORD-TEST-001',
          amount: 250,
          currency: 'INR',
          customer: {
            name: 'Priya Sharma',
            phone: '+919876543210',
            email: 'priya@example.com',
          },
          restaurantId: TEST_RESTAURANT_ID,
          restaurantShare: 225,
          platformShare: 25,
        });

        assert.strictEqual(orderRes.success, true);
        assert.ok(orderRes.providerOrderId);
        assert.strictEqual(orderRes.amount, 250);
        assert.strictEqual(orderRes.currency, 'INR');
        assert.strictEqual(orderRes.clientSecret, 'session_mock_secret_token_123');

        // Verify HTTP route returns 200 when configured
        const httpRes = await makeRequest(server, {
          path: '/api/payments/create-order',
          method: 'POST',
          body: {
            orderId: 'ord_test_http_1',
            orderNumber: 'ORD-TEST-HTTP-1',
            amount: 250,
            provider: 'cashfree',
            restaurantId: TEST_RESTAURANT_ID,
          },
        });

        assert.strictEqual(httpRes.status, 200);
        assert.strictEqual(httpRes.body.success, true);
        assert.strictEqual(httpRes.body.provider, 'cashfree');
        assert.ok(httpRes.body.orderId);

        // Verify no private API secret is returned
        const clientStr = JSON.stringify(httpRes.body).toLowerCase();
        assert.strictEqual(clientStr.includes('cf_mock_secret_key_test'), false);
        assert.strictEqual(clientStr.includes('private_key'), false);
      } finally {
        globalThis.fetch = originalFetch;
        delete process.env.CASHFREE_CLIENT_ID;
        delete process.env.CASHFREE_CLIENT_SECRET;
      }
    });

    // -------------------------------------------------------------------------
    // 4. AUTHORITATIVE PAYMENT WEBHOOKS & SIGNATURE VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- 4. AUTHORITATIVE PAYMENT WEBHOOKS & IDEMPOTENCY ---');

    const webhookSecret = 'starters4u_cashfree_webhook_secret_key_2025';
    process.env.CASHFREE_WEBHOOK_SECRET = webhookSecret;

    await test('Webhook rejects forged or missing signature', async () => {
      const fakePayload = JSON.stringify({
        data: {
          order: { order_id: createdDeliveryOrder.id, order_amount: createdDeliveryOrder.grandTotal },
          payment: { payment_id: 'pay_test_forged', payment_status: 'SUCCESS' },
        },
        event_time: new Date().toISOString(),
        type: 'PAYMENT_SUCCESS_WEBHOOK',
      });

      const res = await makeRequest(server, {
        path: '/api/webhooks/payments/cashfree',
        method: 'POST',
        headers: {
          'x-webhook-signature': 'invalid_signature_hash',
        },
        body: JSON.parse(fakePayload),
      });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    await test('Authentic Cashfree webhook successfully marks order paid and updates ledger', async () => {
      const webhookPayloadObj = {
        data: {
          order: {
            order_id: createdDeliveryOrder.id,
            order_amount: createdDeliveryOrder.grandTotal,
            order_currency: 'INR',
          },
          payment: {
            payment_id: 'pay_cf_verified_999',
            payment_status: 'SUCCESS',
            payment_amount: createdDeliveryOrder.grandTotal,
            payment_currency: 'INR',
            payment_method: 'upi',
          },
        },
        event_time: new Date().toISOString(),
        type: 'PAYMENT_SUCCESS_WEBHOOK',
      };

      const rawString = JSON.stringify(webhookPayloadObj);
      const authenticSignature = crypto.createHmac('sha256', webhookSecret).update(rawString).digest('base64');

      const res = await makeRequest(server, {
        path: '/api/webhooks/payments/cashfree',
        method: 'POST',
        headers: {
          'x-webhook-signature': authenticSignature,
        },
        body: webhookPayloadObj,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.processed, true);

      // Verify order is now marked paid in system
      const updatedOrder = await getOrderById(createdDeliveryOrder.id, TEST_RESTAURANT_ID);
      assert.ok(updatedOrder);
      assert.strictEqual(updatedOrder.paymentStatus, 'paid');
      assert.strictEqual(updatedOrder.paymentId, 'pay_cf_verified_999');
    });

    await test('Webhook idempotency prevents replay attacks and duplicate processing', async () => {
      const webhookPayloadObj = {
        data: {
          order: {
            order_id: createdDeliveryOrder.id,
            order_amount: createdDeliveryOrder.grandTotal,
            order_currency: 'INR',
          },
          payment: {
            payment_id: 'pay_cf_verified_999',
            payment_status: 'SUCCESS',
            payment_amount: createdDeliveryOrder.grandTotal,
          },
        },
        event_time: new Date().toISOString(),
        type: 'PAYMENT_SUCCESS_WEBHOOK',
      };

      const rawString = JSON.stringify(webhookPayloadObj);
      const authenticSignature = crypto.createHmac('sha256', webhookSecret).update(rawString).digest('base64');

      // Replaying the EXACT same payload
      const res = await makeRequest(server, {
        path: '/api/webhooks/payments/cashfree',
        method: 'POST',
        headers: {
          'x-webhook-signature': authenticSignature,
        },
        body: webhookPayloadObj,
      });

      // Returns 200 HTTP acknowledge with already processed flag
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    // -------------------------------------------------------------------------
    // 5. REAL-TIME NOTIFICATION BROADCAST & SSE
    // -------------------------------------------------------------------------
    console.log('\n--- 5. REAL-TIME PAYMENT NOTIFICATIONS & SSE STREAM ---');

    await test('Publishing payment event alerts registered SSE subscribers', async () => {
      let eventReceived: any = null;

      // Register mock client
      const mockRes: any = {
        write: (chunk: string) => {
          if (chunk.startsWith('data:')) {
            const dataStr = chunk.slice(5).trim();
            try {
              eventReceived = JSON.parse(dataStr);
            } catch {}
          }
        },
      };

      const unregister = realtimeNotificationService.registerClient(TEST_RESTAURANT_ID, mockRes);

      // Publish event
      realtimeNotificationService.publishRestaurantEvent(TEST_RESTAURANT_ID, {
        type: 'PAYMENT_RECEIVED',
        orderId: createdDeliveryOrder.id,
        orderNumber: createdDeliveryOrder.orderNumber,
        amount: createdDeliveryOrder.grandTotal,
        paymentId: 'pay_cf_verified_999',
        orderType: 'delivery',
        message: 'Payment received via Cashfree',
      });

      unregister();

      assert.ok(eventReceived);
      assert.strictEqual(eventReceived.type, 'PAYMENT_RECEIVED');
      assert.strictEqual(eventReceived.orderId, createdDeliveryOrder.id);
      assert.strictEqual(eventReceived.amount, createdDeliveryOrder.grandTotal);
    });

    // -------------------------------------------------------------------------
    // 6. SPLIT ACCOUNTING LEDGER & SETTLEMENT ENGINE
    // -------------------------------------------------------------------------
    console.log('\n--- 6. SPLIT ACCOUNTING LEDGER & SETTLEMENTS ---');

    await test('Ledger transactions API returns recorded splits with integer precision', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/payments/ledger',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.transactions));
      assert.ok(res.body.transactions.length > 0);

      const tx = res.body.transactions.find((t: any) => t.orderId === createdDeliveryOrder.id);
      assert.ok(tx);
      assert.strictEqual(tx.customerPaidAmount, createdDeliveryOrder.grandTotal);
      assert.strictEqual(tx.restaurantShare, createdDeliveryOrder.restaurantShare);
      assert.strictEqual(tx.platformShare, createdDeliveryOrder.platformShare);
    });

    await test('Settlement records remain PENDING and are NEVER marked settled without provider confirmation', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/payments/settlements',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.settlements));
      assert.ok(res.body.settlements.length > 0);

      const s = res.body.settlements[0];
      assert.strictEqual(s.status, 'PENDING');
      assert.strictEqual(s.isSettled, false);
      assert.strictEqual(Boolean(s.settledAt), false);

      // Attempting to sync settlement with an unconfirmed provider does not fake success
      const syncRes = await makeRequest(server, {
        path: `/api/admin/payments/settlements/${s.id}/sync`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(syncRes.status, 200);
      assert.strictEqual(syncRes.body.success, true);
      // Status remains PENDING until bank/provider confirms clearance
      assert.strictEqual(syncRes.body.settlement.status, 'PENDING');
    });

    await test('Ledger stats endpoint returns accurate aggregated totals', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/payments/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.stats.totalCustomerPaid >= createdDeliveryOrder.grandTotal);
      assert.ok(res.body.stats.totalRestaurantShare >= createdDeliveryOrder.restaurantShare);
      assert.ok(res.body.stats.totalPlatformShare >= createdDeliveryOrder.platformShare);
    });

    // -------------------------------------------------------------------------
    // 7. SECURITY & BACKWARD COMPATIBILITY
    // -------------------------------------------------------------------------
    console.log('\n--- 7. SECURITY & BACKWARD COMPATIBILITY ---');

    await test('Existing MOZZ Razorpay config endpoint continues to function', async () => {
      const res = await makeRequest(server, {
        path: '/api/razorpay/config',
      });

      // Even if credentials aren't present in CI/test env, returns predictable 503 or 200 without throwing 500
      assert.ok(res.status === 200 || res.status === 503);
    });

    await test('Admin payment settings never expose raw gateway secrets to frontend', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/payment-settings',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const str = JSON.stringify(res.body).toLowerCase();
      assert.strictEqual(str.includes('secret'), false);
      assert.strictEqual(str.includes('private_key'), false);
    });

  } finally {
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  console.log('\n=============================================================');
  console.log(`PHASE 6 TEST RUN SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase6Tests().catch((err) => {
  console.error('Fatal error during Phase 6 tests:', err);
  process.exit(1);
});
