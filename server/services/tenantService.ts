import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import { AuthenticatedUser } from '../middleware/authMiddleware.js';
import { getTenantDeliverySettings } from './adminService.js';

export const FLAGSHIP_MOZZ_ID = 'a0000000-0000-0000-0000-000000000001';
export const FLAGSHIP_MOZZ_BRANCH_ID = 'b0000000-0000-0000-0000-000000000001';
export const FLAGSHIP_MOZZ_SLUG = 'mozz';

export const TEST_RESTAURANT_ID = 'a0000000-0000-0000-0000-000000000002';
export const TEST_RESTAURANT_BRANCH_ID = 'b0000000-0000-0000-0000-000000000002';
export const TEST_RESTAURANT_SLUG = 'test-restaurant';

export type PlatformRole =
  | 'PLATFORM_ADMIN'
  | 'SUPER_ADMIN'
  | 'RESTAURANT_ADMIN'
  | 'RESTAURANT_OWNER'
  | 'BRANCH_MANAGER'
  | 'CASHIER'
  | 'KITCHEN'
  | 'STAFF';

export interface TenantContext {
  restaurantId: string;
  branchId?: string;
  role: PlatformRole | string;
  restaurantName: string;
  restaurantSlug: string;
  branchName?: string;
  isPlatformAdmin: boolean;
  hasAllBranchAccess: boolean;
}

