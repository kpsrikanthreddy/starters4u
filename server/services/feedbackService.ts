import crypto from 'crypto';
import { query, inMemoryDb, isPostgresRunning, isPostgresConfigured } from '../db.js';
import { getRestaurantSettings } from './tenantService.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPgActive(): boolean {
  return isPostgresRunning() || isPostgresConfigured() || process.env.NODE_ENV === 'production';
}

export const WHATSAPP_APPROVED_FEEDBACK_TEMPLATE = 'glossylooks_customer_feedback';

export interface FeedbackRequestRecord {
  id: string;
  restaurant_id: string;
  order_id: string;
  customer_phone: string;
  template_name: string;
  scheduled_at: string;
  sent_at: string | null;
  whatsapp_message_id: string | null;
  status: 'SCHEDULED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  error_message: string | null;
  created_at: string;
}

/**
 * Format mobile number for WhatsApp Business Cloud API.
 * Ensures international format (defaults to Indian +91 prefix if 10-digit number).
 */
export function formatWhatsAppPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

/**
 * Validate customer phone number for WhatsApp sending.
 */
export function isValidCustomerMobile(phone: string | undefined | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Schedule feedback message for exactly 2 hours after order was completed/delivered.
 * Idempotent: duplicate protection via UNIQUE constraint on order_id.
 * Does not overwrite if already scheduled or sent.
 */
export async function scheduleOrderFeedback(
  order: any,
  completionTimestamp: Date = new Date()
): Promise<FeedbackRequestRecord | null> {
  const orderId = order.id;
  const restaurantId = order.restaurantId || order.restaurant_id;
  let rawPhone = order.customer?.phone || order.customerPhone || order.customer_phone;

  if (!rawPhone && order.customer_snapshot) {
    try {
      const snap = typeof order.customer_snapshot === 'string'
        ? JSON.parse(order.customer_snapshot)
        : order.customer_snapshot;
      if (snap?.phone) rawPhone = snap.phone;
    } catch {}
  }

  if (!rawPhone && order.customer_id) {
    if (isPgActive()) {
      try {
        const custRes = await query(`SELECT phone FROM customers WHERE id = $1 LIMIT 1`, [order.customer_id]);
        if (custRes.rows[0]?.phone) {
          rawPhone = custRes.rows[0].phone;
        }
      } catch {}
    } else {
      const inMemCust = (inMemoryDb.customers || []).find((c: any) => c.id === order.customer_id);
      if (inMemCust?.phone) {
        rawPhone = inMemCust.phone;
      }
    }
  }

  if (!orderId || !restaurantId || !isValidCustomerMobile(rawPhone)) {
    return null;
  }

  const customerPhone = formatWhatsAppPhone(rawPhone!);
  // Exactly 2 hours after first completed/delivered timestamp
  const scheduledAt = new Date(completionTimestamp.getTime() + 2 * 60 * 60 * 1000);
  const templateName = process.env.WHATSAPP_FEEDBACK_TEMPLATE || WHATSAPP_APPROVED_FEEDBACK_TEMPLATE;

  if (isPgActive()) {
    try {
      const res = await query(
        `INSERT INTO customer_feedback_requests (
          restaurant_id, order_id, customer_phone, template_name, scheduled_at, status
        ) VALUES ($1, $2, $3, $4, $5, 'SCHEDULED')
        ON CONFLICT (order_id) DO NOTHING
        RETURNING *`,
        [restaurantId, orderId, customerPhone, templateName, scheduledAt.toISOString()]
      );

      if (res.rows.length > 0) {
        return res.rows[0];
      }

      // If already existed, return existing record
      const existing = await query(
        `SELECT * FROM customer_feedback_requests WHERE order_id = $1 LIMIT 1`,
        [orderId]
      );
      return existing.rows[0] || null;
    } catch (err: any) {
      console.error('[FeedbackService] Error scheduling feedback in PostgreSQL:', err.message);
    }
  }

  // In-Memory Fallback
  if (!inMemoryDb.customer_feedback_requests) {
    inMemoryDb.customer_feedback_requests = [];
  }

  const existing = inMemoryDb.customer_feedback_requests.find((r) => r.order_id === orderId);
  if (existing) {
    return existing;
  }

  const newRecord: FeedbackRequestRecord = {
    id: crypto.randomUUID(),
    restaurant_id: restaurantId,
    order_id: orderId,
    customer_phone: customerPhone,
    template_name: templateName,
    scheduled_at: scheduledAt.toISOString(),
    sent_at: null,
    whatsapp_message_id: null,
    status: 'SCHEDULED',
    error_message: null,
    created_at: new Date().toISOString(),
  };

  inMemoryDb.customer_feedback_requests.push(newRecord);
  return newRecord;
}

/**
 * Get feedback request status for a specific order.
 */
export async function getFeedbackRequestForOrder(
  orderId: string,
  tenantRestaurantId?: string
): Promise<FeedbackRequestRecord | null> {
  const isPg = isPgActive();
  const rawOrderId = String(orderId || '').trim();
  const isUuid = UUID_REGEX.test(rawOrderId);

  if (isPg) {
    try {
      if (isUuid) {
        if (tenantRestaurantId) {
          const res = await query(
            `SELECT * FROM customer_feedback_requests WHERE order_id = $1 AND restaurant_id = $2 LIMIT 1`,
            [rawOrderId, tenantRestaurantId]
          );
          return res.rows[0] || null;
        } else {
          const res = await query(
            `SELECT * FROM customer_feedback_requests WHERE order_id = $1 LIMIT 1`,
            [rawOrderId]
          );
          return res.rows[0] || null;
        }
      } else {
        // If caller passed order_number, look up via order relation
        const res = await query(
          `SELECT cfr.* FROM customer_feedback_requests cfr
           JOIN orders o ON cfr.order_id = o.id
           WHERE o.order_number = $1 ${tenantRestaurantId ? 'AND (cfr.restaurant_id = $2 OR o.restaurant_id = $2)' : ''} LIMIT 1`,
          tenantRestaurantId ? [rawOrderId, tenantRestaurantId] : [rawOrderId]
        );
        return res.rows[0] || null;
      }
    } catch (err: any) {
      console.error('[FeedbackService] Error fetching feedback status from DB:', err.message);
    }
  }

  const inMem = inMemoryDb.customer_feedback_requests || [];
  return inMem.find((r: any) => {
    const match = r.order_id === rawOrderId;
    return tenantRestaurantId ? match && r.restaurant_id === tenantRestaurantId : match;
  }) || null;
}

/**
 * Get feedback requests map for a batch of order IDs (used when listing orders).
 */
export async function getFeedbackRequestsForOrders(orderIds: string[]): Promise<Record<string, FeedbackRequestRecord>> {
  const result: Record<string, FeedbackRequestRecord> = {};
  if (!orderIds || orderIds.length === 0) return result;

  const validUuidOrderIds = orderIds.filter((id) => id && UUID_REGEX.test(String(id).trim()));
  if (validUuidOrderIds.length === 0) return result;

  if (isPgActive()) {
    try {
      const res = await query(
        `SELECT * FROM customer_feedback_requests WHERE order_id = ANY($1::uuid[])`,
        [validUuidOrderIds]
      );
      for (const row of res.rows) {
        result[row.order_id] = row;
      }
      return result;
    } catch (err: any) {
      console.error('[FeedbackService] Error fetching batch feedback records from DB:', err.message);
    }
  }

  const inMem = inMemoryDb.customer_feedback_requests || [];
  for (const r of inMem) {
    if (orderIds.includes(r.order_id)) {
      result[r.order_id] = r;
    }
  }
  return result;
}

interface MetaTemplateInfo {
  name: string;
  language: string;
  bodyParamCount: number;
  hasButtonUrlParam: boolean;
  buttons: any[];
}

let cachedTemplateInfo: MetaTemplateInfo | null = null;

/**
 * Fetch approved template definition from Meta Graph API.
 * Identifies exact approved language, body parameters count, and button configuration.
 */
export async function getMetaApprovedTemplate(
  token: string,
  phoneNumberId: string,
  templateName: string
): Promise<MetaTemplateInfo | null> {
  if (cachedTemplateInfo && cachedTemplateInfo.name === templateName) {
    return cachedTemplateInfo;
  }

  try {
    const phoneRes = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=id,whatsapp_business_account`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!phoneRes.ok) {
      console.warn('[FeedbackService] Could not resolve WABA ID from phone number ID:', await phoneRes.text());
      return null;
    }

    const phoneData = await phoneRes.json();
    const wabaId = phoneData?.whatsapp_business_account?.id;
    if (!wabaId) return null;

    const tplRes = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!tplRes.ok) {
      console.warn('[FeedbackService] Could not fetch templates from WABA:', await tplRes.text());
      return null;
    }

    const tplData = await tplRes.json();
    const matching = (tplData?.data || []).find(
      (t: any) => t.name === templateName && (t.status === 'APPROVED' || !t.status)
    ) || tplData?.data?.[0];

    if (!matching) return null;

    const bodyComp = (matching.components || []).find((c: any) => c.type === 'BODY');
    const btnComp = (matching.components || []).find((c: any) => c.type === 'BUTTONS');

    // Count {{1}}, {{2}} in body text
    const matches = bodyComp?.text ? bodyComp.text.match(/\{\{\d+\}\}/g) : null;
    const bodyParamCount = matches ? matches.length : (bodyComp?.example?.body_text?.[0]?.length || 0);

    // Check if any button URL requires parameter {{1}}
    let hasButtonUrlParam = false;
    const buttons = btnComp?.buttons || [];
    for (const btn of buttons) {
      if (btn.type === 'URL' && btn.url && btn.url.includes('{{1}}')) {
        hasButtonUrlParam = true;
      }
    }

    cachedTemplateInfo = {
      name: matching.name,
      language: matching.language || 'en_US',
      bodyParamCount,
      hasButtonUrlParam,
      buttons,
    };

    console.info(`[FeedbackService] Resolved approved Meta template: ${templateName} (${cachedTemplateInfo.language}) with ${bodyParamCount} body params.`);
    return cachedTemplateInfo;
  } catch (err: any) {
    console.warn('[FeedbackService] Failed querying Meta Graph API for template info:', err.message);
    return null;
  }
}

/**
 * Builds Meta Cloud API template components matching approved schema.
 * Ensures no parameters or buttons are invented.
 */
function buildApprovedTemplateComponents(
  bodyParamCount: number,
  customerName: string,
  restaurantName: string,
  orderNumber: string,
  hasButtonUrlParam: boolean = false
): any[] {
  const components: any[] = [];

  // BODY component: exactly match approved parameters
  if (bodyParamCount > 0) {
    const allAvailable = [customerName, restaurantName, orderNumber];
    const params = allAvailable.slice(0, bodyParamCount).map((val) => ({
      type: 'text',
      text: String(val || '').trim(),
    }));
    components.push({
      type: 'body',
      parameters: params,
    });
  }

  // BUTTON component: only include if dynamic URL button requires a parameter
  if (hasButtonUrlParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [
        {
          type: 'text',
          text: orderNumber,
        },
      ],
    });
  }

  return components;
}

/**
 * Common Backend Function: sendOrderFeedback(orderId)
 * Called by BOTH:
 *  1. Manual admin WhatsApp button in Orders & Kitchen
 *  2. Scheduled automatic 2-hour backend job
 *
 * Implements strict duplicate protection:
 * If already SENT, skips sending and returns the existing sent record.
 */
export async function sendOrderFeedback(
  orderId: string,
  isManual = false,
  tenantRestaurantId?: string
): Promise<{
  success: boolean;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  templateName?: string;
  whatsappMessageId?: string;
  sentAt?: string;
  error?: string;
  alreadySent?: boolean;
}> {
  if (!orderId) {
    return { success: false, status: 'FAILED', error: 'Missing orderId' };
  }

  const rawOrderId = String(orderId).trim();
  const isUuid = UUID_REGEX.test(rawOrderId);
  const isPg = isPgActive();

  // 1. Fetch Order and verify eligibility with tenant scoping
  let orderRow: any = null;
  if (isPg) {
    try {
      if (isUuid) {
        // Preferred: lookup by orders.id UUID with tenant scoping
        if (tenantRestaurantId) {
          const res = await query(
            `SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2 LIMIT 1`,
            [rawOrderId, tenantRestaurantId]
          );
          orderRow = res.rows[0];
        } else {
          const res = await query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [rawOrderId]);
          orderRow = res.rows[0];
        }
      } else {
        // Normalization if caller sent display order_number (e.g. MOZZ-9206):
        // Do NOT query orders.id with a display order number to avoid Postgres UUID casting errors!
        if (tenantRestaurantId) {
          const res = await query(
            `SELECT * FROM orders WHERE order_number = $1 AND restaurant_id = $2 LIMIT 1`,
            [rawOrderId, tenantRestaurantId]
          );
          orderRow = res.rows[0];
        } else {
          const res = await query(`SELECT * FROM orders WHERE order_number = $1 LIMIT 1`, [rawOrderId]);
          orderRow = res.rows[0];
        }
      }
    } catch (err: any) {
      console.error('[FeedbackService] Error fetching order for feedback from DB:', err.message);
    }
  }

  // Local fallback only if PostgreSQL is not active/configured
  if (!orderRow && !isPg) {
    orderRow = inMemoryDb.orders.find((o: any) => {
      const match = o.id === rawOrderId || o.order_number === rawOrderId;
      return tenantRestaurantId ? match && o.restaurant_id === tenantRestaurantId : match;
    });
  }

  // Safe server-side diagnostic logging (no WhatsApp tokens, service keys, passwords)
  console.info(
    `[WhatsApp Feedback Diagnostic] Received orderId: ${rawOrderId} | Authenticated restaurant_id: ${tenantRestaurantId || orderRow?.restaurant_id || 'N/A'} | Order found: ${Boolean(orderRow)}`
  );

  if (!orderRow) {
    return { success: false, status: 'FAILED', error: 'Order not found' };
  }

  // Normalize resolved order UUID for customer_feedback_requests relation
  const resolvedOrderId = orderRow.id;

  const statusLower = (orderRow.status || '').toLowerCase();
  if (statusLower !== 'delivered' && statusLower !== 'completed') {
    return {
      success: false,
      status: 'FAILED',
      error: `Feedback can only be sent for DELIVERED or COMPLETED orders (current status: ${orderRow.status})`,
    };
  }

  // Parse customer details
  let customerName = 'Valued Customer';
  let rawPhone = orderRow.customer_phone;
  if (orderRow.customer_snapshot) {
    try {
      const snap = typeof orderRow.customer_snapshot === 'string'
        ? JSON.parse(orderRow.customer_snapshot)
        : orderRow.customer_snapshot;
      if (snap?.name) customerName = snap.name;
      if (snap?.phone) rawPhone = snap.phone;
    } catch {}
  }

  // Fallback to customer table if customer_id is present
  if ((!rawPhone || !customerName) && orderRow.customer_id) {
    if (isPg) {
      try {
        const custRes = await query(`SELECT name, phone FROM customers WHERE id = $1 LIMIT 1`, [orderRow.customer_id]);
        if (custRes.rows[0]) {
          customerName = custRes.rows[0].name || customerName;
          rawPhone = custRes.rows[0].phone || rawPhone;
        }
      } catch {}
    } else {
      const inMemCust = (inMemoryDb.customers || []).find((c: any) => c.id === orderRow.customer_id);
      if (inMemCust) {
        customerName = inMemCust.name || customerName;
        rawPhone = inMemCust.phone || rawPhone;
      }
    }
  }

  if (!isValidCustomerMobile(rawPhone)) {
    return {
      success: false,
      status: 'FAILED',
      error: 'Valid customer mobile number does not exist on this order',
    };
  }

  const formattedPhone = formatWhatsAppPhone(rawPhone!);
  const restaurantId = orderRow.restaurant_id;

  // 2. Fetch Restaurant for dynamic multi-tenant name
  let restaurantName = 'Starters4U Partner Restaurant';
  try {
    const restaurant = await getRestaurantSettings(restaurantId);
    if (restaurant?.displayName) {
      restaurantName = restaurant.displayName;
    }
  } catch {}

  const orderNumber = orderRow.order_number || `ORD-${resolvedOrderId.slice(0, 6).toUpperCase()}`;

  // 3. Duplicate Protection Check
  const existingFeedback = await getFeedbackRequestForOrder(resolvedOrderId, restaurantId);
  if (existingFeedback && existingFeedback.status === 'SENT') {
    return {
      success: true,
      status: 'SENT',
      alreadySent: true,
      whatsappMessageId: existingFeedback.whatsapp_message_id || undefined,
      sentAt: existingFeedback.sent_at || undefined,
    };
  }

  // Mark record as SENDING or insert new
  const templateName = process.env.WHATSAPP_FEEDBACK_TEMPLATE || WHATSAPP_APPROVED_FEEDBACK_TEMPLATE;
  let requestId = existingFeedback?.id || crypto.randomUUID();

  if (isPg) {
    try {
      const upsert = await query(
        `INSERT INTO customer_feedback_requests (
          id, restaurant_id, order_id, customer_phone, template_name, scheduled_at, status
        ) VALUES ($1, $2, $3, $4, $5, NOW(), 'SENDING')
        ON CONFLICT (order_id) DO UPDATE SET status = 'SENDING', template_name = $5
        RETURNING *`,
        [requestId, restaurantId, resolvedOrderId, formattedPhone, templateName]
      );
      if (upsert.rows[0]) {
        requestId = upsert.rows[0].id;
      }
    } catch (err: any) {
      console.error('[FeedbackService] Error upserting SENDING status in DB:', err.message);
    }
  } else {
    if (!inMemoryDb.customer_feedback_requests) inMemoryDb.customer_feedback_requests = [];
    const idx = inMemoryDb.customer_feedback_requests.findIndex((r: any) => r.order_id === resolvedOrderId);
    if (idx >= 0) {
      inMemoryDb.customer_feedback_requests[idx].status = 'SENDING';
      inMemoryDb.customer_feedback_requests[idx].template_name = templateName;
    } else {
      inMemoryDb.customer_feedback_requests.push({
        id: requestId,
        restaurant_id: restaurantId,
        order_id: resolvedOrderId,
        customer_phone: formattedPhone,
        template_name: templateName,
        scheduled_at: new Date().toISOString(),
        sent_at: null,
        whatsapp_message_id: null,
        status: 'SENDING',
        error_message: null,
        created_at: new Date().toISOString(),
      });
    }
  }

  // 4. Send via Meta WhatsApp Cloud API
  const token = process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID;

  let whatsappMessageId: string | null = null;
  const nowIso = new Date().toISOString();

  try {
    if (token && phoneNumberId) {
      const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

      // 1. Fetch approved template schema directly from Meta Graph API if available
      const metaTpl = await getMetaApprovedTemplate(token, phoneNumberId, templateName);

      // Language code configured for this approved template (defaults to approved language or en_US)
      let languageCode = process.env.WHATSAPP_TEMPLATE_LANGUAGE || metaTpl?.language || 'en_US';
      let bodyParamCount = metaTpl ? metaTpl.bodyParamCount : 1;
      let hasButtonParam = metaTpl ? metaTpl.hasButtonUrlParam : false;

      let components = buildApprovedTemplateComponents(
        bodyParamCount,
        customerName,
        restaurantName,
        orderNumber,
        hasButtonParam
      );

      let sendPayload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length > 0 ? { components } : {}),
        },
      };

      let response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sendPayload),
      });

      let resData = await response.json().catch(() => null);

      // Automatic adaptation if Meta returns parameter count mismatch (132000) or language mismatch (132001)
      if (!response.ok && resData?.error) {
        const errCode = resData.error.code;
        const errDetail = resData.error.error_data?.details || resData.error.message || '';
        console.warn(`[FeedbackService] Meta returned error ${errCode}: ${errDetail}. Attempting adaptation...`);

        let retryNeeded = false;

        // Language mismatch (e.g. template is in 'en' but sent 'en_US' or vice-versa)
        if (errCode === 132001 || errDetail.toLowerCase().includes('translation') || errDetail.toLowerCase().includes('language')) {
          languageCode = languageCode === 'en_US' ? 'en' : 'en_US';
          sendPayload.template.language = { code: languageCode };
          retryNeeded = true;
        }

        // Parameter count mismatch (e.g. "expected 0 got 1", or "expected 1 got 0")
        if (errCode === 132000 || errDetail.toLowerCase().includes('parameters')) {
          const matchExpected = errDetail.match(/expected\s+(\d+)/i);
          if (matchExpected) {
            bodyParamCount = parseInt(matchExpected[1], 10);
            components = buildApprovedTemplateComponents(bodyParamCount, customerName, restaurantName, orderNumber, false);
            if (components.length > 0) {
              sendPayload.template.components = components;
            } else {
              delete sendPayload.template.components;
            }
            retryNeeded = true;
          }
        }

        if (retryNeeded) {
          console.info(`[FeedbackService] Retrying Meta dispatch with adapted payload: language=${languageCode}, bodyParams=${bodyParamCount}`);
          response = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(sendPayload),
          });
          resData = await response.json().catch(() => null);
        }
      }

      if (!response.ok) {
        const errorDetail = resData?.error?.message || `WhatsApp API responded with status ${response.status}`;
        throw new Error(errorDetail);
      }

      if (resData?.messages?.[0]?.id) {
        whatsappMessageId = resData.messages[0].id;
      } else {
        throw new Error('Meta accepted request but did not return a valid WhatsApp message ID (wamid).');
      }
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Meta WhatsApp Cloud API credentials not configured in environment. Please set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
      }
      console.warn(
        `[FeedbackService] WhatsApp Cloud API credentials not configured in environment. Simulating successful dispatch for development: order ${orderNumber} to ${formattedPhone}.`
      );
      whatsappMessageId = `wamid.HBg${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
    }

    // 5. Only set to SENT after Meta successfully accepts the message and returns wamid
    // Note: Do NOT mark API acceptance as DELIVERED. SENT means Meta accepted the request.
    if (isPg) {
      await query(
        `UPDATE customer_feedback_requests
         SET status = 'SENT',
             template_name = $1,
             sent_at = NOW(),
             whatsapp_message_id = $2,
             error_message = NULL
         WHERE order_id = $3`,
        [templateName, whatsappMessageId, resolvedOrderId]
      );
    } else {
      const rec = (inMemoryDb.customer_feedback_requests || []).find((r: any) => r.order_id === resolvedOrderId);
      if (rec) {
        rec.status = 'SENT';
        rec.template_name = templateName;
        rec.sent_at = nowIso;
        rec.whatsapp_message_id = whatsappMessageId;
        rec.error_message = null;
      }
    }

    return {
      success: true,
      status: 'SENT',
      templateName,
      whatsappMessageId,
      sentAt: nowIso,
    };
  } catch (err: any) {
    console.error('[FeedbackService] WhatsApp send failed:', err.message);

    // Update Status to FAILED
    if (isPg) {
      await query(
        `UPDATE customer_feedback_requests
         SET status = 'FAILED',
             template_name = $1,
             error_message = $2
         WHERE order_id = $3`,
        [templateName, err.message, resolvedOrderId]
      );
    } else {
      const rec = (inMemoryDb.customer_feedback_requests || []).find((r: any) => r.order_id === resolvedOrderId);
      if (rec) {
        rec.status = 'FAILED';
        rec.template_name = templateName;
        rec.error_message = err.message;
      }
    }

    return {
      success: false,
      status: 'FAILED',
      templateName,
      error: err.message,
    };
  }
}

/**
 * Updates feedback request status from Meta WhatsApp Cloud API webhooks.
 * Keeps delivery status handling separate: SENT -> DELIVERED -> READ -> FAILED.
 */
export async function updateFeedbackStatusByMessageId(
  whatsappMessageId: string,
  newStatus: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
  errorMessage?: string | null
): Promise<FeedbackRequestRecord | null> {
  if (!whatsappMessageId) return null;

  const validStatuses = ['SENT', 'DELIVERED', 'READ', 'FAILED'];
  if (!validStatuses.includes(newStatus)) {
    return null;
  }

  if (isPgActive()) {
    try {
      const res = await query(
        `UPDATE customer_feedback_requests
         SET status = $1,
             error_message = COALESCE($2, error_message)
         WHERE whatsapp_message_id = $3
         RETURNING *`,
        [newStatus, errorMessage || null, whatsappMessageId]
      );
      if (res.rows[0]) return res.rows[0];
    } catch (err: any) {
      console.error('[FeedbackService] Error updating status via webhook in PostgreSQL:', err.message);
    }
  }

  const inMem = (inMemoryDb.customer_feedback_requests || []).find(
    (r: any) => r.whatsapp_message_id === whatsappMessageId
  );
  if (inMem) {
    inMem.status = newStatus;
    if (errorMessage) inMem.error_message = errorMessage;
    return inMem;
  }

  return null;
}

/**
 * Background Job: Process all feedback requests that are due (scheduled_at <= NOW() and status = 'SCHEDULED')
 */
export async function processDueFeedbackRequests(): Promise<{ processed: number; succeeded: number; failed: number }> {
  let dueOrderIds: string[] = [];

  if (isPgActive()) {
    try {
      const res = await query(
        `SELECT order_id FROM customer_feedback_requests
         WHERE status = 'SCHEDULED' AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT 50`
      );
      dueOrderIds = res.rows.map((r: any) => r.order_id);
    } catch (err: any) {
      console.error('[FeedbackService] Error querying due feedback requests:', err.message);
    }
  } else {
    const now = new Date().toISOString();
    dueOrderIds = (inMemoryDb.customer_feedback_requests || [])
      .filter((r: any) => r.status === 'SCHEDULED' && r.scheduled_at <= now)
      .slice(0, 50)
      .map((r: any) => r.order_id);
  }

  let succeeded = 0;
  let failed = 0;

  for (const orderId of dueOrderIds) {
    try {
      const res = await sendOrderFeedback(orderId, false);
      if (res.success) {
        succeeded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { processed: dueOrderIds.length, succeeded, failed };
}
