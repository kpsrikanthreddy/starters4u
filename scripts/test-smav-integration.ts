/**
 * Central SMAV Integration Verification Suite
 * Tests end-to-end MOZZ <-> Central SMAV user synchronization:
 * 1. POS / order status preservation (no broken SMAV side-effect on orders)
 * 2. Staff & outlet admin sync on create, edit, disable, and password/PIN reset
 * 3. UUID reuse & duplicate Auth account prevention
 * 4. Role mapping (owners/managers/admins -> ADMIN; cashiers/staff -> STAFF)
 * 5. Outlet-level authorization & SUPERADMIN preservation
 * 6. Authenticated webhooks (HMAC & Bearer), idempotency, loop prevention
 * 7. Failed-sync retry queue without persisting plaintext secrets
 */

import http from 'http';
import crypto from 'node:crypto';
import { AddressInfo } from 'net';
import assert from 'node:assert';
import { createApp } from '../server/app.js';
import { signAuthToken } from '../server/middleware/authMiddleware.js';
import { inMemoryDb } from '../server/db.js';
import { FLAGSHIP_MOZZ_ID, TEST_RESTAURANT_ID } from '../server/services/tenantService.js';
import { syncSmavStaff, mapSmavRole } from '../server/services/smavSync.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
    failed++;
  }
}

