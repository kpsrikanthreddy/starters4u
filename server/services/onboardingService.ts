import crypto from 'crypto';
import { query, inMemoryDb, isPostgresRunning, getClient } from '../db.js';
import { hashPassword } from './authService.js';
import {
  getRestaurantSettings,
  getRestaurantPaymentSettings,
  isRestaurantSeoEligible,
} from './tenantService.js';

export interface ProvisionRestaurantInput {
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  slug?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  subscriptionPlan?: 'starter' | 'growth' | 'enterprise' | string;
  paymentMode?: 'CASH' | 'UPI' | 'CASH_UPI' | 'ONLINE' | 'LATER' | 'ALL';
  serviceModes?: {
    dineIn?: boolean;
    counter?: boolean;
    takeaway?: boolean;
    delivery?: boolean;
  };
}

export interface OnboardingChecklist {
  overallStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  businessDetailsStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  menuStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  businessHoursStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  tablesQrStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  paymentsStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  printerStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  deliveryStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  completedSteps: number;
  totalSteps: number;
  notes?: string;
}

export interface PlatformRestaurantSummary {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  phone: string;
  email?: string;
  mainBranchName: string;
  status: 'active' | 'suspended' | 'pending' | 'inactive' | 'archived';
  planName: string;
  onboardingStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  orderCount: number;
  totalRevenue: number;
  createdAt: string;
}

export interface PlatformRestaurantDetail {
  restaurant: any;
  branches: any[];
  adminUser?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    invitationStatus?: string;
  };
  settings: any;
  paymentSettings: any;
  subscription: any;
  onboarding: OnboardingChecklist;
  menuSummary: {
    categoryCount: number;
    itemCount: number;
  };
  printerStatus: {
    configured: boolean;
    deviceCount: number;
    message: string;
  };
  seoReadiness?: {
    publicStorefrontActive: boolean;
    slug: string;
    isSeoEligible: boolean;
    isIndexable: boolean;
    isSitemapIncluded: boolean;
    publicUrl: string;
    menuUrl: string;
    googleOrderingUrl: string;
    canonicalUrl: string;
    menuCanonicalUrl: string;
    reasons: string[];
  };
}

