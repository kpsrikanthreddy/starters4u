import crypto from 'node:crypto';
import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import { FLAGSHIP_MOZZ_ID } from './tenantService.js';
import * as adminService from './adminService.js';
import { syncSmavStaff, mapSmavRole, SyncStaff } from './smavSync.js';

export type SmavOutletCode = 'glossylooks' | 'mozz';

const MAX_SYNC_ATTEMPTS = 5;
let isRetryWorkerRunning = false;

export function isPlatformAdminRole(role?: string | null): boolean {
  const r = (role || '').trim().toUpperCase();
  return r === 'SUPER_ADMIN' || r === 'SUPERADMIN' || r === 'PLATFORM_ADMIN';
}

export function computeSmavPayloadHash(staff: Omit<SyncStaff, 'password'>): string {
  const canonical = JSON.stringify({
    sourceId: String(staff.sourceId || ''),
    email: String(staff.email || '').trim().toLowerCase(),
    name: String(staff.name || '').trim(),
    role: mapSmavRole(staff.role || ''),
    active: Boolean(staff.active),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export async function resolveSmavOutletCode(
  restaurantId: string,
  knownSlug?: string | null
): Promise<SmavOutletCode | null> {
  if (knownSlug) {
    const clean = knownSlug.trim().toLowerCase();
    if (clean === 'mozz') return 'mozz';
    if (clean === 'glossylooks') return 'glossylooks';
    return null;
  }

  if (restaurantId === FLAGSHIP_MOZZ_ID) {
    return 'mozz';
  }

  if (isPostgresRunning()) {
    try {
      const res = await query(`SELECT slug FROM restaurants WHERE id = $1 LIMIT 1`, [restaurantId]);
      const slug = res.rows[0]?.slug?.trim().toLowerCase();
      if (slug === 'mozz') return 'mozz';
      if (slug === 'glossylooks') return 'glossylooks';
      return null;
    } catch (err: any) {
      console.warn('[SMAV] Failed to resolve restaurant slug in PG:', err.message);
    }
  }

  const memRest = inMemoryDb.restaurants.find((r) => r.id === restaurantId);
  const memSlug = memRest?.slug?.trim().toLowerCase();
  if (memSlug === 'mozz') return 'mozz';
  if (memSlug === 'glossylooks') return 'glossylooks';
  return null;
}

function isNonRetryableSmavError(message: string): boolean {
  const m = (message || '').toLowerCase();
  return (
    m.includes('refusing to modify central superadmin account') ||
    m.includes('smaV requires passwords of at least 8 characters'.toLowerCase()) ||
    m.includes('smav requires source id and valid email') ||
    m.includes('central email already exists; link account manually')
  );
}

function calculateNextRetryIso(attempts: number): string {
  // 30s, 2m, 8m, 30m, 60m
  const delaySeconds = Math.min(3600, Math.round(30 * Math.pow(4, Math.max(0, attempts - 1))));
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

function sanitizeStaffForPersistence(staff: SyncStaff): Omit<SyncStaff, 'password'> {
  return {
    sourceId: String(staff.sourceId),
    ...(staff.username ? { username: staff.username } : {}),
    email: staff.email.trim().toLowerCase(),
    name: staff.name,
    ...(staff.phone ? { phone: staff.phone } : {}),
    role: staff.role,
    active: Boolean(staff.active),
  };
}

export async function upsertIdentityLink(params: {
  localUserId: string;
  restaurantId: string;
  outletCode: SmavOutletCode;
  centralUserId?: string | null;
  lastSyncHash?: string | null;
  direction: 'OUTBOUND' | 'INBOUND';
}): Promise<void> {
  const now = new Date().toISOString();

  if (isPostgresRunning()) {
    try {
      await query(
        `INSERT INTO smav_identity_links (
          local_user_id, restaurant_id, outlet_code, central_user_id,
          last_sync_hash, last_sync_direction, last_synced_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (local_user_id) DO UPDATE SET
          restaurant_id = EXCLUDED.restaurant_id,
          outlet_code = EXCLUDED.outlet_code,
          central_user_id = COALESCE(EXCLUDED.central_user_id, smav_identity_links.central_user_id),
          last_sync_hash = COALESCE(EXCLUDED.last_sync_hash, smav_identity_links.last_sync_hash),
          last_sync_direction = EXCLUDED.last_sync_direction,
          last_synced_at = NOW(),
          updated_at = NOW()`,
        [
          params.localUserId,
          params.restaurantId,
          params.outletCode,
          params.centralUserId || null,
          params.lastSyncHash || null,
          params.direction,
        ]
      );
      return;
    } catch (err: any) {
      console.warn('[SMAV] Error upserting identity link in PG:', err.message);
    }
  }

  inMemoryDb.smav_identity_links = inMemoryDb.smav_identity_links || [];
  const existing = inMemoryDb.smav_identity_links.find(
    (l: any) => String(l.local_user_id) === String(params.localUserId)
  );
  if (existing) {
    existing.restaurant_id = params.restaurantId;
    existing.outlet_code = params.outletCode;
    if (params.centralUserId) existing.central_user_id = params.centralUserId;
    if (params.lastSyncHash) existing.last_sync_hash = params.lastSyncHash;
    existing.last_sync_direction = params.direction;
    existing.last_synced_at = now;
    existing.updated_at = now;
  } else {
    inMemoryDb.smav_identity_links.push({
      local_user_id: params.localUserId,
      restaurant_id: params.restaurantId,
      outlet_code: params.outletCode,
      central_user_id: params.centralUserId || null,
      last_sync_hash: params.lastSyncHash || null,
      last_sync_direction: params.direction,
      last_synced_at: now,
      created_at: now,
      updated_at: now,
    });
  }
}

export async function getIdentityLinkByCentralId(
  restaurantId: string,
  centralUserId: string
): Promise<any | null> {
  if (!centralUserId) return null;

  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT * FROM smav_identity_links WHERE restaurant_id = $1 AND central_user_id = $2 LIMIT 1`,
        [restaurantId, centralUserId]
      );
      return res.rows[0] || null;
    } catch (err: any) {
      console.warn('[SMAV] Error looking up identity link in PG:', err.message);
    }
  }

  return (
    (inMemoryDb.smav_identity_links || []).find(
      (l: any) => l.restaurant_id === restaurantId && l.central_user_id === centralUserId
    ) || null
  );
}

async function markPendingJobsSucceeded(
  restaurantId: string,
  localUserId: string,
  centralUserId?: string
): Promise<void> {
  const now = new Date().toISOString();
  if (isPostgresRunning()) {
    try {
      await query(
        `UPDATE smav_sync_jobs
         SET status = 'SUCCEEDED',
             central_user_id = COALESCE($3, central_user_id),
             last_synced_at = NOW(),
             updated_at = NOW()
         WHERE restaurant_id = $1 AND local_user_id = $2 AND status = 'PENDING'`,
        [restaurantId, localUserId, centralUserId || null]
      );
      return;
    } catch (err: any) {
      console.warn('[SMAV] Error marking sync jobs succeeded in PG:', err.message);
    }
  }

  inMemoryDb.smav_sync_jobs = inMemoryDb.smav_sync_jobs || [];
  for (const j of inMemoryDb.smav_sync_jobs) {
    if (j.restaurant_id === restaurantId && String(j.local_user_id) === String(localUserId) && j.status === 'PENDING') {
      j.status = 'SUCCEEDED';
      if (centralUserId) j.central_user_id = centralUserId;
      j.last_synced_at = now;
      j.updated_at = now;
    }
  }
}

async function enqueueFailedSyncJob(params: {
  restaurantId: string;
  outletCode: SmavOutletCode;
  action: 'UPSERT' | 'DISABLE';
  staff: SyncStaff;
  payloadHash: string;
  errorMessage: string;
  nonRetryable: boolean;
}): Promise<{ id: string; status: 'PENDING' | 'DEAD_LETTER' }> {
  const safePayload = sanitizeStaffForPersistence(params.staff);
  const status: 'PENDING' | 'DEAD_LETTER' = params.nonRetryable ? 'DEAD_LETTER' : 'PENDING';
  const nextRetryAt = calculateNextRetryIso(1);
  const now = new Date().toISOString();

  if (isPostgresRunning()) {
    try {
      // Collapse into existing PENDING job for same user & outlet to prevent queue bloat
      const existingRes = await query(
        `SELECT id FROM smav_sync_jobs
         WHERE restaurant_id = $1 AND local_user_id = $2 AND outlet_code = $3 AND status = 'PENDING'
         ORDER BY created_at DESC LIMIT 1`,
        [params.restaurantId, String(params.staff.sourceId), params.outletCode]
      );

      if (existingRes.rows.length > 0) {
        const jobId = existingRes.rows[0].id;
        await query(
          `UPDATE smav_sync_jobs
           SET action = $2,
               payload = $3::jsonb,
               payload_hash = $4,
               status = $5,
               attempts = 1,
               next_retry_at = $6,
               last_error = $7,
               updated_at = NOW()
           WHERE id = $1`,
          [
            jobId,
            params.action,
            JSON.stringify(safePayload),
            params.payloadHash,
            status,
            nextRetryAt,
            params.errorMessage,
          ]
        );
        return { id: jobId, status };
      }

      const id = crypto.randomUUID();
      await query(
        `INSERT INTO smav_sync_jobs (
          id, restaurant_id, outlet_code, local_user_id, action, payload, payload_hash,
          status, attempts, max_attempts, next_retry_at, last_error, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 1, $9, $10, $11, NOW(), NOW())`,
        [
          id,
          params.restaurantId,
          params.outletCode,
          String(params.staff.sourceId),
          params.action,
          JSON.stringify(safePayload),
          params.payloadHash,
          status,
          MAX_SYNC_ATTEMPTS,
          nextRetryAt,
          params.errorMessage,
        ]
      );
      return { id, status };
    } catch (err: any) {
      console.warn('[SMAV] Error enqueuing retry job in PG:', err.message);
    }
  }

  inMemoryDb.smav_sync_jobs = inMemoryDb.smav_sync_jobs || [];
  const existingMem = inMemoryDb.smav_sync_jobs.find(
    (j: any) =>
      j.restaurant_id === params.restaurantId &&
      String(j.local_user_id) === String(params.staff.sourceId) &&
      j.outlet_code === params.outletCode &&
      j.status === 'PENDING'
  );

  if (existingMem) {
    existingMem.action = params.action;
    existingMem.payload = safePayload;
    existingMem.payload_hash = params.payloadHash;
    existingMem.status = status;
    existingMem.attempts = 1;
    existingMem.next_retry_at = nextRetryAt;
    existingMem.last_error = params.errorMessage;
    existingMem.updated_at = now;
    return { id: existingMem.id, status };
  }

  const id = crypto.randomUUID();
  inMemoryDb.smav_sync_jobs.push({
    id,
    restaurant_id: params.restaurantId,
    outlet_code: params.outletCode,
    local_user_id: String(params.staff.sourceId),
    action: params.action,
    payload: safePayload,
    payload_hash: params.payloadHash,
    status,
    attempts: 1,
    max_attempts: MAX_SYNC_ATTEMPTS,
    next_retry_at: nextRetryAt,
    last_error: params.errorMessage,
    central_user_id: null,
    last_synced_at: null,
    created_at: now,
    updated_at: now,
  });
  return { id, status };
}

export async function syncUserWithSmavRetry(params: {
  restaurantId: string;
  outletCode: SmavOutletCode;
  staff: SyncStaff;
  action?: 'UPSERT' | 'DISABLE';
  syncFn?: typeof syncSmavStaff;
}): Promise<{
  synced: boolean;
  userId?: string;
  outletCode: SmavOutletCode;
  queuedForRetry?: boolean;
  jobId?: string;
  jobStatus?: string;
  error?: string;
}> {
  const action = params.action || (params.staff.active ? 'UPSERT' : 'DISABLE');
  const payloadHash = computeSmavPayloadHash(params.staff);
  const runSync = params.syncFn || syncSmavStaff;

  try {
    const res = await runSync(params.outletCode, params.staff);
    await upsertIdentityLink({
      localUserId: String(params.staff.sourceId),
      restaurantId: params.restaurantId,
      outletCode: params.outletCode,
      centralUserId: res.userId,
      lastSyncHash: payloadHash,
      direction: 'OUTBOUND',
    });
    await markPendingJobsSucceeded(params.restaurantId, String(params.staff.sourceId), res.userId);
    return {
      synced: true,
      userId: res.userId,
      outletCode: params.outletCode,
    };
  } catch (err: any) {
    const errorMessage = err?.message || 'Unknown SMAV sync error';
    const nonRetryable = isNonRetryableSmavError(errorMessage);
    const queued = await enqueueFailedSyncJob({
      restaurantId: params.restaurantId,
      outletCode: params.outletCode,
      action,
      staff: params.staff,
      payloadHash,
      errorMessage,
      nonRetryable,
    });
    return {
      synced: false,
      outletCode: params.outletCode,
      queuedForRetry: !nonRetryable,
      jobId: queued.id,
      jobStatus: queued.status,
      error: errorMessage,
    };
  }
}

export async function processPendingSmavSyncJobs(options?: {
  restaurantId?: string;
  limit?: number;
  forceImmediate?: boolean;
  syncFn?: typeof syncSmavStaff;
}): Promise<{
  processed: number;
  succeeded: number;
  requeued: number;
  deadLettered: number;
  details: Array<{ jobId: string; localUserId: string; status: string; error?: string }>;
}> {
  const limit = options?.limit || 20;
  const runSync = options?.syncFn || syncSmavStaff;
  const nowIso = new Date().toISOString();
  let pendingJobs: any[] = [];

  if (isPostgresRunning()) {
    try {
      const conditions = [`status = 'PENDING'`, `attempts < max_attempts`];
      const values: any[] = [];
      if (!options?.forceImmediate) {
        conditions.push(`next_retry_at <= NOW()`);
      }
      if (options?.restaurantId) {
        values.push(options.restaurantId);
        conditions.push(`restaurant_id = $${values.length}`);
      }
      values.push(limit);

      const res = await query(
        `SELECT * FROM smav_sync_jobs
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at ASC
         LIMIT $${values.length}`,
        values
      );
      pendingJobs = res.rows;
    } catch (err: any) {
      console.warn('[SMAV] Failed to query pending sync jobs in PG:', err.message);
    }
  } else {
    inMemoryDb.smav_sync_jobs = inMemoryDb.smav_sync_jobs || [];
    pendingJobs = inMemoryDb.smav_sync_jobs
      .filter((j: any) => {
        if (j.status !== 'PENDING' || j.attempts >= (j.max_attempts || MAX_SYNC_ATTEMPTS)) return false;
        if (options?.restaurantId && j.restaurant_id !== options.restaurantId) return false;
        if (!options?.forceImmediate && new Date(j.next_retry_at).getTime() > Date.now()) return false;
        return true;
      })
      .slice(0, limit);
  }

  let succeeded = 0;
  let requeued = 0;
  let deadLettered = 0;
  const details: Array<{ jobId: string; localUserId: string; status: string; error?: string }> = [];

  for (const job of pendingJobs) {
    const rawPayload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    const latestUser = await adminService.getTenantUserById(job.restaurant_id, job.local_user_id);

    // Do not retry sync on SUPERADMIN accounts
    if (latestUser && isPlatformAdminRole(latestUser.role)) {
      await updateRetryJobState(job.id, 'DEAD_LETTER', job.attempts + 1, nowIso, 'SUPERADMIN preserved; skipped outlet retry');
      deadLettered++;
      details.push({ jobId: job.id, localUserId: job.local_user_id, status: 'DEAD_LETTER', error: 'SUPERADMIN preserved' });
      continue;
    }

    const effectiveStaff: SyncStaff = latestUser
      ? {
          sourceId: String(latestUser.id),
          email: latestUser.email,
          name: latestUser.name,
          phone: latestUser.phone || undefined,
          role: latestUser.role,
          active: job.action === 'DISABLE' ? false : Boolean(latestUser.is_active),
        }
      : {
          ...rawPayload,
          sourceId: String(job.local_user_id),
          active: false,
        };

    const payloadHash = computeSmavPayloadHash(effectiveStaff);

    try {
      const result = await runSync(job.outlet_code as SmavOutletCode, effectiveStaff);
      await upsertIdentityLink({
        localUserId: String(effectiveStaff.sourceId),
        restaurantId: job.restaurant_id,
        outletCode: job.outlet_code,
        centralUserId: result.userId,
        lastSyncHash: payloadHash,
        direction: 'OUTBOUND',
      });
      await updateRetryJobState(job.id, 'SUCCEEDED', job.attempts + 1, nowIso, null, result.userId);
      succeeded++;
      details.push({ jobId: job.id, localUserId: job.local_user_id, status: 'SUCCEEDED' });
    } catch (err: any) {
      const errMsg = err?.message || 'Retry failed';
      const nextAttempts = Number(job.attempts || 0) + 1;
      const exhausted = nextAttempts >= Number(job.max_attempts || MAX_SYNC_ATTEMPTS) || isNonRetryableSmavError(errMsg);
      const nextStatus = exhausted ? 'DEAD_LETTER' : 'PENDING';
      const nextRetryAt = calculateNextRetryIso(nextAttempts);
      await updateRetryJobState(job.id, nextStatus, nextAttempts, nextRetryAt, errMsg);
      if (nextStatus === 'DEAD_LETTER') deadLettered++;
      else requeued++;
      details.push({ jobId: job.id, localUserId: job.local_user_id, status: nextStatus, error: errMsg });
    }
  }

  return {
    processed: pendingJobs.length,
    succeeded,
    requeued,
    deadLettered,
    details,
  };
}

async function updateRetryJobState(
  jobId: string,
  status: 'PENDING' | 'SUCCEEDED' | 'DEAD_LETTER',
  attempts: number,
  nextRetryAt: string,
  lastError: string | null,
  centralUserId?: string
): Promise<void> {
  const now = new Date().toISOString();

  if (isPostgresRunning()) {
    try {
      await query(
        `UPDATE smav_sync_jobs
         SET status = $2,
             attempts = $3,
             next_retry_at = $4,
             last_error = $5,
             central_user_id = COALESCE($6, central_user_id),
             last_synced_at = CASE WHEN $2 = 'SUCCEEDED' THEN NOW() ELSE last_synced_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [jobId, status, attempts, nextRetryAt, lastError, centralUserId || null]
      );
      return;
    } catch (err: any) {
      console.warn('[SMAV] Error updating retry job state in PG:', err.message);
    }
  }

  const mem = (inMemoryDb.smav_sync_jobs || []).find((j: any) => j.id === jobId);
  if (mem) {
    mem.status = status;
    mem.attempts = attempts;
    mem.next_retry_at = nextRetryAt;
    mem.last_error = lastError;
    if (centralUserId) mem.central_user_id = centralUserId;
    if (status === 'SUCCEEDED') mem.last_synced_at = now;
    mem.updated_at = now;
  }
}

export async function getSmavSyncStatus(restaurantId: string) {
  if (isPostgresRunning()) {
    try {
      const jobsRes = await query(
        `SELECT id, outlet_code, local_user_id, action, status, attempts, max_attempts,
                next_retry_at, last_error, central_user_id, last_synced_at, created_at, updated_at
         FROM smav_sync_jobs
         WHERE restaurant_id = $1
         ORDER BY updated_at DESC
         LIMIT 50`,
        [restaurantId]
      );
      const linksRes = await query(
        `SELECT COUNT(*) as count FROM smav_identity_links WHERE restaurant_id = $1`,
        [restaurantId]
      );
      const jobs = jobsRes.rows;
      return {
        configured: Boolean(process.env.SMAV_SUPABASE_URL && process.env.SMAV_SERVICE_ROLE_KEY),
        webhookConfigured: Boolean(process.env.SMAV_WEBHOOK_SECRET),
        linkedUsersCount: Number(linksRes.rows[0]?.count || 0),
        pendingCount: jobs.filter((j) => j.status === 'PENDING').length,
        deadLetterCount: jobs.filter((j) => j.status === 'DEAD_LETTER').length,
        succeededCount: jobs.filter((j) => j.status === 'SUCCEEDED').length,
        recentJobs: jobs,
      };
    } catch (err: any) {
      console.warn('[SMAV] Error fetching sync status in PG:', err.message);
    }
  }

  const jobs = (inMemoryDb.smav_sync_jobs || [])
    .filter((j: any) => j.restaurant_id === restaurantId)
    .map((j: any) => ({
      id: j.id,
      outlet_code: j.outlet_code,
      local_user_id: j.local_user_id,
      action: j.action,
      status: j.status,
      attempts: j.attempts,
      max_attempts: j.max_attempts,
      next_retry_at: j.next_retry_at,
      last_error: j.last_error,
      central_user_id: j.central_user_id,
      last_synced_at: j.last_synced_at,
      created_at: j.created_at,
      updated_at: j.updated_at,
    }));
  const links = (inMemoryDb.smav_identity_links || []).filter((l: any) => l.restaurant_id === restaurantId);
  return {
    configured: Boolean(process.env.SMAV_SUPABASE_URL && process.env.SMAV_SERVICE_ROLE_KEY),
    webhookConfigured: Boolean(process.env.SMAV_WEBHOOK_SECRET),
    linkedUsersCount: links.length,
    pendingCount: jobs.filter((j: any) => j.status === 'PENDING').length,
    deadLetterCount: jobs.filter((j: any) => j.status === 'DEAD_LETTER').length,
    succeededCount: jobs.filter((j: any) => j.status === 'SUCCEEDED').length,
    recentJobs: jobs.slice(0, 50),
  };
}

function timingSafeEqualsStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifySmavWebhookAuth(
  headers: Record<string, string | string[] | undefined>,
  rawBody: string
): { authenticated: boolean; statusCode?: number; error?: string } {
  const secret = (process.env.SMAV_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return {
      authenticated: false,
      statusCode: 503,
      error: 'SMAV_WEBHOOK_SECRET is not configured on this server',
    };
  }

  const getHeader = (name: string): string => {
    const val = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(val)) return val[0] || '';
    return String(val || '').trim();
  };

  // 1. Check HMAC-SHA256 signature headers
  const sigHeader =
    getHeader('x-smav-signature') ||
    getHeader('x-webhook-signature') ||
    getHeader('x-hub-signature-256');

  if (sigHeader) {
    const providedHex = sigHeader.startsWith('sha256=') ? sigHeader.slice(7).trim() : sigHeader.trim();
    const expectedHex = crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex');
    if (timingSafeEqualsStr(providedHex.toLowerCase(), expectedHex.toLowerCase())) {
      return { authenticated: true };
    }
    return { authenticated: false, statusCode: 401, error: 'Invalid SMAV webhook HMAC signature' };
  }

  // 2. Check shared secret / Bearer header
  const directSecret = getHeader('x-smav-webhook-secret');
  if (directSecret && timingSafeEqualsStr(directSecret, secret)) {
    return { authenticated: true };
  }

  const authHeader = getHeader('authorization');
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && timingSafeEqualsStr(token, secret)) {
      return { authenticated: true };
    }
  }

  return { authenticated: false, statusCode: 401, error: 'Missing or invalid SMAV webhook credentials' };
}