async function apiRequest(
  serverUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: any;
    rawBody?: string;
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

  const bodyStr =
    options.rawBody !== undefined
      ? options.rawBody
      : options.body !== undefined
      ? JSON.stringify(options.body)
      : undefined;

  const res = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body: bodyStr,
  });

  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function createMockSmavServer() {
  const state = {
    outage: false,
    expectedKey: 'test-smav-service-role-key',
    authUsers: new Map<string, any>(),
    profiles: new Map<string, any>(),
    outlets: new Map<string, any>([
      ['mozz', { id: 'outlet-uuid-mozz', outlet_code: 'mozz' }],
      ['glossylooks', { id: 'outlet-uuid-gl', outlet_code: 'glossylooks' }],
    ]),
    outletRoles: new Map<string, any>(),
    externalIdentities: new Map<string, any>(),
    requestLog: [] as Array<{ method: string; path: string; body?: any }>,
  };

  const server = http.createServer(async (req, res) => {
    const auth = req.headers.authorization || '';
    const apikey = req.headers.apikey || '';
    if (auth !== `Bearer ${state.expectedKey}` || apikey !== state.expectedKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized SMAV key' }));
      return;
    }

    if (state.outage) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Simulated SMAV outage' }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) : undefined;

    const fullUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = fullUrl.pathname;
    state.requestLog.push({ method: req.method || 'GET', path: pathname, body });

    res.setHeader('Content-Type', 'application/json');

    // GET /rest/v1/smav_external_identities
    if (req.method === 'GET' && pathname === '/rest/v1/smav_external_identities') {
      const source = (fullUrl.searchParams.get('source') || '').replace(/^eq\./, '');
      const externalId = (fullUrl.searchParams.get('external_id') || '').replace(/^eq\./, '');
      const rec = state.externalIdentities.get(`${source}:${externalId}`);
      res.writeHead(200);
      res.end(JSON.stringify(rec ? [{ auth_user_id: rec.auth_user_id }] : []));
      return;
    }

    // POST /rest/v1/smav_external_identities
    if (req.method === 'POST' && pathname === '/rest/v1/smav_external_identities') {
      state.externalIdentities.set(`${body.source}:${body.external_id}`, body);
      res.writeHead(201);
      res.end(JSON.stringify(body));
      return;
    }

    // GET /rest/v1/smav_profiles
    if (req.method === 'GET' && pathname === '/rest/v1/smav_profiles') {
      const idFilter = fullUrl.searchParams.get('id');
      const emailFilter = fullUrl.searchParams.get('email');
      const rows = Array.from(state.profiles.values()).filter((p) => {
        if (idFilter && p.id !== idFilter.replace(/^eq\./, '')) return false;
        if (emailFilter && String(p.email).toLowerCase() !== emailFilter.replace(/^eq\./, '').toLowerCase()) return false;
        return true;
      });
      res.writeHead(200);
      res.end(JSON.stringify(rows));
      return;
    }

    // POST /rest/v1/smav_profiles
    if (req.method === 'POST' && pathname === '/rest/v1/smav_profiles') {
      state.profiles.set(body.id, { ...(state.profiles.get(body.id) || {}), ...body });
      res.writeHead(201);
      res.end(JSON.stringify(body));
      return;
    }

    // POST /auth/v1/admin/users
    if (req.method === 'POST' && pathname === '/auth/v1/admin/users') {
      const dup = Array.from(state.authUsers.values()).find(
        (u) => String(u.email).toLowerCase() === String(body.email).toLowerCase()
      );
      if (dup) {
        res.writeHead(422);
        res.end(JSON.stringify({ message: 'Duplicate Auth user email' }));
        return;
      }
      const id = crypto.randomUUID();
      const user = { id, ...body };
      state.authUsers.set(id, user);
      res.writeHead(200);
      res.end(JSON.stringify(user));
      return;
    }

    // PUT /auth/v1/admin/users/:id
    if (req.method === 'PUT' && pathname.startsWith('/auth/v1/admin/users/')) {
      const id = decodeURIComponent(pathname.split('/').pop() || '');
      const existing = state.authUsers.get(id);
      if (!existing) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Auth user not found' }));
        return;
      }
      const updated = { ...existing, ...body };
      state.authUsers.set(id, updated);
      res.writeHead(200);
      res.end(JSON.stringify(updated));
      return;
    }

    // GET /rest/v1/smav_outlets
    if (req.method === 'GET' && pathname === '/rest/v1/smav_outlets') {
      const code = (fullUrl.searchParams.get('outlet_code') || '').replace(/^eq\./, '');
      const outlet = state.outlets.get(code);
      res.writeHead(200);
      res.end(JSON.stringify(outlet ? [outlet] : []));
      return;
    }

    // POST /rest/v1/smav_user_outlet_roles
    if (req.method === 'POST' && pathname === '/rest/v1/smav_user_outlet_roles') {
      state.outletRoles.set(`${body.user_id}:${body.outlet_id}`, body);
      res.writeHead(201);
      res.end(JSON.stringify(body));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: `Unhandled mock SMAV route: ${req.method} ${pathname}` }));
  });

  return { server, state };
}