export const RESERVED_SLUGS = new Set([
  'admin',
  'platform-admin',
  'restaurant-admin',
  'api',
  'track',
  'cart',
  'checkout',
  'login',
  'onboarding',
  'table',
  'counter',
  'restaurants',
  'about',
  'contact',
  'delivery-information',
  'privacy-policy',
  'terms-and-conditions',
  'refund-and-cancellation-policy',
  'chinese-specials',
  'assets',
  'static',
  'sitemap',
  'robots',
  'test-restaurant',
  'test-kitchen',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has((slug || '').trim().toLowerCase());
}

/**
 * Validates a candidate slug format, checks against reserved words, and verifies database uniqueness.
 */
export async function checkSlugAvailability(
  candidateSlug: string,
  excludeRestaurantId?: string
): Promise<{ available: boolean; slug: string; reason?: string }> {
  const clean = sanitizeSlug(candidateSlug);
  if (!clean || clean.length < 2) {
    return {
      available: false,
      slug: clean,
      reason: 'Slug must be at least 2 characters long and contain alphanumeric characters or hyphens.',
    };
  }

  const validPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!validPattern.test(clean)) {
    return {
      available: false,
      slug: clean,
      reason: 'Slug can only contain lowercase alphanumeric characters and single hyphens (no trailing or double hyphens).',
    };
  }

  if (isReservedSlug(clean)) {
    return {
      available: false,
      slug: clean,
      reason: `"${clean}" is a reserved system path and cannot be used as a restaurant slug.`,
    };
  }

  let exists = false;
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT id FROM restaurants WHERE LOWER(slug) = $1 AND ($2::uuid IS NULL OR id != $2::uuid) LIMIT 1`,
        [clean, excludeRestaurantId || null]
      );
      exists = res.rows.length > 0;
    } catch (err: any) {
      console.error('[OnboardingService] Error checking slug availability in PG:', err.message);
    }
  } else {
    exists = inMemoryDb.restaurants.some(
      (r) => r.slug.toLowerCase() === clean && (!excludeRestaurantId || r.id !== excludeRestaurantId)
    );
  }

  if (exists) {
    return {
      available: false,
      slug: clean,
      reason: `The slug "${clean}" is already in use by another restaurant. Please choose a unique slug.`,
    };
  }

  return { available: true, slug: clean };
}

/**
 * Normalizes input string to clean SEO-safe slug (alphanumeric + hyphen).
 */
export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Generates unique restaurant slug with sequential deduplication (e.g., abc-kitchen, abc-kitchen-2).
 */
export async function generateUniqueSlug(rawName: string): Promise<string> {
  const base = sanitizeSlug(rawName) || 'restaurant';
  let candidate = base;
  let counter = 2;

  while (true) {
    let exists = false;

    if (isPostgresRunning()) {
      try {
        const res = await query(`SELECT id FROM restaurants WHERE LOWER(slug) = $1 LIMIT 1`, [candidate]);
        exists = res.rows.length > 0;
      } catch (err: any) {
        console.error('[OnboardingService] Error checking slug collision in PG:', err.message);
      }
    } else {
      exists = inMemoryDb.restaurants.some((r) => r.slug.toLowerCase() === candidate);
    }

    if (!exists) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter++;
  }
}

/**
 * Normalizes contact mobile number.
 */
export function normalizePhoneNumber(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '').trim();
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  return cleaned;
}

/**
 * Provisions a brand new restaurant tenant end-to-end within a single atomic transaction.
 */
export async function provisionNewRestaurant(input: ProvisionRestaurantInput): Promise<{
  success: boolean;
  restaurantId?: string;
  slug?: string;
  profile?: PlatformRestaurantDetail;
  error?: string;
  seo?: {
    publicUrl: string;
    menuUrl: string;
    googleOrderingUrl: string;
    canonicalUrl: string;
    menuCanonicalUrl: string;
    isSeoEligible: boolean;
    isPublicStorefrontActive: boolean;
    sitemapIncluded: boolean;
  };
}> {
  // 1. Mandatory validations
  const name = (input.name || '').trim();
  const ownerName = (input.ownerName || '').trim();
  const phoneRaw = (input.phone || '').trim();
  const address = (input.address || '').trim();

  if (!name) {
    return { success: false, error: 'Restaurant Name is required.' };
  }
  if (!ownerName) {
    return { success: false, error: 'Owner / Contact Name is required.' };
  }
  if (!phoneRaw) {
    return { success: false, error: 'Mobile Number is required.' };
  }
  if (!address) {
    return { success: false, error: 'Address is required.' };
  }

  const phone = normalizePhoneNumber(phoneRaw);
  let slug = '';
  if (input.slug && input.slug.trim()) {
    const avail = await checkSlugAvailability(input.slug);
    if (!avail.available) {
      return { success: false, error: avail.reason || 'Invalid or unavailable slug.' };
    }
    slug = avail.slug;
  } else {
    slug = await generateUniqueSlug(name);
  }
  const email = (input.email || `${slug}.admin@starters4u.in`).trim().toLowerCase();
  const lat = input.latitude ?? 17.442509;
  const lng = input.longitude ?? 78.353966;
  const plan = input.subscriptionPlan || 'growth';
  const paymentMode = input.paymentMode || 'CASH_UPI';
  const serviceModes = {
    dineIn: input.serviceModes?.dineIn !== false,
    counter: input.serviceModes?.counter !== false,
    takeaway: input.serviceModes?.takeaway !== false,
    delivery: input.serviceModes?.delivery !== false,
  };

  const restaurantId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const subscriptionId = crypto.randomUUID();
  const tableId = crypto.randomUUID();

  // Compute secure initial password hash (default PIN '8888')
  const defaultPinHash = await hashPassword('8888', 12);

  // 2. PostgreSQL Transaction Execution
  if (isPostgresRunning()) {
    const client = await getClient();
    if (!client) {
      return { success: false, error: 'Failed to acquire database connection client.' };
    }

    try {
      await client.query('BEGIN');

      // A. Create Restaurant
      await client.query(
        `INSERT INTO restaurants (
          id, name, slug, phone, email, owner_name, status, currency, tax_rate, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'active', 'INR', 5.0, NOW(), NOW()
        )`,
        [restaurantId, name, slug, phone, email, ownerName]
      );

      // B. Create Main Branch
      await client.query(
        `INSERT INTO restaurant_branches (
          id, restaurant_id, name, slug, address, latitude, longitude, delivery_radius_km, phone, is_active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, 'main-branch', $4, $5, $6, 10.0, $7, TRUE, NOW(), NOW()
        )`,
        [branchId, restaurantId, `${name} - Main Branch`, address, lat, lng, phone]
      );

      // C. Create Restaurant Settings
      await client.query(
        `INSERT INTO restaurant_settings (
          restaurant_id, default_branch_id, display_name, phone, email, address, latitude, longitude,
          timezone, currency, tax_rate, is_delivery_enabled, is_takeaway_enabled, is_dine_in_enabled, is_counter_enabled, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 'Asia/Kolkata', 'INR', 5.0, $9, $10, $11, $12, NOW(), NOW()
        )`,
        [
          restaurantId,
          branchId,
          name,
          phone,
          email,
          address,
          lat,
          lng,
          serviceModes.delivery,
          serviceModes.takeaway,
          serviceModes.dineIn,
          serviceModes.counter,
        ]
      );

      // D. Create Payment Settings (Never store secrets in plaintext)
      const isCash = paymentMode === 'CASH' || paymentMode === 'CASH_UPI' || paymentMode === 'ALL';
      const isUpi = paymentMode === 'UPI' || paymentMode === 'CASH_UPI' || paymentMode === 'ALL';
      const isOnline = paymentMode === 'ONLINE' || paymentMode === 'ALL';

      await client.query(
        `INSERT INTO restaurant_payment_settings (
          restaurant_id, is_cash_enabled, is_upi_enabled, upi_id, is_online_enabled, is_razorpay_enabled,
          active_payment_mode, accepted_currencies, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, '["INR"]'::jsonb, NOW(), NOW()
        )`,
        [
          restaurantId,
          isCash,
          isUpi,
          `${slug}@upi`,
          isOnline,
          isOnline,
          paymentMode,
        ]
      );

      // E. Create Subscription
      const subAmount = plan === 'starter' ? 999 : plan === 'enterprise' ? 4999 : 1999;
      await client.query(
        `INSERT INTO subscriptions (
          id, restaurant_id, plan_name, status, billing_cycle, amount, starts_at, expires_at, created_at
        ) VALUES (
          $1, $2, $3, 'active', 'monthly', $4, NOW(), NOW() + INTERVAL '30 days', NOW()
        )`,
        [subscriptionId, restaurantId, plan, subAmount]
      );

      // F. Create Restaurant Admin User
      await client.query(
        `INSERT INTO restaurant_users (
          id, restaurant_id, branch_id, name, email, phone, role, pin_hash, is_active, invitation_status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'RESTAURANT_ADMIN', $7, TRUE, 'pending_setup', NOW(), NOW()
        )`,
        [userId, restaurantId, branchId, ownerName, email, phone, defaultPinHash]
      );

      // G. Create Onboarding Checklist
      const paymentsStatus = paymentMode === 'LATER' ? 'NOT_STARTED' : 'READY';
      const deliveryStatus = serviceModes.delivery ? 'READY' : 'NOT_STARTED';
      await client.query(
        `INSERT INTO restaurant_onboarding (
          restaurant_id, overall_status, business_details_status, menu_status,
          business_hours_status, tables_qr_status, payments_status, printer_status,
          delivery_status, completed_steps, total_steps, notes, created_at, updated_at
        ) VALUES (
          $1, 'IN_PROGRESS', 'READY', 'NOT_STARTED', 'READY', 'READY', $2, 'NOT_STARTED', $3, 4, 7,
          'Provisioned via Starters4U Platform Admin.', NOW(), NOW()
        )`,
        [restaurantId, paymentsStatus, deliveryStatus]
      );

      // H. Create Default Table for QR Ordering
      await client.query(
        `INSERT INTO restaurant_tables (
          id, restaurant_id, branch_id, table_number, table_name, capacity, is_active, created_at
        ) VALUES (
          $1, $2, $3, '1', 'Table 1', 4, TRUE, NOW()
        )`,
        [tableId, restaurantId, branchId]
      );

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[OnboardingService] Error provisioning restaurant in PG (transaction rolled back):', err.message);
      return { success: false, error: `Provisioning transaction failed: ${err.message}` };
    } finally {
      client.release();
    }
  } else {
    // 3. In-Memory Store Provisioning (Dual-Mirror Fallback with Rollback Protection)
    try {
      const nowIso = new Date().toISOString();

      inMemoryDb.restaurants.push({
        id: restaurantId,
        name,
        slug,
        phone,
        email,
        owner_name: ownerName,
        status: 'active',
        currency: 'INR',
        tax_rate: 5.0,
        created_at: nowIso,
        updated_at: nowIso,
      });

      inMemoryDb.restaurant_branches.push({
        id: branchId,
        restaurant_id: restaurantId,
        name: `${name} - Main Branch`,
        slug: 'main-branch',
        address,
        latitude: lat,
        longitude: lng,
        delivery_radius_km: 10.0,
        phone,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (!inMemoryDb.restaurant_settings) inMemoryDb.restaurant_settings = [];
      inMemoryDb.restaurant_settings.push({
        id: `settings-${restaurantId}`,
        restaurant_id: restaurantId,
        default_branch_id: branchId,
        display_name: name,
        phone,
        email,
        address,
        latitude: lat,
        longitude: lng,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        tax_rate: 5.0,
        is_delivery_enabled: serviceModes.delivery,
        is_takeaway_enabled: serviceModes.takeaway,
        is_dine_in_enabled: serviceModes.dineIn,
        is_counter_enabled: serviceModes.counter,
        created_at: nowIso,
        updated_at: nowIso,
      });

      const isCash = paymentMode === 'CASH' || paymentMode === 'CASH_UPI' || paymentMode === 'ALL';
      const isUpi = paymentMode === 'UPI' || paymentMode === 'CASH_UPI' || paymentMode === 'ALL';
      const isOnline = paymentMode === 'ONLINE' || paymentMode === 'ALL';

      if (!inMemoryDb.restaurant_payment_settings) inMemoryDb.restaurant_payment_settings = [];
      inMemoryDb.restaurant_payment_settings.push({
        id: `payment-${restaurantId}`,
        restaurant_id: restaurantId,
        is_cash_enabled: isCash,
        is_upi_enabled: isUpi,
        upi_id: `${slug}@upi`,
        is_online_enabled: isOnline,
        is_razorpay_enabled: isOnline,
        active_payment_mode: paymentMode,
        accepted_currencies: ['INR'],
        created_at: nowIso,
        updated_at: nowIso,
      });

      const subAmount = plan === 'starter' ? 999 : plan === 'enterprise' ? 4999 : 1999;
      inMemoryDb.subscriptions.push({
        id: subscriptionId,
        restaurant_id: restaurantId,
        plan_name: plan,
        status: 'active',
        billing_cycle: 'monthly',
        amount: subAmount,
        starts_at: nowIso,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: nowIso,
      });

      inMemoryDb.restaurant_users.push({
        id: userId,
        restaurant_id: restaurantId,
        branch_id: branchId,
        name: ownerName,
        email,
        phone,
        role: 'RESTAURANT_ADMIN',
        pin_hash: defaultPinHash,
        is_active: true,
        invitation_status: 'pending_setup',
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (!inMemoryDb.restaurant_onboarding) inMemoryDb.restaurant_onboarding = [];
      inMemoryDb.restaurant_onboarding.push({
        id: `onboard-${restaurantId}`,
        restaurant_id: restaurantId,
        overall_status: 'IN_PROGRESS',
        business_details_status: 'READY',
        menu_status: 'NOT_STARTED',
        business_hours_status: 'READY',
        tables_qr_status: 'READY',
        payments_status: paymentMode === 'LATER' ? 'NOT_STARTED' : 'READY',
        printer_status: 'NOT_STARTED',
        delivery_status: serviceModes.delivery ? 'READY' : 'NOT_STARTED',
        completed_steps: 4,
        total_steps: 7,
        notes: 'Provisioned via Starters4U Platform Admin.',
        created_at: nowIso,
        updated_at: nowIso,
      });

      inMemoryDb.restaurant_tables.push({
        id: tableId,
        restaurant_id: restaurantId,
        branch_id: branchId,
        table_number: '1',
        table_name: 'Table 1',
        capacity: 4,
        is_active: true,
        created_at: nowIso,
      });
    } catch (memErr: any) {
      // In-memory rollback cleanup
      inMemoryDb.restaurants = inMemoryDb.restaurants.filter((r) => r.id !== restaurantId);
      inMemoryDb.restaurant_branches = inMemoryDb.restaurant_branches.filter((b) => b.restaurant_id !== restaurantId);
      inMemoryDb.restaurant_users = inMemoryDb.restaurant_users.filter((u) => u.restaurant_id !== restaurantId);
      inMemoryDb.subscriptions = inMemoryDb.subscriptions.filter((s) => s.restaurant_id !== restaurantId);
      return { success: false, error: `In-memory provisioning failed: ${memErr.message}` };
    }
  }

  // 4. Fetch and return created composite detail
  const profile = await getPlatformRestaurantDetail(restaurantId);

  const publicUrl = `https://www.starters4u.in/r/${slug}`;
  const menuUrl = `https://www.starters4u.in/r/${slug}/menu`;

  return {
    success: true,
    restaurantId,
    slug,
    profile: profile || undefined,
    seo: {
      publicUrl,
      menuUrl,
      googleOrderingUrl: menuUrl,
      canonicalUrl: publicUrl,
      menuCanonicalUrl: menuUrl,
      isSeoEligible: true,
      isPublicStorefrontActive: true,
      sitemapIncluded: true,
    },
  };
}