function mapSmavInboundRole(
  smavRole?: string | null,
  platformRole?: string | null,
  existingLocalRole?: string | null
): string {
  const pRole = (platformRole || '').trim().toUpperCase();
  const r = (smavRole || '').trim().toUpperCase();
  const existing = (existingLocalRole || '').trim().toUpperCase();

  // Never downgrade existing SUPER_ADMIN
  if (isPlatformAdminRole(existing) || pRole === 'SUPERADMIN') {
    return 'SUPER_ADMIN';
  }

  if (r === 'ADMIN') {
    if (['RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'OWNER', 'ADMIN', 'BRANCH_MANAGER', 'MANAGER'].includes(existing)) {
      return existingLocalRole!;
    }
    return 'BRANCH_MANAGER';
  }

  if (r === 'STAFF') {
    if (['CASHIER', 'KITCHEN', 'CHEF', 'WAITER', 'RIDER', 'STAFF'].includes(existing)) {
      return existingLocalRole!;
    }
    return 'CASHIER';
  }

  return existingLocalRole || 'CASHIER';
}

async function claimWebhookEvent(
  eventKey: string,
  eventType: string,
  outletCode: string | null,
  payload: any
): Promise<{ claimed: boolean }> {
  const now = new Date().toISOString();

  if (isPostgresRunning()) {
    try {
      const res = await query(
        `INSERT INTO smav_webhook_events (event_key, event_type, outlet_code, payload, status, received_at)
         VALUES ($1, $2, $3, $4::jsonb, 'PROCESSING', NOW())
         ON CONFLICT (event_key) DO NOTHING
         RETURNING id`,
        [eventKey, eventType, outletCode, JSON.stringify(payload || {})]
      );
      return { claimed: res.rows.length > 0 };
    } catch (err: any) {
      console.warn('[SMAV Webhook] Error claiming event key in PG:', err.message);
    }
  }

  inMemoryDb.smav_webhook_events = inMemoryDb.smav_webhook_events || [];
  const exists = inMemoryDb.smav_webhook_events.some((e: any) => e.event_key === eventKey);
  if (exists) return { claimed: false };

  inMemoryDb.smav_webhook_events.push({
    id: crypto.randomUUID(),
    event_key: eventKey,
    event_type: eventType,
    outlet_code: outletCode,
    payload,
    status: 'PROCESSING',
    received_at: now,
    processed_at: null,
  });
  return { claimed: true };
}

async function finalizeWebhookEvent(
  eventKey: string,
  status: 'PROCESSED' | 'IGNORED' | 'FAILED',
  errorMessage?: string
): Promise<void> {
  const now = new Date().toISOString();

  if (isPostgresRunning()) {
    try {
      await query(
        `UPDATE smav_webhook_events
         SET status = $2, error_message = $3, processed_at = NOW()
         WHERE event_key = $1`,
        [eventKey, status, errorMessage || null]
      );
      return;
    } catch (err: any) {
      console.warn('[SMAV Webhook] Error finalizing event in PG:', err.message);
    }
  }

  const mem = (inMemoryDb.smav_webhook_events || []).find((e: any) => e.event_key === eventKey);
  if (mem) {
    mem.status = status;
    mem.error_message = errorMessage || null;
    mem.processed_at = now;
  }
}

export async function handleSmavWebhook(
  payload: any,
  headers: Record<string, string | string[] | undefined>,
  rawBody: string
): Promise<{
  statusCode: number;
  body: Record<string, any>;
}> {
  const getHeader = (name: string): string => {
    const val = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(val)) return val[0] || '';
    return String(val || '').trim();
  };

  const table = payload?.table ? String(payload.table) : undefined;
  const record = payload?.record && typeof payload.record === 'object' ? payload.record : payload;
  const oldRecord = payload?.old_record && typeof payload.old_record === 'object' ? payload.old_record : undefined;
  const targetRec = record || oldRecord || payload || {};

  const eventType = String(payload?.event || payload?.type || (table ? `${table}:${payload?.type || 'UPSERT'}` : 'SMAV_SYNC'));
  const explicitEventId =
    getHeader('x-smav-delivery-id') ||
    getHeader('x-webhook-id') ||
    getHeader('idempotency-key') ||
    payload?.event_id ||
    payload?.delivery_id ||
    payload?.idempotency_key;

  const eventKey = explicitEventId
    ? String(explicitEventId)
    : `sha256:${crypto.createHash('sha256').update(rawBody || JSON.stringify(payload || {})).digest('hex')}`;

  const rawOutletCode =
    payload?.outlet_code ||
    payload?.outletCode ||
    targetRec?.business_source ||
    targetRec?.source ||
    payload?.business_source ||
    payload?.source ||
    null;

  const normalizedOutletCode = rawOutletCode ? String(rawOutletCode).trim().toLowerCase() : null;

  // Idempotency claim
  const { claimed } = await claimWebhookEvent(eventKey, eventType, normalizedOutletCode, payload);
  if (!claimed) {
    return {
      statusCode: 200,
      body: { success: true, duplicate: true, eventKey, message: 'Webhook event already processed' },
    };
  }

  try {
    // 1. Loop prevention: ignore echoes explicitly tagged as originating from MOZZ outbound sync
    const originHeader = getHeader('x-smav-origin').toLowerCase();
    const originBody = String(payload?.origin || payload?.source_origin || '').trim().toLowerCase();
    if (
      originHeader === 'mozz' ||
      originHeader === 'mozz_outbound_sync' ||
      originBody === 'mozz' ||
      originBody === 'mozz_outbound_sync'
    ) {
      await finalizeWebhookEvent(eventKey, 'IGNORED', 'Outbound echo ignored');
      return {
        statusCode: 200,
        body: { success: true, ignored: true, reason: 'Loop prevention: outbound echo ignored' },
      };
    }

    // 2. Outlet-level authorization: only process events targeting MOZZ (or global smav_profiles linked to MOZZ)
    if (normalizedOutletCode && normalizedOutletCode !== 'mozz') {
      await finalizeWebhookEvent(eventKey, 'IGNORED', `Ignored foreign outlet: ${normalizedOutletCode}`);
      return {
        statusCode: 200,
        body: { success: true, ignored: true, reason: `Outlet '${normalizedOutletCode}' does not match 'mozz'` },
      };
    }

    const restaurantId = FLAGSHIP_MOZZ_ID;
    const centralUserId =
      targetRec?.auth_user_id ||
      targetRec?.user_id ||
      (table === 'smav_profiles' ? targetRec?.id : undefined) ||
      payload?.auth_user_id ||
      payload?.user_id ||
      payload?.central_user_id;

    const externalStaffId =
      targetRec?.external_staff_id ||
      targetRec?.external_id ||
      payload?.external_staff_id ||
      payload?.external_id ||
      payload?.sourceId;

    const email = (targetRec?.email || payload?.email || '').trim().toLowerCase() || undefined;
    const fullName = (targetRec?.full_name || payload?.full_name || payload?.name || '').trim() || undefined;
    const platformRole =
      table === 'smav_profiles'
        ? targetRec?.platform_role
        : payload?.platform_role || (targetRec?.platform_role ? targetRec.platform_role : undefined);
    const smavRole = targetRec?.role || payload?.role || platformRole;

    const isDeleteEvent = String(payload?.type || '').toUpperCase() === 'DELETE' || eventType.toUpperCase() === 'USER_REMOVED';
    const rawIsActive = isDeleteEvent
      ? false
      : targetRec?.is_active !== undefined
      ? targetRec.is_active
      : payload?.is_active !== undefined
      ? payload.is_active
      : payload?.active;

    // 3. Locate existing MOZZ user scoped strictly to FLAGSHIP_MOZZ_ID
    let localUser = externalStaffId
      ? await adminService.getTenantUserById(restaurantId, String(externalStaffId))
      : null;

    if (!localUser && centralUserId) {
      const link = await getIdentityLinkByCentralId(restaurantId, String(centralUserId));
      if (link?.local_user_id) {
        localUser = await adminService.getTenantUserById(restaurantId, String(link.local_user_id));
      }
    }

    if (!localUser && email) {
      localUser = await adminService.getTenantUserByEmail(restaurantId, email);
    }

    if (localUser) {
      const existingIsSuperAdmin = isPlatformAdminRole(localUser.role);
      const nextRole = mapSmavInboundRole(smavRole, platformRole, localUser.role);
      const nextName = fullName || localUser.name;
      const nextEmail = email || localUser.email;
      // Preserve SUPERADMIN active access unless explicitly deactivated on central smav_profiles
      const nextIsActive =
        rawIsActive !== undefined
          ? existingIsSuperAdmin && table === 'smav_user_outlet_roles'
            ? localUser.is_active
            : Boolean(rawIsActive)
          : Boolean(localUser.is_active);

      const unchanged =
        nextName === localUser.name &&
        String(nextEmail).toLowerCase() === String(localUser.email).toLowerCase() &&
        nextRole === localUser.role &&
        Boolean(nextIsActive) === Boolean(localUser.is_active);

      if (centralUserId) {
        await upsertIdentityLink({
          localUserId: String(localUser.id),
          restaurantId,
          outletCode: 'mozz',
          centralUserId: String(centralUserId),
          lastSyncHash: computeSmavPayloadHash({
            sourceId: String(localUser.id),
            email: nextEmail,
            name: nextName,
            role: nextRole,
            active: nextIsActive,
          }),
          direction: 'INBOUND',
        });
      }

      if (unchanged) {
        await finalizeWebhookEvent(eventKey, 'PROCESSED', 'No-op: local state already matches SMAV');
        return {
          statusCode: 200,
          body: { success: true, noOp: true, userId: localUser.id, reason: 'Loop prevention: state already synchronized' },
        };
      }

      const updated = await adminService.updateTenantUser(restaurantId, localUser.id, {
        name: nextName,
        email: nextEmail,
        role: nextRole,
        isActive: nextIsActive,
      });

      await finalizeWebhookEvent(eventKey, 'PROCESSED');
      return {
        statusCode: 200,
        body: { success: true, action: 'UPDATED', userId: updated?.id || localUser.id },
      };
    }

    // 4. Create new local user if inbound webhook represents an active MOZZ user with email
    if (!email || rawIsActive === false) {
      await finalizeWebhookEvent(eventKey, 'IGNORED', 'No matching local user to update/disable');
      return {
        statusCode: 200,
        body: { success: true, ignored: true, reason: 'No matching local user found' },
      };
    }

    const mappedRole = mapSmavInboundRole(smavRole, platformRole, null);
    const created = await adminService.createTenantUser(restaurantId, {
      name: fullName || email.split('@')[0],
      email,
      role: mappedRole,
      pin: crypto.randomBytes(16).toString('base64url'),
      isActive: rawIsActive !== undefined ? Boolean(rawIsActive) : true,
    });

    if (centralUserId) {
      await upsertIdentityLink({
        localUserId: String(created.id),
        restaurantId,
        outletCode: 'mozz',
        centralUserId: String(centralUserId),
        lastSyncHash: computeSmavPayloadHash({
          sourceId: String(created.id),
          email: created.email,
          name: created.name,
          role: created.role,
          active: Boolean(created.is_active),
        }),
        direction: 'INBOUND',
      });
    }

    await finalizeWebhookEvent(eventKey, 'PROCESSED');
    return {
      statusCode: 200,
      body: { success: true, action: 'CREATED', userId: created.id },
    };
  } catch (err: any) {
    await finalizeWebhookEvent(eventKey, 'FAILED', err?.message || 'Webhook processing error');
    return {
      statusCode: 500,
      body: { success: false, error: 'Failed to process SMAV webhook', details: err?.message },
    };
  }
}

export function startSmavRetryWorker(intervalMs = 60_000) {
  const g = globalThis as any;
  if (g.__smavRetryWorkerTimer) {
    return g.__smavRetryWorkerTimer;
  }

  const timer = setInterval(async () => {
    if (isRetryWorkerRunning) return;
    isRetryWorkerRunning = true;
    try {
      const res = await processPendingSmavSyncJobs({ limit: 20 });
      if (res.processed > 0) {
        console.info(
          `[SMAV Retry Worker] Processed ${res.processed} jobs (succeeded: ${res.succeeded}, requeued: ${res.requeued}, deadLettered: ${res.deadLettered})`
        );
      }
    } catch (err: any) {
      console.warn('[SMAV Retry Worker] Cycle warning:', err?.message || err);
    } finally {
      isRetryWorkerRunning = false;
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  g.__smavRetryWorkerTimer = timer;
  return timer;
}
