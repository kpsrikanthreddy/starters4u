import { query, inMemoryDb, isPostgresRunning } from '../db.js';

export interface ServiceabilityResult {
  isServiceable: boolean;
  distanceKm?: number;
  maxRadiusKm: number;
  deliveryFee: number;
  minimumOrder: number;
  freeDeliveryThreshold: number;
  estimatedMinutes?: number;
  error?: string;
  reason?: string;
  branchId?: string;
  branchName?: string;
  canTakeaway: boolean;
}

export interface ChannelSettings {
  isDeliveryEnabled: boolean;
  isTakeawayEnabled: boolean;
  isDineInEnabled: boolean;
  isCounterEnabled: boolean;
  deliveryRadiusKm: number;
  minimumOrder: number;
  baseDeliveryFee: number;
  freeDeliveryThreshold: number;
  branchLatitude?: number | null;
  branchLongitude?: number | null;
  branchName?: string;
  branchId?: string;
}

/**
 * Calculates Haversine spherical distance between two coordinates in kilometers.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export const calculateHaversineDistance = calculateDistanceKm;

/**
 * Retrieves authoritative service mode and delivery rules for a restaurant and branch.
 */
export async function getChannelSettings(
  restaurantId: string,
  branchId?: string
): Promise<ChannelSettings> {
  const defaults: ChannelSettings = {
    isDeliveryEnabled: true,
    isTakeawayEnabled: true,
    isDineInEnabled: true,
    isCounterEnabled: true,
    deliveryRadiusKm: 10.0,
    minimumOrder: 0.0,
    baseDeliveryFee: 35.0,
    freeDeliveryThreshold: 299.0,
  };

  if (isPostgresRunning()) {
    try {
      // 1. Fetch Restaurant Settings
      const settRes = await query(
        `SELECT is_delivery_enabled, is_takeaway_enabled, is_dine_in_enabled, is_counter_enabled,
                delivery_radius_km, minimum_order, base_delivery_fee, free_delivery_threshold, default_branch_id
         FROM restaurant_settings WHERE restaurant_id = $1 LIMIT 1`,
        [restaurantId]
      );
      const sett = settRes.rows[0];

      // 2. Fetch Branch Settings
      const targetBranchId = branchId || sett?.default_branch_id;
      let branchQuery = `SELECT id, name, latitude, longitude, delivery_radius_km, minimum_order, base_delivery_fee,
                                free_delivery_threshold, is_delivery_enabled, is_takeaway_enabled, is_dine_in_enabled
                         FROM restaurant_branches WHERE restaurant_id = $1`;
      const branchParams: any[] = [restaurantId];
      if (targetBranchId) {
        branchQuery += ` AND id = $2`;
        branchParams.push(targetBranchId);
      } else {
        branchQuery += ` ORDER BY created_at ASC LIMIT 1`;
      }
      const branchRes = await query(branchQuery, branchParams);
      const branch = branchRes.rows[0];

      const deliveryEnabled =
        sett?.is_delivery_enabled !== false && branch?.is_delivery_enabled !== false;
      const takeawayEnabled =
        sett?.is_takeaway_enabled !== false && branch?.is_takeaway_enabled !== false;
      const dineInEnabled =
        sett?.is_dine_in_enabled !== false && branch?.is_dine_in_enabled !== false;
      const counterEnabled = sett?.is_counter_enabled !== false;

      const radius = Number(
        branch?.delivery_radius_km ?? sett?.delivery_radius_km ?? defaults.deliveryRadiusKm
      );
      const minOrder = Number(
        branch?.minimum_order ?? sett?.minimum_order ?? defaults.minimumOrder
      );
      const baseFee = Number(
        branch?.base_delivery_fee ?? sett?.base_delivery_fee ?? defaults.baseDeliveryFee
      );
      const freeThreshold = Number(
        branch?.free_delivery_threshold ?? sett?.free_delivery_threshold ?? defaults.freeDeliveryThreshold
      );

      return {
        isDeliveryEnabled: deliveryEnabled,
        isTakeawayEnabled: takeawayEnabled,
        isDineInEnabled: dineInEnabled,
        isCounterEnabled: counterEnabled,
        deliveryRadiusKm: radius,
        minimumOrder: minOrder,
        baseDeliveryFee: baseFee,
        freeDeliveryThreshold: freeThreshold,
        branchLatitude: branch?.latitude ? Number(branch.latitude) : null,
        branchLongitude: branch?.longitude ? Number(branch.longitude) : null,
        branchName: branch?.name,
        branchId: branch?.id,
      };
    } catch (err: any) {
      console.error('[ChannelService] Error fetching PG channel settings:', err.message);
    }
  }

  // Fallback to in-memory store
  const memSett = inMemoryDb.restaurant_settings?.find((s: any) => s.restaurant_id === restaurantId);
  const memBranch = inMemoryDb.restaurant_branches.find(
    (b: any) => b.restaurant_id === restaurantId && (!branchId || b.id === branchId)
  );

  return {
    isDeliveryEnabled: memSett?.is_delivery_enabled !== false && memBranch?.is_delivery_enabled !== false,
    isTakeawayEnabled: memSett?.is_takeaway_enabled !== false && memBranch?.is_takeaway_enabled !== false,
    isDineInEnabled: memSett?.is_dine_in_enabled !== false && memBranch?.is_dine_in_enabled !== false,
    isCounterEnabled: memSett?.is_counter_enabled !== false,
    deliveryRadiusKm: Number(memBranch?.delivery_radius_km ?? memSett?.delivery_radius_km ?? defaults.deliveryRadiusKm),
    minimumOrder: Number(memBranch?.minimum_order ?? memSett?.minimum_order ?? defaults.minimumOrder),
    baseDeliveryFee: Number(memBranch?.base_delivery_fee ?? memSett?.base_delivery_fee ?? defaults.baseDeliveryFee),
    freeDeliveryThreshold: Number(memBranch?.free_delivery_threshold ?? memSett?.free_delivery_threshold ?? defaults.freeDeliveryThreshold),
    branchLatitude: memBranch?.latitude ? Number(memBranch.latitude) : null,
    branchLongitude: memBranch?.longitude ? Number(memBranch.longitude) : null,
    branchName: memBranch?.name,
    branchId: memBranch?.id,
  };
}

