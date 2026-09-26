import crypto from 'crypto';
import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import { QR_SIGNING_SECRET } from '../config.js';
const CANONICAL_BASE_URL = process.env.APP_URL || 'https://starters4u.in';
const DEFAULT_RESTAURANT_ID = 'a0000000-0000-0000-0000-000000000001';
const DEFAULT_BRANCH_ID = 'b0000000-0000-0000-0000-000000000001';

// Cryptographic HMAC-SHA256 signature generator
export function generateHmacSignature(data: string, secret: string = QR_SIGNING_SECRET): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export interface QRPayload {
  restaurantId: string;
  restaurantSlug: string;
  branchId?: string;
  mode: 'dine_in' | 'takeaway' | 'delivery';
  source: 'table_qr' | 'counter_qr' | 'online_web';
  table?: string;
  tableId?: string;
  section?: string;
  allowedOrderTypes: ('dine_in' | 'takeaway' | 'delivery')[];
  issuedAt: number;
  nonce: string;
}

export interface ValidatedQRResult {
  valid: boolean;
  error?: string;
  source: 'table_qr' | 'counter_qr' | 'online_web';
  orderMode: 'dine_in' | 'takeaway' | 'delivery';
  tableNumber?: string;
  tableId?: string;
  section?: string;
  restaurantId?: string;
  restaurantSlug?: string;
  branchId?: string;
  isModeLocked: boolean;
  message?: string;
  fallbackMode?: 'delivery' | 'takeaway' | 'dine_in';
}

export function generateSignedToken(
  mode: 'dine_in' | 'takeaway' | 'delivery',
  table?: string,
  restaurantSlug: string = 'mozz',
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  branchId: string = DEFAULT_BRANCH_ID,
  tableId?: string,
  section?: string
) {
  const cleanTable = mode === 'dine_in' ? (table ? table.replace(/^Table\s*/i, '').trim() : '1') : undefined;
  const source = mode === 'dine_in' ? 'table_qr' : mode === 'takeaway' ? 'counter_qr' : 'online_web';

  const payload: QRPayload = {
    restaurantId,
    restaurantSlug,
    branchId,
    mode,
    source,
    table: cleanTable,
    tableId,
    section,
    allowedOrderTypes: mode === 'dine_in' ? ['dine_in'] : mode === 'takeaway' ? ['takeaway'] : ['delivery', 'takeaway'],
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex'),
  };

  const payloadString = JSON.stringify(payload);
  const encodedPayload = Buffer.from(payloadString, 'utf-8').toString('base64url');
  const signature = generateHmacSignature(encodedPayload, QR_SIGNING_SECRET);
  const token = `${encodedPayload}.${signature}`;

  let path = '/';
  if (mode === 'dine_in') {
    path = `/r/${restaurantSlug}/table/${payload.table}`;
  } else if (mode === 'takeaway') {
    path = `/r/${restaurantSlug}/counter`;
  }

  const canonicalUrl = `${CANONICAL_BASE_URL}${path}?token=${token}`;
  const localPath = `${path}?token=${token}`;

  // Register QR token asynchronously in PostgreSQL / Memory store
  registerTokenInDatabase({
    restaurantId,
    branchId,
    tableId,
    codeType: source,
    token,
    targetUrl: canonicalUrl,
  }).catch((err) => console.warn('[QRService] Async token registration notice:', err.message));

  return {
    token,
    payload,
    canonicalUrl,
    localPath,
  };
}

export function generateSignedTableToken(
  tableId: string,
  tableNumber: string,
  restaurantSlug: string = 'mozz',
  section?: string,
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  branchId: string = DEFAULT_BRANCH_ID
): string {
  const result = generateSignedToken('dine_in', tableNumber, restaurantSlug, restaurantId, branchId, tableId, section);
  return result.token;
}

