/**
 * Automated Test Suite for Production Payment & Order Safety
 * 
 * Verifies:
 * 1. Missing Razorpay credentials cannot create an order (Returns HTTP 503).
 * 2. Absent or invalid Razorpay config displays: "Online payment is temporarily unavailable. Please try again later."
 * 3. Failed or cancelled payment cannot create print jobs.
 * 4. Only verified paid or admin-confirmed orders create KOT/BILL print jobs.
 * 5. Codebase audit confirms no simulated payment IDs (order_sim_..., rzp_test_placeholder, simulated: true, triggerPaymentSimulation).
 */

import http from 'http';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createApp, ensureInitialized, isRazorpayConfigured } from '../server/app.js';
import { inMemoryDb, query } from '../server/db.js';
import { createPrintJobsForOrder } from '../server/services/printService.js';
import { updateOrderStatus } from '../server/services/orderService.js';
import { Order } from '../src/types.js';

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
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (reqData) {
      req.write(reqData);
    }
    req.end();
  });
}

async function runPaymentSafetyTests() {
  console.log('\n======================================================');
  console.log('  MOZZ PRODUCTION PAYMENT & ORDER SAFETY TEST SUITE');
  console.log('======================================================\n');

  // Save current environment variables
  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const origViteKey = process.env.VITE_RAZORPAY_KEY_ID;

  // ----------------------------------------------------
  // SECTION 1: Static Codebase Audit for Simulation Logic
  // ----------------------------------------------------
  console.log('--- Section 1: Codebase Audit for Simulation Logic ---');

  await test('server/app.ts must NOT contain simulated order fallbacks (order_sim_, rzp_test_placeholder, simulated: true)', () => {
    const appTs = fs.readFileSync(path.join(process.cwd(), 'server/app.ts'), 'utf-8');
    assert.strictEqual(appTs.includes('order_sim_'), false, 'server/app.ts still contains order_sim_');
    assert.strictEqual(appTs.includes('rzp_test_placeholder'), false, 'server/app.ts still contains rzp_test_placeholder');
    assert.strictEqual(appTs.includes('simulated: true'), false, 'server/app.ts still contains simulated: true');
  });

  await test('RazorpayCheckoutModal.tsx must NOT contain simulation functions or timeouts', () => {
    const modalTsx = fs.readFileSync(path.join(process.cwd(), 'src/components/RazorpayCheckoutModal.tsx'), 'utf-8');
    assert.strictEqual(modalTsx.includes('triggerPaymentSimulation'), false, 'RazorpayCheckoutModal.tsx still contains triggerPaymentSimulation');
    assert.strictEqual(modalTsx.includes('simulatedPaymentId'), false, 'RazorpayCheckoutModal.tsx still contains simulatedPaymentId');
  });

  // ----------------------------------------------------
  // SECTION 2: Missing Razorpay Credentials Safety (HTTP 503)
  // ----------------------------------------------------
  console.log('\n--- Section 2: Missing Razorpay Credentials Safety (HTTP 503) ---');

  // Clear credentials to simulate production with missing/invalid Razorpay configuration
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.VITE_RAZORPAY_KEY_ID;

  await ensureInitialized();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    await test('isRazorpayConfigured() returns false when credentials are absent', () => {
      assert.strictEqual(isRazorpayConfigured(), false);
    });

    await test('GET /api/razorpay/config returns HTTP 503 when credentials absent', async () => {
      const res = await makeRequest(server, { path: '/api/razorpay/config', method: 'GET' });
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.available, false);
      assert.strictEqual(res.body.error, 'Online payment is temporarily unavailable. Please try again later.');
    });

    await test('POST /api/create-order returns HTTP 503 when credentials absent', async () => {
      const res = await makeRequest(server, {
        path: '/api/create-order',
        method: 'POST',
        body: { amount: 250 },
      });
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.error, 'Online payment is temporarily unavailable. Please try again later.');
      assert.strictEqual(res.body.order_id, undefined);
    });

    await test('POST /api/razorpay/create-order returns HTTP 503 when credentials absent', async () => {
      const res = await makeRequest(server, {
        path: '/api/razorpay/create-order',
        method: 'POST',
        body: { amount: 499 },
      });
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.error, 'Online payment is temporarily unavailable. Please try again later.');
    });

    await test('POST /api/verify-payment returns HTTP 503 when credentials absent', async () => {
      const res = await makeRequest(server, {
        path: '/api/verify-payment',
        method: 'POST',
        body: {
          razorpay_order_id: 'order_test_123',
          razorpay_payment_id: 'pay_test_123',
          razorpay_signature: 'sig_test_123',
        },
      });
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.error, 'Online payment is temporarily unavailable. Please try again later.');
    });

    await test('POST /api/orders with paymentMethod="razorpay" returns HTTP 503 and refuses order creation', async () => {
      const initialOrdersCount = inMemoryDb.orders.length;

      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          items: [{ menuItemId: 'test_item_1', name: 'Korean Pocket Pizza', price: 150, quantity: 1 }],
          orderType: 'delivery',
          customer: { name: 'Test Customer', phone: '9876543210', address: 'Banjara Hills' },
          paymentMethod: 'razorpay',
          paymentId: 'pay_fake_bypass',
        },
      });

      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.error, 'Online payment is temporarily unavailable. Please try again later.');
      assert.strictEqual(inMemoryDb.orders.length, initialOrdersCount, 'Database must not contain unverified online order');
    });

    // ----------------------------------------------------
    // SECTION 3: Fake / Unverified Payment Signature Rejection
    // ----------------------------------------------------
    console.log('\n--- Section 3: Signature Verification Enforcement ---');

    // Temporarily set test credentials
    const testKeySecret = 'test_secret_for_validation_1234567890';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_LIVEKEY123';
    process.env.RAZORPAY_KEY_SECRET = testKeySecret;

    await test('isRazorpayConfigured() returns true with valid credentials format', () => {
      assert.strictEqual(isRazorpayConfigured(), true);
    });

    await test('POST /api/orders with paymentMethod="razorpay" rejects missing signature with HTTP 400', async () => {
      const initialOrdersCount = inMemoryDb.orders.length;

      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          items: [
            {
              menuItem: { id: 'm1', name: 'Paneer Makhani Pocket Pizza', price: 249 },
              quantity: 1,
              unitPrice: 249,
              totalPrice: 249,
            },
          ],
          orderType: 'delivery',
          customer: { name: 'Test Customer', phone: '9876543210', address: 'Banjara Hills' },
          paymentMethod: 'razorpay',
          paymentId: 'pay_attempt_without_signature',
        },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(
        res.body.error,
        'Online payment verification required. Missing payment ID, order ID, or signature.'
      );
      assert.strictEqual(inMemoryDb.orders.length, initialOrdersCount, 'No order should be created');
    });

    await test('POST /api/orders with paymentMethod="razorpay" rejects forged/invalid HMAC signature with HTTP 400', async () => {
      const initialOrdersCount = inMemoryDb.orders.length;

      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          items: [
            {
              menuItem: { id: 'm1', name: 'Paneer Makhani Pocket Pizza', price: 249 },
              quantity: 1,
              unitPrice: 249,
              totalPrice: 249,
            },
          ],
          orderType: 'delivery',
          customer: { name: 'Test Customer', phone: '9876543210', address: 'Banjara Hills' },
          paymentMethod: 'razorpay',
          paymentId: 'pay_ABC123',
          razorpay_order_id: 'order_XYZ987',
          razorpay_signature: 'invalid_forged_hex_signature',
        },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(
        res.body.error,
        'Invalid payment signature. Online payment verification failed.'
      );
      assert.strictEqual(inMemoryDb.orders.length, initialOrdersCount, 'No order should be created');
    });

    let verifiedPaidOrderId = '';

    await test('POST /api/orders with paymentMethod="razorpay" accepts authentic HMAC signature and creates paid order', async () => {
      const razorpayOrderId = 'order_REAL_' + Date.now();
      const paymentId = 'pay_REAL_' + Date.now();
      const bodyToSign = `${razorpayOrderId}|${paymentId}`;
      const validSignature = crypto.createHmac('sha256', testKeySecret).update(bodyToSign).digest('hex');

      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          items: [
            {
              menuItem: { id: 'm1', name: 'Paneer Makhani Pocket Pizza', price: 249 },
              quantity: 1,
              unitPrice: 249,
              totalPrice: 249,
            },
          ],
          orderType: 'delivery',
          customer: { name: 'Verified Customer', phone: '9876543210', address: 'Jubilee Hills' },
          paymentMethod: 'razorpay',
          paymentId,
          razorpay_order_id: razorpayOrderId,
          razorpay_signature: validSignature,
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.paymentStatus, 'paid');
      assert.strictEqual(res.body.paymentId, paymentId);
      verifiedPaidOrderId = res.body.id;
    });

    // ----------------------------------------------------
    // SECTION 4: Print Job Generation Safety
    // ----------------------------------------------------
    console.log('\n--- Section 4: Print Job Generation Safety ---');

    const baseTestOrder: Order = {
      id: crypto.randomUUID(),
      orderNumber: 'MOZZ-9901',
      kotNumber: 'KOT-9901',
      customer: { name: 'Test Customer', phone: '9876543210' },
      items: [
        {
          cartItemId: 'cart-item-1',
          menuItem: {
            id: 'item-1',
            itemCode: 'CH01',
            name: 'Schezwan Noodles',
            price: 180,
            category: 'noodles',
            dietary: 'veg',
            description: 'Spicy wok noodles',
            inStock: true,
          },
          addons: [],
          quantity: 1,
          unitPrice: 180,
        },
      ],
      orderType: 'delivery',
      paymentMethod: 'razorpay',
      status: 'placed',
      paymentStatus: 'pending',
      itemTotal: 180,
      tax: 9,
      deliveryFee: 0,
      discount: 0,
      grandTotal: 189,
      estimatedDeliveryTimeMinutes: 30,
      statusHistory: [{ status: 'placed', timestamp: new Date().toISOString(), note: 'Order placed' }],
      createdAt: new Date().toISOString(),
    };

    await test('Refuses print jobs for unverified pending online orders (status: placed, paymentStatus: pending)', async () => {
      const unverifiedOrder: Order = {
        ...baseTestOrder,
        id: crypto.randomUUID(),
        status: 'placed',
        paymentStatus: 'pending',
      };
      const jobs = await createPrintJobsForOrder(unverifiedOrder, { reason: 'confirmed' });
      assert.strictEqual(jobs.length, 0, 'Must create 0 print jobs for unverified pending online order');
    });

    await test('Refuses print jobs for failed payment orders (paymentStatus: failed)', async () => {
      const failedOrder: Order = {
        ...baseTestOrder,
        id: crypto.randomUUID(),
        status: 'placed',
        paymentStatus: 'failed',
      };
      const jobs = await createPrintJobsForOrder(failedOrder, { reason: 'confirmed' });
      assert.strictEqual(jobs.length, 0, 'Must create 0 print jobs for failed payment order');
    });

    await test('Refuses print jobs for cancelled orders (status: cancelled)', async () => {
      const cancelledOrder: Order = {
        ...baseTestOrder,
        id: crypto.randomUUID(),
        status: 'cancelled',
        paymentStatus: 'pending',
      };
      const jobs = await createPrintJobsForOrder(cancelledOrder, { reason: 'confirmed' });
      assert.strictEqual(jobs.length, 0, 'Must create 0 print jobs for cancelled order');
    });

    await test('Refuses print jobs for rejected orders (status: rejected)', async () => {
      const rejectedOrder: Order = {
        ...baseTestOrder,
        id: crypto.randomUUID(),
        status: 'rejected',
        paymentStatus: 'pending',
      };
      const jobs = await createPrintJobsForOrder(rejectedOrder, { reason: 'confirmed' });
      assert.strictEqual(jobs.length, 0, 'Must create 0 print jobs for rejected order');
    });

    await test('Verified paid online order automatically generates both KOT and BILL print jobs', async () => {
      assert.ok(verifiedPaidOrderId, 'Must have created verified paid order in Section 3');
      const jobsRes = await query(
        'SELECT job_type, status FROM print_jobs WHERE order_id = $1 ORDER BY job_type ASC',
        [verifiedPaidOrderId]
      );
      assert.strictEqual(jobsRes.rows.length, 2, 'Verified online order must have exactly 2 print jobs');
      const types = jobsRes.rows.map((r: any) => r.job_type.toLowerCase()).sort();
      assert.deepStrictEqual(types, ['bill', 'kot']);
    });

    await test('Unconfirmed COD order does NOT generate print jobs until admin confirms', async () => {
      const codRes = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          items: [
            {
              menuItem: { id: 'm1', name: 'Paneer Makhani Pocket Pizza', price: 249 },
              quantity: 1,
              unitPrice: 249,
              totalPrice: 249,
            },
          ],
          orderType: 'delivery',
          customer: { name: 'COD Customer', phone: '9876543210', address: 'Madhapur' },
          paymentMethod: 'cod',
        },
      });

      assert.strictEqual(codRes.status, 201);
      const codOrderId = codRes.body.id;

      // Check print jobs immediately after placement - MUST BE 0
      const initialJobs = await query('SELECT * FROM print_jobs WHERE order_id = $1', [codOrderId]);
      assert.strictEqual(initialJobs.rows.length, 0, 'Unconfirmed COD order must NOT have any print jobs');

      // Now admin confirms the order
      await updateOrderStatus(codOrderId, 'confirmed');

      // Check print jobs after admin confirmation - MUST BE 2 (KOT + BILL)
      const confirmedJobs = await query('SELECT job_type FROM print_jobs WHERE order_id = $1', [codOrderId]);
      assert.strictEqual(confirmedJobs.rows.length, 2, 'Admin-confirmed COD order must have 2 print jobs');
      const types = confirmedJobs.rows.map((r: any) => r.job_type.toLowerCase()).sort();
      assert.deepStrictEqual(types, ['bill', 'kot']);
    });

  } finally {
    // Restore original environment
    if (origKeyId) process.env.RAZORPAY_KEY_ID = origKeyId; else delete process.env.RAZORPAY_KEY_ID;
    if (origKeySecret) process.env.RAZORPAY_KEY_SECRET = origKeySecret; else delete process.env.RAZORPAY_KEY_SECRET;
    if (origViteKey) process.env.VITE_RAZORPAY_KEY_ID = origViteKey; else delete process.env.VITE_RAZORPAY_KEY_ID;

    server.close();
  }

  console.log('\n======================================================');
  console.log(`  RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPaymentSafetyTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