/**
 * Validates that the requested order channel is active for this restaurant tenant.
 */
export async function validateServiceMode(
  restaurantId: string,
  branchId: string | undefined,
  orderType: 'dine_in' | 'counter' | 'takeaway' | 'delivery'
): Promise<void> {
  const settings = await getChannelSettings(restaurantId, branchId);

  switch (orderType) {
    case 'dine_in':
      if (!settings.isDineInEnabled) {
        throw new Error('Dine-In ordering is currently disabled for this restaurant.');
      }
      break;
    case 'counter':
      if (!settings.isCounterEnabled) {
        throw new Error('Counter POS ordering is currently disabled for this restaurant.');
      }
      break;
    case 'takeaway':
      if (!settings.isTakeawayEnabled) {
        throw new Error('Takeaway ordering is currently disabled for this restaurant.');
      }
      break;
    case 'delivery':
      if (!settings.isDeliveryEnabled) {
        throw new Error('Delivery ordering is not currently enabled for this restaurant.');
      }
      break;
  }
}

/**
 * Checks server-side delivery serviceability for a customer's location and order subtotal.
 */
export async function checkDeliveryServiceability(
  restaurantId: string,
  branchId: string | undefined,
  customerCoords: { latitude?: number | null; longitude?: number | null } | undefined,
  subtotal: number = 0
): Promise<ServiceabilityResult> {
  const settings = await getChannelSettings(restaurantId, branchId);

  // If delivery is disabled by merchant
  if (!settings.isDeliveryEnabled) {
    const msg = 'Sorry, this restaurant currently does not offer delivery service.';
    return {
      isServiceable: false,
      maxRadiusKm: settings.deliveryRadiusKm,
      deliveryFee: settings.baseDeliveryFee,
      minimumOrder: settings.minimumOrder,
      freeDeliveryThreshold: settings.freeDeliveryThreshold,
      error: msg,
      reason: msg,
      branchId: settings.branchId,
      branchName: settings.branchName,
      canTakeaway: settings.isTakeawayEnabled,
    };
  }

  // Calculate distance if both customer and branch coordinates are available
  let distanceKm: number | undefined;
  if (
    typeof customerCoords?.latitude === 'number' &&
    !isNaN(customerCoords.latitude) &&
    typeof customerCoords?.longitude === 'number' &&
    !isNaN(customerCoords.longitude) &&
    typeof settings.branchLatitude === 'number' &&
    typeof settings.branchLongitude === 'number'
  ) {
    distanceKm = calculateDistanceKm(
      customerCoords.latitude,
      customerCoords.longitude,
      settings.branchLatitude,
      settings.branchLongitude
    );

    if (distanceKm > settings.deliveryRadiusKm) {
      const msg = `Delivery distance (${distanceKm.toFixed(1)} km) exceeds maximum delivery radius (${settings.deliveryRadiusKm} km).`;
      return {
        isServiceable: false,
        distanceKm,
        maxRadiusKm: settings.deliveryRadiusKm,
        deliveryFee: settings.baseDeliveryFee,
        minimumOrder: settings.minimumOrder,
        freeDeliveryThreshold: settings.freeDeliveryThreshold,
        error: msg,
        reason: msg,
        branchId: settings.branchId,
        branchName: settings.branchName,
        canTakeaway: settings.isTakeawayEnabled,
      };
    }
  }

  // Check minimum order requirement
  if (settings.minimumOrder > 0 && subtotal > 0 && subtotal < settings.minimumOrder) {
    const msg = `Minimum order amount for delivery is ₹${settings.minimumOrder}. Current order is ₹${subtotal}.`;
    return {
      isServiceable: false,
      distanceKm,
      maxRadiusKm: settings.deliveryRadiusKm,
      deliveryFee: settings.baseDeliveryFee,
      minimumOrder: settings.minimumOrder,
      freeDeliveryThreshold: settings.freeDeliveryThreshold,
      error: msg,
      reason: msg,
      branchId: settings.branchId,
      branchName: settings.branchName,
      canTakeaway: settings.isTakeawayEnabled,
    };
  }

  // Calculate dynamic delivery fee (Free above threshold)
  const computedFee =
    settings.freeDeliveryThreshold > 0 && subtotal >= settings.freeDeliveryThreshold
      ? 0
      : settings.baseDeliveryFee;

  return {
    isServiceable: true,
    distanceKm,
    maxRadiusKm: settings.deliveryRadiusKm,
    deliveryFee: computedFee,
    minimumOrder: settings.minimumOrder,
    freeDeliveryThreshold: settings.freeDeliveryThreshold,
    estimatedMinutes: Math.max(25, Math.round(20 + (distanceKm || 2) * 3)),
    branchId: settings.branchId,
    branchName: settings.branchName,
    canTakeaway: settings.isTakeawayEnabled,
  };
}