async function main() {
  console.log('\n=============================================================');
  console.log('CENTRAL SMAV INTEGRATION & SECURITY TEST SUITE');
  console.log('=============================================================\n');

  const mockSmav = createMockSmavServer();
  await new Promise<void>((resolve) => mockSmav.server.listen(0, '127.0.0.1', resolve));
  const smavPort = (mockSmav.server.address() as AddressInfo).port;

  process.env.SMAV_SUPABASE_URL = `http://127.0.0.1:${smavPort}`;
  process.env.SMAV_SERVICE_ROLE_KEY = mockSmav.state.expectedKey;
  process.env.SMAV_WEBHOOK_SECRET = 'test-smav-webhook-hmac-secret';

  const app = createApp();
  const appServer = http.createServer(app);
  await new Promise<void>((resolve) => appServer.listen(0, '127.0.0.1', resolve));
  const appPort = (appServer.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${appPort}`;

  const mozzOwnerToken = signAuthToken({
    userId: 'mozz-owner-test',
    name: 'MOZZ Owner',
    email: 'owner@mozz.in',
    role: 'RESTAURANT_OWNER',
    restaurantId: FLAGSHIP_MOZZ_ID,
    restaurantSlug: 'mozz',
  });

  const mozzCashierToken = signAuthToken({
    userId: 'mozz-cashier-test',
    name: 'MOZZ Cashier',
    email: 'cashier@mozz.in',
    role: 'CASHIER',
    restaurantId: FLAGSHIP_MOZZ_ID,
    restaurantSlug: 'mozz',
  });

  const superAdminToken = signAuthToken({
    userId: 'platform-super-admin-test',
    name: 'Platform SuperAdmin',
    email: 'superadmin@starters4u.in',
    role: 'SUPER_ADMIN',
    restaurantId: FLAGSHIP_MOZZ_ID,
    restaurantSlug: 'mozz',
  });

  const otherRestaurantOwnerToken = signAuthToken({
    userId: 'other-owner-test',
    name: 'Other Owner',
    email: 'owner@otherrestaurant.in',
    role: 'RESTAURANT_OWNER',
    restaurantId: TEST_RESTAURANT_ID,
    restaurantSlug: 'test-restaurant',
  });

  try {
    // 1. Role mapping test
    await test('Maps owners/managers/admins to ADMIN and cashiers/kitchen/staff to STAFF', () => {
      assert.strictEqual(mapSmavRole('RESTAURANT_OWNER'), 'ADMIN');
      assert.strictEqual(mapSmavRole('RESTAURANT_ADMIN'), 'ADMIN');
      assert.strictEqual(mapSmavRole('BRANCH_MANAGER'), 'ADMIN');
      assert.strictEqual(mapSmavRole('manager'), 'ADMIN');
      assert.strictEqual(mapSmavRole('owner'), 'ADMIN');
      assert.strictEqual(mapSmavRole('CASHIER'), 'STAFF');
      assert.strictEqual(mapSmavRole('KITCHEN'), 'STAFF');
      assert.strictEqual(mapSmavRole('WAITER'), 'STAFF');
      assert.strictEqual(mapSmavRole('STAFF'), 'STAFF');
    });

    // 2. Preserve POS order status endpoint (regression fix check)
    await test('PATCH /api/admin/orders/:id/status preserves order update without triggering SMAV sync', async () => {
      const orderId = 'test-order-smav-preserve';
      inMemoryDb.orders.push({
        id: orderId,
        restaurant_id: FLAGSHIP_MOZZ_ID,
        order_number: 'MOZZ-9999',
        order_type: 'takeaway',
        status: 'pending',
        grand_total: 450,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const logCountBefore = mockSmav.state.requestLog.length;
      const res = await apiRequest(baseUrl, `/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        token: mozzOwnerToken,
        body: { status: 'preparing' },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'preparing');
      assert.strictEqual(res.data.smavSync, undefined);
      assert.strictEqual(mockSmav.state.requestLog.length, logCountBefore);
    });

    // 3. Create Cashier with 4-digit PIN -> syncs as STAFF without failing 8-char check
    let createdCashierId = '';
    let cashierAuthUuid = '';
    await test('POST /api/admin/users creates staff with 4-digit PIN and syncs to SMAV as STAFF', async () => {
      const res = await apiRequest(baseUrl, '/api/admin/users', {
        method: 'POST',
        token: mozzOwnerToken,
        body: {
          name: 'Ravi Kumar',
          email: 'ravi.cashier@mozz.in',
          phone: '9876543210',
          role: 'CASHIER',
          pin: '1234',
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.smavSync?.synced, true);
      assert.ok(res.data.smavSync?.userId);
      createdCashierId = res.data.id;
      cashierAuthUuid = res.data.smavSync.userId;

      const profile = mockSmav.state.profiles.get(cashierAuthUuid);
      assert.strictEqual(profile.platform_role, 'STAFF');
      assert.strictEqual(profile.is_active, true);
      const outletRole = mockSmav.state.outletRoles.get(`${cashierAuthUuid}:outlet-uuid-mozz`);
      assert.strictEqual(outletRole.role, 'STAFF');
      assert.strictEqual(outletRole.external_staff_id, String(createdCashierId));
    });

    // 4. Edit role -> promotes to ADMIN, resets password, updates email, reuses same Auth UUID
    await test('PATCH /api/admin/users/:id promotes role, resets password/email, and reuses Central SMAV Auth UUID', async () => {
      const authUserCountBefore = mockSmav.state.authUsers.size;
      const res = await apiRequest(baseUrl, `/api/admin/users/${createdCashierId}`, {
        method: 'PATCH',
        token: mozzOwnerToken,
        body: {
          name: 'Ravi Kumar Promoted',
          email: 'ravi.manager@mozz.in',
          role: 'BRANCH_MANAGER',
          pin: 'StrongPass123!',
          isActive: true,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.smavSync?.synced, true);
      assert.strictEqual(res.data.smavSync?.userId, cashierAuthUuid);
      assert.strictEqual(mockSmav.state.authUsers.size, authUserCountBefore);

      const authUser = mockSmav.state.authUsers.get(cashierAuthUuid);
      assert.strictEqual(authUser.email, 'ravi.manager@mozz.in');
      assert.strictEqual(authUser.password, 'StrongPass123!');

      const profile = mockSmav.state.profiles.get(cashierAuthUuid);
      assert.strictEqual(profile.platform_role, 'ADMIN');
      assert.strictEqual(profile.full_name, 'Ravi Kumar Promoted');
    });

    // 5. Disable & Delete syncs active=false while reusing UUID
    await test('PATCH deactivate & DELETE /api/admin/users/:id set active=false centrally without orphan auth users', async () => {
      const disableRes = await apiRequest(baseUrl, `/api/admin/users/${createdCashierId}`, {
        method: 'PATCH',
        token: mozzOwnerToken,
        body: { is_active: false },
      });
      assert.strictEqual(disableRes.status, 200);
      assert.strictEqual(disableRes.data.is_active, false);
      assert.strictEqual(mockSmav.state.profiles.get(cashierAuthUuid).is_active, false);

      const delRes = await apiRequest(baseUrl, `/api/admin/users/${createdCashierId}`, {
        method: 'DELETE',
        token: mozzOwnerToken,
      });
      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.data.smavSync?.synced, true);
      assert.strictEqual(delRes.data.smavSync?.userId, cashierAuthUuid);
    });

    // 6. Authorization & SUPERADMIN protection
    await test('Enforces outlet-level authorization and protects SUPERADMIN accounts', async () => {
      // Cashier cannot manage staff
      const cashierReq = await apiRequest(baseUrl, '/api/admin/users', {
        method: 'POST',
        token: mozzCashierToken,
        body: { name: 'X', email: 'x@mozz.in', role: 'CASHIER', pin: '1234' },
      });
      assert.strictEqual(cashierReq.status, 403);

      // Restaurant B owner cannot access or tamper Restaurant A (MOZZ) staff
      const crossTenantReq = await apiRequest(baseUrl, `/api/admin/users?restaurantId=${FLAGSHIP_MOZZ_ID}`, {
        method: 'GET',
        token: otherRestaurantOwnerToken,
      });
      assert.strictEqual(crossTenantReq.status, 403);

      // Non-superadmin cannot create SUPER_ADMIN
      const escalateReq = await apiRequest(baseUrl, '/api/admin/users', {
        method: 'POST',
        token: mozzOwnerToken,
        body: { name: 'Fake Super', email: 'fakesuper@mozz.in', role: 'SUPER_ADMIN', pin: '12345678' },
      });
      assert.strictEqual(escalateReq.status, 403);

      // SuperAdmin created locally is preserved & skipped from outlet sync
      const superCreate = await apiRequest(baseUrl, '/api/admin/users', {
        method: 'POST',
        token: superAdminToken,
        body: { name: 'Central Guard', email: 'guard@starters4u.in', role: 'SUPER_ADMIN', pin: '12345678' },
      });
      assert.strictEqual(superCreate.status, 201);
      assert.strictEqual(superCreate.data.smavSync?.skipped, true);
      const guardId = superCreate.data.id;

      // Outlet owner cannot edit or delete SUPER_ADMIN
      const ownerEditSuper = await apiRequest(baseUrl, `/api/admin/users/${guardId}`, {
        method: 'PATCH',
        token: mozzOwnerToken,
        body: { role: 'CASHIER' },
      });
      assert.strictEqual(ownerEditSuper.status, 403);

      // Central SMAV SUPERADMIN cannot have password/role overwritten via direct adapter sync
      const centralSuperUid = crypto.randomUUID();
      mockSmav.state.authUsers.set(centralSuperUid, {
        id: centralSuperUid,
        email: 'central-super@smav.in',
        password: 'original-super-password',
      });
      mockSmav.state.profiles.set(centralSuperUid, {
        id: centralSuperUid,
        email: 'central-super@smav.in',
        platform_role: 'SUPERADMIN',
        is_active: true,
      });
      mockSmav.state.externalIdentities.set('mozz:super-src-1', {
        source: 'mozz',
        external_id: 'super-src-1',
        auth_user_id: centralSuperUid,
      });

      await assert.rejects(
        () =>
          syncSmavStaff('mozz', {
            sourceId: 'super-src-1',
            email: 'central-super@smav.in',
            name: 'Tamper Try',
            role: 'CASHIER',
            active: false,
            password: 'hacked-password-123',
          }),
        /Refusing to modify central Superadmin account/
      );
      assert.strictEqual(mockSmav.state.authUsers.get(centralSuperUid).password, 'original-super-password');
    });

    // 7. Authenticated Webhook, Idempotency & Loop Prevention
    await test('Authenticates SMAV webhooks, enforces idempotency, prevents loops, and syncs inbound updates', async () => {
      const centralInboundUid = crypto.randomUUID();
      const eventPayload = {
        event_id: 'evt-smav-inbound-1',
        outlet_code: 'mozz',
        table: 'smav_user_outlet_roles',
        record: {
          auth_user_id: centralInboundUid,
          email: 'inbound.chef@mozz.in',
          full_name: 'Chef Inbound',
          role: 'STAFF',
          is_active: true,
          business_source: 'mozz',
        },
      };
      const raw = JSON.stringify(eventPayload);

      // Missing auth -> 401
      const unauth = await apiRequest(baseUrl, '/api/webhooks/smav', {
        method: 'POST',
        rawBody: raw,
      });
      assert.strictEqual(unauth.status, 401);

      // Bad HMAC -> 401
      const badHmac = await apiRequest(baseUrl, '/api/webhooks/smav', {
        method: 'POST',
        rawBody: raw,
        headers: { 'x-smav-signature': 'sha256=deadbeef' },
      });
      assert.strictEqual(badHmac.status, 401);

      // Valid HMAC -> creates user locally
      const validSig = crypto
        .createHmac('sha256', process.env.SMAV_WEBHOOK_SECRET!)
        .update(raw)
        .digest('hex');

      const logBefore = mockSmav.state.requestLog.length;
      const ok = await apiRequest(baseUrl, '/api/webhooks/smav', {
        method: 'POST',
        rawBody: raw,
        headers: { 'x-smav-signature': `sha256=${validSig}` },
      });
      assert.strictEqual(ok.status, 200);
      assert.strictEqual(ok.data.action, 'CREATED');
      // Must NOT echo back outbound to SMAV
      assert.strictEqual(mockSmav.state.requestLog.length, logBefore);

      // Replay same event_id -> idempotent duplicate
      const replay = await apiRequest(baseUrl, '/api/webhooks/smav', {
        method: 'POST',
        rawBody: raw,
        headers: { 'x-smav-signature': `sha256=${validSig}` },
      });
      assert.strictEqual(replay.status, 200);
      assert.strictEqual(replay.data.duplicate, true);

      // Explicit outbound echo origin -> loop prevented
      const echoPayload = JSON.stringify({
        event_id: 'evt-smav-echo-1',
        origin: 'mozz',
        outlet_code: 'mozz',
        record: { auth_user_id: centralInboundUid, email: 'inbound.chef@mozz.in', role: 'STAFF', is_active: false },
      });
      const echoRes = await apiRequest(baseUrl, '/api/webhooks/smav', {
        method: 'POST',
        rawBody: echoPayload,
        headers: { Authorization: `Bearer ${process.env.SMAV_WEBHOOK_SECRET!}` },
      });
      assert.strictEqual(echoRes.status, 200);
      assert.strictEqual(echoRes.data.ignored, true);

      // Identical state on new event_id -> state-diff no-op loop prevention
      const sameStatePayload = JSON.stringify({
        event_id: 'evt-smav-noop-1',
        outlet_code: 'mozz',
        record: {
          auth_user_id: centralInboundUid,
          email: 'inbound.chef@mozz.in',
          full_name: 'Chef Inbound',
          role: 'STAFF',
          is_active: true,
        },
      });
      const noopRes = await apiRequest(baseUrl, '/api/webhooks/smav', {
        method: 'POST',
        rawBody: sameStatePayload,
        headers: { Authorization: `Bearer ${process.env.SMAV_WEBHOOK_SECRET!}` },
      });
      assert.strictEqual(noopRes.status, 200);
      assert.strictEqual(noopRes.data.noOp, true);
    });

    // 8. Failed-sync queuing & retry recovery without storing passwords
    await test('Queues failed sync jobs cleanly without storing passwords and recovers on retry', async () => {
      mockSmav.state.outage = true;

      const created = await apiRequest(baseUrl, '/api/admin/users', {
        method: 'POST',
        token: mozzOwnerToken,
        body: {
          name: 'Offline Queue Staff',
          email: 'retry.staff@mozz.in',
          role: 'WAITER',
          pin: 'SuperSecretPin99!',
        },
      });

      assert.strictEqual(created.status, 201);
      assert.strictEqual(created.data.smavSync?.synced, false);
      assert.strictEqual(created.data.smavSync?.queuedForRetry, true);
      const jobId = created.data.smavSync?.jobId;
      assert.ok(jobId);

      // Verify password is never stored inside persisted smav_sync_jobs payload
      const jobRecord = inMemoryDb.smav_sync_jobs.find((j: any) => j.id === jobId);
      assert.ok(jobRecord);
      assert.strictEqual(jobRecord.payload.password, undefined);

      // Status endpoint exposes diagnostics cleanly
      const statusBefore = await apiRequest(baseUrl, '/api/admin/users/sync-smav/status', {
        method: 'GET',
        token: mozzOwnerToken,
      });
      assert.strictEqual(statusBefore.status, 200);
      assert.ok(statusBefore.data.pendingCount >= 1);

      // Restore SMAV and trigger retry
      mockSmav.state.outage = false;
      const retryRes = await apiRequest(baseUrl, '/api/admin/users/sync-smav/retry', {
        method: 'POST',
        token: mozzOwnerToken,
        body: { force: true },
      });
      assert.strictEqual(retryRes.status, 200);
      assert.ok(retryRes.data.succeeded >= 1);

      const statusAfter = await apiRequest(baseUrl, '/api/admin/users/sync-smav/status', {
        method: 'GET',
        token: mozzOwnerToken,
      });
      assert.strictEqual(statusAfter.data.pendingCount, 0);
    });
  } finally {
    appServer.closeAllConnections?.();
    mockSmav.server.closeAllConnections?.();
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
    await new Promise<void>((resolve) => mockSmav.server.close(() => resolve()));
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
