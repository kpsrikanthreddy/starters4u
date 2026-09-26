import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import { CustomerDetails } from '../../src/types.js';

const DEFAULT_RESTAURANT_ID = 'a0000000-0000-0000-0000-000000000001';

export interface CustomerRecord {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  landmark?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
  updated_at: string;
}

export async function findOrCreateCustomer(
  details: CustomerDetails,
  restaurantId: string = DEFAULT_RESTAURANT_ID
): Promise<CustomerRecord> {
  const sanitizedPhone = (details.phone || '').trim().replace(/[^0-9]/g, '');
  const name = (details.name || 'Guest').trim();
  const email = details.email?.trim() || null;
  const address = details.address?.trim() || null;
  const landmark = details.landmark?.trim() || null;
  const notes = details.notes?.trim() || null;
  const latitude = typeof details.latitude === 'number' && !isNaN(details.latitude) ? details.latitude : null;
  const longitude = typeof details.longitude === 'number' && !isNaN(details.longitude) ? details.longitude : null;

  if (isPostgresRunning()) {
    try {
      // Upsert using PostgreSQL ON CONFLICT (restaurant_id, phone)
      const upsertSql = `
        INSERT INTO customers (restaurant_id, name, phone, email, address, landmark, notes, latitude, longitude, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (restaurant_id, phone) DO UPDATE SET
          name = CASE WHEN EXCLUDED.name <> 'Guest' THEN EXCLUDED.name ELSE customers.name END,
          email = COALESCE(EXCLUDED.email, customers.email),
          address = COALESCE(EXCLUDED.address, customers.address),
          landmark = COALESCE(EXCLUDED.landmark, customers.landmark),
          notes = COALESCE(EXCLUDED.notes, customers.notes),
          latitude = COALESCE(EXCLUDED.latitude, customers.latitude),
          longitude = COALESCE(EXCLUDED.longitude, customers.longitude),
          updated_at = NOW()
        RETURNING *;
      `;

      const res = await query(upsertSql, [restaurantId, name, sanitizedPhone, email, address, landmark, notes, latitude, longitude]);
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch (err) {
      console.error('[CustomerService] Error in PG findOrCreateCustomer upsert:', err);
    }
  }

  // In-Memory Fallback
  let found = inMemoryDb.customers.find(
    (c) => c.restaurant_id === restaurantId && c.phone === sanitizedPhone
  );

  if (found) {
    if (name && name !== 'Guest') found.name = name;
    if (email) found.email = email;
    if (address) found.address = address;
    if (landmark) found.landmark = landmark;
    if (notes) found.notes = notes;
    if (latitude !== null) found.latitude = latitude;
    if (longitude !== null) found.longitude = longitude;
    found.updated_at = new Date().toISOString();
    return found;
  }

  const newCust: CustomerRecord = {
    id: `00000000-0000-0000-0000-${Math.random().toString(16).slice(2, 14).padStart(12, '0')}`,
    restaurant_id: restaurantId,
    name,
    phone: sanitizedPhone,
    email: email || undefined,
    address: address || undefined,
    landmark: landmark || undefined,
    notes: notes || undefined,
    latitude: latitude !== null ? latitude : undefined,
    longitude: longitude !== null ? longitude : undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  inMemoryDb.customers.push(newCust);
  return newCust;
}

export async function getCustomerByPhone(
  phone: string,
  restaurantId: string = DEFAULT_RESTAURANT_ID
): Promise<CustomerRecord | null> {
  const sanitized = phone.trim().replace(/[^0-9]/g, '');
  if (!sanitized) return null;

  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT * FROM customers WHERE restaurant_id = $1 AND phone = $2 LIMIT 1`,
        [restaurantId, sanitized]
      );
      return res.rows.length > 0 ? res.rows[0] : null;
    } catch (err) {
      console.error('[CustomerService] Error getCustomerByPhone in PG:', err);
    }
  }

  const found = inMemoryDb.customers.find(
    (c) => c.restaurant_id === restaurantId && c.phone === sanitized
  );
  return found || null;
}