export interface RestaurantSettings {
  id?: string;
  restaurantId: string;
  defaultBranchId?: string;
  displayName: string;
  logoUrl?: string;
  bannerUrl?: string;
  phone?: string;
  email?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  timezone: string;
  currency: string;
  taxRate: number;
  businessHours?: {
    open: string;
    close: string;
    days: string[];
  };
  isDeliveryEnabled: boolean;
  isTakeawayEnabled: boolean;
  isDineInEnabled: boolean;
  isCounterEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RestaurantPaymentSettings {
  id?: string;
  restaurantId: string;
  isCashEnabled: boolean;
  isUpiEnabled: boolean;
  upiId?: string;
  directUpiEnabled?: boolean;
  directUpiProvider?: 'GOOGLE_PAY_BUSINESS' | 'PHONEPE_BUSINESS' | 'OTHER_BUSINESS_UPI' | string;
  merchantUpiId?: string;
  merchantDisplayName?: string;
  isOnlineEnabled: boolean;
  isRazorpayEnabled: boolean;
  razorpayKeyId?: string; // Note: Never exposes secret key
  activePaymentMode: 'CASH' | 'UPI' | 'CASH_UPI' | 'ONLINE' | 'ALL' | 'LATER';
  acceptedCurrencies: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicRestaurantBranch {
  id: string;
  name: string;
  slug?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  deliveryRadiusKm?: number;
  phone?: string;
  isActive: boolean;
}

export interface PublicRestaurantProfile {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  currency: string;
  taxRate: number;
  status: string;
  defaultBranchId?: string;
  settings: RestaurantSettings;
  paymentSettings: RestaurantPaymentSettings;
  deliverySettings?: {
    isDeliveryEnabled: boolean;
    isTakeawayEnabled: boolean;
    deliveryRadiusKm: number;
    deliveryFee: number;
    minOrderFreeDelivery: number;
    estimatedDeliveryMinutes: number;
  };
  branches: PublicRestaurantBranch[];
}

/**
 * Normalizes role string into standard PlatformRole hierarchy
 */
export function normalizePlatformRole(rawRole: string): PlatformRole {
  const r = (rawRole || '').trim().toUpperCase();
  if (r === 'SUPER_ADMIN' || r === 'SUPERADMIN' || r === 'PLATFORM_ADMIN') return 'PLATFORM_ADMIN';
  if (r === 'RESTAURANT_ADMIN' || r === 'RESTAURANT_OWNER' || r === 'OWNER' || r === 'ADMIN') return 'RESTAURANT_ADMIN';
  if (r === 'BRANCH_MANAGER' || r === 'MANAGER') return 'BRANCH_MANAGER';
  if (r === 'CASHIER') return 'CASHIER';
  if (r === 'KITCHEN' || r === 'CHEF') return 'KITCHEN';
  return 'STAFF';
}

export function isPlatformAdmin(role: string): boolean {
  const norm = normalizePlatformRole(role);
  return norm === 'PLATFORM_ADMIN';
}

/**
 * Builds request tenant context from AuthenticatedUser session
 */
export function buildTenantContext(user: AuthenticatedUser): TenantContext {
  const normRole = normalizePlatformRole(user.role);
  const isPlatform = normRole === 'PLATFORM_ADMIN';
  const hasAllBranches = isPlatform || normRole === 'RESTAURANT_ADMIN' || !user.branchId;

  return {
    restaurantId: user.restaurantId || FLAGSHIP_MOZZ_ID,
    branchId: user.branchId,
    role: normRole,
    restaurantName: user.restaurantName || 'Restaurant',
    restaurantSlug: user.restaurantSlug || 'mozz',
    branchName: user.branchName,
    isPlatformAdmin: isPlatform,
    hasAllBranchAccess: hasAllBranches,
  };
}

/**
 * Verifies if user has authorization to access target restaurant and branch
 */
export function verifyTenantAccess(
  user: AuthenticatedUser,
  targetRestaurantId: string,
  targetBranchId?: string
): { allowed: boolean; reason?: string } {
  const tenant = buildTenantContext(user);

  // Platform admin has universal cross-tenant access
  if (tenant.isPlatformAdmin) {
    return { allowed: true };
  }

  // Strict tenant boundary check
  if (tenant.restaurantId !== targetRestaurantId) {
    return {
      allowed: false,
      reason: `Access denied: Authenticated tenant (${tenant.restaurantId}) cannot access foreign tenant (${targetRestaurantId}).`,
    };
  }

  // Branch boundary check for branch-scoped staff
  if (targetBranchId && !tenant.hasAllBranchAccess && tenant.branchId && tenant.branchId !== targetBranchId) {
    return {
      allowed: false,
      reason: `Access denied: User is assigned to branch ${tenant.branchId} and cannot access branch ${targetBranchId}.`,
    };
  }

  return { allowed: true };
}

/**
 * Resolves restaurant settings by restaurant UUID
 */
export async function getRestaurantSettings(restaurantId: string): Promise<RestaurantSettings> {
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT s.*, r.name as restaurant_name, r.currency as r_currency, r.tax_rate as r_tax_rate,
                r.phone as r_phone, r.email as r_email, r.logo_url as r_logo_url
         FROM restaurants r
         LEFT JOIN restaurant_settings s ON r.id = s.restaurant_id
         WHERE r.id = $1 LIMIT 1`,
        [restaurantId]
      );

      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          id: row.id,
          restaurantId: row.restaurant_id || restaurantId,
          defaultBranchId: row.default_branch_id,
          displayName: row.display_name || row.restaurant_name || 'Restaurant',
          logoUrl: row.logo_url || row.r_logo_url,
          bannerUrl: row.banner_url,
          phone: row.phone || row.r_phone,
          email: row.email || row.r_email,
          address: row.address,
          latitude: row.latitude ? Number(row.latitude) : undefined,
          longitude: row.longitude ? Number(row.longitude) : undefined,
          timezone: row.timezone || 'Asia/Kolkata',
          currency: row.currency || row.r_currency || 'INR',
          taxRate: row.tax_rate ? Number(row.tax_rate) : (row.r_tax_rate ? Number(row.r_tax_rate) : 5.0),
          businessHours: row.business_hours,
          isDeliveryEnabled: row.is_delivery_enabled !== false,
          isTakeawayEnabled: row.is_takeaway_enabled !== false,
          isDineInEnabled: row.is_dine_in_enabled !== false,
          isCounterEnabled: row.is_counter_enabled !== false,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
    } catch (err: any) {
      console.error('[TenantService] Error getting settings in PG:', err.message);
    }
  }

  // In-memory fallback
  const rest = inMemoryDb.restaurants.find((r) => r.id === restaurantId) || inMemoryDb.restaurants[0];
  const memSettings = (inMemoryDb.restaurant_settings || []).find((s) => s.restaurant_id === restaurantId);

  return {
    id: memSettings?.id || 'mem-settings-1',
    restaurantId: restaurantId,
    defaultBranchId: memSettings?.default_branch_id || FLAGSHIP_MOZZ_BRANCH_ID,
    displayName: memSettings?.display_name || rest?.name || 'MOZZ Chinese & Pizzateria',
    logoUrl: memSettings?.logo_url || rest?.logo_url,
    bannerUrl: memSettings?.banner_url,
    phone: memSettings?.phone || rest?.phone || '+918179620607',
    email: memSettings?.email || rest?.email || 'contact@mozzpizzateria.com',
    address: memSettings?.address || 'Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli, Hyderabad, Telangana',
    latitude: memSettings?.latitude ?? 17.442509,
    longitude: memSettings?.longitude ?? 78.353966,
    timezone: memSettings?.timezone || 'Asia/Kolkata',
    currency: memSettings?.currency || rest?.currency || 'INR',
    taxRate: memSettings?.taxRate || rest?.tax_rate || 5.0,
    businessHours: memSettings?.business_hours || { open: '11:00', close: '23:00', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
    isDeliveryEnabled: memSettings?.is_delivery_enabled !== false,
    isTakeawayEnabled: memSettings?.is_takeaway_enabled !== false,
    isDineInEnabled: memSettings?.is_dine_in_enabled !== false,
    isCounterEnabled: memSettings?.is_counter_enabled !== false,
  };
}

/**
 * Updates tenant operational settings
 */
export async function updateRestaurantSettings(
  restaurantId: string,
  updates: Partial<RestaurantSettings>
): Promise<RestaurantSettings> {
  if (isPostgresRunning()) {
    try {
      const sql = `
        INSERT INTO restaurant_settings (
          restaurant_id, default_branch_id, display_name, logo_url, banner_url,
          phone, email, address, latitude, longitude, timezone, currency, tax_rate,
          business_hours, is_delivery_enabled, is_takeaway_enabled, is_dine_in_enabled, is_counter_enabled, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
        )
        ON CONFLICT (restaurant_id) DO UPDATE SET
          default_branch_id = COALESCE($2, restaurant_settings.default_branch_id),
          display_name = COALESCE($3, restaurant_settings.display_name),
          logo_url = COALESCE($4, restaurant_settings.logo_url),
          banner_url = COALESCE($5, restaurant_settings.banner_url),
          phone = COALESCE($6, restaurant_settings.phone),
          email = COALESCE($7, restaurant_settings.email),
          address = COALESCE($8, restaurant_settings.address),
          latitude = COALESCE($9, restaurant_settings.latitude),
          longitude = COALESCE($10, restaurant_settings.longitude),
          timezone = COALESCE($11, restaurant_settings.timezone),
          currency = COALESCE($12, restaurant_settings.currency),
          tax_rate = COALESCE($13, restaurant_settings.tax_rate),
          business_hours = COALESCE($14, restaurant_settings.business_hours),
          is_delivery_enabled = COALESCE($15, restaurant_settings.is_delivery_enabled),
          is_takeaway_enabled = COALESCE($16, restaurant_settings.is_takeaway_enabled),
          is_dine_in_enabled = COALESCE($17, restaurant_settings.is_dine_in_enabled),
          is_counter_enabled = COALESCE($18, restaurant_settings.is_counter_enabled),
          updated_at = NOW()
        RETURNING *;
      `;
      await query(sql, [
        restaurantId,
        updates.defaultBranchId || null,
        updates.displayName || null,
        updates.logoUrl || null,
        updates.bannerUrl || null,
        updates.phone || null,
        updates.email || null,
        updates.address || null,
        updates.latitude || null,
        updates.longitude || null,
        updates.timezone || null,
        updates.currency || null,
        updates.taxRate || null,
        updates.businessHours ? JSON.stringify(updates.businessHours) : null,
        updates.isDeliveryEnabled !== undefined ? updates.isDeliveryEnabled : null,
        updates.isTakeawayEnabled !== undefined ? updates.isTakeawayEnabled : null,
        updates.isDineInEnabled !== undefined ? updates.isDineInEnabled : null,
        updates.isCounterEnabled !== undefined ? updates.isCounterEnabled : null,
      ]);

      // Sync base restaurant fields if display name or currency or tax changed
      if (updates.displayName || updates.currency || updates.taxRate) {
        await query(
          `UPDATE restaurants SET
            name = COALESCE($2, name),
            currency = COALESCE($3, currency),
            tax_rate = COALESCE($4, tax_rate),
            updated_at = NOW()
           WHERE id = $1`,
          [restaurantId, updates.displayName || null, updates.currency || null, updates.taxRate || null]
        );
      }
    } catch (err: any) {
      console.error('[TenantService] Error updating settings in PG:', err.message);
    }
  }

  // Update in-memory db fallback
  if (!inMemoryDb.restaurant_settings) inMemoryDb.restaurant_settings = [];
  const idx = inMemoryDb.restaurant_settings.findIndex((s) => s.restaurant_id === restaurantId);
  const updated = {
    ...await getRestaurantSettings(restaurantId),
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) {
    inMemoryDb.restaurant_settings[idx] = updated;
  } else {
    inMemoryDb.restaurant_settings.push(updated);
  }

  return updated;
}

/**
 * Resolves restaurant payment settings (Strictly sanitizes out secret keys)
 */
export async function getRestaurantPaymentSettings(restaurantId: string): Promise<RestaurantPaymentSettings> {
  const envKeyId = process.env.RAZORPAY_KEY_ID?.trim();
  const hasEnvRazorpay = Boolean(envKeyId && !envKeyId.toLowerCase().includes('placeholder'));

  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT * FROM restaurant_payment_settings WHERE restaurant_id = $1 LIMIT 1`,
        [restaurantId]
      );

      if (res.rows.length > 0) {
        const row = res.rows[0];
        const isRazorpay = row.is_razorpay_enabled && (Boolean(row.razorpay_key_id) || hasEnvRazorpay);
        return {
          id: row.id,
          restaurantId: row.restaurant_id,
          isCashEnabled: row.is_cash_enabled !== false,
          isUpiEnabled: row.is_upi_enabled !== false,
          upiId: row.merchant_upi_id || row.upi_id || 'mozz@upi',
          directUpiEnabled: row.direct_upi_enabled !== false,
          directUpiProvider: row.direct_upi_provider || 'GOOGLE_PAY_BUSINESS',
          merchantUpiId: row.merchant_upi_id || row.upi_id || 'mozz@upi',
          merchantDisplayName: row.merchant_display_name || '',
          isOnlineEnabled: row.is_online_enabled !== false,
          isRazorpayEnabled: isRazorpay,
          razorpayKeyId: row.razorpay_key_id || (restaurantId === FLAGSHIP_MOZZ_ID && hasEnvRazorpay ? envKeyId : undefined),
          activePaymentMode: row.active_payment_mode || 'ALL',
          acceptedCurrencies: Array.isArray(row.accepted_currencies) ? row.accepted_currencies : ['INR'],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
    } catch (err: any) {
      console.error('[TenantService] Error getting payment settings in PG:', err.message);
    }
  }

  // In-memory or default fallback
  const mem = (inMemoryDb.restaurant_payment_settings || []).find((p) => p.restaurant_id === restaurantId);
  const fallbackUpi = mem?.merchant_upi_id || mem?.upi_id || (restaurantId === TEST_RESTAURANT_ID ? 'testkitchen@upi' : '817962067@okbizaxis');
  return {
    id: mem?.id || 'mem-payment-1',
    restaurantId: restaurantId,
    isCashEnabled: mem?.is_cash_enabled !== false,
    isUpiEnabled: mem?.is_upi_enabled !== false,
    upiId: fallbackUpi,
    directUpiEnabled: mem?.direct_upi_enabled !== false,
    directUpiProvider: mem?.direct_upi_provider || 'GOOGLE_PAY_BUSINESS',
    merchantUpiId: fallbackUpi,
    merchantDisplayName: mem?.merchant_display_name || (restaurantId === TEST_RESTAURANT_ID ? 'Starters4U Test Kitchen' : 'MOZZ Chinese & Pizzateria'),
    isOnlineEnabled: mem?.is_online_enabled !== false,
    isRazorpayEnabled: mem?.is_razorpay_enabled ?? (restaurantId === FLAGSHIP_MOZZ_ID ? hasEnvRazorpay : false),
    razorpayKeyId: mem?.razorpay_key_id || (restaurantId === FLAGSHIP_MOZZ_ID && hasEnvRazorpay ? envKeyId : undefined),
    activePaymentMode: mem?.active_payment_mode || 'ALL',
    acceptedCurrencies: mem?.accepted_currencies || ['INR'],
  };
}

export interface PaymentAuditActor {
  userId?: string;
  role: string;
  reason?: string;
}

/**
 * Updates restaurant payment settings (only toggles & public IDs, secrets never stored in plaintext)
 * Logs audit record to payment_settings_audit if UPI destination or provider changes.
 */
export async function updateRestaurantPaymentSettings(
  restaurantId: string,
  updates: Partial<RestaurantPaymentSettings>,
  actor?: PaymentAuditActor
): Promise<RestaurantPaymentSettings> {
  const previous = await getRestaurantPaymentSettings(restaurantId);

  const effectiveUpi = updates.merchantUpiId || updates.upiId || previous.merchantUpiId || previous.upiId;
  const effectiveMerchantName = updates.merchantDisplayName !== undefined ? updates.merchantDisplayName : previous.merchantDisplayName;
  const effectiveProvider = updates.directUpiProvider !== undefined ? updates.directUpiProvider : previous.directUpiProvider;

  if (isPostgresRunning()) {
    try {
      const sql = `
        INSERT INTO restaurant_payment_settings (
          restaurant_id, is_cash_enabled, is_upi_enabled, upi_id,
          direct_upi_enabled, direct_upi_provider, merchant_upi_id, merchant_display_name,
          is_online_enabled, is_razorpay_enabled, razorpay_key_id, active_payment_mode,
          accepted_currencies, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
        )
        ON CONFLICT (restaurant_id) DO UPDATE SET
          is_cash_enabled = COALESCE($2, restaurant_payment_settings.is_cash_enabled),
          is_upi_enabled = COALESCE($3, restaurant_payment_settings.is_upi_enabled),
          upi_id = COALESCE($4, restaurant_payment_settings.upi_id),
          direct_upi_enabled = COALESCE($5, restaurant_payment_settings.direct_upi_enabled),
          direct_upi_provider = COALESCE($6, restaurant_payment_settings.direct_upi_provider),
          merchant_upi_id = COALESCE($7, restaurant_payment_settings.merchant_upi_id),
          merchant_display_name = COALESCE($8, restaurant_payment_settings.merchant_display_name),
          is_online_enabled = COALESCE($9, restaurant_payment_settings.is_online_enabled),
          is_razorpay_enabled = COALESCE($10, restaurant_payment_settings.is_razorpay_enabled),
          razorpay_key_id = COALESCE($11, restaurant_payment_settings.razorpay_key_id),
          active_payment_mode = COALESCE($12, restaurant_payment_settings.active_payment_mode),
          accepted_currencies = COALESCE($13, restaurant_payment_settings.accepted_currencies),
          updated_at = NOW()
        RETURNING *;
      `;
      await query(sql, [
        restaurantId,
        updates.isCashEnabled !== undefined ? updates.isCashEnabled : null,
        updates.isUpiEnabled !== undefined ? updates.isUpiEnabled : null,
        effectiveUpi || null,
        updates.directUpiEnabled !== undefined ? updates.directUpiEnabled : null,
        updates.directUpiProvider || null,
        effectiveUpi || null,
        effectiveMerchantName || null,
        updates.isOnlineEnabled !== undefined ? updates.isOnlineEnabled : null,
        updates.isRazorpayEnabled !== undefined ? updates.isRazorpayEnabled : null,
        updates.razorpayKeyId || null,
        updates.activePaymentMode || null,
        updates.acceptedCurrencies ? JSON.stringify(updates.acceptedCurrencies) : null,
      ]);

      // Check if audit log is needed
      const upiChanged = (updates.merchantUpiId !== undefined || updates.upiId !== undefined) && effectiveUpi !== (previous.merchantUpiId || previous.upiId);
      const providerChanged = updates.directUpiProvider !== undefined && updates.directUpiProvider !== previous.directUpiProvider;
      const merchantNameChanged = updates.merchantDisplayName !== undefined && updates.merchantDisplayName !== previous.merchantDisplayName;

      if (upiChanged || providerChanged || merchantNameChanged) {
        await query(
          `INSERT INTO payment_settings_audit (
            id, restaurant_id, changed_by_user_id, changed_by_role,
            previous_provider, new_provider,
            previous_upi_id, new_upi_id,
            previous_merchant_name, new_merchant_name,
            change_reason, changed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
          [
            crypto.randomUUID(),
            restaurantId,
            actor?.userId || null,
            actor?.role || 'RESTAURANT_ADMIN',
            previous.directUpiProvider || 'GOOGLE_PAY_BUSINESS',
            effectiveProvider || 'GOOGLE_PAY_BUSINESS',
            previous.merchantUpiId || previous.upiId || null,
            effectiveUpi || null,
            previous.merchantDisplayName || null,
            effectiveMerchantName || null,
            actor?.reason || 'Payment settings updated via Admin Portal',
          ]
        ).catch((err) => console.error('[TenantService] Error inserting payment audit in PG:', err.message));
      }
    } catch (err: any) {
      console.error('[TenantService] Error updating payment settings in PG:', err.message);
    }
  }

  if (!inMemoryDb.restaurant_payment_settings) inMemoryDb.restaurant_payment_settings = [];
  const idx = inMemoryDb.restaurant_payment_settings.findIndex((p) => p.restaurant_id === restaurantId);
  const updated = {
    ...previous,
    ...updates,
    upiId: effectiveUpi,
    merchantUpiId: effectiveUpi,
    merchantDisplayName: effectiveMerchantName,
    directUpiProvider: effectiveProvider,
    updatedAt: new Date().toISOString(),
  };

  if (idx >= 0) {
    inMemoryDb.restaurant_payment_settings[idx] = updated;
  } else {
    inMemoryDb.restaurant_payment_settings.push(updated);
  }

  // In-memory audit log
  const upiChanged = (updates.merchantUpiId !== undefined || updates.upiId !== undefined) && effectiveUpi !== (previous.merchantUpiId || previous.upiId);
  const providerChanged = updates.directUpiProvider !== undefined && updates.directUpiProvider !== previous.directUpiProvider;
  const merchantNameChanged = updates.merchantDisplayName !== undefined && updates.merchantDisplayName !== previous.merchantDisplayName;

  if (upiChanged || providerChanged || merchantNameChanged) {
    inMemoryDb.payment_settings_audit = inMemoryDb.payment_settings_audit || [];
    inMemoryDb.payment_settings_audit.push({
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      changed_by_user_id: actor?.userId || null,
      changed_by_role: actor?.role || 'RESTAURANT_ADMIN',
      previous_provider: previous.directUpiProvider || 'GOOGLE_PAY_BUSINESS',
      new_provider: effectiveProvider || 'GOOGLE_PAY_BUSINESS',
      previous_upi_id: previous.merchantUpiId || previous.upiId || null,
      new_upi_id: effectiveUpi || null,
      previous_merchant_name: previous.merchantDisplayName || null,
      new_merchant_name: effectiveMerchantName || null,
      change_reason: actor?.reason || 'Payment settings updated via Admin Portal',
      changed_at: new Date().toISOString(),
    });
  }

  return updated;
}

/**
 * Retrieves payment settings audit history for a restaurant tenant
 */
export async function getPaymentSettingsAuditHistory(restaurantId: string): Promise<any[]> {
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT a.*, u.name as changed_by_name, u.email as changed_by_email
         FROM payment_settings_audit a
         LEFT JOIN restaurant_users u ON a.changed_by_user_id = u.id
         WHERE a.restaurant_id = $1
         ORDER BY a.changed_at DESC
         LIMIT 50`,
        [restaurantId]
      );
      return res.rows;
    } catch (err: any) {
      console.error('[TenantService] Error fetching payment audit in PG:', err.message);
    }
  }

  const logs = (inMemoryDb.payment_settings_audit || [])
    .filter((a) => a.restaurant_id === restaurantId)
    .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
  return logs;
}

/**
 * Public Restaurant Resolution by Slug:
 * Returns strictly public restaurant data without secrets or internal credentials
 */
export async function resolveRestaurantBySlug(slug: string): Promise<PublicRestaurantProfile | null> {
  const cleanSlug = (slug || '').trim().toLowerCase();
  if (!cleanSlug) return null;

  let restaurantRow: any = null;
  let branchRows: any[] = [];

  if (isPostgresRunning()) {
    try {
      const restRes = await query(
        `SELECT id, name, slug, phone, email, logo_url, tagline, currency, tax_rate, status
         FROM restaurants
         WHERE LOWER(slug) = $1 AND status IN ('active', 'suspended')
         LIMIT 1`,
        [cleanSlug]
      );
      if (restRes.rows.length > 0) {
        restaurantRow = restRes.rows[0];
        const branchesRes = await query(
          `SELECT id, name, slug, address, latitude, longitude, delivery_radius_km, phone, is_active
           FROM restaurant_branches
           WHERE restaurant_id = $1 AND is_active = TRUE
           ORDER BY created_at ASC`,
          [restaurantRow.id]
        );
        branchRows = branchesRes.rows;
      }
    } catch (err: any) {
      console.error('[TenantService] Error resolving restaurant by slug in PG:', err.message);
    }
  }

  if (!restaurantRow) {
    restaurantRow = inMemoryDb.restaurants.find(
      (r) => r.slug.toLowerCase() === cleanSlug && (r.status === 'active' || r.status === 'suspended')
    );
    if (restaurantRow) {
      branchRows = inMemoryDb.restaurant_branches.filter((b) => b.restaurant_id === restaurantRow.id && b.is_active);
    }
  }

  if (!restaurantRow) return null;

  const settings = await getRestaurantSettings(restaurantRow.id);
  const paymentSettings = await getRestaurantPaymentSettings(restaurantRow.id);
  const deliverySettings = await getTenantDeliverySettings(restaurantRow.id);

  const branches: PublicRestaurantBranch[] = branchRows.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    address: b.address,
    latitude: b.latitude ? Number(b.latitude) : undefined,
    longitude: b.longitude ? Number(b.longitude) : undefined,
    deliveryRadiusKm: b.delivery_radius_km ? Number(b.delivery_radius_km) : undefined,
    phone: b.phone,
    isActive: b.is_active !== false,
  }));

  return {
    id: restaurantRow.id,
    name: restaurantRow.name,
    slug: restaurantRow.slug,
    tagline: restaurantRow.tagline,
    logoUrl: restaurantRow.logo_url,
    phone: restaurantRow.phone,
    email: restaurantRow.email,
    currency: restaurantRow.currency || 'INR',
    taxRate: restaurantRow.tax_rate ? Number(restaurantRow.tax_rate) : 5.0,
    status: restaurantRow.status || 'active',
    defaultBranchId: settings.defaultBranchId || branches[0]?.id,
    settings,
    paymentSettings,
    deliverySettings: {
      isDeliveryEnabled: deliverySettings.isDeliveryEnabled,
      isTakeawayEnabled: deliverySettings.isTakeawayEnabled,
      deliveryRadiusKm: deliverySettings.deliveryRadiusKm,
      deliveryFee: deliverySettings.deliveryFee,
      minOrderFreeDelivery: deliverySettings.minOrderFreeDelivery,
      estimatedDeliveryMinutes: deliverySettings.estimatedDeliveryMinutes,
    },
    branches,
  };
}