export function validateSignedToken(token?: string, expectedRestaurantSlug?: string): ValidatedQRResult {
  if (!token) {
    return {
      valid: true,
      source: 'online_web',
      orderMode: 'delivery',
      restaurantSlug: expectedRestaurantSlug || 'mozz',
      isModeLocked: false,
      message: 'Direct Online Customer Session (Delivery & Takeaway)',
    };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return {
      valid: false,
      error: 'Invalid or expired table QR.',
      source: 'online_web',
      orderMode: 'delivery',
      isModeLocked: false,
      fallbackMode: 'delivery',
    };
  }

  const [encodedPayload, providedSig] = parts;
  const expectedSig = generateHmacSignature(encodedPayload, QR_SIGNING_SECRET);

  // Timing safe HMAC comparison to prevent timing attacks
  const providedBuffer = Buffer.from(providedSig);
  const expectedBuffer = Buffer.from(expectedSig);

  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return {
      valid: false,
      error: 'Invalid or expired table QR.',
      source: 'online_web',
      orderMode: 'delivery',
      isModeLocked: false,
      fallbackMode: 'delivery',
    };
  }

  try {
    const decodedJson = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
    const payload: QRPayload = JSON.parse(decodedJson);

    // Verify Restaurant Slug match if explicitly specified
    if (expectedRestaurantSlug && payload.restaurantSlug && payload.restaurantSlug !== expectedRestaurantSlug) {
      return {
        valid: false,
        error: 'Invalid or expired table QR. Token belongs to another restaurant.',
        source: 'online_web',
        orderMode: 'delivery',
        isModeLocked: false,
      };
    }

    const isDineIn = payload.mode === 'dine_in';
    const isTakeaway = payload.mode === 'takeaway';

    return {
      valid: true,
      source: payload.source || (isDineIn ? 'table_qr' : isTakeaway ? 'counter_qr' : 'online_web'),
      orderMode: payload.mode,
      tableNumber: payload.table ? `Table ${payload.table}` : undefined,
      tableId: payload.tableId,
      section: payload.section,
      restaurantId: payload.restaurantId || DEFAULT_RESTAURANT_ID,
      restaurantSlug: payload.restaurantSlug || expectedRestaurantSlug || 'mozz',
      branchId: payload.branchId || DEFAULT_BRANCH_ID,
      isModeLocked: true,
      message: isDineIn
        ? `Authenticated Table ${payload.table} Dine-In Session`
        : isTakeaway
        ? `Authenticated Takeaway Counter Session`
        : `Online Customer Direct Session`,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: 'Invalid or expired table QR.',
      source: 'online_web',
      orderMode: 'delivery',
      isModeLocked: false,
      fallbackMode: 'delivery',
    };
  }
}

// Persist / Cache QR token in Database
async function registerTokenInDatabase(data: {
  restaurantId: string;
  branchId?: string;
  tableId?: string;
  codeType: 'table_qr' | 'counter_qr' | 'online_web';
  token: string;
  targetUrl: string;
}) {
  if (isPostgresRunning()) {
    try {
      const isUuid = (val?: string | null) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
      await query(
        `INSERT INTO qr_codes (restaurant_id, branch_id, table_id, code_type, token, target_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (token) DO UPDATE SET target_url = EXCLUDED.target_url;`,
        [data.restaurantId, isUuid(data.branchId) ? data.branchId : null, isUuid(data.tableId) ? data.tableId : null, data.codeType, data.token, data.targetUrl]
      );
    } catch (err: any) {
      // Non-critical logging for registration
    }
  }
}

export async function getRestaurantTables(
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  branchId: string = DEFAULT_BRANCH_ID
) {
  let activeSlug = 'mozz';
  if (isPostgresRunning()) {
    try {
      const slugRes = await query(`SELECT slug FROM restaurants WHERE id = $1 LIMIT 1`, [restaurantId]);
      if (slugRes.rows.length > 0) activeSlug = slugRes.rows[0].slug;

      const res = await query(
        `SELECT * FROM restaurant_tables WHERE restaurant_id = $1 AND (branch_id = $2 OR branch_id IS NULL) ORDER BY CAST(table_number AS INTEGER) ASC`,
        [restaurantId, branchId]
      );
      return res.rows.map((row: any) => {
        const qrInfo = generateSignedToken('dine_in', String(row.table_number), activeSlug, restaurantId, branchId, row.id, row.section);
        return {
          ...row,
          id: row.id,
          table_number: String(row.table_number),
          tableNumber: String(row.table_number),
          table_name: row.table_name || `Table ${row.table_number}`,
          tableName: row.table_name || `Table ${row.table_number}`,
          capacity: Number(row.capacity || 4),
          section: row.section || 'Main Hall',
          is_active: row.is_active ?? true,
          isActive: row.is_active ?? true,
          qr_token: row.qr_token || qrInfo.token,
          qrToken: row.qr_token || qrInfo.token,
          qr_url: qrInfo.canonicalUrl,
        };
      });
    } catch (err) {
      console.error('[QRService] Error getting tables from PG:', err);
    }
  }

  const rest = inMemoryDb.restaurants.find((r) => r.id === restaurantId);
  activeSlug = rest?.slug || (restaurantId === DEFAULT_RESTAURANT_ID ? 'mozz' : 'restaurant');

  return inMemoryDb.restaurant_tables
    .filter((t) => t.restaurant_id === restaurantId && (t.branch_id === branchId || !t.branch_id))
    .map((t) => {
      const qrInfo = generateSignedToken('dine_in', String(t.table_number), activeSlug, restaurantId, branchId, t.id, t.section);
      return {
        ...t,
        id: t.id,
        table_number: String(t.table_number),
        tableNumber: String(t.table_number),
        table_name: t.table_name || `Table ${t.table_number}`,
        tableName: t.table_name || `Table ${t.table_number}`,
        capacity: Number(t.capacity || 4),
        section: t.section || 'Main Hall',
        is_active: t.is_active ?? true,
        isActive: t.is_active ?? true,
        qr_token: t.qr_token || qrInfo.token,
        qrToken: t.qr_token || qrInfo.token,
        qr_url: qrInfo.canonicalUrl,
      };
    });
}