/**
 * Returns summary list of all platform restaurants for Platform Admin Fleet View.
 */
export async function getPlatformRestaurants(): Promise<PlatformRestaurantSummary[]> {
  if (isPostgresRunning()) {
    try {
      const sql = `
        SELECT 
          r.id,
          r.name,
          r.slug,
          COALESCE(r.owner_name, u.name, 'Store Owner') as owner_name,
          COALESCE(r.phone, u.phone, '') as phone,
          r.email,
          r.status,
          r.created_at,
          COALESCE(b.name, 'Main Outlet') as main_branch_name,
          COALESCE(s.plan_name, 'growth') as plan_name,
          COALESCE(o.overall_status, 'IN_PROGRESS') as onboarding_status,
          COUNT(DISTINCT ord.id)::int as order_count,
          COALESCE(SUM(ord.grand_total), 0)::float as total_revenue
        FROM restaurants r
        LEFT JOIN restaurant_branches b ON r.id = b.restaurant_id AND b.is_active = TRUE
        LEFT JOIN restaurant_users u ON r.id = u.restaurant_id AND (LOWER(u.role) IN ('restaurant_admin', 'restaurant_owner', 'admin', 'owner'))
        LEFT JOIN subscriptions s ON r.id = s.restaurant_id
        LEFT JOIN restaurant_onboarding o ON r.id = o.restaurant_id
        LEFT JOIN orders ord ON r.id = ord.restaurant_id
        GROUP BY r.id, r.name, r.slug, r.owner_name, u.name, r.phone, u.phone, r.email, r.status, r.created_at, b.name, s.plan_name, o.overall_status
        ORDER BY r.created_at DESC;
      `;
      const res = await query(sql);
      return res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        ownerName: row.owner_name,
        phone: row.phone,
        email: row.email,
        mainBranchName: row.main_branch_name,
        status: row.status,
        planName: row.plan_name,
        onboardingStatus: row.onboarding_status,
        orderCount: Number(row.order_count || 0),
        totalRevenue: Number(row.total_revenue || 0),
        createdAt: row.created_at,
      }));
    } catch (err: any) {
      console.error('[OnboardingService] Error fetching platform restaurants in PG:', err.message);
    }
  }

  // In-Memory Fallback
  return inMemoryDb.restaurants.map((r) => {
    const mainBranch = inMemoryDb.restaurant_branches.find((b) => b.restaurant_id === r.id);
    const owner = inMemoryDb.restaurant_users.find((u) => u.restaurant_id === r.id && ['RESTAURANT_ADMIN', 'RESTAURANT_OWNER', 'admin'].includes(u.role));
    const sub = inMemoryDb.subscriptions.find((s) => s.restaurant_id === r.id);
    const onboard = (inMemoryDb.restaurant_onboarding || []).find((o) => o.restaurant_id === r.id);
    const orders = inMemoryDb.orders.filter((o) => o.restaurant_id === r.id);

    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerName: r.owner_name || owner?.name || 'Store Owner',
      phone: r.phone || owner?.phone || '+91 81796 20607',
      email: r.email || owner?.email,
      mainBranchName: mainBranch?.name || 'Main Outlet',
      status: r.status || 'active',
      planName: sub?.plan_name || 'growth',
      onboardingStatus: onboard?.overall_status || (r.id.endsWith('1') ? 'READY' : 'IN_PROGRESS'),
      orderCount: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + (o.grand_total || 0), 0),
      createdAt: r.created_at || new Date().toISOString(),
    };
  });
}