/**
 * Resolves restaurant by UUID
 */
export async function resolveRestaurantById(restaurantId: string): Promise<PublicRestaurantProfile | null> {
  let slug = FLAGSHIP_MOZZ_SLUG;
  if (isPostgresRunning()) {
    try {
      const res = await query(`SELECT slug FROM restaurants WHERE id = $1 LIMIT 1`, [restaurantId]);
      if (res.rows.length > 0) {
        slug = res.rows[0].slug;
      }
    } catch (err: any) {
      console.error('[TenantService] Error looking up slug by ID in PG:', err.message);
    }
  } else {
    const r = inMemoryDb.restaurants.find((rest) => rest.id === restaurantId);
    if (r) slug = r.slug;
  }

  return resolveRestaurantBySlug(slug);
}

/**
 * Resolves tenant basic context (including default branch) for a given restaurant UUID
 */
export async function resolveTenantContext(restaurantId: string): Promise<{ restaurantId: string; defaultBranchId?: string } | null> {
  const profile = await resolveRestaurantById(restaurantId);
  if (!profile) return null;
  return {
    restaurantId: profile.id,
    defaultBranchId: profile.defaultBranchId || profile.branches?.[0]?.id,
  };
}

export interface PublicRestaurantCardItem {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  logoUrl?: string;
  bannerUrl?: string;
  cuisines: string[];
  locality?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  isOpen: boolean | null;
  businessHours?: {
    open: string;
    close: string;
    days: string[];
  };
  isDeliveryEnabled: boolean;
  isTakeawayEnabled: boolean;
  isDineInEnabled: boolean;
  deliveryFee?: number;
  minOrderFreeDelivery?: number;
  estimatedDeliveryMinutes?: number;
  deliveryRadiusKm?: number;
}