export async function getTableCatalog(
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  branchId: string = DEFAULT_BRANCH_ID,
  restaurantSlug?: string
) {
  let activeSlug = restaurantSlug;
  if (!activeSlug) {
    if (isPostgresRunning()) {
      try {
        const slugRes = await query(`SELECT slug FROM restaurants WHERE id = $1 LIMIT 1`, [restaurantId]);
        if (slugRes.rows.length > 0) activeSlug = slugRes.rows[0].slug;
      } catch {}
    }
    if (!activeSlug) {
      const rest = inMemoryDb.restaurants.find((r) => r.id === restaurantId);
      activeSlug = rest?.slug || (restaurantId === DEFAULT_RESTAURANT_ID ? 'mozz' : 'restaurant');
    }
  }

  const counter = generateSignedToken('takeaway', undefined, activeSlug, restaurantId, branchId);
  const tablesDb = await getRestaurantTables(restaurantId, branchId);

  const tableList = tablesDb.map((t: any) => {
    const gen = generateSignedToken('dine_in', String(t.table_number), activeSlug, restaurantId, branchId, t.id, t.section);
    return {
      id: t.id || `table-${t.table_number}`,
      label: t.table_name || `Table ${t.table_number} Dine-In QR`,
      tableNumber: `Table ${t.table_number}`,
      section: t.section,
      capacity: t.capacity || 4,
      isActive: t.is_active ?? true,
      qrToken: t.qr_token || gen.token,
      ...gen,
    };
  });

  return {
    counter: {
      id: 'counter-main',
      label: 'Takeaway Counter QR',
      ...counter,
    },
    tables: tableList,
    website: {
      id: 'web-direct',
      label: 'Online Customer (Direct Web)',
      canonicalUrl: `${CANONICAL_BASE_URL}/r/${activeSlug}`,
      mode: 'delivery',
    },
  };
}