/**
 * Returns comprehensive restaurant detail for Platform Admin.
 * Note: Never exposes payment secrets (like Razorpay Key Secret) to frontend.
 */
export async function getPlatformRestaurantDetail(restaurantId: string): Promise<PlatformRestaurantDetail | null> {
  let restRow: any = null;
  let branchRows: any[] = [];
  let userRow: any = null;
  let subRow: any = null;
  let onboardRow: any = null;
  let categoryCount = 0;
  let itemCount = 0;
  let deviceCount = 0;

  if (isPostgresRunning()) {
    try {
      const restRes = await query(`SELECT * FROM restaurants WHERE id = $1 LIMIT 1`, [restaurantId]);
      if (restRes.rows.length === 0) return null;
      restRow = restRes.rows[0];

      const branchesRes = await query(`SELECT * FROM restaurant_branches WHERE restaurant_id = $1 ORDER BY created_at ASC`, [restaurantId]);
      branchRows = branchesRes.rows;

      const userRes = await query(
        `SELECT id, name, email, phone, role, invitation_status FROM restaurant_users 
         WHERE restaurant_id = $1 AND LOWER(role) IN ('restaurant_admin', 'restaurant_owner', 'admin') 
         ORDER BY created_at ASC LIMIT 1`,
        [restaurantId]
      );
      userRow = userRes.rows[0] || null;

      const subRes = await query(`SELECT * FROM subscriptions WHERE restaurant_id = $1 LIMIT 1`, [restaurantId]);
      subRow = subRes.rows[0] || null;

      const onboardRes = await query(`SELECT * FROM restaurant_onboarding WHERE restaurant_id = $1 LIMIT 1`, [restaurantId]);
      onboardRow = onboardRes.rows[0] || null;

      const catRes = await query(`SELECT COUNT(*)::int as count FROM menu_categories WHERE restaurant_id = $1`, [restaurantId]);
      categoryCount = Number(catRes.rows[0]?.count || 0);

      const itemRes = await query(`SELECT COUNT(*)::int as count FROM menu_items WHERE restaurant_id = $1`, [restaurantId]);
      itemCount = Number(itemRes.rows[0]?.count || 0);

      const devRes = await query(`SELECT COUNT(*)::int as count FROM print_devices WHERE restaurant_id = $1 AND is_active = TRUE`, [restaurantId]);
      deviceCount = Number(devRes.rows[0]?.count || 0);
    } catch (err: any) {
      console.error('[OnboardingService] Error fetching restaurant detail in PG:', err.message);
    }
  }

  // Fallback to in-memory store
  if (!restRow) {
    restRow = inMemoryDb.restaurants.find((r) => r.id === restaurantId);
    if (!restRow) return null;
    branchRows = inMemoryDb.restaurant_branches.filter((b) => b.restaurant_id === restaurantId);
    userRow = inMemoryDb.restaurant_users.find((u) => u.restaurant_id === restaurantId && ['RESTAURANT_ADMIN', 'RESTAURANT_OWNER', 'admin'].includes(u.role));
    subRow = inMemoryDb.subscriptions.find((s) => s.restaurant_id === restaurantId);
    onboardRow = (inMemoryDb.restaurant_onboarding || []).find((o) => o.restaurant_id === restaurantId);
    categoryCount = inMemoryDb.menu_categories.filter((c) => c.restaurant_id === restaurantId).length;
    itemCount = inMemoryDb.menu_items.filter((i) => i.restaurant_id === restaurantId).length;
    deviceCount = inMemoryDb.print_devices.filter((d) => d.restaurant_id === restaurantId && d.is_active).length;
  }

  const settings = await getRestaurantSettings(restaurantId);
  const paymentSettings = await getRestaurantPaymentSettings(restaurantId);

  const onboarding: OnboardingChecklist = {
    overallStatus: onboardRow?.overall_status || (restaurantId.endsWith('1') ? 'READY' : 'IN_PROGRESS'),
    businessDetailsStatus: onboardRow?.business_details_status || 'READY',
    menuStatus: onboardRow?.menu_status || (itemCount > 0 ? 'READY' : 'NOT_STARTED'),
    businessHoursStatus: onboardRow?.business_hours_status || 'READY',
    tablesQrStatus: onboardRow?.tables_qr_status || 'READY',
    paymentsStatus: onboardRow?.payments_status || (paymentSettings.isCashEnabled || paymentSettings.isUpiEnabled ? 'READY' : 'NOT_STARTED'),
    printerStatus: onboardRow?.printer_status || (deviceCount > 0 ? 'READY' : 'NOT_STARTED'),
    deliveryStatus: onboardRow?.delivery_status || (settings.isDeliveryEnabled ? 'READY' : 'NOT_STARTED'),
    completedSteps: onboardRow?.completed_steps || 4,
    totalSteps: onboardRow?.total_steps || 7,
    notes: onboardRow?.notes,
  };

  return {
    restaurant: {
      id: restRow.id,
      name: restRow.name,
      slug: restRow.slug,
      phone: restRow.phone,
      email: restRow.email,
      ownerName: restRow.owner_name || userRow?.name,
      logoUrl: restRow.logo_url,
      tagline: restRow.tagline,
      currency: restRow.currency || 'INR',
      taxRate: Number(restRow.tax_rate || 5.0),
      status: restRow.status || 'active',
      createdAt: restRow.created_at,
      updatedAt: restRow.updated_at,
    },
    branches: branchRows.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      address: b.address,
      latitude: b.latitude ? Number(b.latitude) : undefined,
      longitude: b.longitude ? Number(b.longitude) : undefined,
      deliveryRadiusKm: b.delivery_radius_km ? Number(b.delivery_radius_km) : undefined,
      phone: b.phone,
      isActive: b.is_active !== false,
    })),
    adminUser: userRow
      ? {
          id: userRow.id,
          name: userRow.name,
          email: userRow.email,
          phone: userRow.phone,
          role: userRow.role,
          invitationStatus: userRow.invitation_status || 'active',
        }
      : undefined,
    settings,
    paymentSettings,
    subscription: {
      planName: subRow?.plan_name || 'growth',
      status: subRow?.status || 'active',
      billingCycle: subRow?.billing_cycle || 'monthly',
      amount: subRow?.amount || 1999,
      startsAt: subRow?.starts_at,
      expiresAt: subRow?.expires_at,
    },
    onboarding,
    menuSummary: {
      categoryCount,
      itemCount,
    },
    printerStatus: {
      configured: deviceCount > 0,
      deviceCount,
      message: deviceCount > 0 ? `${deviceCount} Starters4U Print Device(s) Paired` : 'Not configured - Starters4U Print Agent pairing ready',
    },
    seoReadiness: (() => {
      const seoCheck = isRestaurantSeoEligible(
        { id: restRow.id, name: restRow.name, slug: restRow.slug, status: restRow.status || 'active' },
        settings
      );
      const slug = restRow.slug;
      const isEligible = seoCheck.isEligible;
      const publicUrl = `https://www.starters4u.in/r/${slug}`;
      const menuUrl = `https://www.starters4u.in/r/${slug}/menu`;

      return {
        publicStorefrontActive: seoCheck.isPublicStorefrontActive,
        slug,
        isSeoEligible: isEligible,
        isIndexable: isEligible,
        isSitemapIncluded: isEligible,
        publicUrl,
        menuUrl,
        googleOrderingUrl: menuUrl,
        canonicalUrl: publicUrl,
        menuCanonicalUrl: menuUrl,
        reasons: seoCheck.reasons,
      };
    })(),
  };
}