export interface ListPublicRestaurantsOptions {
  limit?: number;
  offset?: number;
  page?: number;
  category?: string;
  search?: string;
  latitude?: number;
  longitude?: number;
}

export interface ListPublicRestaurantsResult {
  restaurants: PublicRestaurantCardItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  availableCategories: string[];
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function checkIsOpen(businessHours?: { open: string; close: string; days?: string[] }): boolean | null {
  if (!businessHours || !businessHours.open || !businessHours.close) return null;
  try {
    const now = new Date();
    const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istDate = new Date(istString);
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDay = dayNames[istDate.getDay()];
    if (businessHours.days && businessHours.days.length > 0) {
      const lowerDays = businessHours.days.map((d) => d.toLowerCase());
      if (!lowerDays.includes(currentDay)) return false;
    }
    const currentMinutes = istDate.getHours() * 60 + istDate.getMinutes();
    const [openH, openM] = businessHours.open.split(':').map(Number);
    const [closeH, closeM] = businessHours.close.split(':').map(Number);
    const openMinutes = openH * 60 + (openM || 0);
    const closeMinutes = closeH * 60 + (closeM || 0);
    if (closeMinutes < openMinutes) {
      return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
    }
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  } catch {
    return null;
  }
}

/**
 * Derives cuisines for a restaurant from slug, settings or menu categories
 */
function deriveCuisinesForRestaurant(slug: string, rawCategories: string[] = []): string[] {
  if (slug === FLAGSHIP_MOZZ_SLUG) {
    return ['Chinese', 'Pizza', 'Momos', 'Fast Food', 'Desserts'];
  }
  const detected = new Set<string>();
  const catText = rawCategories.join(' ').toLowerCase();

  if (catText.includes('chinese') || catText.includes('wok') || catText.includes('manchurian') || catText.includes('noodle')) {
    detected.add('Chinese');
  }
  if (catText.includes('pizza')) {
    detected.add('Pizza');
  }
  if (catText.includes('momo') || catText.includes('dim sum')) {
    detected.add('Momos');
  }
  if (catText.includes('biryani')) {
    detected.add('Biryani');
  }
  if (catText.includes('dosa') || catText.includes('idli') || catText.includes('south')) {
    detected.add('South Indian');
  }
  if (catText.includes('curry') || catText.includes('paneer') || catText.includes('north') || catText.includes('tandoor')) {
    detected.add('North Indian');
  }
  if (catText.includes('starter') || catText.includes('snack') || catText.includes('maggie') || catText.includes('burger')) {
    detected.add('Fast Food');
  }
  if (catText.includes('dessert') || catText.includes('sweet') || catText.includes('beverage') || catText.includes('drink')) {
    detected.add('Desserts');
  }

  if (detected.size === 0) {
    // If restaurant has name with spice or kitchen, assign sensible cuisines or multi-cuisine
    if (slug.includes('spice') || slug.includes('biryani')) {
      return ['North Indian', 'Biryani', 'Fast Food'];
    }
    return ['Multi-Cuisine', 'Fast Food'];
  }
  return Array.from(detected);
}

/**
 * Public Marketplace Restaurant Listing:
 * Returns only ACTIVE, properly onboarded, production tenants.
 * Excludes test tenants, suspended tenants, and internal dev tenants.
 */
export async function listPublicRestaurants(
  options: ListPublicRestaurantsOptions = {}
): Promise<ListPublicRestaurantsResult> {
  const limit = Math.min(Math.max(options.limit || 20, 1), 50);
  const offset = Math.max(options.offset !== undefined ? options.offset : ((options.page || 1) - 1) * limit, 0);
  const categoryFilter = options.category?.trim().toLowerCase();
  const searchFilter = options.search?.trim().toLowerCase();
  const customerLat = typeof options.latitude === 'number' ? options.latitude : undefined;
  const customerLng = typeof options.longitude === 'number' ? options.longitude : undefined;

  let allRestaurants: any[] = [];
  let categoryMap: Record<string, string[]> = {};

  if (isPostgresRunning()) {
    try {
      // 1. Fetch active restaurants excluding test tenants
      const res = await query(
        `SELECT id, name, slug, phone, email, logo_url, tagline, currency, tax_rate, status
         FROM restaurants
         WHERE status = 'active'
           AND LOWER(slug) NOT IN ('test-restaurant', 'test-kitchen')
           AND LOWER(slug) NOT LIKE '%test%'
           AND id != $1
         ORDER BY (CASE WHEN slug = 'mozz' THEN 0 ELSE 1 END), created_at ASC`,
        [TEST_RESTAURANT_ID]
      );
      allRestaurants = res.rows;

      // 2. Fetch category names per restaurant for cuisine inference
      const catRes = await query(
        `SELECT DISTINCT restaurant_id, name FROM menu_categories WHERE restaurant_id = ANY($1)`,
        [allRestaurants.map((r) => r.id)]
      );
      catRes.rows.forEach((row: any) => {
        if (!categoryMap[row.restaurant_id]) categoryMap[row.restaurant_id] = [];
        categoryMap[row.restaurant_id].push(row.name);
      });
    } catch (err: any) {
      console.error('[TenantService] Error querying public restaurants in PG:', err.message);
    }
  }

  if (allRestaurants.length === 0) {
    allRestaurants = inMemoryDb.restaurants.filter(
      (r) =>
        r.status === 'active' &&
        r.slug !== TEST_RESTAURANT_SLUG &&
        r.id !== TEST_RESTAURANT_ID &&
        !r.slug.includes('test')
    );
    (inMemoryDb.menu_categories || []).forEach((c) => {
      if (!categoryMap[c.restaurant_id]) categoryMap[c.restaurant_id] = [];
      categoryMap[c.restaurant_id].push(c.name);
    });
  }

  // Build restaurant card objects with settings, branch location, and cuisines
  const cardItems: PublicRestaurantCardItem[] = [];

  for (const r of allRestaurants) {
    const settings = await getRestaurantSettings(r.id);
    const delivery = await getTenantDeliverySettings(r.id);

    // Resolve branch for coordinates & locality
    let branchLat: number | undefined = settings.latitude;
    let branchLng: number | undefined = settings.longitude;
    let branchAddress: string | undefined = settings.address;
    let locality = 'Hyderabad';

    if (r.slug === FLAGSHIP_MOZZ_SLUG) {
      locality = 'Gachibowli';
      branchLat = branchLat || 17.442509;
      branchLng = branchLng || 78.353966;
    } else if (branchAddress) {
      const parts = branchAddress.split(',').map((p) => p.trim());
      if (parts.length >= 2) {
        locality = parts[parts.length - 2] || parts[0];
      }
    }

    let distanceKm: number | undefined;
    if (customerLat !== undefined && customerLng !== undefined && branchLat && branchLng) {
      distanceKm = calculateDistanceKm(customerLat, customerLng, branchLat, branchLng);
    }

    const cuisines = deriveCuisinesForRestaurant(r.slug, categoryMap[r.id] || []);
    const rawHours = settings.businessHours || (settings as any).business_hours;
    const isOpen = checkIsOpen(rawHours);

    cardItems.push({
      id: r.id,
      name: r.name,
      slug: r.slug,
      tagline: r.tagline || settings.displayName || (settings as any).display_name,
      logoUrl: r.logo_url || settings.logoUrl,
      bannerUrl: settings.bannerUrl,
      cuisines,
      locality,
      address: branchAddress,
      city: 'Hyderabad',
      latitude: branchLat,
      longitude: branchLng,
      distanceKm,
      isOpen,
      businessHours: rawHours,
      isDeliveryEnabled: delivery.isDeliveryEnabled ?? settings.isDeliveryEnabled ?? true,
      isTakeawayEnabled: delivery.isTakeawayEnabled ?? settings.isTakeawayEnabled ?? true,
      isDineInEnabled: settings.isDineInEnabled ?? true,
      deliveryFee: delivery.deliveryFee,
      minOrderFreeDelivery: delivery.minOrderFreeDelivery,
      estimatedDeliveryMinutes: delivery.estimatedDeliveryMinutes,
      deliveryRadiusKm: delivery.deliveryRadiusKm,
    });
  }

  // Filter by category/cuisine if requested
  let filtered = cardItems;
  if (categoryFilter && categoryFilter !== 'all') {
    filtered = filtered.filter((item) =>
      item.cuisines.some((c) => c.toLowerCase() === categoryFilter || c.toLowerCase().includes(categoryFilter))
    );
  }

  // Filter by search query if requested
  if (searchFilter) {
    filtered = filtered.filter(
      (item) =>
        item.name.toLowerCase().includes(searchFilter) ||
        (item.locality && item.locality.toLowerCase().includes(searchFilter)) ||
        item.cuisines.some((c) => c.toLowerCase().includes(searchFilter))
    );
  }

  // Sort: Flagship first, then by distance if available, otherwise name
  filtered.sort((a, b) => {
    if (a.slug === FLAGSHIP_MOZZ_SLUG) return -1;
    if (b.slug === FLAGSHIP_MOZZ_SLUG) return 1;
    if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
      return a.distanceKm - b.distanceKm;
    }
    return a.name.localeCompare(b.name);
  });

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  // Standard marketplace food categories
  const standardCategories = [
    'All',
    'Chinese',
    'Pizza',
    'Momos',
    'Biryani',
    'South Indian',
    'North Indian',
    'Fast Food',
    'Desserts',
  ];

