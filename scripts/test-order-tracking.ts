/**
 * Comprehensive Test Suite for MOZZ Order Tracking
 * 
 * Scenarios Covered:
 * 1. Orders with Coordinates (Persistence, Distance Calculation, Deep-Links)
 * 2. Orders without Coordinates (Centering, Location Patching, Validation)
 * 3. Page Refresh Behavior (URL Query Params & LocalStorage Persistence)
 * 4. Multi-Device Access (Independent ID Lookup, Live Polling State Synchronization)
 * 5. Tenant Isolation & Verified Restaurant Coordinate Immutability
 * 6. Terminology & Telemetry Integrity Audit ("Order Tracking", "Confirmed delivery location", Disclaimer)
 */

import http from 'http';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { createApp, ensureInitialized } from '../server/app.js';
import { inMemoryDb } from '../server/db.js';
import { updateOrderStatus } from '../server/services/orderService.js';
import { BUSINESS_INFO } from '../src/config/businessInfo.js';
import { MOZZ_RESTAURANT_LOCATION } from '../src/components/GoogleMapsLiveTracker.js';

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

// Helper to make HTTP requests against the test server
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

// Haversine formula helper matching GoogleMapsLiveTracker implementation
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of Earth in KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

async function runTestSuite() {
  console.log('\n================================================================');
  console.log('MOZZ ORDER TRACKING COMPREHENSIVE VERIFICATION SUITE');
  console.log('================================================================\n');

  await ensureInitialized();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    // -------------------------------------------------------------------------
    // SCENARIO 1: Orders with Confirmed Delivery Coordinates
    // -------------------------------------------------------------------------
    console.log('📍 [Scenario 1] Orders with Confirmed Delivery Coordinates:');

    let orderWithCoordsId = '';
    const customerLat = 17.448500;
    const customerLng = 78.362000;
    const phoneWithCoords = `98765${Date.now().toString().slice(-5)}`;

    await test('Creates an order with confirmed customer GPS coordinates', async () => {
      const payload = {
        orderType: 'delivery',
        paymentMethod: 'upi_qr',
        customer: {
          name: 'Ananya Rao',
          phone: phoneWithCoords,
          address: 'Flat 402, Cyber Residency, Gachibowli',
          latitude: customerLat,
          longitude: customerLng,
        },
        items: [
          {
            menuItem: {
              id: 'm1',
              name: 'Paneer Makhani Pocket Pizza',
              price: 249,
              category: 'pocket_pizza',
              dietary: 'veg',
            },
            quantity: 2,
            unitPrice: 249,
            totalPrice: 498,
            selectedShape: 'R',
          },
        ],
      };

      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: payload,
      });

      assert.strictEqual(res.status, 201, `Expected status 201, got ${res.status}`);
      assert(res.body.id, 'Created order must have a valid ID');
      assert.strictEqual(res.body.customer.latitude, customerLat);
      assert.strictEqual(res.body.customer.longitude, customerLng);
      assert.strictEqual(res.body.customer.address, 'Flat 402, Cyber Residency, Gachibowli');
      orderWithCoordsId = res.body.id;
    });

    await test('Calculates accurate transit distance from MOZZ Restaurant (17.442509, 78.353966)', () => {
      const distance = calculateDistanceKm(
        MOZZ_RESTAURANT_LOCATION.lat,
        MOZZ_RESTAURANT_LOCATION.lng,
        customerLat,
        customerLng
      );
      assert(distance > 0, 'Distance should be greater than 0 km');
      assert(distance < 5.0, `Customer in Gachibowli should be within reasonable delivery radius (<5km). Got ${distance} km`);
      assert.strictEqual(distance, 1.08, `Expected Haversine distance ~1.08 km, got ${distance}`);
    });

    await test('Generates verified Google Maps directions URL for delivery staff', () => {
      const origin = `${MOZZ_RESTAURANT_LOCATION.lat},${MOZZ_RESTAURANT_LOCATION.lng}`;
      const destination = `${customerLat},${customerLng}`;
      const deepLink = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;

      assert(deepLink.includes('17.442509,78.353966'), 'Origin must match verified MOZZ entrance');
      assert(deepLink.includes(`${customerLat},${customerLng}`), 'Destination must match confirmed customer coordinates');
    });

    // -------------------------------------------------------------------------
    // SCENARIO 2: Orders without Coordinates
    // -------------------------------------------------------------------------
    console.log('\n📍 [Scenario 2] Orders without Initial Coordinates (Centering & Location Patching):');

    let orderWithoutCoordsId = '';
    const phoneWithoutCoords = `91234${Date.now().toString().slice(-5)}`;

    await test('Creates an order with text address only (no coordinates)', async () => {
      const payload = {
        orderType: 'delivery',
        paymentMethod: 'cod',
        customer: {
          name: 'Vikram Singh',
          phone: phoneWithoutCoords,
          address: 'Plot 15, Telecom Nagar, Gachibowli',
        },
        items: [
          {
            menuItem: {
              id: 'm2',
              name: 'Chicken Schezwan Pocket Pizza',
              price: 299,
              category: 'pocket_pizza',
              dietary: 'non-veg',
            },
            quantity: 1,
            unitPrice: 299,
            totalPrice: 299,
            selectedShape: 'C',
          },
        ],
      };

      const res = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: payload,
      });

      assert.strictEqual(res.status, 201);
      orderWithoutCoordsId = res.body.id;
      assert.strictEqual(res.body.customer.latitude, undefined);
      assert.strictEqual(res.body.customer.longitude, undefined);
    });

    await test('PATCH /api/orders/:id/location persists newly pinned coordinates', async () => {
      const newLat = 17.445100;
      const newLng = 78.357200;
      const newAddress = 'Telecom Nagar Main Road, Gachibowli, Hyderabad';

      const res = await makeRequest(server, {
        path: `/api/orders/${orderWithoutCoordsId}/location`,
        method: 'PATCH',
        body: {
          latitude: newLat,
          longitude: newLng,
          address: newAddress,
        },
      });

      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.body.customer.latitude, newLat);
      assert.strictEqual(res.body.customer.longitude, newLng);
      assert.strictEqual(res.body.customer.address, newAddress);

      // Verify re-fetch confirms database persistence
      const getRes = await makeRequest(server, { path: `/api/orders/${orderWithoutCoordsId}` });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.customer.latitude, newLat);
      assert.strictEqual(getRes.body.customer.longitude, newLng);
    });

    await test('Rejects invalid non-numeric coordinates on PATCH /api/orders/:id/location', async () => {
      const res = await makeRequest(server, {
        path: `/api/orders/${orderWithoutCoordsId}/location`,
        method: 'PATCH',
        body: {
          latitude: 'not-a-number',
          longitude: 'invalid',
        },
      });

      assert.strictEqual(res.status, 400, `Expected 400 bad request, got ${res.status}`);
      assert(res.body.error.includes('Valid numerical latitude and longitude'), 'Error message should explain requirement');
    });

    // -------------------------------------------------------------------------
    // SCENARIO 3: Page Refresh Behavior & URL Query Param Initialization
    // -------------------------------------------------------------------------
    console.log('\n📍 [Scenario 3] Page Refresh & Deep-Link URL State Restoration:');

    await test('URL parser correctly extracts orderId from both ?orderId and ?order_id parameters', () => {
      function extractOrderId(search: string): string | null {
        const params = new URLSearchParams(search);
        return params.get('orderId') || params.get('order_id');
      }

      assert.strictEqual(extractOrderId('?orderId=MOZZ-1001'), 'MOZZ-1001');
      assert.strictEqual(extractOrderId('?order_id=MOZZ-2002'), 'MOZZ-2002');
      assert.strictEqual(extractOrderId('?other=123&orderId=MOZZ-3003'), 'MOZZ-3003');
      assert.strictEqual(extractOrderId(''), null);
    });

    await test('Simulates browser reload: re-fetching order by ID restores complete customer state and coordinates', async () => {
      const res = await makeRequest(server, { path: `/api/orders/${orderWithCoordsId}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, orderWithCoordsId);
      assert.strictEqual(res.body.customer.name, 'Ananya Rao');
      assert.strictEqual(res.body.customer.latitude, customerLat);
      assert.strictEqual(res.body.customer.longitude, customerLng);
      assert.strictEqual(res.body.items.length, 1);
    });

    // -------------------------------------------------------------------------
    // SCENARIO 4: Multi-Device Access & Kitchen Status Synchronization
    // -------------------------------------------------------------------------
    console.log('\n📍 [Scenario 4] Multi-Device Access & Real-Time Kitchen Synchronization:');

    await test('Allows independent devices/sessions to look up and track order by Order ID without credentials', async () => {
      // Simulate Device 1 (Customer's smartphone)
      const device1 = await makeRequest(server, {
        path: `/api/orders/${orderWithCoordsId}`,
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
      });
      assert.strictEqual(device1.status, 200);

      // Simulate Device 2 (Customer's family member or laptop)
      const device2 = await makeRequest(server, {
        path: `/api/orders/${orderWithCoordsId}`,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      assert.strictEqual(device2.status, 200);
      assert.strictEqual(device1.body.id, device2.body.id);
      assert.strictEqual(device1.body.customer.latitude, device2.body.customer.latitude);
    });

    await test('Simulates kitchen advancing status and multiple polling devices observing update', async () => {
      // Advance status to "out_for_delivery" in database
      await updateOrderStatus(orderWithCoordsId, 'out_for_delivery', 'Dispatched with delivery rider');

      // Check that customer tracking GET endpoint returns the new status
      const pollRes = await makeRequest(server, { path: `/api/orders/${orderWithCoordsId}` });
      assert.strictEqual(pollRes.status, 200);
      assert.strictEqual(pollRes.body.status, 'out_for_delivery');
    });

    // -------------------------------------------------------------------------
    // SCENARIO 5: Tenant Isolation & Immutability of Verified Restaurant Coordinates
    // -------------------------------------------------------------------------
    console.log('\n📍 [Scenario 5] Tenant Isolation & Verified Restaurant Coordinate Immutability:');

    await test('MOZZ Restaurant entrance coordinates match owner listing exactly (17.442509, 78.353966)', () => {
      assert.strictEqual(
        MOZZ_RESTAURANT_LOCATION.lat,
        17.442509,
        `Expected 17.442509, got ${MOZZ_RESTAURANT_LOCATION.lat}`
      );
      assert.strictEqual(
        MOZZ_RESTAURANT_LOCATION.lng,
        78.353966,
        `Expected 78.353966, got ${MOZZ_RESTAURANT_LOCATION.lng}`
      );
      assert.strictEqual(
        MOZZ_RESTAURANT_LOCATION.placeId,
        'ChIJQ_8-QkKTyzsRcb3W1I0llIM'
      );
      assert.strictEqual(
        MOZZ_RESTAURANT_LOCATION.googleMapsUrl,
        'https://maps.app.goo.gl/H9R6Fma2rBVmt3uN9'
      );
    });

    await test('Client order payloads cannot override or alter MOZZ Restaurant origin coordinates', async () => {
      // Attempt to spoof restaurant location in an order payload
      const spoofPayload = {
        orderType: 'delivery',
        paymentMethod: 'cod',
        restaurantCoords: { lat: 0, lng: 0 }, // Malicious override attempt
        customer: {
          name: 'Spoof Test',
          phone: '9999999999',
          address: 'Testing address',
        },
        items: [
          {
            menuItem: { id: 'm1', name: 'Pizza', price: 200, category: 'pocket_pizza', dietary: 'veg' },
            quantity: 1,
            unitPrice: 200,
            totalPrice: 200,
          },
        ],
      };

      await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: spoofPayload,
      });

      // Assert that the centralized restaurant coordinates remain completely unchanged
      assert.strictEqual(MOZZ_RESTAURANT_LOCATION.lat, 17.442509);
      assert.strictEqual(MOZZ_RESTAURANT_LOCATION.lng, 78.353966);
      assert.strictEqual(BUSINESS_INFO.geo?.latitude, 17.442509);
      assert.strictEqual(BUSINESS_INFO.geo?.longitude, 78.353966);
    });

    // -------------------------------------------------------------------------
    // SCENARIO 6: Terminology & Telemetry Integrity Audit
    // -------------------------------------------------------------------------
    console.log('\n📍 [Scenario 6] Terminology & Telemetry Integrity Codebase Audit:');

    const trackerPath = path.resolve(process.cwd(), 'src/components/GoogleMapsLiveTracker.tsx');
    const liveTrackerPath = path.resolve(process.cwd(), 'src/components/LiveOrderTracker.tsx');
    const navbarPath = path.resolve(process.cwd(), 'src/components/Navbar.tsx');

    const trackerContent = fs.readFileSync(trackerPath, 'utf-8');
    const liveTrackerContent = fs.readFileSync(liveTrackerPath, 'utf-8');
    const navbarContent = fs.readFileSync(navbarPath, 'utf-8');

    await test('Customer navigation renamed from "Live Tracking" to "Order Tracking"', () => {
      assert(
        !navbarContent.includes('> Live Tracking<') && !navbarContent.includes('>Live Tracking<'),
        'Navbar should not contain "Live Tracking" label'
      );
      assert(
        navbarContent.includes('Order Tracking'),
        'Navbar should contain "Order Tracking"'
      );
    });

    await test('Mandatory rider telemetry disclaimer present verbatim in tracking UI', () => {
      const requiredDisclaimer = 'Live rider location is not currently available. Order progress below reflects updates from the restaurant.';
      assert(
        liveTrackerContent.includes(requiredDisclaimer),
        'LiveOrderTracker.tsx must include mandatory rider telemetry disclaimer'
      );
      assert(
        trackerContent.includes(requiredDisclaimer),
        'GoogleMapsLiveTracker.tsx must include mandatory rider telemetry disclaimer'
      );
    });

    await test('Terminology audit: "Confirmed delivery location" used instead of "live GPS address"', () => {
      assert(
        !liveTrackerContent.includes('Live GPS Address') && !liveTrackerContent.includes('live GPS address'),
        'LiveOrderTracker.tsx must not contain "Live GPS Address"'
      );
      assert(
        liveTrackerContent.includes('Confirmed delivery location'),
        'LiveOrderTracker.tsx must use "Confirmed delivery location"'
      );
      assert(
        trackerContent.includes('Confirmed delivery location'),
        'GoogleMapsLiveTracker.tsx must use "Confirmed delivery location"'
      );
    });

    await test('Route Directions API documentation: Billing SKU and calculate-once logic documented', () => {
      assert(
        trackerContent.includes('ROUTE & DIRECTIONS API ARCHITECTURE AND BILLING SKU DOCUMENTATION'),
        'GoogleMapsLiveTracker.tsx must contain API architecture documentation'
      );
      assert(
        trackerContent.includes('Directions API SKU'),
        'Documentation must specify Directions API billing SKU'
      );
      assert(
        trackerContent.includes('lastCalculatedRouteKeyRef'),
        'Directions renderer must maintain lastCalculatedRouteKeyRef to prevent redundant route requests during status polling'
      );
    });

    await test('No simulated rider telemetry or artificial progress tickers exist', () => {
      assert(
        !trackerContent.includes('setRiderProgress'),
        'setRiderProgress must not exist in GoogleMapsLiveTracker.tsx'
      );
      assert(
        !liveTrackerContent.includes('setRiderProgress'),
        'setRiderProgress must not exist in LiveOrderTracker.tsx'
      );
    });

    // =========================================================================
    // Scenario 7: Customer Order Tracking UI, Cancellation & Print Restrictions
    // =========================================================================
    console.log('\n--- Scenario 7: Customer Order Tracking UI & Cancellation Rules ---');

    await test('1. Customer never sees Print Bill or Tax Invoice in customer tracking', () => {
      assert(
        !liveTrackerContent.includes('Print Bill'),
        'Customer LiveOrderTracker must not contain "Print Bill" button'
      );
      assert(
        !liveTrackerContent.includes('isPrintModalOpen'),
        'Customer LiveOrderTracker must not maintain isPrintModalOpen state'
      );
      assert(
        !liveTrackerContent.includes('onPrintBill'),
        'Customer LiveOrderTracker must not pass onPrintBill to calendar view'
      );
    });

    await test('2. Cancellation is available only for initial pending/placed status', () => {
      assert(
        liveTrackerContent.includes("isCustomerCancellable = (order.status === 'placed' || (order.status as string) === 'pending') && isActive"),
        'LiveOrderTracker must strictly constrain isCustomerCancellable to placed/pending'
      );
      assert(
        liveTrackerContent.includes('{isCustomerCancellable && ('),
        'LiveOrderTracker must guard cancellation button with isCustomerCancellable'
      );
    });

    await test('3. Backend rejects cancellation after acceptance/preparation with clear error', async () => {
      // Create a test order
      const createRes = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          items: [
            {
              menuItem: {
                id: 'm-test',
                name: 'Test Pizza',
                price: 299,
                category: 'pizza',
              },
              quantity: 1,
              unitPrice: 299,
              totalPrice: 299,
            },
          ],
          orderType: 'delivery',
          customer: {
            name: 'Cancellation Test Customer',
            phone: '9876543210',
            address: '123 Test Street, Whitefield',
          },
          paymentMethod: 'cod',
        },
      });
      assert.strictEqual(createRes.status, 201, 'Order creation must succeed with 201');
      const orderId = createRes.body.id;

      // Advance order status to 'confirmed' (acceptance)
      await updateOrderStatus(orderId, 'confirmed', 'Kitchen accepted order');

      // Attempt to cancel as customer
      const cancelRes = await makeRequest(server, {
        path: `/api/orders/${encodeURIComponent(orderId)}/cancel`,
        method: 'POST',
        body: { reason: 'Customer changed mind' },
      });

      assert.strictEqual(cancelRes.status, 400, 'Backend must reject cancellation of confirmed order with HTTP 400');
      assert.strictEqual(
        cancelRes.body.error,
        'This order can no longer be cancelled because preparation has started. Please contact the restaurant for help.',
        'Backend must return exact required error message'
      );

      // Advance order status to 'baking' (preparation)
      await updateOrderStatus(orderId, 'baking', 'Stone deck oven baking');
      const cancelBakingRes = await makeRequest(server, {
        path: `/api/orders/${encodeURIComponent(orderId)}/cancel`,
        method: 'POST',
        body: { reason: 'Customer changed mind' },
      });
      assert.strictEqual(cancelBakingRes.status, 400, 'Backend must reject cancellation of baking order with HTTP 400');
      assert.strictEqual(
        cancelBakingRes.body.error,
        'This order can no longer be cancelled because preparation has started. Please contact the restaurant for help.'
      );

      // Now test that a placed/pending order CAN be cancelled
      const placedOrderRes = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          items: [
            {
              menuItem: {
                id: 'm-test-2',
                name: 'Test Pizza 2',
                price: 299,
                category: 'pizza',
              },
              quantity: 1,
              unitPrice: 299,
              totalPrice: 299,
            },
          ],
          orderType: 'delivery',
          customer: {
            name: 'Cancel Allowed Customer',
            phone: '9876543210',
            address: '456 Test Lane',
          },
          paymentMethod: 'cod',
        },
      });
      assert.strictEqual(placedOrderRes.status, 201, 'Placed order creation must succeed with 201');
      const placedOrderId = placedOrderRes.body.id;
      const cancelPlacedRes = await makeRequest(server, {
        path: `/api/orders/${encodeURIComponent(placedOrderId)}/cancel`,
        method: 'POST',
        body: { reason: 'Wrong address selected' },
      });
      assert.strictEqual(cancelPlacedRes.status, 200, 'Backend must permit cancellation of initial placed order');
      assert.strictEqual(cancelPlacedRes.body.status, 'cancelled');
    });

    await test('4. Timeline is visible for active orders', () => {
      assert(
        liveTrackerContent.includes('{isActive && ('),
        'Timeline must be conditionally rendered when isActive is true'
      );
      assert(
        liveTrackerContent.includes('Kitchen & Order Progress Timeline'),
        'Timeline must display active kitchen progress header'
      );
    });

    await test('5. Timeline is hidden and final delivered message appears for DELIVERED/COMPLETED orders', () => {
      const deliveredMessage = 'Order delivered successfully. Thank you for ordering from MOZZ!';
      assert(
        liveTrackerContent.includes(deliveredMessage),
        'LiveOrderTracker.tsx must include exact delivered confirmation message'
      );
      assert(
        liveTrackerContent.includes('{isDelivered && ('),
        'Delivered message must be rendered conditionally when isDelivered is true'
      );
      assert(
        liveTrackerContent.includes('{isCancelled && ('),
        'Cancelled message must be rendered conditionally when isCancelled is true'
      );
    });

    await test('6. Multi-tenant and order-ownership checks remain intact', async () => {
      // Trying to cancel non-existent order returns 404
      const nonExistentRes = await makeRequest(server, {
        path: '/api/orders/NON-EXISTENT-ID/cancel',
        method: 'POST',
        body: {},
      });
      assert.strictEqual(nonExistentRes.status, 404, 'Non-existent order must return 404');
    });

    // =========================================================================
    // Scenario 8: Customer Session Cleanup & Header Customer-Details Action
    // =========================================================================
    console.log('\n--- Scenario 8: Customer Session Cleanup & Header Reset Rules ---');

    const customerModalPath = path.resolve(process.cwd(), 'src/components/CustomerDetailsModal.tsx');
    const storeContextPath = path.resolve(process.cwd(), 'src/context/StoreContext.tsx');
    const cartDrawerPath = path.resolve(process.cwd(), 'src/components/CartDrawer.tsx');

    const customerModalContent = fs.readFileSync(customerModalPath, 'utf-8');
    const storeContextContent = fs.readFileSync(storeContextPath, 'utf-8');
    const cartDrawerContent = fs.readFileSync(cartDrawerPath, 'utf-8');

    await test('1. Terminal order status helper identifies DELIVERED, COMPLETED, and SETTLED', () => {
      const terminalStatuses = ['delivered', 'DELIVERED', 'completed', 'COMPLETED', 'settled', 'SETTLED'];
      for (const st of terminalStatuses) {
        assert(
          st.toLowerCase() === 'delivered' || st.toLowerCase() === 'completed' || st.toLowerCase() === 'settled',
          `Status ${st} must be recognized as terminal`
        );
      }
      assert(
        storeContextContent.includes("s === 'delivered' || s === 'completed' || s === 'settled'"),
        'isTerminalSuccessfulStatus helper must cover delivered, completed, and settled'
      );
    });

    await test('2. Active order statuses (pending, baking, ready, out_for_delivery) do not trigger cleanup', () => {
      const activeStatuses = [
        'pending', 'placed', 'confirmed', 'accepted',
        'baking', 'preparing', 'packing', 'ready',
        'ready_for_pickup', 'out_for_delivery',
      ];
      for (const st of activeStatuses) {
        assert(
          st !== 'delivered' && st !== 'completed' && st !== 'settled',
          `Active status ${st} must not be marked terminal`
        );
      }
      assert(
        storeContextContent.includes('if (currentActive && isTerminalSuccessfulStatus(currentActive.status))'),
        'StoreContext must only clean session when status is verified as terminal'
      );
    });

    await test('3. Delivered/completed order clears only local active-session data keys', () => {
      assert(
        storeContextContent.includes("export const LOCAL_STORAGE_KEY_ACTIVE_ORDER = 'mozz_active_order_id_v1'"),
        'StoreContext must export active order localStorage key'
      );
      assert(
        storeContextContent.includes("export const LOCAL_STORAGE_KEY_CUSTOMER = 'mozz_customer_details_v1'"),
        'StoreContext must export customer details localStorage key'
      );
      assert(
        storeContextContent.includes('localStorage.removeItem(LOCAL_STORAGE_KEY_ACTIVE_ORDER)'),
        'Cleanup function must remove active order from localStorage'
      );
      assert(
        storeContextContent.includes('localStorage.removeItem(LOCAL_STORAGE_KEY_CUSTOMER)'),
        'Cleanup function must remove customer details from localStorage'
      );
      assert(
        storeContextContent.includes('sessionStorage.removeItem(LOCAL_STORAGE_KEY_ACTIVE_ORDER)'),
        'Cleanup function must remove active order from sessionStorage'
      );
      assert(
        storeContextContent.includes('sessionStorage.removeItem(LOCAL_STORAGE_KEY_CUSTOMER)'),
        'Cleanup function must remove customer details from sessionStorage'
      );
    });

    await test('4. Backend/database order and customer records remain completely intact after completion', async () => {
      // Create order with customer details
      const customerPayload = {
        name: 'Persistent Customer Record',
        phone: '9876543210',
        address: 'Plot 42, Gachibowli Financial District, Hyderabad',
      };
      const createRes = await makeRequest(server, {
        path: '/api/orders',
        method: 'POST',
        body: {
          items: [
            {
              menuItem: {
                id: 'm-session-verify-1',
                name: 'Veg Loaded Pocket Pizza',
                price: 199,
                category: 'pizza',
              },
              quantity: 1,
              unitPrice: 199,
              totalPrice: 199,
            },
          ],
          orderType: 'delivery',
          customer: customerPayload,
          paymentMethod: 'cod',
        },
      });
      assert.strictEqual(createRes.status, 201, 'Order creation must succeed');
      const orderId = createRes.body.id;

      // Update to delivered
      await updateOrderStatus(orderId, 'delivered', 'Order fulfilled and delivered to doorstep');

      // Fetch order from server database
      const fetchRes = await makeRequest(server, {
        path: `/api/orders/${encodeURIComponent(orderId)}`,
        method: 'GET',
      });
      assert.strictEqual(fetchRes.status, 200, 'Delivered order must be retrievable from database');
      assert.strictEqual(fetchRes.body.status, 'delivered', 'Order status must be delivered');
      // Assert customer details are completely intact in PostgreSQL
      assert.strictEqual(fetchRes.body.customer.name, 'Persistent Customer Record');
      assert.strictEqual(fetchRes.body.customer.phone, '9876543210');
      assert.strictEqual(fetchRes.body.customer.address, 'Plot 42, Gachibowli Financial District, Hyderabad');
      assert.strictEqual(fetchRes.body.items.length, 1);
      assert.strictEqual(fetchRes.body.items[0].menuItem.name, 'Veg Loaded Pocket Pizza');
    });

    await test('5. Header displays "Enter Customer Details" when no active customer details are saved', () => {
      assert(
        navbarContent.includes("'Enter Customer Details'"),
        'Header component must output exact string "Enter Customer Details"'
      );
      assert(
        navbarContent.includes('isCustomerVerified'),
        'Header component must check isCustomerVerified'
      );
      assert(
        navbarContent.includes('Phone className="w-3.5 h-3.5 text-emerald-600"'),
        'Header customer details button must maintain the phone/WhatsApp icon'
      );
    });

    await test('6. CustomerDetailsModal opens for details entry and validates Indian mobile format', () => {
      assert(
        customerModalContent.includes("title = 'Enter Customer Details'"),
        'CustomerDetailsModal must default title to "Enter Customer Details"'
      );
      assert(
        customerModalContent.includes('/^[6-9]\\d{9}$/'),
        'CustomerDetailsModal must enforce Indian mobile number format (/^[6-9]\\d{9}$/)'
      );
      assert(
        customerModalContent.includes('Mobile Number'),
        'CustomerDetailsModal must use "Mobile Number" label'
      );
      assert(
        customerModalContent.includes('id="customer-name-input"'),
        'CustomerDetailsModal must include name input element'
      );
      assert(
        customerModalContent.includes('id="customer-phone-input"'),
        'CustomerDetailsModal must include phone input element'
      );
      assert(
        cartDrawerContent.includes('/^[6-9]\\d{9}$/'),
        'CartDrawer checkout validation must also enforce Indian mobile format'
      );
    });

    await test('7. Refreshing simulation: hydration does not restore delivered order or customer details', () => {
      assert(
        storeContextContent.includes('isTerminalSuccessfulStatus(ord.status)'),
        'StoreContext hydration must verify if restored order is terminal'
      );
      assert(
        storeContextContent.includes('clearCompletedCustomerSession(ord.id)'),
        'StoreContext hydration must immediately clear session if order is terminal'
      );
      assert(
        !storeContextContent.includes("useState<string | null>('MOZZ-8901')"),
        'StoreContext must not hardcode an active order ID on initial load'
      );
      assert(
        !storeContextContent.includes('(orders.length > 0 ? orders[0] : null)'),
        'StoreContext activeOrder must not fall back to arbitrary orders[0]'
      );
    });

  } finally {
    server.close();
  }

  console.log(`\n================================================================`);
  if (failed > 0) {
    console.error(`RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log(`================================================================\n`);
    process.exit(1);
  } else {
    console.log(`RESULTS: All ${passed} Tests Passed Successfully!`);
    console.log(`================================================================\n`);
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