/**
 * Resolves a human-readable, tenant-prefixed order number.
 * Example: MOZZ-1042 or LOLLY-1001 or REST-1001.
 */
export async function generateTenantOrderNumber(
  restaurantId: string
): Promise<string> {
  let prefix = 'MOZZ';
  let slug = '';

  if (isPostgresRunning()) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId);
      if (isUuid) {
        const res = await query(`SELECT slug, name FROM restaurants WHERE id = $1 LIMIT 1`, [restaurantId]);
        if (res.rows.length > 0) {
          slug = res.rows[0].slug || '';
        }
      }
    } catch {}
  }

  if (!slug) {
    const rest = inMemoryDb.restaurants.find((r: any) => r.id === restaurantId);
    slug = rest?.slug || '';
  }

  if (slug) {
    if (slug === 'mozz') {
      prefix = 'MOZZ';
    } else if (slug.includes('waffle')) {
      prefix = 'LOLLY';
    } else if (slug.startsWith('test')) {
      prefix = 'TEST';
    } else {
      const firstPart = slug.split('-')[0];
      prefix = firstPart.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
      if (!prefix) prefix = 'REST';
    }
  }

  // Concurrency-safe atomic counter generation
  const searchPattern = `${prefix}-%`;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId);

  if (isPostgresRunning() && isUuid) {
    try {
      const counterRes = await query(
        `INSERT INTO restaurant_order_counters (restaurant_id, last_seq, prefix, updated_at)
         VALUES (
           $1,
           COALESCE((
             SELECT MAX(CAST(SUBSTRING(order_number FROM '[0-9]+$') AS INTEGER))
             FROM orders
             WHERE restaurant_id = $1 AND order_number LIKE $2
           ), 1000) + 1,
           $3,
           NOW()
         )
         ON CONFLICT (restaurant_id) DO UPDATE
         SET last_seq = restaurant_order_counters.last_seq + 1, prefix = $3, updated_at = NOW()
         RETURNING last_seq;`,
        [restaurantId, searchPattern, prefix]
      );
      if (counterRes.rows.length > 0 && counterRes.rows[0].last_seq) {
        return `${prefix}-${counterRes.rows[0].last_seq}`;
      }
    } catch {
      // Fallback to table scan if counter table error
    }
  }

  // Query highest order number for this restaurant prefix (Fallback / In-Memory)
  let nextSeq = 1001;

  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT order_number FROM orders WHERE restaurant_id = $1 AND order_number LIKE $2 ORDER BY created_at DESC LIMIT 50`,
        [restaurantId, searchPattern]
      );
      for (const row of res.rows) {
        const parts = row.order_number.split('-');
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num >= nextSeq) {
          nextSeq = num + 1;
        }
      }
    } catch {}
  } else {
    for (const ord of inMemoryDb.orders) {
      if (ord.restaurant_id === restaurantId && ord.order_number?.startsWith(`${prefix}-`)) {
        const parts = ord.order_number.split('-');
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num >= nextSeq) {
          nextSeq = num + 1;
        }
      }
    }
  }

  return `${prefix}-${nextSeq}`;
}

/**
 * Formats channel-specific KOT display details and stations.
 */
export function formatKotStationDetails(
  orderType: 'dine_in' | 'counter' | 'takeaway' | 'delivery',
  tableNumber?: string | null,
  counterToken?: string | null,
  deliveryAddress?: string | null,
  hasPizza: boolean = false,
  hasChinese: boolean = false
): {
  station: string;
  channelBadge: string;
  channelHeading: string;
} {
  const station =
    hasPizza && hasChinese
      ? 'All Stations'
      : hasPizza
      ? 'Pizza Oven Station'
      : hasChinese
      ? 'Chinese Wok Station'
      : 'Main Kitchen';

  let channelBadge = 'DINE-IN';
  let channelHeading = `Table ${tableNumber || '1'}`;

  switch (orderType) {
    case 'dine_in':
      channelBadge = 'DINE-IN';
      channelHeading = `Table ${tableNumber ? String(tableNumber).replace(/^Table\s*/i, '') : '1'}`;
      break;
    case 'counter':
      channelBadge = 'COUNTER';
      channelHeading = `Counter #${counterToken || 'Walk-in'}`;
      break;
    case 'takeaway':
      channelBadge = 'TAKEAWAY';
      channelHeading = 'Takeaway / In-Store Pickup';
      break;
    case 'delivery':
      channelBadge = 'DELIVERY';
      channelHeading = `Delivery: ${deliveryAddress ? deliveryAddress.slice(0, 35) : 'Online Web'}`;
      break;
  }

  return {
    station,
    channelBadge,
    channelHeading,
  };
}