  return {
    restaurants: paginated,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
    availableCategories: standardCategories,
  };
}

/**
 * Public Marketplace Search:
 * Searches across active restaurants and in-stock dishes.
 * Identifies the restaurant clearly for every dish.
 * Excludes test tenants and suspended restaurants.
 */
export async function searchPublicMarketplace(queryText: string) {
  const cleanQ = (queryText || '').trim().toLowerCase();
  if (!cleanQ) {
    return { restaurants: [], dishes: [] };
  }

  // 1. Search Restaurants
  const restaurantsResult = await listPublicRestaurants({ search: cleanQ, limit: 10 });

  // 2. Search Dishes across active restaurants
  const activeRestaurantMap = new Map<string, { id: string; name: string; slug: string; locality?: string }>();
  // Pre-populate with all active restaurants
  const allActive = await listPublicRestaurants({ limit: 50 });
  allActive.restaurants.forEach((r) => {
    activeRestaurantMap.set(r.id, {
      id: r.id,
      name: r.name,
      slug: r.slug,
      locality: r.locality,
    });
  });

  const activeIds = Array.from(activeRestaurantMap.keys());
  let matchedDishes: any[] = [];

  if (activeIds.length > 0) {
    if (isPostgresRunning()) {
      try {
        const dishRes = await query(
          `SELECT id, restaurant_id, name, description, category, dietary_type, price, image_url, in_stock
           FROM menu_items
           WHERE restaurant_id = ANY($1)
             AND in_stock = TRUE
             AND (LOWER(name) LIKE $2 OR LOWER(description) LIKE $2 OR LOWER(category) LIKE $2)
           ORDER BY (CASE WHEN restaurant_id = $3 THEN 0 ELSE 1 END), is_popular DESC
           LIMIT 15`,
          [activeIds, `%${cleanQ}%`, FLAGSHIP_MOZZ_ID]
        );
        matchedDishes = dishRes.rows;
      } catch (err: any) {
        console.error('[TenantService] Error searching dishes in PG:', err.message);
      }
    }

    if (matchedDishes.length === 0) {
      matchedDishes = (inMemoryDb.menu_items || [])
        .filter(
          (item) =>
            activeRestaurantMap.has(item.restaurant_id) &&
            item.in_stock !== false &&
            (item.name.toLowerCase().includes(cleanQ) ||
              (item.description && item.description.toLowerCase().includes(cleanQ)) ||
              (item.category && item.category.toLowerCase().includes(cleanQ)))
        )
        .slice(0, 15);
    }
  }

  const formattedDishes = matchedDishes.map((item) => {
    const parentRest = activeRestaurantMap.get(item.restaurant_id);
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      dietaryType: item.dietary_type,
      price: item.price !== null ? Number(item.price) : null,
      imageUrl: item.image_url,
      restaurant: parentRest || {
        id: item.restaurant_id,
        name: 'Restaurant',
        slug: 'restaurant',
      },
    };
  });

  return {
    restaurants: restaurantsResult.restaurants,
    dishes: formattedDishes,
  };
}

