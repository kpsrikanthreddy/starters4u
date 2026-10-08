import crypto from 'crypto';
import type { Response } from 'express';
import { query, inMemoryDb, isPostgresRunning } from '../db.js';
export { isPostgresRunning };
import type {
  PrintJob,
  PrintJobType,
  PrintJobStatus,
  KotTicketPayload,
  BillTicketPayload,
  PrintDevice,
  PrinterConfiguration,
  PrintJobAttempt,
} from '../types/printTypes.js';
import type { Order } from '../../src/types.js';

// Global SSE connection registry: Key is `${restaurantId}:${branchId}`
const sseClients = new Map<string, Set<Response>>();

// Heartbeat timer to keep SSE streams alive through reverse proxies
setInterval(() => {
  for (const clientSet of sseClients.values()) {
    for (const res of clientSet) {
      try {
        res.write(`: heartbeat\n\n`);
      } catch (err) {
        // Client will be cleaned up on error/close
      }
    }
  }
}, 25000);

export function registerSseClient(restaurantId: string, branchId: string, res: Response): () => void {
  const key = `${restaurantId}:${branchId}`;
  if (!sseClients.has(key)) {
    sseClients.set(key, new Set());
  }
  const set = sseClients.get(key)!;
  set.add(res);

  // Send initial connected acknowledgement event
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString(), restaurantId, branchId })}\n\n`);

  return () => {
    set.delete(res);
    if (set.size === 0) {
      sseClients.delete(key);
    }
  };
}

export function broadcastPrintEvent(restaurantId: string, branchId: string, eventName: string, data: any): void {
  const key = `${restaurantId}:${branchId}`;
  const set = sseClients.get(key);
  if (!set || set.size === 0) return;

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of set) {
    try {
      client.write(payload);
    } catch (err) {
      console.warn('[PrintService] Failed to write to SSE client, removing:', err);
      set.delete(client);
    }
  }
}

// Helper to fetch Restaurant and Branch metadata for ticket rendering
async function getRestaurantAndBranchInfo(restaurantId: string, branchId: string) {
  let restaurantName = 'Starters4U Kitchen';
  let branchName = 'Main Branch';
  let branchAddress = '';
  let branchPhone = '';
  let gstin = '';
  let tagline = '';
  let taxRate = 5.0;

  if (isPostgresRunning()) {
    try {
      const restRes = await query(`SELECT name, tagline, tax_rate, phone FROM restaurants WHERE id = $1 LIMIT 1`, [restaurantId]);
      if (restRes.rows.length > 0) {
        restaurantName = restRes.rows[0].name;
        tagline = restRes.rows[0].tagline || '';
        taxRate = Number(restRes.rows[0].tax_rate || 5.0);
        if (restRes.rows[0].phone) branchPhone = restRes.rows[0].phone;
      }
      const settRes = await query(`SELECT address, phone FROM restaurant_settings WHERE restaurant_id = $1 LIMIT 1`, [restaurantId]);
      if (settRes.rows.length > 0) {
        if (settRes.rows[0].address) branchAddress = settRes.rows[0].address;
        if (settRes.rows[0].phone) branchPhone = settRes.rows[0].phone;
      }
      const branchRes = await query(`SELECT name, address, phone FROM restaurant_branches WHERE id = $1 LIMIT 1`, [branchId]);
      if (branchRes.rows.length > 0) {
        branchName = branchRes.rows[0].name;
        branchAddress = branchRes.rows[0].address || branchAddress;
        branchPhone = branchRes.rows[0].phone || branchPhone;
      }
    } catch (err) {
      console.error('[PrintService] Error querying restaurant/branch info:', err);
    }
  } else {
    const r = inMemoryDb.restaurants.find((rest) => rest.id === restaurantId);
    if (r) {
      restaurantName = r.name;
      tagline = r.tagline || '';
      taxRate = Number(r.tax_rate || 5.0);
      if (r.phone) branchPhone = r.phone;
    }
    const s = (inMemoryDb.restaurant_settings || []).find((st) => st.restaurant_id === restaurantId);
    if (s) {
      if (s.gstin) gstin = s.gstin;
      if (s.address) branchAddress = s.address;
      if (s.phone) branchPhone = s.phone;
    }
    const b = inMemoryDb.restaurant_branches.find((br) => br.id === branchId);
    if (b) {
      branchName = b.name;
      branchAddress = b.address || branchAddress;
      branchPhone = b.phone || branchPhone;
    }
  }

  return { restaurantName, branchName, branchAddress, branchPhone, gstin, tagline, taxRate };
}

// Build KOT Ticket Payload (Strictly NO pricing or payment details)
export function buildKotPayload(
  order: Order,
  restaurantName: string,
  branchName: string,
  station: string,
  isReprint = false
): KotTicketPayload {
  const orderNumber = order.orderNumber || (order as any).order_number || `ORD-${order.id.slice(0, 6)}`;
  const tableNum = order.tableNumber || order.customer?.tableNumber || order.qrSession?.tableNumber || undefined;

  const items = order.items.map((it) => {
    const itemName = it.menuItem?.name || (it as any).itemName || (it as any).name || 'Item';
    const addonNames = Array.isArray(it.addons)
      ? it.addons.map((a: any) => (typeof a === 'string' ? a : a.name || ''))
      : [];

    return {
      name: itemName,
      quantity: it.quantity,
      selectedShape: it.selectedShape,
      selectedCrust: it.selectedCrust,
      spiceLevel: it.spiceLevel,
      addons: addonNames,
      specialInstructions: it.specialInstructions,
      category: it.menuItem?.category,
    };
  });

  return {
    restaurantName,
    branchName,
    kotNumber: order.kotNumber || `KOT-${orderNumber.replace(/[^0-9]/g, '') || order.id.slice(0, 4)}`,
    orderNumber,
    orderType: order.orderType,
    tableNumber: tableNum,
    orderTime: order.createdAt || new Date().toISOString(),
    isReprint,
    station,
    items,
    orderInstructions: (order as any).instructions || undefined,
    customerName: order.orderType === 'dine_in' ? undefined : order.customer?.name,
    waiterName: order.waiterName || undefined,
  };
}

// Build Bill Ticket Payload (With full item totals, taxes, discount, and payment summary)
export function buildBillPayload(
  order: Order,
  info: { restaurantName: string; branchName: string; branchAddress: string; branchPhone: string; gstin: string; tagline?: string; taxRate: number },
  isReprint = false
): BillTicketPayload {
  const orderNumber = order.orderNumber || (order as any).order_number || `ORD-${order.id.slice(0, 6)}`;
  const tableNum = order.tableNumber || order.customer?.tableNumber || order.qrSession?.tableNumber || undefined;

  const items = order.items.map((it) => {
    const itemName = it.menuItem?.name || (it as any).itemName || (it as any).name || 'Item';
    const addonNames = Array.isArray(it.addons)
      ? it.addons.map((a: any) => (typeof a === 'string' ? a : a.name || ''))
      : [];

    return {
      name: itemName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      itemTotal: Math.round(it.quantity * it.unitPrice * 100) / 100,
      selectedShape: it.selectedShape,
      selectedCrust: it.selectedCrust,
      spiceLevel: it.spiceLevel,
      addons: addonNames,
      specialInstructions: it.specialInstructions,
    };
  });

  const subtotal = Number(order.itemTotal || 0);
  const discount = Number(order.discount || 0);
  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = Number(order.tax || 0);
  const cgst = Math.round((tax / 2) * 100) / 100;
  const sgst = Math.round((tax - cgst) * 100) / 100;

  return {
    restaurantName: info.restaurantName,
    branchName: info.branchName,
    branchAddress: info.branchAddress,
    branchPhone: info.branchPhone,
    tagline: info.tagline,
    gstin: info.gstin || undefined,
    billNumber: `BILL-${orderNumber.replace(/[^0-9A-Z-]/gi, '')}`,
    orderNumber,
    orderTime: order.createdAt || new Date().toISOString(),
    orderType: order.orderType,
    tableNumber: tableNum,
    customerName: order.customer?.name,
    customerPhone: order.customer?.phone,
    customerAddress: order.customer?.address,
    isReprint,
    items,
    subtotal,
    itemTotal: subtotal,
    taxableAmount,
    cgst,
    sgst,
    discount,
    couponCode: order.couponCode,
    tax,
    taxRate: info.taxRate,
    deliveryFee: order.deliveryFee || 0,
    platformMarkup: order.platformMarkupTotal || 0,
    packingCharges: 0,
    grandTotal: order.grandTotal,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    footerMessage: `Thank you for ordering with ${info.restaurantName}!`,
    website: 'starters4u.in',
  };
}

// Create atomic print jobs for an order (idempotent; safe against browser refreshes)
export async function createPrintJobsForOrder(
  order: Order,
  options: { reason: 'confirmed' | 'online_paid' | 'manual'; isReprint?: boolean }
): Promise<PrintJob[]> {
  // Production Payment & Order Safety: Print jobs must ONLY be created for real verified paid or admin-confirmed orders
  const isPaid = order.paymentStatus === 'paid';
  const isConfirmed = [
    'confirmed',
    'accepted',
    'baking',
    'preparing',
    'packing',
    'ready',
    'ready_for_pickup',
    'out_for_delivery',
    'delivered',
    'completed',
    'settled',
  ].includes(order.status);
  const isCancelledOrFailed = ['cancelled', 'rejected'].includes(order.status) || order.paymentStatus === 'failed';

  if (isCancelledOrFailed && !options.isReprint) {
    console.warn(`[PrintService] Safety refusal: Order ${order.id} is cancelled/rejected/failed. Refusing print job creation.`);
    return [];
  }

  if (!isPaid && !isConfirmed && !options.isReprint && options.reason !== 'manual') {
    console.warn(
      `[PrintService] Safety refusal: Order ${order.id} is neither verified paid nor admin-confirmed (status: ${order.status}, paymentStatus: ${order.paymentStatus}). Refusing print job creation.`
    );
    return [];
  }

  const restaurantId = order.restaurantId || (order as any).restaurant_id || 'a0000000-0000-0000-0000-000000000001';
  const branchId = order.branchId || (order as any).branch_id || 'b0000000-0000-0000-0000-000000000001';
  const info = await getRestaurantAndBranchInfo(restaurantId, branchId);
  const kotStation = order.kotStation || 'kitchen_master';

  const kotPayload = buildKotPayload(order, info.restaurantName, info.branchName, kotStation, options.isReprint || false);
  const billPayload = buildBillPayload(order, info, options.isReprint || false);

  const jobsToCreate = [
    {
      id: crypto.randomUUID(),
      restaurantId,
      branchId,
      orderId: order.id,
      jobType: 'KOT' as PrintJobType,
      station: kotStation,
      idempotencyKey: options.isReprint
        ? `${restaurantId}-${branchId}-${order.id}-KOT-REPRINT-${Date.now()}`
        : `${restaurantId}-${branchId}-${order.id}-KOT-${kotStation}`,
      isReprint: !!options.isReprint,
      payload: kotPayload,
    },
    {
      id: crypto.randomUUID(),
      restaurantId,
      branchId,
      orderId: order.id,
      jobType: 'BILL' as PrintJobType,
      station: 'billing',
      idempotencyKey: options.isReprint
        ? `${restaurantId}-${branchId}-${order.id}-BILL-REPRINT-${Date.now()}`
        : `${restaurantId}-${branchId}-${order.id}-BILL`,
      isReprint: !!options.isReprint,
      payload: billPayload,
    },
  ];

  const createdJobs: PrintJob[] = [];

  if (isPostgresRunning()) {
    for (const job of jobsToCreate) {
      try {
        const sql = `
          INSERT INTO print_jobs (
            id, restaurant_id, branch_id, order_id, job_type, station,
            idempotency_key, status, is_reprint, payload, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, 'PENDING', $8, $9, NOW(), NOW()
          )
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING *;
        `;
        const res = await query(sql, [
          job.id,
          job.restaurantId,
          job.branchId,
          job.orderId,
          job.jobType,
          job.station,
          job.idempotencyKey,
          job.isReprint,
          JSON.stringify(job.payload),
        ]);

        if (res.rows.length > 0) {
          const row = res.rows[0];
          const mappedJob: PrintJob = {
            id: row.id,
            restaurantId: row.restaurant_id,
            branchId: row.branch_id,
            orderId: row.order_id,
            jobType: row.job_type,
            station: row.station,
            idempotencyKey: row.idempotency_key,
            status: row.status,
            isReprint: row.is_reprint,
            claimedByDeviceId: row.claimed_by_device_id,
            claimedAt: row.claimed_at,
            printedAt: row.printed_at,
            failedAt: row.failed_at,
            errorMessage: row.error_message,
            retryCount: row.retry_count,
            maxRetries: row.max_retries,
            payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
          createdJobs.push(mappedJob);
          broadcastPrintEvent(mappedJob.restaurantId, mappedJob.branchId, 'new-job', mappedJob);
        } else {
          console.info(`[PrintService] Skipped duplicate print job for idempotency key: ${job.idempotencyKey}`);
        }
      } catch (err) {
        console.error('[PrintService] Error inserting print job in PG:', err);
      }
    }
    return createdJobs;
  }

  // In-Memory Fallback
  for (const job of jobsToCreate) {
    const exists = inMemoryDb.print_jobs.some(
      (j) => (j.idempotencyKey || j.idempotency_key) === job.idempotencyKey
    );
    if (exists) {
      console.info(`[PrintService] Skipped in-memory duplicate print job: ${job.idempotencyKey}`);
      continue;
    }

    const newJob: PrintJob = {
      id: job.id,
      restaurantId: job.restaurantId,
      branchId: job.branchId,
      orderId: job.orderId,
      jobType: job.jobType,
      station: job.station,
      idempotencyKey: job.idempotencyKey,
      status: 'PENDING',
      isReprint: job.isReprint,
      claimedByDeviceId: null,
      claimedAt: null,
      printedAt: null,
      failedAt: null,
      errorMessage: null,
      retryCount: 0,
      maxRetries: 3,
      payload: job.payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    inMemoryDb.print_jobs.push(newJob);
    createdJobs.push(newJob);
    broadcastPrintEvent(newJob.restaurantId, newJob.branchId, 'new-job', newJob);
  }

  return createdJobs;
}

// Create a manual staff reprint job
export async function createReprintJob(
  order: Order,
  jobType: PrintJobType,
  station?: string
): Promise<PrintJob | null> {
  const restaurantId = order.restaurantId || (order as any).restaurant_id || 'a0000000-0000-0000-0000-000000000001';
  const branchId = order.branchId || (order as any).branch_id || 'b0000000-0000-0000-0000-000000000001';
  const info = await getRestaurantAndBranchInfo(restaurantId, branchId);
  const kotStation = station || order.kotStation || 'kitchen_master';

  const isKOT = jobType === 'KOT';
  const payload = isKOT
    ? buildKotPayload(order, info.restaurantName, info.branchName, kotStation, true)
    : buildBillPayload(order, info, true);

  const jobId = crypto.randomUUID();
  const idempotencyKey = `${restaurantId}-${branchId}-${order.id}-${jobType}-REPRINT-${Date.now()}`;

  if (isPostgresRunning()) {
    try {
      const sql = `
        INSERT INTO print_jobs (
          id, restaurant_id, branch_id, order_id, job_type, station,
          idempotency_key, status, is_reprint, payload, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, 'PENDING', TRUE, $8, NOW(), NOW()
        ) RETURNING *;
      `;
      const res = await query(sql, [
        jobId,
        restaurantId,
        branchId,
        order.id,
        jobType,
        isKOT ? kotStation : 'billing',
        idempotencyKey,
        JSON.stringify(payload),
      ]);

      if (res.rows.length > 0) {
        const row = res.rows[0];
        const job: PrintJob = {
          id: row.id,
          restaurantId: row.restaurant_id,
          branchId: row.branch_id,
          orderId: row.order_id,
          jobType: row.job_type,
          station: row.station,
          idempotencyKey: row.idempotency_key,
          status: row.status,
          isReprint: row.is_reprint,
          claimedByDeviceId: row.claimed_by_device_id,
          claimedAt: row.claimed_at,
          printedAt: row.printed_at,
          failedAt: row.failed_at,
          errorMessage: row.error_message,
          retryCount: row.retry_count,
          maxRetries: row.max_retries,
          payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
        broadcastPrintEvent(job.restaurantId, job.branchId, 'new-job', job);
        return job;
      }
    } catch (err) {
      console.error('[PrintService] Error creating reprint job in PG:', err);
    }
  }

  // In-Memory Fallback
  const inMemJob: PrintJob = {
    id: jobId,
    restaurantId,
    branchId,
    orderId: order.id,
    jobType,
    station: isKOT ? kotStation : 'billing',
    idempotencyKey,
    status: 'PENDING',
    isReprint: true,
    claimedByDeviceId: null,
    claimedAt: null,
    printedAt: null,
    failedAt: null,
    errorMessage: null,
    retryCount: 0,
    maxRetries: 3,
    payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  inMemoryDb.print_jobs.push(inMemJob);
  broadcastPrintEvent(inMemJob.restaurantId, inMemJob.branchId, 'new-job', inMemJob);
  return inMemJob;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper to resolve device UUID if human device_id string is passed
async function resolveDeviceUuid(deviceId?: string | null): Promise<string | null> {
  if (!deviceId) return null;
  if (isPostgresRunning()) {
    try {
      const devRes = await query(
        `SELECT id FROM print_devices WHERE id::text = $1 OR device_id = $1 LIMIT 1`,
        [deviceId]
      );
      if (devRes.rows.length > 0) {
        return devRes.rows[0].id;
      }
    } catch {
      // ignore
    }
  }
  return UUID_REGEX.test(deviceId) ? deviceId : null;
}

// Atomically claim a print job by device
export async function claimPrintJob(
  jobId: string,
  deviceId: string,
  restaurantId: string,
  branchId: string
): Promise<{ claimed: boolean; job?: PrintJob; error?: string }> {
  if (isPostgresRunning()) {
    try {
      const deviceUuid = await resolveDeviceUuid(deviceId);
      if (!deviceUuid) {
        return { claimed: false, error: 'Authenticated device could not be resolved' };
      }
      const sql = `
        UPDATE print_jobs
        SET status = 'CLAIMED', claimed_by_device_id = $1, claimed_at = NOW(), updated_at = NOW()
        WHERE id::text = $2 AND status = 'PENDING' AND restaurant_id::text = $3 AND branch_id::text = $4
        RETURNING *;
      `;
      const res = await query(sql, [deviceUuid, jobId, restaurantId, branchId]);
      if (res.rows.length === 0) {
        return { claimed: false, error: 'Job already claimed, processed, or not found' };
      }
      const row = res.rows[0];
      const job: PrintJob = {
        id: row.id,
        restaurantId: row.restaurant_id,
        branchId: row.branch_id,
        orderId: row.order_id,
        jobType: row.job_type,
        station: row.station,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        isReprint: row.is_reprint,
        claimedByDeviceId: row.claimed_by_device_id,
        claimedAt: row.claimed_at,
        printedAt: row.printed_at,
        failedAt: row.failed_at,
        errorMessage: row.error_message,
        retryCount: row.retry_count,
        maxRetries: row.max_retries,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      return { claimed: true, job };
    } catch (err: any) {
      console.error('[PrintService] Error claiming job in PG:', err);
      return { claimed: false, error: err.message };
    }
  }

  // In-Memory Fallback
  const job = inMemoryDb.print_jobs.find(
    (j) => j.id === jobId && j.restaurantId === restaurantId && j.branchId === branchId
  );
  if (!job) {
    return { claimed: false, error: 'Job not found' };
  }
  if (job.status !== 'PENDING') {
    return { claimed: false, error: `Job is already in ${job.status} state` };
  }

  job.status = 'CLAIMED';
  job.claimedByDeviceId = deviceId;
  job.claimedAt = new Date().toISOString();
  job.updatedAt = new Date().toISOString();

  return { claimed: true, job };
}

// Re-claim a failed job for the same authenticated device after an explicit staff retry.
export async function retryFailedPrintJob(
  jobId: string,
  deviceId: string,
  restaurantId: string,
  branchId: string
): Promise<{ claimed: boolean; job?: PrintJob; error?: string }> {
  if (isPostgresRunning()) {
    try {
      const deviceUuid = await resolveDeviceUuid(deviceId);
      if (!deviceUuid) {
        return { claimed: false, error: 'Authenticated device could not be resolved' };
      }
      const res = await query(
        `UPDATE print_jobs
         SET status = 'CLAIMED', claimed_by_device_id = $1, claimed_at = NOW(),
             failed_at = NULL, error_message = NULL, updated_at = NOW()
         WHERE id::text = $2
           AND restaurant_id::text = $3
           AND branch_id::text = $4
           AND status = 'FAILED'
           AND retry_count < max_retries
           AND (claimed_by_device_id IS NULL OR claimed_by_device_id = $1)
         RETURNING *`,
        [deviceUuid, jobId, restaurantId, branchId]
      );
      if (res.rows.length === 0) {
        return { claimed: false, error: 'Job is not retryable, belongs to another device, or reached its retry limit' };
      }
      const row = res.rows[0];
      return {
        claimed: true,
        job: {
          id: row.id,
          restaurantId: row.restaurant_id,
          branchId: row.branch_id,
          orderId: row.order_id,
          jobType: row.job_type,
          station: row.station,
          idempotencyKey: row.idempotency_key,
          status: row.status,
          isReprint: row.is_reprint,
          claimedByDeviceId: row.claimed_by_device_id,
          claimedAt: row.claimed_at,
          printedAt: row.printed_at,
          failedAt: row.failed_at,
          errorMessage: row.error_message,
          retryCount: row.retry_count,
          maxRetries: row.max_retries,
          payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    } catch (err: any) {
      console.error('[PrintService] Error retrying failed job in PG:', err);
      return { claimed: false, error: err.message };
    }
  }

  const job = inMemoryDb.print_jobs.find(
    (j) =>
      j.id === jobId &&
      j.restaurantId === restaurantId &&
      j.branchId === branchId
  );
  if (!job || job.status !== 'FAILED') {
    return { claimed: false, error: 'Job is not in FAILED state' };
  }
  if ((job.retryCount || 0) >= (job.maxRetries || 3)) {
    return { claimed: false, error: 'Job reached its retry limit' };
  }
  if (job.claimedByDeviceId && job.claimedByDeviceId !== deviceId) {
    return { claimed: false, error: 'Job belongs to another device' };
  }
  job.status = 'CLAIMED';
  job.claimedByDeviceId = deviceId;
  job.claimedAt = new Date().toISOString();
  job.failedAt = null;
  job.errorMessage = null;
  job.updatedAt = new Date().toISOString();
  return { claimed: true, job };
}

// Update job status (PRINTING, PRINTED, FAILED) & record audit attempt
export async function updatePrintJobStatus(
  jobId: string,
  deviceId: string,
  newStatus: 'PRINTING' | 'PRINTED' | 'FAILED',
  options: { errorMessage?: string; durationMs?: number; attemptNumber?: number } = {}
): Promise<PrintJob | null> {
  const durationMs = options.durationMs || 0;
  const attemptNumber = options.attemptNumber || 1;
  const errorMessage = options.errorMessage || null;

  if (isPostgresRunning()) {
    try {
      const deviceUuid = await resolveDeviceUuid(deviceId);
      const updateSql = `
        UPDATE print_jobs
        SET
          status = $1::varchar,
          printed_at = CASE WHEN $1::varchar = 'PRINTED' THEN NOW() ELSE printed_at END,
          failed_at = CASE WHEN $1::varchar = 'FAILED' THEN NOW() ELSE failed_at END,
          error_message = $2,
          retry_count = retry_count + (CASE WHEN $1::varchar = 'FAILED' THEN 1 ELSE 0 END),
          updated_at = NOW()
        WHERE id::text = $3 AND claimed_by_device_id = $4
        RETURNING *;
      `;
      const res = await query(updateSql, [newStatus, errorMessage, jobId, deviceUuid]);
      if (res.rows.length === 0) return null;

      // Insert audit record in print_job_attempts
      const attemptSql = `
        INSERT INTO print_job_attempts (id, job_id, device_id, attempt_number, status, error_message, duration_ms, attempted_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW());
      `;
      await query(attemptSql, [res.rows[0].id, deviceUuid, attemptNumber, newStatus, errorMessage, durationMs]);

      const row = res.rows[0];
      const job: PrintJob = {
        id: row.id,
        restaurantId: row.restaurant_id,
        branchId: row.branch_id,
        orderId: row.order_id,
        jobType: row.job_type,
        station: row.station,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        isReprint: row.is_reprint,
        claimedByDeviceId: row.claimed_by_device_id,
        claimedAt: row.claimed_at,
        printedAt: row.printed_at,
        failedAt: row.failed_at,
        errorMessage: row.error_message,
        retryCount: row.retry_count,
        maxRetries: row.max_retries,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      broadcastPrintEvent(job.restaurantId, job.branchId, 'job-status-updated', {
        id: job.id,
        status: job.status,
        errorMessage,
      });

      return job;
    } catch (err) {
      console.error('[PrintService] Error updating job status in PG:', err);
    }
  }

  // In-Memory Fallback
  const job = inMemoryDb.print_jobs.find(
    (j) => j.id === jobId && j.claimedByDeviceId === deviceId
  );
  if (!job) return null;

  job.status = newStatus;
  job.updatedAt = new Date().toISOString();
  if (newStatus === 'PRINTED') {
    job.printedAt = new Date().toISOString();
  } else if (newStatus === 'FAILED') {
    job.failedAt = new Date().toISOString();
    job.errorMessage = errorMessage;
    job.retryCount += 1;
  }

  inMemoryDb.print_job_attempts.push({
    id: crypto.randomUUID(),
    jobId,
    deviceId,
    attemptNumber,
    status: newStatus,
    errorMessage,
    durationMs,
    attemptedAt: new Date().toISOString(),
  });

  broadcastPrintEvent(job.restaurantId, job.branchId, 'job-status-updated', {
    id: job.id,
    status: job.status,
    errorMessage,
  });

  return job;
}

// Get pending or active print jobs for fallback polling
export async function getPrintJobs(
  restaurantId: string,
  branchId: string,
  status?: string,
  limit = 25
): Promise<PrintJob[]> {
  if (isPostgresRunning()) {
    try {
      const sql = `
        SELECT * FROM print_jobs
        WHERE restaurant_id = $1 AND branch_id = $2
          ${status ? 'AND status = $3' : ''}
        ORDER BY created_at ASC
        LIMIT $${status ? 4 : 3};
      `;
      const params = status ? [restaurantId, branchId, status, limit] : [restaurantId, branchId, limit];
      const res = await query(sql, params);

      return res.rows.map((row) => ({
        id: row.id,
        restaurantId: row.restaurant_id,
        branchId: row.branch_id,
        orderId: row.order_id,
        jobType: row.job_type,
        station: row.station,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        isReprint: row.is_reprint,
        claimedByDeviceId: row.claimed_by_device_id,
        claimedAt: row.claimed_at,
        printedAt: row.printed_at,
        failedAt: row.failed_at,
        errorMessage: row.error_message,
        retryCount: row.retry_count,
        maxRetries: row.max_retries,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      console.error('[PrintService] Error fetching jobs from PG:', err);
    }
  }

  // In-Memory Fallback
  let list = inMemoryDb.print_jobs.filter(
    (j) => j.restaurantId === restaurantId && j.branchId === branchId
  );
  if (status) {
    list = list.filter((j) => j.status === status);
  }
  return list.slice(0, limit);
}

// Register or re-authenticate a physical desktop terminal
export async function registerDevice(data: {
  restaurantId: string;
  branchId: string;
  deviceId: string;
  deviceName: string;
  platform?: string;
  appVersion?: string;
}): Promise<{ device: PrintDevice; deviceToken: string }> {
  const plainToken = `device_${crypto.randomBytes(24).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
  const platform = data.platform || 'win32';
  const appVersion = data.appVersion || '1.0.0';
  const now = new Date().toISOString();

  if (isPostgresRunning()) {
    try {
      const sql = `
        INSERT INTO print_devices (
          id, restaurant_id, branch_id, device_id, device_name,
          token_hash, platform, app_version, is_active, last_seen_at, last_heartbeat_at,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4,
          $5, $6, $7, TRUE, NOW(), NOW(),
          NOW(), NOW()
        )
        ON CONFLICT (restaurant_id, branch_id, device_id)
        DO UPDATE SET
          device_name = EXCLUDED.device_name,
          token_hash = EXCLUDED.token_hash,
          platform = EXCLUDED.platform,
          app_version = EXCLUDED.app_version,
          is_active = TRUE,
          last_seen_at = NOW(),
          last_heartbeat_at = NOW(),
          updated_at = NOW()
        RETURNING *;
      `;
      const res = await query(sql, [
        data.restaurantId,
        data.branchId,
        data.deviceId,
        data.deviceName,
        tokenHash,
        platform,
        appVersion,
      ]);
      const row = res.rows[0];
      const lastSeen = row.last_seen_at || row.last_heartbeat_at || now;
      const device: PrintDevice = {
        id: row.id,
        restaurantId: row.restaurant_id,
        branchId: row.branch_id,
        deviceId: row.device_id,
        deviceName: row.device_name,
        tokenHash: row.token_hash,
        platform: row.platform,
        appVersion: row.app_version,
        isActive: row.is_active,
        last_seen_at: lastSeen,
        lastSeenAt: lastSeen,
        lastHeartbeatAt: row.last_heartbeat_at || lastSeen,
        isOnline: true,
        online: true,
        status: 'online',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      return { device, deviceToken: plainToken };
    } catch (err) {
      console.error('[PrintService] Error registering device in PG:', err);
      throw err;
    }
  }

  // In-Memory Fallback
  const existingIdx = inMemoryDb.print_devices.findIndex(
    (d) => d.restaurantId === data.restaurantId && d.branchId === data.branchId && d.deviceId === data.deviceId
  );

  const deviceObj: PrintDevice = {
    id: existingIdx >= 0 ? inMemoryDb.print_devices[existingIdx].id : crypto.randomUUID(),
    restaurantId: data.restaurantId,
    branchId: data.branchId,
    deviceId: data.deviceId,
    deviceName: data.deviceName,
    tokenHash,
    platform,
    appVersion,
    isActive: true,
    last_seen_at: now,
    lastSeenAt: now,
    lastHeartbeatAt: now,
    isOnline: true,
    online: true,
    status: 'online',
    createdAt: existingIdx >= 0 ? inMemoryDb.print_devices[existingIdx].createdAt : now,
    updatedAt: now,
  };

  if (existingIdx >= 0) {
    inMemoryDb.print_devices[existingIdx] = deviceObj;
  } else {
    inMemoryDb.print_devices.push(deviceObj);
  }

  return { device: deviceObj, deviceToken: plainToken };
}

// Authenticate device token from Authorization header
export async function authenticateDeviceToken(plainToken: string): Promise<PrintDevice | null> {
  if (!plainToken) return null;
  const cleanToken = plainToken.trim();
  const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

  if (isPostgresRunning()) {
    try {
      const sql = `
        SELECT * FROM print_devices
        WHERE token_hash = $1 AND is_active = TRUE
        LIMIT 1;
      `;
      const res = await query(sql, [tokenHash]);
      if (res.rows.length === 0) return null;

      const row = res.rows[0];
      const now = new Date().toISOString();
      // Scoped touch for exact device, restaurant, and branch
      await query(
        `UPDATE print_devices
         SET last_seen_at = NOW(), last_heartbeat_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND restaurant_id = $2 AND branch_id = $3`,
        [row.id, row.restaurant_id, row.branch_id]
      );

      return {
        id: row.id,
        restaurantId: row.restaurant_id,
        branchId: row.branch_id,
        deviceId: row.device_id,
        deviceName: row.device_name,
        tokenHash: row.token_hash,
        platform: row.platform,
        appVersion: row.app_version,
        isActive: row.is_active,
        last_seen_at: now,
        lastSeenAt: now,
        lastHeartbeatAt: now,
        isOnline: true,
        online: true,
        status: 'online',
        createdAt: row.created_at,
        updatedAt: now,
      };
    } catch (err) {
      console.error('[PrintService] Error authenticating device in PG:', err);
      return null;
    }
  }

  // In-Memory Fallback
  const found = inMemoryDb.print_devices.find((d) => d.tokenHash === tokenHash && d.isActive);
  if (!found) return null;
  const now = new Date().toISOString();
  found.last_seen_at = now;
  found.lastSeenAt = now;
  found.lastHeartbeatAt = now;
  found.updatedAt = now;
  found.isOnline = true;
  found.online = true;
  found.status = 'online';
  return found;
}

// Device Heartbeat (Scoped to restaurant_id and branch_id for strict tenant isolation)
export async function touchDeviceHeartbeat(
  deviceIdentifier: string,
  restaurantId?: string,
  branchId?: string
): Promise<boolean> {
  const now = new Date().toISOString();
  if (isPostgresRunning()) {
    try {
      let sql: string;
      let params: any[];
      if (restaurantId && branchId) {
        sql = `
          UPDATE print_devices
          SET last_seen_at = NOW(), last_heartbeat_at = NOW(), updated_at = NOW()
          WHERE (id::text = $1 OR device_id = $1)
            AND restaurant_id::text = $2
            AND branch_id::text = $3
            AND is_active = TRUE
          RETURNING id, last_seen_at;
        `;
        params = [deviceIdentifier, restaurantId, branchId];
      } else if (restaurantId) {
        sql = `
          UPDATE print_devices
          SET last_seen_at = NOW(), last_heartbeat_at = NOW(), updated_at = NOW()
          WHERE (id::text = $1 OR device_id = $1)
            AND restaurant_id::text = $2
            AND is_active = TRUE
          RETURNING id, last_seen_at;
        `;
        params = [deviceIdentifier, restaurantId];
      } else {
        sql = `
          UPDATE print_devices
          SET last_seen_at = NOW(), last_heartbeat_at = NOW(), updated_at = NOW()
          WHERE (id::text = $1 OR device_id = $1)
            AND is_active = TRUE
          RETURNING id, last_seen_at;
        `;
        params = [deviceIdentifier];
      }
      const res = await query(sql, params);
      return res.rows.length > 0;
    } catch (err) {
      console.error('[PrintService] Error updating heartbeat in PG:', err);
      return false;
    }
  }

  // In-Memory Fallback
  const d = inMemoryDb.print_devices.find((dev) => {
    const idMatch = dev.id === deviceIdentifier || dev.deviceId === deviceIdentifier;
    if (!idMatch || !dev.isActive) return false;
    if (restaurantId && dev.restaurantId !== restaurantId) return false;
    if (branchId && dev.branchId !== branchId) return false;
    return true;
  });

  if (d) {
    d.last_seen_at = now;
    d.lastSeenAt = now;
    d.lastHeartbeatAt = now;
    d.updatedAt = now;
    d.isOnline = true;
    d.online = true;
    d.status = 'online';
    return true;
  }
  return false;
}

// In-memory store for short-lived, single-use stream tickets (60s TTL)
interface StreamTicket {
  ticket: string;
  device: PrintDevice;
  expiresAt: number;
}
const activeStreamTickets = new Map<string, StreamTicket>();

// Periodically clean up expired tickets
setInterval(() => {
  const now = Date.now();
  for (const [key, t] of activeStreamTickets.entries()) {
    if (t.expiresAt <= now) {
      activeStreamTickets.delete(key);
    }
  }
}, 30000);

export async function createStreamTicket(device: PrintDevice): Promise<string> {
  const ticket = `st_${crypto.randomBytes(24).toString('hex')}`;
  activeStreamTickets.set(ticket, {
    ticket,
    device,
    expiresAt: Date.now() + 60 * 1000, // 60 seconds
  });
  return ticket;
}

export async function validateAndConsumeStreamTicket(ticket: string): Promise<PrintDevice | null> {
  if (!ticket) return null;
  const entry = activeStreamTickets.get(ticket);
  if (!entry) return null;

  // Single-use: delete immediately
  activeStreamTickets.delete(ticket);

  if (entry.expiresAt <= Date.now()) {
    return null; // Expired
  }

  return entry.device;
}

// Save or update printer mappings for a device
export async function savePrinterConfigurations(
  restaurantId: string,
  branchId: string,
  deviceId: string,
  configs: Array<{
    station: string;
    printerName: string;
    paperWidthMm?: number;
    copies?: number;
    isAutoPrint?: boolean;
  }>
): Promise<PrinterConfiguration[]> {
  const results: PrinterConfiguration[] = [];

  if (isPostgresRunning()) {
    try {
      const deviceUuid = await resolveDeviceUuid(deviceId);
      for (const c of configs) {
        const sql = `
          INSERT INTO printer_configurations (
            id, restaurant_id, branch_id, device_id, station,
            printer_name, paper_width_mm, copies, is_auto_print,
            created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4,
            $5, $6, $7, $8,
            NOW(), NOW()
          )
          ON CONFLICT (device_id, station)
          DO UPDATE SET
            printer_name = EXCLUDED.printer_name,
            paper_width_mm = EXCLUDED.paper_width_mm,
            copies = EXCLUDED.copies,
            is_auto_print = EXCLUDED.is_auto_print,
            updated_at = NOW()
          RETURNING *;
        `;
        const res = await query(sql, [
          restaurantId,
          branchId,
          deviceUuid,
          c.station,
          c.printerName,
          c.paperWidthMm || 80,
          c.copies || 1,
          c.isAutoPrint !== undefined ? c.isAutoPrint : true,
        ]);
        if (res.rows.length > 0) {
          const row = res.rows[0];
          results.push({
            id: row.id,
            restaurantId: row.restaurant_id,
            branchId: row.branch_id,
            deviceId: row.device_id,
            station: row.station,
            printerName: row.printer_name,
            paperWidthMm: row.paper_width_mm,
            copies: row.copies,
            isAutoPrint: row.is_auto_print,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          });
        }
      }
      return results;
    } catch (err) {
      console.error('[PrintService] Error saving printer configs in PG:', err);
      throw err;
    }
  }

  // In-Memory Fallback
  for (const c of configs) {
    const existingIdx = inMemoryDb.printer_configurations.findIndex(
      (cfg) => cfg.deviceId === deviceId && cfg.station === c.station
    );
    const configObj: PrinterConfiguration = {
      id: existingIdx >= 0 ? inMemoryDb.printer_configurations[existingIdx].id : crypto.randomUUID(),
      restaurantId,
      branchId,
      deviceId,
      station: c.station,
      printerName: c.printerName,
      paperWidthMm: c.paperWidthMm || 80,
      copies: c.copies || 1,
      isAutoPrint: c.isAutoPrint !== undefined ? c.isAutoPrint : true,
      createdAt: existingIdx >= 0 ? inMemoryDb.printer_configurations[existingIdx].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      inMemoryDb.printer_configurations[existingIdx] = configObj;
    } else {
      inMemoryDb.printer_configurations.push(configObj);
    }
    results.push(configObj);
  }

  return results;
}

// Get saved printer configs for a device
export async function getPrinterConfigurations(
  restaurantId: string,
  branchId: string,
  deviceId?: string
): Promise<PrinterConfiguration[]> {
  if (isPostgresRunning()) {
    try {
      const deviceUuid = await resolveDeviceUuid(deviceId);
      const sql = `
        SELECT * FROM printer_configurations
        WHERE restaurant_id = $1 AND branch_id = $2
          ${deviceUuid ? 'AND device_id = $3' : ''}
        ORDER BY station ASC;
      `;
      const params = deviceUuid ? [restaurantId, branchId, deviceUuid] : [restaurantId, branchId];
      const res = await query(sql, params);
      return res.rows.map((row) => ({
        id: row.id,
        restaurantId: row.restaurant_id,
        branchId: row.branch_id,
        deviceId: row.device_id,
        station: row.station,
        printerName: row.printer_name,
        paperWidthMm: row.paper_width_mm,
        copies: row.copies,
        isAutoPrint: row.is_auto_print,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      console.error('[PrintService] Error fetching printer configs in PG:', err);
    }
  }

  // In-Memory Fallback
  return inMemoryDb.printer_configurations.filter((cfg) => {
    if (cfg.restaurantId !== restaurantId || cfg.branchId !== branchId) return false;
    if (deviceId && cfg.deviceId !== deviceId) return false;
    return true;
  });
}

// ==========================================================
// 16. DEVICE PAIRING FLOW (6-Digit Pairing Code with TTL & Single-Use)
// ==========================================================

// Rate-limiting tracking for pairing attempts per IP
const pairingAttemptsByIp = new Map<string, { count: number; resetAt: number }>();

export function resetPairingRateLimit(clientIp?: string) {
  if (clientIp) {
    pairingAttemptsByIp.delete(clientIp);
  } else {
    pairingAttemptsByIp.clear();
  }
}

export function checkPairingRateLimit(clientIp: string): { allowed: boolean; remainingAttempts: number } {
  const isLocalOrTest =
    clientIp === '127.0.0.1' ||
    clientIp === '::1' ||
    clientIp === 'localhost' ||
    process.env.NODE_ENV === 'test';
  const maxAttempts = isLocalOrTest ? 50 : 10;

  const now = Date.now();
  const entry = pairingAttemptsByIp.get(clientIp);
  if (!entry || entry.resetAt <= now) {
    pairingAttemptsByIp.set(clientIp, { count: 1, resetAt: now + 5 * 60 * 1000 }); // 5 minutes window
    return { allowed: true, remainingAttempts: maxAttempts - 1 };
  }
  if (entry.count >= maxAttempts) {
    return { allowed: false, remainingAttempts: 0 };
  }
  entry.count++;
  return { allowed: true, remainingAttempts: maxAttempts - entry.count };
}

// Generate a cryptographically random 6-digit registration code with 10-minute expiry
export async function createPairingCode(
  arg1: string | { restaurantId: string; branchId: string; userId?: string; ttlMinutes?: number },
  arg2?: string,
  arg3?: string | number
): Promise<{ id: string; pairingCode: string; code: string; expiresAt: string; restaurantId: string; branchId: string; isUsed: boolean }> {
  let restaurantId = '';
  let branchId = '';
  let userId: string | null = null;
  let ttlMinutes = 10;

  if (typeof arg1 === 'object' && arg1 !== null) {
    restaurantId = arg1.restaurantId;
    branchId = arg1.branchId;
    userId = arg1.userId || null;
    if (arg1.ttlMinutes) ttlMinutes = arg1.ttlMinutes;
  } else {
    restaurantId = String(arg1);
    branchId = String(arg2 || '');
    if (typeof arg3 === 'number') {
      ttlMinutes = arg3;
    } else if (typeof arg3 === 'string') {
      userId = arg3;
    }
  }

  // Generate random 6-digit numeric string (100000 - 999999)
  const pairingCode = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const codeId = crypto.randomUUID();

  const isValidUuid = (val: string | null | undefined): boolean => {
    return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  };
  const pgUserId = isValidUuid(userId) ? userId : null;

  if (isPostgresRunning()) {
    try {
      // Invalidate any previous unused codes for this restaurant, branch, and admin user
      const invalidateSql = `
        UPDATE device_pairing_codes
        SET is_used = TRUE
        WHERE restaurant_id = $1
          AND branch_id = $2
          AND is_used = FALSE
          AND (created_by_user_id = $3 OR $3 IS NULL);
      `;
      await query(invalidateSql, [restaurantId, branchId, pgUserId]);

      const sql = `
        INSERT INTO device_pairing_codes (
          id, code, restaurant_id, branch_id, created_by_user_id,
          expires_at, is_used, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, FALSE, NOW()
        ) RETURNING id;
      `;
      await query(sql, [codeId, pairingCode, restaurantId, branchId, pgUserId, expiresAt]);
    } catch (err) {
      console.error('[PrintService] Error saving pairing code in PG:', err);
    }
  }

  // Also maintain in-memory fallback: invalidate previous unused codes
  for (const c of inMemoryDb.device_pairing_codes) {
    if (
      c.restaurant_id === restaurantId &&
      c.branch_id === branchId &&
      !c.is_used &&
      (!userId || c.created_by_user_id === userId)
    ) {
      c.is_used = true;
      (c as any).used_at = new Date().toISOString();
    }
  }

  inMemoryDb.device_pairing_codes.push({
    id: codeId,
    code: pairingCode,
    restaurant_id: restaurantId,
    branch_id: branchId,
    created_by_user_id: userId || '',
    expires_at: expiresAt,
    is_used: false,
    created_at: new Date().toISOString(),
  });

  return {
    id: codeId,
    pairingCode,
    code: pairingCode,
    expiresAt,
    restaurantId,
    branchId,
    isUsed: false,
  };
}

// Exchange 6-digit pairing code for deviceToken and establish hardware linkage
export async function pairDeviceWithCode(params: {
  pairingCode: string;
  deviceId: string;
  deviceName: string;
  platform?: string;
  appVersion?: string;
}): Promise<{
  success: boolean;
  deviceId?: string;
  deviceName?: string;
  restaurantId?: string;
  branchId?: string;
  backendUrl?: string;
  device?: PrintDevice;
  deviceToken?: string;
  token?: string;
  restaurant?: { id: string; name: string };
  branch?: { id: string; name: string };
  error?: string;
}> {
  const code = (params.pairingCode || '').trim();
  if (!code || code.length !== 6) {
    return { success: false, error: 'A valid 6-digit registration code is required.' };
  }

  let codeRecord: any = null;

  if (isPostgresRunning()) {
    try {
      // Find valid, unexpired, unused code
      const findSql = `
        SELECT * FROM device_pairing_codes
        WHERE code = $1 AND is_used = FALSE AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      const res = await query(findSql, [code]);
      if (res.rows.length > 0) {
        codeRecord = res.rows[0];
      }
    } catch (err) {
      console.error('[PrintService] Error querying pairing code in PG:', err);
    }
  }

  if (!codeRecord) {
    const now = new Date().toISOString();
    const inMem = inMemoryDb.device_pairing_codes.find(
      (c) => c.code === code && !c.is_used && c.expires_at > now
    );
    if (inMem) {
      codeRecord = inMem;
    }
  }

  if (!codeRecord) {
    return {
      success: false,
      error: 'Registration code is invalid, has already been used, or has expired (10 min TTL). Please generate a new code from the admin dashboard.',
    };
  }

  // Register device for the tenant & branch
  const registration = await registerDevice({
    restaurantId: codeRecord.restaurant_id,
    branchId: codeRecord.branch_id,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    platform: params.platform || 'win32',
    appVersion: params.appVersion || '1.0.0',
  });

  // Atomically mark pairing code as used (single-use enforcement)
  if (isPostgresRunning()) {
    try {
      await query(
        `UPDATE device_pairing_codes SET is_used = TRUE, used_at = NOW(), used_by_device_id = $1 WHERE id = $2`,
        [registration.device.id, codeRecord.id]
      );
    } catch (err) {
      console.error('[PrintService] Error marking code used in PG:', err);
    }
  }
  codeRecord.is_used = true;
  codeRecord.used_at = new Date().toISOString();
  codeRecord.used_by_device_id = registration.device.id;

  // Also synchronize in-memory state for this code
  for (const item of inMemoryDb.device_pairing_codes) {
    if (item.code === code || item.id === codeRecord.id) {
      item.is_used = true;
      item.used_at = new Date().toISOString();
      item.used_by_device_id = registration.device.id;
    }
  }

  // Retrieve restaurant and branch friendly names
  const meta = await getRestaurantAndBranchInfo(codeRecord.restaurant_id, codeRecord.branch_id);

  return {
    success: true,
    deviceId: registration.device.deviceId,
    deviceName: registration.device.deviceName,
    restaurantId: codeRecord.restaurant_id,
    branchId: codeRecord.branch_id,
    backendUrl: 'https://www.starters4u.in',
    deviceToken: registration.deviceToken,
    token: registration.deviceToken,
    device: registration.device,
    restaurant: {
      id: codeRecord.restaurant_id,
      name: meta.restaurantName,
    },
    branch: {
      id: codeRecord.branch_id,
      name: meta.branchName,
    },
  };
}

// Deactivate a print device (invalidates token and revokes access)
export async function deactivateDevice(
  deviceId: string,
  restaurantId: string
): Promise<{ success: boolean; message: string }> {
  if (isPostgresRunning()) {
    try {
      const revokedHash = `revoked_${crypto.randomUUID()}`;
      const res = await query(
        `UPDATE print_devices
         SET is_active = FALSE, token_hash = $1, updated_at = NOW()
         WHERE (id::text = $2 OR device_id = $2) AND restaurant_id::text = $3
         RETURNING id, branch_id;`,
        [revokedHash, deviceId, restaurantId]
      );
      if (res.rows.length > 0) {
        broadcastPrintEvent(restaurantId, res.rows[0].branch_id, 'device-deactivated', {
          deviceId,
          timestamp: new Date().toISOString(),
        });
        return { success: true, message: 'Device deactivated and token invalidated successfully' };
      }
    } catch (err) {
      console.error('[PrintService] Error deactivating device in PG:', err);
    }
  }

  // In-Memory Fallback
  const dev = inMemoryDb.print_devices.find(
    (d) => (d.id === deviceId || d.deviceId === deviceId) && d.restaurantId === restaurantId
  );
  if (dev) {
    dev.isActive = false;
    dev.tokenHash = `revoked_${crypto.randomUUID()}`;
    dev.updatedAt = new Date().toISOString();
    broadcastPrintEvent(restaurantId, dev.branchId, 'device-deactivated', {
      deviceId,
      timestamp: new Date().toISOString(),
    });
    return { success: true, message: 'Device deactivated and token invalidated successfully' };
  }

  return { success: false, message: 'Device not found' };
}

// 90-second timeout window for Online status per Requirement 4
export const DEVICE_ONLINE_TIMEOUT_MS = 90 * 1000;

// List all print devices for restaurant / branch with authoritative online status
export async function getTenantDevices(restaurantId: string, branchId?: string): Promise<PrintDevice[]> {
  const nowMs = Date.now();

  if (isPostgresRunning()) {
    try {
      const sql = `
        SELECT d.*, b.name as branch_name
        FROM print_devices d
        LEFT JOIN restaurant_branches b ON d.branch_id = b.id
        WHERE d.restaurant_id = $1
          ${branchId ? 'AND d.branch_id = $2' : ''}
        ORDER BY d.created_at DESC;
      `;
      const params = branchId ? [restaurantId, branchId] : [restaurantId];
      const res = await query(sql, params);
      return res.rows.map((row) => {
        const lastSeen = row.last_seen_at || row.last_heartbeat_at;
        const diffMs = lastSeen ? nowMs - new Date(lastSeen).getTime() : Infinity;
        // Requirement 4: Online when last_seen_at is within 90 seconds (tolerating slight server clock skew)
        const isOnline = Boolean(row.is_active && lastSeen && diffMs <= DEVICE_ONLINE_TIMEOUT_MS && diffMs >= -120000);
        return {
          id: row.id,
          restaurantId: row.restaurant_id,
          branchId: row.branch_id,
          branchName: row.branch_name,
          deviceId: row.device_id,
          deviceName: row.device_name,
          platform: row.platform,
          appVersion: row.app_version,
          isActive: row.is_active,
          last_seen_at: lastSeen,
          lastSeenAt: lastSeen,
          lastHeartbeatAt: row.last_heartbeat_at || lastSeen,
          isOnline,
          online: isOnline,
          status: !row.is_active ? 'revoked' : (isOnline ? 'online' : 'offline'),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });
    } catch (err) {
      console.error('[PrintService] Error querying print devices in PG:', err);
    }
  }

  return inMemoryDb.print_devices
    .filter((d) => {
      if (d.restaurantId !== restaurantId) return false;
      if (branchId && d.branchId !== branchId) return false;
      return true;
    })
    .map((d) => {
      const branch = inMemoryDb.restaurant_branches.find((b) => b.id === d.branchId);
      const { tokenHash, ...safe } = d;
      const lastSeen = d.last_seen_at || d.lastSeenAt || d.lastHeartbeatAt;
      const diffMs = lastSeen ? nowMs - new Date(lastSeen).getTime() : Infinity;
      // Requirement 4: Online when last_seen_at is within 90 seconds (tolerating slight server clock skew)
      const isOnline = Boolean(d.isActive && lastSeen && diffMs <= DEVICE_ONLINE_TIMEOUT_MS && diffMs >= -120000);
      return {
        ...safe,
        branchName: branch?.name || 'Main Branch',
        last_seen_at: lastSeen,
        lastSeenAt: lastSeen,
        lastHeartbeatAt: d.lastHeartbeatAt || lastSeen,
        isOnline,
        online: isOnline,
        status: !d.isActive ? 'revoked' : (isOnline ? 'online' : 'offline'),
      };
    });
}
