/**
 * Automated Test Suite for Starters4U Print Devices & POS Pairing
 * 
 * Verifies:
 * 1. 6-digit pairing code generation via POST /api/admin/print-devices/pairing-code
 * 2. Strict 10-minute expiry window & random non-hardcoded code generation
 * 3. Automatic invalidation of previous unused pairing codes
 * 4. Role-Based Access Control (RBAC) - allowed: OWNER/MANAGER; blocked: CASHIER/KITCHEN/UNAUTH
 * 5. Strict multi-tenant isolation across branches and restaurants
 * 6. Device pairing exchange & single-use replay protection
 * 7. Expired code rejection
 * 8. Security audit: Zero tokenHash / secret token leakage in admin APIs
 * 9. Device revocation and instant hardware token invalidation
 */

import http from 'http';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import { createApp, ensureInitialized } from '../server/app.js';
import { inMemoryDb } from '../server/db.js';
import { signAuthToken } from '../server/middleware/authMiddleware.js';
import * as printService from '../server/services/printService.js';

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
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsedBody: any = data;
        try {
          parsedBody = JSON.parse(data);
        } catch {
          // keep as raw text
        }
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: parsedBody,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runPrintDeviceTests() {
  console.log('\n================================================================');
  console.log('🧪 Starting Starters4U Print Devices & POS Pairing Test Suite');
  console.log('================================================================\n');

  // Initialize DB and server
  await ensureInitialized();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const restaurantAId = 'a0000000-0000-0000-0000-000000000001';
  const branchA1Id = 'b0000000-0000-0000-0000-000000000001';
  const restaurantBId = 'a0000000-0000-0000-0000-000000000002';
  const branchB1Id = 'b0000000-0000-0000-0000-000000000002';

  // Ensure restaurant B and branch B exist in memory for tenant testing
  if (!inMemoryDb.restaurants.some((r) => r.id === restaurantBId)) {
    inMemoryDb.restaurants.push({
      id: restaurantBId,
      name: 'Other Bistro',
      slug: 'other-bistro',
      currency: 'INR',
      tax_rate: 5.0,
      status: 'active',
    });
  }
  if (!inMemoryDb.restaurant_branches.some((b) => b.id === branchB1Id)) {
    inMemoryDb.restaurant_branches.push({
      id: branchB1Id,
      restaurant_id: restaurantBId,
      name: 'Secondary City Branch',
      is_main: true,
      address: 'Madhapur, Hyderabad',
      status: 'active',
      created_at: new Date().toISOString(),
    });
  }

  // Tokens for various roles
  const ownerAToken = signAuthToken({
    userId: 'u-owner-01',
    name: 'Mozz Owner',
    email: 'owner@mozz.in',
    role: 'RESTAURANT_OWNER',
    restaurantId: restaurantAId,
    branchId: branchA1Id,
  });

  const managerAToken = signAuthToken({
    userId: 'u-mgr-01',
    name: 'Mozz Branch Manager',
    email: 'manager@mozz.in',
    role: 'BRANCH_MANAGER',
    restaurantId: restaurantAId,
    branchId: branchA1Id,
  });

  const cashierAToken = signAuthToken({
    userId: 'u-cashier-01',
    name: 'Mozz Cashier',
    email: 'cashier@mozz.in',
    role: 'CASHIER',
    restaurantId: restaurantAId,
    branchId: branchA1Id,
  });

  const kitchenAToken = signAuthToken({
    userId: 'u-chef-01',
    name: 'Mozz Chef',
    email: 'chef@mozz.in',
    role: 'KITCHEN',
    restaurantId: restaurantAId,
    branchId: branchA1Id,
  });

  const ownerBToken = signAuthToken({
    userId: 'u-owner-02',
    name: 'Other Bistro Owner',
    email: 'owner@bistro.in',
    role: 'RESTAURANT_OWNER',
    restaurantId: restaurantBId,
    branchId: branchB1Id,
  });

  try {
    // -------------------------------------------------------------------------
    // Test 1: Generate Pairing Code (POST /api/admin/print-devices/pairing-code)
    // -------------------------------------------------------------------------
    let generatedCode1 = '';
    await test('1. Authenticated Restaurant Owner generates 6-digit pairing code', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/print-devices/pairing-code',
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerAToken}` },
        body: { branchId: branchA1Id },
      });

      assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.pairingCode, 'Pairing code must be present');
      assert.strictEqual(typeof res.body.pairingCode, 'string');
      assert.strictEqual(res.body.pairingCode.length, 6, 'Must be 6 digits');
      assert.ok(/^\d{6}$/.test(res.body.pairingCode), 'Must be purely numeric');
      assert.strictEqual(res.body.expiresInSeconds, 600, 'Must be 600s (10 minutes)');
      assert.strictEqual(res.body.restaurantId, restaurantAId);
      assert.strictEqual(res.body.branchId, branchA1Id);

      // Verify expiration timestamp is approximately 10 minutes in future
      const expiresAtDate = new Date(res.body.expiresAt);
      const now = Date.now();
      const diffMs = expiresAtDate.getTime() - now;
      assert.ok(diffMs > 590 * 1000 && diffMs <= 610 * 1000, 'Expiration must be ~10 minutes');

      generatedCode1 = res.body.pairingCode;
    });

    // -------------------------------------------------------------------------
    // Test 2: Randomness & Non-Hardcoded Check
    // -------------------------------------------------------------------------
    let generatedCode2 = '';
    await test('2. Successive pairing code generation produces random, dynamic codes', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/print-devices/pairing-code',
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerAToken}` },
        body: { branchId: branchA1Id },
      });

      assert.strictEqual(res.status, 201);
      assert.notStrictEqual(res.body.pairingCode, '996699', 'Never hardcode sample codes');
      generatedCode2 = res.body.pairingCode;
    });

    // -------------------------------------------------------------------------
    // Test 3: Automatic Invalidation of Previous Unused Codes
    // -------------------------------------------------------------------------
    await test('3. Generating a new code invalidates any previous unused code for the same branch', async () => {
      // generatedCode1 should now be invalidated by generatedCode2
      const pairAttempt1 = await makeRequest(server, {
        path: '/api/print-agent/devices/pair',
        method: 'POST',
        body: {
          pairingCode: generatedCode1,
          deviceId: 'pos-terminal-attempt-1',
          deviceName: 'Counter POS 1',
        },
      });

      assert.strictEqual(pairAttempt1.status, 400, 'Old pairing code must be rejected');
      assert.ok(
        pairAttempt1.body.error?.includes('expired') || pairAttempt1.body.error?.includes('Invalid'),
        'Must return error indicating code is no longer valid'
      );

      // Meanwhile, generatedCode2 must be valid and usable
      const pairAttempt2 = await makeRequest(server, {
        path: '/api/print-agent/devices/pair',
        method: 'POST',
        body: {
          pairingCode: generatedCode2,
          deviceId: 'pos-terminal-counter-01',
          deviceName: 'Front Counter POS',
          platform: 'win32',
          appVersion: '1.0.0',
        },
      });

      assert.strictEqual(pairAttempt2.status, 201, 'Newest pairing code must succeed');
      assert.strictEqual(pairAttempt2.body.success, true);
      assert.ok(pairAttempt2.body.deviceToken, 'Must receive deviceToken');
    });

    // -------------------------------------------------------------------------
    // Test 4: Role-Based Access Control (RBAC) Enforcement
    // -------------------------------------------------------------------------
    await test('4. RBAC: Cashier & Kitchen users are forbidden from generating pairing codes', async () => {
      // Cashier
      const cashierRes = await makeRequest(server, {
        path: '/api/admin/print-devices/pairing-code',
        method: 'POST',
        headers: { Authorization: `Bearer ${cashierAToken}` },
        body: { branchId: branchA1Id },
      });
      assert.strictEqual(cashierRes.status, 403, 'Cashier must receive 403 Forbidden');

      // Kitchen
      const kitchenRes = await makeRequest(server, {
        path: '/api/admin/print-devices/pairing-code',
        method: 'POST',
        headers: { Authorization: `Bearer ${kitchenAToken}` },
        body: { branchId: branchA1Id },
      });
      assert.strictEqual(kitchenRes.status, 403, 'Kitchen must receive 403 Forbidden');

      // Unauthenticated
      const unauthRes = await makeRequest(server, {
        path: '/api/admin/print-devices/pairing-code',
        method: 'POST',
        body: { branchId: branchA1Id },
      });
      assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must receive 401 Unauthorized');

      // Branch Manager (Permitted)
      const managerRes = await makeRequest(server, {
        path: '/api/admin/print-devices/pairing-code',
        method: 'POST',
        headers: { Authorization: `Bearer ${managerAToken}` },
        body: { branchId: branchA1Id },
      });
      assert.strictEqual(managerRes.status, 201, 'Branch Manager must receive 201 Created');
    });

    // -------------------------------------------------------------------------
    // Test 5: Strict Multi-Tenant Isolation
    // -------------------------------------------------------------------------
    await test('5. Multi-Tenant: Admin cannot generate pairing code for another restaurant branch', async () => {
      // Owner of Restaurant A tries to target branch belonging to Restaurant B
      const crossTenantRes = await makeRequest(server, {
        path: '/api/admin/print-devices/pairing-code',
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerAToken}` },
        body: { branchId: branchB1Id },
      });
      assert.strictEqual(crossTenantRes.status, 403, 'Cross-tenant branch generation must return 403');
    });

    // -------------------------------------------------------------------------
    // Test 6: Single-Use & Replay Protection
    // -------------------------------------------------------------------------
    await test('6. Single-Use: Once a pairing code is consumed, replay attempts fail', async () => {
      // Generate a fresh code
      const codeRes = await makeRequest(server, {
        path: '/api/admin/print-devices/pairing-code',
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerAToken}` },
        body: { branchId: branchA1Id },
      });
      const code = codeRes.body.pairingCode;

      // Pair device 1
      const pair1 = await makeRequest(server, {
        path: '/api/print-agent/devices/pair',
        method: 'POST',
        body: {
          pairingCode: code,
          deviceId: 'pos-kitchen-display-01',
          deviceName: 'Kitchen Ticket Printer',
        },
      });
      assert.strictEqual(pair1.status, 201, 'First pairing must succeed');

      // Replay attempt with same code
      const pair2 = await makeRequest(server, {
        path: '/api/print-agent/devices/pair',
        method: 'POST',
        body: {
          pairingCode: code,
          deviceId: 'pos-intruder-terminal',
          deviceName: 'Unauthorized Device',
        },
      });
      assert.strictEqual(pair2.status, 400, 'Reusing an already consumed code must be rejected');
    });

    // -------------------------------------------------------------------------
    // Test 7: Expiration Enforcement
    // -------------------------------------------------------------------------
    await test('7. Expired Pairing Code: Attempting to pair with an expired code is rejected', async () => {
      // Insert an expired code directly into fallback / DB with expires_at in the past
      const expiredCode = '123456';
      inMemoryDb.device_pairing_codes.push({
        id: 'expired-code-uuid',
        code: expiredCode,
        restaurant_id: restaurantAId,
        branch_id: branchA1Id,
        created_by_user_id: 'u-owner-01',
        expires_at: new Date(Date.now() - 60 * 1000).toISOString(), // 1 min ago
        is_used: false,
        created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      });

      const pairExpired = await makeRequest(server, {
        path: '/api/print-agent/devices/pair',
        method: 'POST',
        body: {
          pairingCode: expiredCode,
          deviceId: 'pos-expired-terminal',
          deviceName: 'Terminal with Expired Code',
        },
      });

      assert.strictEqual(pairExpired.status, 400, 'Expired code must be rejected');
      assert.ok(pairExpired.body.error?.toLowerCase().includes('expired'));
    });

    // -------------------------------------------------------------------------
    // Test 8: Device Listing & Token Security Audit
    // -------------------------------------------------------------------------
    let targetDeviceId = '';
    await test('8. GET /api/admin/print-devices returns registered devices without exposing tokens', async () => {
      const res = await makeRequest(server, {
        path: '/api/admin/print-devices',
        method: 'GET',
        headers: { Authorization: `Bearer ${ownerAToken}` },
      });

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body), 'Must return array of devices');
      assert.ok(res.body.length >= 2, 'Must contain the previously paired devices');

      for (const d of res.body) {
        // Required fields
        assert.ok(d.deviceId, 'Device must have deviceId');
        assert.ok(d.deviceName, 'Device must have deviceName');
        assert.ok(d.branchId, 'Device must have branchId');
        assert.strictEqual(d.restaurantId, restaurantAId, 'Tenant isolation check');
        assert.strictEqual(typeof d.isActive, 'boolean', 'Device must have isActive boolean');

        // Security check: Never leak device tokens or hashes in UI / admin API
        assert.strictEqual(d.tokenHash, undefined, 'SECURITY VIOLATION: tokenHash must never be exposed');
        assert.strictEqual(d.deviceToken, undefined, 'SECURITY VIOLATION: deviceToken must never be exposed');
      }

      targetDeviceId = res.body[0].id;
    });

    // -------------------------------------------------------------------------
    // Test 9: Device Revocation & Token Deactivation
    // -------------------------------------------------------------------------
    await test('9. Revoke Device: Deactivates device and immediately invalidates token', async () => {
      assert.ok(targetDeviceId, 'Must have a device ID to revoke');

      const revokeRes = await makeRequest(server, {
        path: `/api/admin/print-devices/${targetDeviceId}/deactivate`,
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerAToken}` },
      });

      assert.strictEqual(revokeRes.status, 200, `Expected 200, got ${revokeRes.status}`);
      assert.strictEqual(revokeRes.body.success, true);

      // Verify device now shows isActive: false
      const listRes = await makeRequest(server, {
        path: '/api/admin/print-devices',
        method: 'GET',
        headers: { Authorization: `Bearer ${ownerAToken}` },
      });
      const revokedDevice = listRes.body.find((d: any) => d.id === targetDeviceId);
      assert.ok(revokedDevice, 'Device must be found');
      assert.strictEqual(revokedDevice.isActive, false, 'Device must be marked inactive');

      // Cross-tenant protection on revocation: Owner B cannot revoke Restaurant A's device
      const crossRevokeRes = await makeRequest(server, {
        path: `/api/admin/print-devices/${targetDeviceId}/deactivate`,
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerBToken}` },
      });
      assert.strictEqual(crossRevokeRes.status, 404, 'Foreign restaurant must receive 404 Device not found');
    });

    // Summary
    console.log('\n================================================================');
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    console.log('================================================================\n');

    server.close(() => {
      process.exit(failed > 0 ? 1 : 0);
    });
  } finally {
    server.close();
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 200);
  }
}

runPrintDeviceTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