export interface SeoEligibleRestaurant {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  logoUrl?: string;
  bannerUrl?: string;
  locality?: string;
  city?: string;
  address?: string;
  phone?: string;
  cuisines: string[];
  updatedAt?: string;
  status: string;
}

/**
 * Checks whether a given restaurant record and its settings satisfy all criteria for SEO eligibility.
 * All criteria must pass:
 * 1. Restaurant record exists in database
 * 2. Status is active (status = 'active')
 * 3. Public storefront is enabled (at least one service mode active)
 * 4. Unique valid slug is present (not internal test fixture)
 * 5. Restaurant is not suspended
 * 6. Restaurant is not archived / deleted
 * 7. Minimum required public info exists (restaurant name >= 2 chars)
 */
export function isRestaurantSeoEligible(
  restaurant: { id?: string; name?: string; slug?: string; status?: string } | null | undefined,
  settings?: {
    isDeliveryEnabled?: boolean;
    isTakeawayEnabled?: boolean;
    isDineInEnabled?: boolean;
    isCounterEnabled?: boolean;
    address?: string;
  } | null
): { isEligible: boolean; reasons: string[]; isPublicStorefrontActive: boolean } {
  const reasons: string[] = [];

  if (!restaurant || !restaurant.id) {
    return {
      isEligible: false,
      reasons: ['Restaurant record does not exist in the database.'],
      isPublicStorefrontActive: false,
    };
  }

  const name = (restaurant.name || '').trim();
  const slug = (restaurant.slug || '').trim().toLowerCase();
  const status = (restaurant.status || '').trim().toLowerCase();

  // 1. Minimum public info (name)
  if (!name || name.length < 2) {
    reasons.push('Restaurant name must have at least 2 characters.');
  }

  // 2. Slug validation
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slug || !slugPattern.test(slug) || slug.length < 2) {
    reasons.push('Slug is invalid or missing.');
  } else if (slug === 'test-restaurant' || slug === 'test-kitchen' || restaurant.id === TEST_RESTAURANT_ID) {
    reasons.push('Internal development fixture is excluded from public search index.');
  }

  // 3. Status checks: must be 'active' (not suspended, archived, deleted, or pending)
  if (status !== 'active') {
    if (status === 'suspended') {
      reasons.push('Restaurant is currently suspended.');
    } else if (status === 'archived' || status === 'deleted') {
      reasons.push('Restaurant is archived or deleted.');
    } else {
      reasons.push(`Restaurant status is "${status || 'inactive'}", expected "active".`);
    }
  }

  // 4. Public Storefront check: at least one service mode enabled
  const isDelivery = settings ? settings.isDeliveryEnabled !== false : true;
  const isTakeaway = settings ? settings.isTakeawayEnabled !== false : true;
  const isDineIn = settings ? settings.isDineInEnabled !== false : true;
  const isCounter = settings ? settings.isCounterEnabled !== false : true;
  const isPublicStorefrontActive = Boolean(isDelivery || isTakeaway || isDineIn || isCounter);

  if (!isPublicStorefrontActive) {
    reasons.push('All public ordering service modes (delivery, takeaway, dine-in, counter) are disabled.');
  }

  const isEligible = reasons.length === 0;

  return {
    isEligible,
    reasons,
    isPublicStorefrontActive,
  };
}