/**
 * Updates a restaurant lifecycle status ('active', 'suspended', 'inactive', 'archived').
 * Suspended/archived/inactive restaurants reject new orders while preserving operational and audit records.
 */
export async function setRestaurantStatus(
  restaurantId: string,
  newStatus: 'active' | 'suspended' | 'inactive' | 'archived'
): Promise<{ success: boolean; restaurantId: string; status: string; error?: string }> {
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `UPDATE restaurants SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, status`,
        [newStatus, restaurantId]
      );
      if (res.rows.length === 0) {
        return { success: false, restaurantId, status: newStatus, error: 'Restaurant not found.' };
      }
    } catch (err: any) {
      console.error('[OnboardingService] Error setting restaurant status in PG:', err.message);
      return { success: false, restaurantId, status: newStatus, error: err.message };
    }
  }

  // Update in-memory db
  const rest = inMemoryDb.restaurants.find((r) => r.id === restaurantId);
  if (rest) {
    rest.status = newStatus;
    rest.updated_at = new Date().toISOString();
  }

  return { success: true, restaurantId, status: newStatus };
}

export interface PlatformRestaurantUpdatePayload {
  name?: string;
  displayName?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  cuisine?: string;
  tagline?: string;
  logoUrl?: string;
  businessHours?: any;
  isPublicStorefrontActive?: boolean;
  status?: 'active' | 'suspended' | 'inactive' | 'archived';
  subscriptionPlan?: string;
  mainBranchName?: string;
  mainBranchPhone?: string;
  taxRate?: number;
  currency?: string;
}