export async function createRestaurantTable(
  restaurantId: string,
  branchId: string | null = null,
  data: { tableNumber: string; tableName?: string; capacity?: number; section?: string }
) {
  const id = crypto.randomUUID();
  const cleanNumber = String(data.tableNumber).replace(/^Table\s*/i, '').trim();
  const tableName = data.tableName || `Table ${cleanNumber}`;
  const capacity = Number(data.capacity || 4);
  const section = data.section || 'Main Hall';

  let slug = 'mozz';
  if (isPostgresRunning()) {
    try {
      const sRes = await query(`SELECT slug FROM restaurants WHERE id = $1 LIMIT 1`, [restaurantId]);
      if (sRes.rows.length > 0) slug = sRes.rows[0].slug;
    } catch {}
  } else {
    const r = inMemoryDb.restaurants.find((x) => x.id === restaurantId);
    if (r?.slug) slug = r.slug;
  }

  const tokenGen = generateSignedToken('dine_in', cleanNumber, slug, restaurantId, branchId || DEFAULT_BRANCH_ID, id, section);

  if (isPostgresRunning()) {
    try {
      const sql = `
        INSERT INTO restaurant_tables (id, restaurant_id, branch_id, table_number, table_name, capacity, section, qr_token, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, NOW())
        ON CONFLICT (restaurant_id, branch_id, table_number) 
        DO UPDATE SET table_name = EXCLUDED.table_name, capacity = EXCLUDED.capacity, section = EXCLUDED.section, qr_token = EXCLUDED.qr_token, is_active = TRUE
        RETURNING *;
      `;
      const res = await query(sql, [id, restaurantId, branchId || null, cleanNumber, tableName, capacity, section, tokenGen.token]);
      return { ...res.rows[0], qr_url: tokenGen.canonicalUrl };
    } catch (err: any) {
      console.error('[QRService] Error creating table in PG:', err.message);
      throw err;
    }
  }

  const existingIdx = inMemoryDb.restaurant_tables.findIndex(
    (t) => t.restaurant_id === restaurantId && t.table_number === cleanNumber
  );
  const record = {
    id,
    restaurant_id: restaurantId,
    branch_id: branchId || null,
    table_number: cleanNumber,
    table_name: tableName,
    capacity,
    section,
    qr_token: tokenGen.token,
    qr_url: tokenGen.canonicalUrl,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  if (existingIdx !== -1) {
    inMemoryDb.restaurant_tables[existingIdx] = record;
  } else {
    inMemoryDb.restaurant_tables.push(record);
  }
  return record;
}

export async function updateRestaurantTable(
  restaurantId: string,
  tableId: string,
  updates: {
    tableNumber?: string;
    table_number?: string;
    tableName?: string;
    table_name?: string;
    capacity?: number;
    isActive?: boolean;
    is_active?: boolean;
    section?: string;
  }
) {
  if (isPostgresRunning()) {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (updates.tableNumber !== undefined || updates.table_number !== undefined) {
        const rawNum = updates.tableNumber ?? updates.table_number;
        const cleanTNum = String(rawNum).replace(/^Table\s*/i, '').trim();
        fields.push(`table_number = $${idx++}`);
        values.push(cleanTNum);
      }
      if (updates.tableName !== undefined || updates.table_name !== undefined) {
        fields.push(`table_name = $${idx++}`);
        values.push(updates.tableName ?? updates.table_name);
      }
      if (updates.capacity !== undefined) {
        fields.push(`capacity = $${idx++}`);
        values.push(Number(updates.capacity));
      }
      if (updates.section !== undefined) {
        fields.push(`section = $${idx++}`);
        values.push(updates.section);
      }
      if (updates.isActive !== undefined || updates.is_active !== undefined) {
        fields.push(`is_active = $${idx++}`);
        values.push(Boolean(updates.isActive ?? updates.is_active));
      }

      if (fields.length === 0) return null;

      values.push(tableId);
      values.push(restaurantId);

      const sql = `UPDATE restaurant_tables SET ${fields.join(', ')} WHERE id = $${idx++} AND restaurant_id = $${idx} RETURNING *`;
      const res = await query(sql, values);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          ...row,
          tableNumber: String(row.table_number),
          tableName: row.table_name || `Table ${row.table_number}`,
          isActive: row.is_active ?? true,
        };
      }
      return null;
    } catch (err: any) {
      console.error('[QRService] Error updating table in PG:', err.message);
      throw err;
    }
  }

  const idx = inMemoryDb.restaurant_tables.findIndex(
    (t) => (t.id === tableId || t.table_number === tableId) && t.restaurant_id === restaurantId
  );
  if (idx !== -1) {
    const curr = inMemoryDb.restaurant_tables[idx];
    const newTNum = (updates.tableNumber !== undefined || updates.table_number !== undefined)
      ? String(updates.tableNumber ?? updates.table_number).replace(/^Table\s*/i, '').trim()
      : curr.table_number;

    inMemoryDb.restaurant_tables[idx] = {
      ...curr,
      table_number: newTNum,
      tableNumber: newTNum,
      table_name: updates.tableName !== undefined ? updates.tableName : updates.table_name !== undefined ? updates.table_name : curr.table_name,
      tableName: updates.tableName !== undefined ? updates.tableName : updates.table_name !== undefined ? updates.table_name : curr.table_name,
      capacity: updates.capacity !== undefined ? Number(updates.capacity) : curr.capacity,
      section: updates.section !== undefined ? updates.section : curr.section,
      is_active: updates.isActive !== undefined ? Boolean(updates.isActive) : updates.is_active !== undefined ? Boolean(updates.is_active) : curr.is_active,
      isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : updates.is_active !== undefined ? Boolean(updates.is_active) : curr.is_active,
    };
    return inMemoryDb.restaurant_tables[idx];
  }
  return null;
}

export async function deleteRestaurantTable(restaurantId: string, tableId: string) {
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `DELETE FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2 RETURNING id`,
        [tableId, restaurantId]
      );
      return res.rowCount !== null && res.rowCount > 0;
    } catch (err: any) {
      console.error('[QRService] Error deleting table from PG:', err.message);
      throw err;
    }
  }

  const idx = inMemoryDb.restaurant_tables.findIndex(
    (t) => (t.id === tableId || t.table_number === tableId) && t.restaurant_id === restaurantId
  );
  if (idx !== -1) {
    inMemoryDb.restaurant_tables.splice(idx, 1);
    return true;
  }
  return false;
}