/**
 * Returns all ACTIVE, publicly eligible restaurants for dynamic sitemap and SEO indexation.
 * Strictly excludes inactive, suspended, archived, or internal test fixtures.
 */
export async function getSeoEligibleRestaurants(): Promise<SeoEligibleRestaurant[]> {
  let eligible: any[] = [];
  let categoryMap: Record<string, string[]> = {};

  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT r.id, r.name, r.slug, r.tagline, r.logo_url, r.status, r.phone, r.updated_at,
                s.address, s.latitude, s.longitude, s.banner_url,
                s.is_delivery_enabled, s.is_takeaway_enabled, s.is_dine_in_enabled, s.is_counter_enabled
         FROM restaurants r
         LEFT JOIN restaurant_settings s ON r.id = s.restaurant_id
         WHERE r.status = 'active'
           AND LOWER(r.slug) NOT IN ('test-restaurant', 'test-kitchen')
           AND r.id != $1
           AND (s.id IS NULL OR s.is_delivery_enabled = TRUE OR s.is_takeaway_enabled = TRUE OR s.is_dine_in_enabled = TRUE OR s.is_counter_enabled = TRUE)
         ORDER BY (CASE WHEN r.slug = 'mozz' THEN 0 ELSE 1 END), r.created_at ASC`,
        [TEST_RESTAURANT_ID]
      );
      eligible = res.rows;

      if (eligible.length > 0) {
        const catRes = await query(
          `SELECT DISTINCT restaurant_id, name FROM menu_categories WHERE restaurant_id = ANY($1)`,
          [eligible.map((r) => r.id)]
        );
        catRes.rows.forEach((row: any) => {
          if (!categoryMap[row.restaurant_id]) categoryMap[row.restaurant_id] = [];
          categoryMap[row.restaurant_id].push(row.name);
        });
      }
    } catch (err: any) {
      console.error('[TenantService] Error querying SEO eligible restaurants in PG:', err.message);
    }
  }

  if (eligible.length === 0) {
    const memList = inMemoryDb.restaurants.filter(
      (r) =>
        r.status === 'active' &&
        r.slug.toLowerCase() !== TEST_RESTAURANT_SLUG &&
        r.slug.toLowerCase() !== 'test-kitchen' &&
        r.id !== TEST_RESTAURANT_ID
    );
    eligible = memList.map((r) => {
      const s = (inMemoryDb.restaurant_settings || []).find((st) => st.restaurant_id === r.id);
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        tagline: r.tagline,
        logo_url: r.logo_url,
        phone: r.phone,
        status: r.status,
        updated_at: r.updated_at || new Date().toISOString(),
        address: s?.address,
        banner_url: s?.bannerUrl,
        is_delivery_enabled: s?.isDeliveryEnabled,
        is_takeaway_enabled: s?.isTakeawayEnabled,
        is_dine_in_enabled: s?.isDineInEnabled,
        is_counter_enabled: s?.isCounterEnabled,
      };
    }).filter((row) => {
      const seoCheck = isRestaurantSeoEligible(
        { id: row.id, name: row.name, slug: row.slug, status: row.status },
        {
          isDeliveryEnabled: row.is_delivery_enabled,
          isTakeawayEnabled: row.is_takeaway_enabled,
          isDineInEnabled: row.is_dine_in_enabled,
          isCounterEnabled: row.is_counter_enabled,
          address: row.address,
        }
      );
      return seoCheck.isEligible;
    });
  }

  return eligible.map((row) => {
    const rawCategories = categoryMap[row.id] || [];
    const cuisines = deriveCuisinesForRestaurant(row.slug, rawCategories);
    const locality = row.address?.includes('Gachibowli') ? 'Gachibowli' : (row.address ? row.address.split(',')[0].trim() : 'Hyderabad');
    const city = 'Hyderabad';

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      tagline: row.tagline,
      logoUrl: row.logo_url,
      bannerUrl: row.banner_url,
      locality,
      city,
      address: row.address,
      phone: row.phone,
      cuisines,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
      status: row.status,
    };
  });
}

/**
 * Resolves a restaurant specifically for SEO public consumption.
 * Returns null if the restaurant does not exist, is suspended, or is not SEO-eligible.
 */
export async function getRestaurantForSeo(slug: string): Promise<SeoEligibleRestaurant | null> {
  const cleanSlug = (slug || '').trim().toLowerCase();
  if (!cleanSlug) return null;

  // Internal test kitchens are never publicly indexed
  if (cleanSlug === 'test-restaurant' || cleanSlug === 'test-kitchen') {
    return null;
  }

  const profile = await resolveRestaurantBySlug(cleanSlug);
  if (!profile) {
    return null;
  }

  // Strict SEO eligibility gating
  const seoCheck = isRestaurantSeoEligible(
    { id: profile.id, name: profile.name, slug: profile.slug, status: profile.status },
    profile.settings
  );
  if (!seoCheck.isEligible) {
    return null;
  }

  const allEligible = await getSeoEligibleRestaurants();
  const matched = allEligible.find((r) => r.slug.toLowerCase() === cleanSlug);
  if (matched) return matched;

  // Fallback construction if not in batch
  const locality = profile.settings.address?.includes('Gachibowli') ? 'Gachibowli' : (profile.settings.address ? profile.settings.address.split(',')[0].trim() : 'Hyderabad');
  return {
    id: profile.id,
    name: profile.name,
    slug: profile.slug,
    tagline: profile.tagline,
    logoUrl: profile.logoUrl,
    bannerUrl: profile.settings.bannerUrl,
    locality,
    city: 'Hyderabad',
    address: profile.settings.address,
    phone: profile.phone,
    cuisines: deriveCuisinesForRestaurant(profile.slug),
    updatedAt: profile.settings.updatedAt || new Date().toISOString(),
    status: profile.status,
  };
}