/**
 * Updates full restaurant-level details from Platform Admin
 */
export async function updatePlatformRestaurantDetails(
  restaurantId: string,
  payload: PlatformRestaurantUpdatePayload
): Promise<{ success: boolean; error?: string; restaurant?: any }> {
  const {
    name,
    displayName,
    ownerName,
    phone,
    email,
    address,
    cuisine,
    tagline,
    logoUrl,
    businessHours,
    status,
    subscriptionPlan,
    mainBranchName,
    mainBranchPhone,
    taxRate,
    currency,
  } = payload;

  if (isPostgresRunning()) {
    try {
      // 1. Update restaurants base table
      await query(
        `UPDATE restaurants SET
          name = COALESCE($1, name),
          phone = COALESCE($2, phone),
          email = COALESCE($3, email),
          logo_url = COALESCE($4, logo_url),
          tagline = COALESCE($5, tagline),
          currency = COALESCE($6, currency),
          tax_rate = COALESCE($7, tax_rate),
          status = COALESCE($8, status),
          updated_at = NOW()
         WHERE id = $9`,
        [
          name || null,
          phone || null,
          email || null,
          logoUrl || null,
          tagline || cuisine || null,
          currency || null,
          taxRate !== undefined ? taxRate : null,
          status || null,
          restaurantId,
        ]
      );

      // 2. Update restaurant_settings table
      const formattedAddress = address;
      await query(
        `INSERT INTO restaurant_settings (
          restaurant_id, display_name, phone, email, address, logo_url, business_hours, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW()
        )
        ON CONFLICT (restaurant_id) DO UPDATE SET
          display_name = COALESCE($2, restaurant_settings.display_name),
          phone = COALESCE($3, restaurant_settings.phone),
          email = COALESCE($4, restaurant_settings.email),
          address = COALESCE($5, restaurant_settings.address),
          logo_url = COALESCE($6, restaurant_settings.logo_url),
          business_hours = COALESCE($7, restaurant_settings.business_hours),
          updated_at = NOW()`,
        [
          restaurantId,
          displayName || name || null,
          phone || null,
          email || null,
          formattedAddress || null,
          logoUrl || null,
          businessHours ? (typeof businessHours === 'string' ? businessHours : JSON.stringify(businessHours)) : null,
        ]
      );

      // 3. Update primary admin user contact if ownerName/phone/email supplied
      if (ownerName || phone || email) {
        await query(
          `UPDATE restaurant_users SET
            name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            email = COALESCE($3, email),
            updated_at = NOW()
           WHERE restaurant_id = $4 AND LOWER(role) IN ('restaurant_admin', 'restaurant_owner', 'admin', 'owner')`,
          [ownerName || null, phone || null, email || null, restaurantId]
        );
      }

      // 4. Update primary branch if mainBranchName or address provided
      if (mainBranchName || mainBranchPhone || address) {
        await query(
          `UPDATE restaurant_branches SET
            name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            address = COALESCE($3, address),
            updated_at = NOW()
           WHERE restaurant_id = $4 AND is_active = TRUE`,
          [mainBranchName || null, mainBranchPhone || phone || null, address || null, restaurantId]
        );
      }

      // 5. Update subscription plan if provided
      if (subscriptionPlan) {
        const planNormalized = subscriptionPlan.toLowerCase();
        const amount = planNormalized.includes('enterprise') ? 4999 : planNormalized.includes('starter') ? 999 : 1999;
        await query(
          `INSERT INTO subscriptions (restaurant_id, plan_name, status, amount, updated_at)
           VALUES ($1, $2, 'active', $3, NOW())
           ON CONFLICT (restaurant_id) DO UPDATE SET
             plan_name = $2,
             amount = $3,
             updated_at = NOW()`,
          [restaurantId, planNormalized, amount]
        );
      }
    } catch (err: any) {
      console.error('[OnboardingService] Error updating platform restaurant details in PG:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Update in-memory fallback
  const rest = inMemoryDb.restaurants.find((r) => r.id === restaurantId);
  if (rest) {
    if (name) rest.name = name;
    if (phone) rest.phone = phone;
    if (email) rest.email = email;
    if (logoUrl) rest.logo_url = logoUrl;
    if (tagline || cuisine) rest.tagline = tagline || cuisine;
    if (currency) rest.currency = currency;
    if (taxRate !== undefined) rest.tax_rate = taxRate;
    if (status) rest.status = status;
    rest.updated_at = new Date().toISOString();
  }

  if (!inMemoryDb.restaurant_settings) inMemoryDb.restaurant_settings = [];
  let settings = inMemoryDb.restaurant_settings.find((s) => s.restaurant_id === restaurantId);
  if (!settings) {
    settings = { restaurant_id: restaurantId, id: `settings-${restaurantId}` };
    inMemoryDb.restaurant_settings.push(settings);
  }
  if (displayName) settings.display_name = displayName;
  if (phone) settings.phone = phone;
  if (email) settings.email = email;
  if (address) settings.address = address;
  if (logoUrl) settings.logo_url = logoUrl;
  if (businessHours) settings.business_hours = businessHours;
  settings.updated_at = new Date().toISOString();

  // In-memory user update
  const user = inMemoryDb.restaurant_users.find(
    (u) => u.restaurant_id === restaurantId && ['RESTAURANT_ADMIN', 'RESTAURANT_OWNER', 'admin'].includes(u.role)
  );
  if (user) {
    if (ownerName) user.name = ownerName;
    if (phone) user.phone = phone;
    if (email) user.email = email;
  }

  // In-memory branch update
  const branch = inMemoryDb.restaurant_branches.find((b) => b.restaurant_id === restaurantId && b.is_active);
  if (branch) {
    if (mainBranchName) branch.name = mainBranchName;
    if (mainBranchPhone || phone) branch.phone = mainBranchPhone || phone;
    if (address) branch.address = address;
  }

  // In-memory subscription update
  if (subscriptionPlan) {
    let sub = inMemoryDb.subscriptions.find((s) => s.restaurant_id === restaurantId);
    if (!sub) {
      sub = { restaurant_id: restaurantId, id: `sub-${restaurantId}` };
      inMemoryDb.subscriptions.push(sub);
    }
    sub.plan_name = subscriptionPlan.toLowerCase();
    sub.amount = subscriptionPlan.toLowerCase().includes('enterprise') ? 4999 : subscriptionPlan.toLowerCase().includes('starter') ? 999 : 1999;
  }

  const updatedDetail = await getPlatformRestaurantDetail(restaurantId);
  return { success: true, restaurant: updatedDetail };
}

/**
 * Updates an onboarding checklist step and recalculates completion.
 */
export async function updateOnboardingStep(
  restaurantId: string,
  stepKey: string,
  stepStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY'
): Promise<OnboardingChecklist> {
  const columnMap: Record<string, string> = {
    businessDetails: 'business_details_status',
    menu: 'menu_status',
    businessHours: 'business_hours_status',
    tablesQr: 'tables_qr_status',
    payments: 'payments_status',
    printer: 'printer_status',
    delivery: 'delivery_status',
  };

  const colName = columnMap[stepKey];
  if (colName && isPostgresRunning()) {
    try {
      await query(
        `UPDATE restaurant_onboarding 
         SET ${colName} = $1, updated_at = NOW() 
         WHERE restaurant_id = $2`,
        [stepStatus, restaurantId]
      );

      // Recalculate completed steps count
      const updated = await query(`SELECT * FROM restaurant_onboarding WHERE restaurant_id = $1`, [restaurantId]);
      if (updated.rows.length > 0) {
        const row = updated.rows[0];
        const steps = [
          row.business_details_status,
          row.menu_status,
          row.business_hours_status,
          row.tables_qr_status,
          row.payments_status,
          row.printer_status,
          row.delivery_status,
        ];
        const completed = steps.filter((s) => s === 'READY').length;
        const overall = completed >= 5 ? 'READY' : completed > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';

        await query(
          `UPDATE restaurant_onboarding 
           SET completed_steps = $1, overall_status = $2 
           WHERE restaurant_id = $3`,
          [completed, overall, restaurantId]
        );
      }
    } catch (err: any) {
      console.error('[OnboardingService] Error updating onboarding step in PG:', err.message);
    }
  }

  // Fallback in-memory
  const onboard = (inMemoryDb.restaurant_onboarding || []).find((o) => o.restaurant_id === restaurantId);
  if (onboard && colName) {
    onboard[colName] = stepStatus;
    const steps = [
      onboard.business_details_status,
      onboard.menu_status,
      onboard.business_hours_status,
      onboard.tables_qr_status,
      onboard.payments_status,
      onboard.printer_status,
      onboard.delivery_status,
    ];
    onboard.completed_steps = steps.filter((s) => s === 'READY').length;
    onboard.overall_status = onboard.completed_steps >= 5 ? 'READY' : 'IN_PROGRESS';
    onboard.updated_at = new Date().toISOString();
  }

  const detail = await getPlatformRestaurantDetail(restaurantId);
  return detail!.onboarding;
}
