import crypto from 'crypto';
import { query, getClient, inMemoryDb, isPostgresRunning } from '../db.js';
import { Order, OrderStatus, OrderType, EntrySource, PaymentMethod, CartItem, CustomerDetails, CustomerLocationSource } from '../../src/types.js';
import { findOrCreateCustomer } from './customerService.js';
import { validateSignedToken } from './qrService.js';
import { createPrintJobsForOrder } from './printService.js';
import {
  validateServiceMode,
  checkDeliveryServiceability,
  generateTenantOrderNumber,
  formatKotStationDetails,
} from './channelService.js';
import {
  calculateItemLinePricing,
  calculateOrderPaymentSummary,
} from './deliveryPricingEngine.js';
import type { PriceSnapshot } from './deliveryPricingEngine.js';
import { paymentLedgerService } from '../payments/paymentLedgerService.js';
import { getRestaurantPaymentSettings } from './tenantService.js';
import {
  scheduleOrderFeedback,
  getFeedbackRequestForOrder,
  getFeedbackRequestsForOrders,
} from './feedbackService.js';

const DEFAULT_RESTAURANT_ID = 'a0000000-0000-0000-0000-000000000001';
const DEFAULT_BRANCH_ID = 'b0000000-0000-0000-0000-000000000001';

// Sequential, collision-safe Order Number per Restaurant Tenant
async function generateOrderNumber(restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<string> {
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT order_number FROM orders WHERE restaurant_id = $1 AND order_number LIKE 'MOZZ-%' ORDER BY created_at DESC LIMIT 100`,
        [restaurantId]
      );
      let maxNum = 8900;
      for (const row of res.rows) {
        const numPart = parseInt((row.order_number || '').replace('MOZZ-', ''), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
      return `MOZZ-${maxNum + 1}`;
    } catch {
      // Fallback
    }
  }
  const inMemOrders = inMemoryDb.orders.filter((o) => o.restaurant_id === restaurantId);
  let maxNum = 8900;
  for (const row of inMemOrders) {
    if (row.order_number && typeof row.order_number === 'string') {
      const numPart = parseInt(row.order_number.replace('MOZZ-', ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  }
  return `MOZZ-${maxNum + 1}`;
}

export interface CreateOrderPayload {
  restaurantId?: string;
  branchId?: string;
  orderType: OrderType;
  entrySource?: EntrySource;
  tableNumber?: string;
  tableId?: string;
  qrToken?: string;
  qrSession?: any;
  customer: CustomerDetails;
  customerLatitude?: number;
  customerLongitude?: number;
  customerLocationAccuracy?: number;
  customerLocationCapturedAt?: string;
  customerLocationSource?: CustomerLocationSource;
  items: CartItem[];
  paymentMethod: PaymentMethod;
  paymentStatus?: 'pending' | 'paid' | 'cod_pending' | 'failed';
  paymentId?: string;
  couponCode?: string;
  discount?: number;
  deliveryFee?: number;
  specialInstructions?: string;
}

// Map Database Order Row + Items + History to frontend Order model
export async function assembleOrderObject(
  orderRow: any,
  itemsRows: any[] = [],
  historyRows: any[] = [],
  customerRow?: any,
  feedbackRecord?: any
): Promise<Order> {
  const rawCust = customerRow || orderRow.customer_snapshot || {};
  const latRaw = orderRow.customer_latitude ?? orderRow.customer_snapshot?.latitude ?? customerRow?.latitude ?? customerRow?.cust_latitude;
  const lngRaw = orderRow.customer_longitude ?? orderRow.customer_snapshot?.longitude ?? customerRow?.longitude ?? customerRow?.cust_longitude;
  const lat = latRaw !== undefined && latRaw !== null && !isNaN(Number(latRaw)) ? Number(latRaw) : undefined;
  const lng = lngRaw !== undefined && lngRaw !== null && !isNaN(Number(lngRaw)) ? Number(lngRaw) : undefined;

  const accuracyRaw = orderRow.customer_location_accuracy ?? orderRow.customer_snapshot?.accuracy ?? customerRow?.accuracy;
  const capturedAtRaw = orderRow.customer_location_captured_at ?? orderRow.customer_snapshot?.locationCapturedAt ?? customerRow?.location_captured_at;
  const sourceRaw = orderRow.customer_location_source ?? orderRow.customer_snapshot?.locationSource ?? customerRow?.location_source;
  const accuracy = accuracyRaw !== undefined && accuracyRaw !== null && !isNaN(Number(accuracyRaw)) ? Number(accuracyRaw) : undefined;
  const locationCapturedAt = capturedAtRaw ? new Date(capturedAtRaw).toISOString() : undefined;
  const locationSource = sourceRaw || undefined;

  const customer: CustomerDetails = {
    name: customerRow?.name || customerRow?.cust_name || orderRow.customer_snapshot?.name || 'Guest',
    phone: customerRow?.phone || customerRow?.cust_phone || orderRow.customer_snapshot?.phone || '',
    email: customerRow?.email || customerRow?.cust_email || orderRow.customer_snapshot?.email || undefined,
    address: customerRow?.address || customerRow?.cust_address || orderRow.customer_snapshot?.address || undefined,
    landmark: customerRow?.landmark || customerRow?.cust_landmark || orderRow.customer_snapshot?.landmark || undefined,
    tableNumber: orderRow.table_number || orderRow.customer_snapshot?.tableNumber || undefined,
    notes: customerRow?.notes || orderRow.customer_snapshot?.notes || undefined,
    latitude: lat,
    longitude: lng,
    accuracy,
    locationCapturedAt,
    locationSource,
  };

  const items: CartItem[] = itemsRows.map((it) => {
    const unitPrice = Number(it.unit_price);
    const quantity = Number(it.quantity || 1);
    const baseUnitPrice = Number(it.base_unit_price ?? unitPrice);
    const platformMarkupUnit = Number(it.platform_markup_unit ?? 0);
    const baseUnitPricePaise = Number(it.base_unit_price_paise ?? Math.round(baseUnitPrice * 100));
    const platformMarkupUnitPaise = Number(it.platform_markup_unit_paise ?? Math.round(platformMarkupUnit * 100));
    const customerUnitPricePaise = Number(it.customer_unit_price_paise ?? Math.round(unitPrice * 100));
    const baseLineTotalPaise = Number(it.base_line_total_paise ?? baseUnitPricePaise * quantity);
    const platformMarkupLineTotalPaise = Number(it.platform_markup_line_total_paise ?? platformMarkupUnitPaise * quantity);
    const customerLineTotalPaise = Number(it.customer_line_total_paise ?? customerUnitPricePaise * quantity);

    return {
      cartItemId: it.id || `ci-${Math.random().toString(36).slice(2, 7)}`,
      menuItem: {
        id: it.menu_item_id || it.id,
        itemCode: it.item_code || undefined,
        name: it.item_name || 'Item',
        category: it.category || 'pocket_pizza_veg',
        dietary: it.dietary_type || 'veg',
        description: it.description || '',
        inStock: true,
        price: unitPrice,
        isPocketPizza: Boolean(it.selected_shape),
      },
      selectedShape: it.selected_shape || undefined,
      selectedCrust: it.selected_crust || undefined,
      spiceLevel: it.spice_level || undefined,
      addons: it.addons || [],
      specialInstructions: it.special_instructions || undefined,
      unitPrice,
      quantity,
      baseUnitPrice,
      platformMarkupUnit,
      customerUnitPrice: unitPrice,
      baseUnitPricePaise,
      platformMarkupUnitPaise,
      customerUnitPricePaise,
      baseLineTotalPaise,
      platformMarkupLineTotalPaise,
      customerLineTotalPaise,
    };
  });

  const statusHistory = (historyRows || []).map((h) => ({
    status: h.status as OrderStatus,
    timestamp: h.created_at ? new Date(h.created_at).toISOString() : new Date().toISOString(),
    note: h.note || '',
  }));

  if (statusHistory.length === 0) {
    statusHistory.push({
      status: orderRow.status as OrderStatus,
      timestamp: orderRow.created_at ? new Date(orderRow.created_at).toISOString() : new Date().toISOString(),
      note: 'Order registered',
    });
  }

  let snapTableId: string | undefined;
  if (orderRow.customer_snapshot) {
    try {
      const snap = typeof orderRow.customer_snapshot === 'string' ? JSON.parse(orderRow.customer_snapshot) : orderRow.customer_snapshot;
      snapTableId = snap?.tableId;
    } catch {}
  }

  const orderObj: Order = {
    id: orderRow.id,
    restaurantId: orderRow.restaurant_id,
    branchId: orderRow.branch_id,
    orderNumber: orderRow.order_number,
    tableNumber: orderRow.table_number || undefined,
    tableId: orderRow.table_id || snapTableId || undefined,
    createdAt: orderRow.created_at ? new Date(orderRow.created_at).toISOString() : new Date().toISOString(),
    items,
    orderType: orderRow.order_type as OrderType,
    entrySource: orderRow.entry_source as EntrySource,
    qrSession: orderRow.entry_source === 'table_qr'
      ? {
          source: 'table_qr',
          orderMode: 'dine_in',
          tableNumber: orderRow.table_number || 'Table 1',
          isVerified: true,
          isModeLocked: true,
        }
      : orderRow.entry_source === 'counter_qr'
      ? {
          source: 'counter_qr',
          orderMode: 'takeaway',
          isVerified: true,
          isModeLocked: true,
        }
      : undefined,
    customer,
    status: orderRow.status as OrderStatus,
    paymentMethod: orderRow.payment_method as PaymentMethod,
    paymentStatus: orderRow.payment_status as any,
    paymentId: orderRow.payment_id || undefined,
    itemTotal: Number(orderRow.item_total),
    tax: Number(orderRow.tax),
    deliveryFee: Number(orderRow.delivery_fee || 0),
    discount: Number(orderRow.discount || 0),
    couponCode: orderRow.coupon_code || undefined,
    grandTotal: Number(orderRow.grand_total),
    restaurantSubtotal: Number(orderRow.restaurant_subtotal ?? orderRow.item_total ?? 0),
    platformMarkupTotal: Number(orderRow.platform_markup_total ?? 0),
    customerItemsTotal: Number(orderRow.customer_items_total ?? orderRow.item_total ?? 0),
    restaurantShare: Number(orderRow.restaurant_share ?? orderRow.grand_total ?? 0),
    platformShare: Number(orderRow.platform_share ?? 0),
    settlementStatus: orderRow.settlement_status || (orderRow.order_type === 'delivery' ? 'PENDING' : 'NOT_APPLICABLE'),
    estimatedDeliveryTimeMinutes: Number(orderRow.estimated_delivery_time_minutes || 25),
    kotNumber: orderRow.kot_number || undefined,
    kotStation: orderRow.kot_station || undefined,
    waiterName: orderRow.waiter_name || undefined,
    kotPrintCount: Number(orderRow.kot_print_count || 0),
    receiptPrintCount: Number(orderRow.receipt_print_count || 0),
    driverDetails: orderRow.driver_name
      ? {
          name: orderRow.driver_name,
          phone: orderRow.driver_phone || '',
          vehicleNumber: orderRow.driver_vehicle || '',
        }
      : undefined,
    customerLatitude: lat,
    customerLongitude: lng,
    customerLocationAccuracy: accuracy,
    customerLocationCapturedAt: locationCapturedAt,
    customerLocationSource: locationSource,
    confirmedAt: (() => {
      let cAt = orderRow.confirmed_at ? new Date(orderRow.confirmed_at).toISOString() : undefined;
      if (!cAt && historyRows && historyRows.length > 0) {
        const confHist = historyRows.find((h: any) => h.status === 'confirmed' || h.status === 'accepted');
        if (confHist && confHist.created_at) {
          cAt = new Date(confHist.created_at).toISOString();
        }
      }
      return cAt;
    })(),
    completedAt: (() => {
      let compAt = orderRow.completed_at ? new Date(orderRow.completed_at).toISOString() : undefined;
      if (!compAt && historyRows && historyRows.length > 0) {
        const compHist = historyRows.find((h: any) => h.status === 'delivered' || h.status === 'completed');
        if (compHist && compHist.created_at) {
          compAt = new Date(compHist.created_at).toISOString();
        }
      }
      return compAt;
    })(),
    feedbackRequest: feedbackRecord
      ? {
          id: feedbackRecord.id,
          status: feedbackRecord.status,
          scheduledAt: feedbackRecord.scheduled_at ? new Date(feedbackRecord.scheduled_at).toISOString() : undefined,
          sentAt: feedbackRecord.sent_at ? new Date(feedbackRecord.sent_at).toISOString() : undefined,
          whatsappMessageId: feedbackRecord.whatsapp_message_id || undefined,
          errorMessage: feedbackRecord.error_message || undefined,
        }
      : undefined,
    statusHistory,
  };

  return orderObj;
}

export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  let restaurantId = payload.restaurantId || DEFAULT_RESTAURANT_ID;
  let branchId = payload.branchId || DEFAULT_BRANCH_ID;
  let orderType = payload.orderType;
  let entrySource: EntrySource = payload.entrySource || 'customer_web';
  let tableNumber: string | undefined = payload.tableNumber || payload.qrSession?.tableNumber;
  let tableId: string | undefined = payload.tableId;
  const qrToken = payload.qrToken || payload.qrSession?.token;

  // 1. Strict Backend QR & Order Type Validation
  if (qrToken) {
    const qrValidation = validateSignedToken(qrToken);
    if (!qrValidation.valid) {
      throw new Error('Invalid or expired table QR.');
    }
    // Prevent cross-restaurant token misuse
    if (payload.restaurantId && qrValidation.restaurantId && payload.restaurantId !== qrValidation.restaurantId) {
      throw new Error('Invalid or expired table QR. Cross-restaurant token usage is forbidden.');
    }
    restaurantId = qrValidation.restaurantId || restaurantId;
    branchId = qrValidation.branchId || branchId;
    tableId = qrValidation.tableId || tableId;
    tableNumber = qrValidation.tableNumber || tableNumber;

    if (qrValidation.source === 'table_qr') {
      orderType = 'dine_in';
      entrySource = 'table_qr';
    } else if (qrValidation.source === 'counter_qr') {
      orderType = 'takeaway';
      entrySource = 'counter_qr';
    }
  } else {
    // Direct Online Web / Manual entries (DO NOT TRUST RAW QUERY PARAMS AS TABLE_QR!)
    if (orderType === 'dine_in') {
      const isStaffOrPos =
        entrySource === 'pos_counter' ||
        entrySource === 'restaurant_admin' ||
        entrySource === 'staff_app' ||
        payload.entrySource === 'pos_counter' ||
        payload.entrySource === 'restaurant_admin' ||
        payload.entrySource === 'staff_app';

      if (!isStaffOrPos) {
        throw new Error('Dine-In orders are only permitted through a verified Table QR scan. Please scan the QR code on your dining table.');
      }
      entrySource = 'pos_counter';
    } else if (orderType === 'counter') {
      entrySource = 'pos_counter';
    } else if (orderType === 'takeaway') {
      entrySource = payload.entrySource || 'customer_web';
    } else if (orderType === 'delivery') {
      entrySource = payload.entrySource || 'customer_web';
    }
  }

  // 1a. Authoritative Table UUID Resolution for Dine-In Orders
  // Human-readable table number is display data; restaurant_tables.id UUID is authoritative relationship.
  if (orderType === 'dine_in') {
    const rawNum = tableNumber ? tableNumber.replace(/^Table\s*/i, '').trim() : '1';
    let resolvedTable: any = null;

    if (isPostgresRunning()) {
      try {
        if (tableId) {
          const tRes = await query(
            `SELECT id, table_number, table_name, branch_id, is_active FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2 LIMIT 1`,
            [tableId, restaurantId]
          );
          if (tRes.rows.length > 0) resolvedTable = tRes.rows[0];
        }
        if (!resolvedTable && rawNum) {
          const tRes = await query(
            `SELECT id, table_number, table_name, branch_id, is_active FROM restaurant_tables WHERE restaurant_id = $1 AND table_number = $2 LIMIT 1`,
            [restaurantId, rawNum]
          );
          if (tRes.rows.length > 0) resolvedTable = tRes.rows[0];
        }
      } catch (err: any) {
        console.warn('[OrderService] Table resolution error in PG:', err.message);
      }
    }

    if (!resolvedTable) {
      resolvedTable = (inMemoryDb.restaurant_tables || []).find(
        (t) =>
          t.restaurant_id === restaurantId &&
          (t.id === tableId || String(t.table_number) === rawNum)
      );
    }

    if (!resolvedTable) {
      throw new Error(`Dine-In table is invalid or does not belong to this restaurant.`);
    }

    if (resolvedTable.is_active === false) {
      throw new Error(`Table ${resolvedTable.table_number} is currently inactive and cannot accept Dine-In orders.`);
    }

    tableId = resolvedTable.id;
    tableNumber = `Table ${resolvedTable.table_number}`;
    if (resolvedTable.branch_id && !branchId) {
      branchId = resolvedTable.branch_id;
    }
  }

  // 1a. Supported order types
  const validOrderTypes: OrderType[] = ['dine_in', 'counter', 'takeaway', 'delivery'];
  if (!validOrderTypes.includes(orderType)) {
    throw new Error(`Invalid orderType "${orderType}". Supported values are: ${validOrderTypes.join(', ')}.`);
  }

  if (!payload.items || payload.items.length === 0) {
    throw new Error('Cannot create order with an empty cart.');
  }

  // 1b. Verify restaurant is active and not suspended or archived
  if (isPostgresRunning()) {
    const isRestUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId);
    if (isRestUuid) {
      const restCheck = await query(`SELECT status FROM restaurants WHERE id = $1 LIMIT 1`, [restaurantId]);
      if (restCheck.rows.length > 0) {
        const s = restCheck.rows[0].status;
        if (s === 'suspended' || s === 'archived' || s === 'inactive') {
          throw new Error(`This restaurant is currently ${s} and not accepting new orders.`);
        }
      }
    }
  } else {
    const rest = inMemoryDb.restaurants.find((r) => r.id === restaurantId);
    if (rest && (rest.status === 'suspended' || rest.status === 'archived' || rest.status === 'inactive')) {
      throw new Error(`This restaurant is currently ${rest.status} and not accepting new orders.`);
    }
  }

  // 1c. Validate channel service mode enablement
  await validateServiceMode(restaurantId, branchId, orderType);

  // 1d. Strict Cart Item Tenant Isolation: verify all items belong to this restaurant
  for (const it of payload.items) {
    const menuItemId = it.menuItem?.id || (it as any).id;
    if (menuItemId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(menuItemId);
      if (isPostgresRunning() && isUuid) {
        const itemCheck = await query(`SELECT restaurant_id FROM menu_items WHERE id = $1 LIMIT 1`, [menuItemId]);
        if (itemCheck.rows.length > 0 && itemCheck.rows[0].restaurant_id !== restaurantId) {
          throw new Error('Cart contains items from another restaurant. Cross-restaurant orders are not permitted.');
        }
      } else {
        const item = inMemoryDb.menu_items.find((m) => m.id === menuItemId);
        if (item && item.restaurant_id && item.restaurant_id !== restaurantId) {
          throw new Error('Cart contains items from another restaurant. Cross-restaurant orders are not permitted.');
        }
      }
    }
  }

  // 2. Authoritative Server-Side Pricing & Item Snapshots (Phase 6)
  const itemSnapshots: PriceSnapshot[] = [];
  const processedItems: Array<{
    item: any;
    resolvedMenuItemUuid: string | null;
    itemName: string;
    shapeCode: 'R' | 'C' | 'S' | null;
    pricing: PriceSnapshot;
  }> = [];

  for (const it of payload.items) {
    let resolvedMenuItemUuid: string | null = null;
    let baseItemPrice = 0;
    let itemName = it.menuItem?.name || (it as any).name || 'Item';
    const rawItemId = it.menuItem?.id || (it as any).id || it.menuItem?.itemCode;

    // Fetch authoritative base price from DB or in-memory
    if (rawItemId) {
      if (isPostgresRunning()) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawItemId);
        let itemRow: any = null;
        if (isUuid) {
          const res = await query(`SELECT id, name, price, price_r, price_c, price_s FROM menu_items WHERE id = $1 LIMIT 1`, [rawItemId]);
          if (res.rows.length > 0) itemRow = res.rows[0];
        } else {
          const res = await query(`SELECT id, name, price, price_r, price_c, price_s FROM menu_items WHERE (item_code = $1 OR id::text = $1) AND restaurant_id = $2 LIMIT 1`, [rawItemId, restaurantId]);
          if (res.rows.length > 0) itemRow = res.rows[0];
        }
        if (itemRow) {
          resolvedMenuItemUuid = itemRow.id;
          itemName = itemRow.name;
          const rawShape = (it.selectedShape || '').toUpperCase();
          if (rawShape === 'R' || rawShape === 'RECTANGLE') {
            baseItemPrice = Number(itemRow.price_r || itemRow.price || 149);
          } else if (rawShape === 'C' || rawShape === 'CIRCLE') {
            baseItemPrice = Number(itemRow.price_c || itemRow.price || 179);
          } else if (rawShape === 'S' || rawShape === 'SQUARE') {
            baseItemPrice = Number(itemRow.price_s || itemRow.price || 199);
          } else {
            baseItemPrice = Number(itemRow.price || 0);
          }
        }
      } else {
        const memItem = inMemoryDb.menu_items.find((m) => m.id === rawItemId || (m as any).item_code === rawItemId);
        if (memItem) {
          resolvedMenuItemUuid = memItem.id;
          itemName = memItem.name;
          const rawShape = (it.selectedShape || '').toUpperCase();
          const prices = (memItem as any).prices || {};
          if (rawShape === 'R' || rawShape === 'RECTANGLE') {
            baseItemPrice = Number((memItem as any).price_r || prices.R || memItem.price || 149);
          } else if (rawShape === 'C' || rawShape === 'CIRCLE') {
            baseItemPrice = Number((memItem as any).price_c || prices.C || memItem.price || 179);
          } else if (rawShape === 'S' || rawShape === 'SQUARE') {
            baseItemPrice = Number((memItem as any).price_s || prices.S || memItem.price || 199);
          } else {
            baseItemPrice = Number(memItem.price || 0);
          }
        }
      }
    }

    if (baseItemPrice <= 0) {
      baseItemPrice = Number(it.baseUnitPrice ?? it.unitPrice ?? (it as any).price ?? it.menuItem?.price ?? 0);
    }

    // Addons price added to base
    let addonsTotal = 0;
    if (Array.isArray(it.addons)) {
      for (const addon of it.addons) {
        addonsTotal += Number(addon.price || 0);
      }
    }
    const finalBaseUnitPrice = baseItemPrice + addonsTotal;
    const qty = Math.max(1, Number(it.quantity || 1));

    const linePricing = calculateItemLinePricing(finalBaseUnitPrice, qty, orderType);
    itemSnapshots.push(linePricing);

    const rawShape = it.selectedShape as any;
    const shapeCode =
      rawShape === 'rectangle'
        ? 'R'
        : rawShape === 'circle'
        ? 'C'
        : rawShape === 'square'
        ? 'S'
        : ['R', 'C', 'S'].includes(rawShape as string)
        ? (rawShape as 'R' | 'C' | 'S')
        : null;

    processedItems.push({
      item: it,
      resolvedMenuItemUuid,
      itemName,
      shapeCode,
      pricing: linePricing,
    });
  }

  const calculatedItemTotal = itemSnapshots.reduce((acc, s) => acc + s.customerLineTotal, 0);

  // Strict GPS & Serviceability Validation for Delivery orders
  let customerLat: number | null = null;
  let customerLng: number | null = null;
  let customerAccuracy: number | null = null;
  let customerCapturedAt: string | null = null;
  let customerSource: CustomerLocationSource | null = null;
  let deliveryFee = 0;

  if (orderType === 'delivery') {
    const rawLat = payload.customerLatitude !== undefined ? payload.customerLatitude : payload.customer?.latitude;
    const rawLng = payload.customerLongitude !== undefined ? payload.customerLongitude : payload.customer?.longitude;
    const hasLat = rawLat !== undefined && rawLat !== null;
    const hasLng = rawLng !== undefined && rawLng !== null;

    if (hasLat || hasLng) {
      const latNum = Number(rawLat);
      const lngNum = Number(rawLng);

      if (!hasLat || isNaN(latNum) || latNum < -90 || latNum > 90) {
        throw new Error('Delivery orders require valid customer delivery GPS latitude (-90 to 90).');
      }
      if (!hasLng || isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        throw new Error('Delivery orders require valid customer delivery GPS longitude (-180 to 180).');
      }

      customerLat = latNum;
      customerLng = lngNum;

      const rawAccuracy = payload.customerLocationAccuracy !== undefined ? payload.customerLocationAccuracy : payload.customer?.accuracy;
      customerAccuracy = rawAccuracy !== undefined && rawAccuracy !== null && !isNaN(Number(rawAccuracy)) ? Number(rawAccuracy) : null;

      const rawCapturedAt = payload.customerLocationCapturedAt || payload.customer?.locationCapturedAt;
      customerCapturedAt = rawCapturedAt ? new Date(rawCapturedAt).toISOString() : new Date().toISOString();

      const rawSource = payload.customerLocationSource || payload.customer?.locationSource;
      const validSources = ['device_gps', 'map_pin', 'saved_address'];
      customerSource = (validSources.includes(rawSource as string) ? rawSource : 'device_gps') as CustomerLocationSource;
    }

    const addr = payload.customer?.address?.trim();
    if (!addr) {
      throw new Error('Delivery orders require a valid delivery address.');
    }

    // Check delivery serviceability & distance calculation
    const serviceability = await checkDeliveryServiceability(
      restaurantId,
      branchId,
      { latitude: customerLat, longitude: customerLng },
      calculatedItemTotal
    );
    if (!serviceability.isServiceable) {
      throw new Error(serviceability.error || 'Sorry, this restaurant currently does not deliver to this location.');
    }
    deliveryFee = payload.deliveryFee !== undefined ? Number(payload.deliveryFee) : serviceability.deliveryFee;
  } else {
    // For Dine-in, Takeaway, and Counter orders, delivery fee is 0 and customer coordinates are null
    customerLat = null;
    customerLng = null;
    customerAccuracy = null;
    customerCapturedAt = null;
    customerSource = null;
    deliveryFee = 0;
  }

  const discount = Math.max(0, Number(payload.discount || 0));
  const taxableAmount = Math.max(0, calculatedItemTotal - discount);
  const tax = Math.round(taxableAmount * 0.05 * 100) / 100;

  const paymentSummary = calculateOrderPaymentSummary({
    orderType,
    itemSnapshots,
    deliveryFee,
    tax,
    discount,
  });
  const grandTotal = paymentSummary.customerPayableTotal;

  // Determine KOT station assignment
  const hasPizza = payload.items.some((i) => i.selectedShape || i.menuItem?.isPocketPizza || i.menuItem?.category?.includes('pizza'));
  const hasChinese = payload.items.some((i) => !i.menuItem?.isPocketPizza && (i.menuItem?.category?.includes('chinese') || i.menuItem?.category?.includes('rice') || i.menuItem?.category?.includes('noodle') || i.menuItem?.category?.includes('momo')));

  const internalOrderId = crypto.randomUUID();
  const orderNumber = await generateTenantOrderNumber(restaurantId);
  const kotDetails = formatKotStationDetails(
    orderType,
    tableNumber,
    orderNumber.replace(/[^0-9]/g, ''),
    payload.customer?.address,
    hasPizza,
    hasChinese
  );
  const kotStation = kotDetails.station;
  const kotNumber = `KOT-${orderNumber.replace(/[^0-9]/g, '') || Math.floor(1000 + Math.random() * 9000)}`;

  const paymentMethod = payload.paymentMethod || 'cash';
  let paymentStatus = payload.paymentStatus || (paymentMethod === 'cod' ? 'cod_pending' : 'pending');

  // CRITICAL SECURITY ENFORCEMENT:
  // If payment is required (online payments like razorpay, upi, direct_upi),
  // NEVER mark order as paid without server-verified payment evidence.
  const isOnlinePaymentRequired = ['razorpay', 'upi', 'direct_upi'].includes(paymentMethod);
  if (isOnlinePaymentRequired && paymentStatus !== 'paid') {
    paymentStatus = 'pending';
  }

  let initialStatus: OrderStatus = orderType === 'counter' && paymentStatus === 'paid' ? 'confirmed' : 'placed';
  if (isOnlinePaymentRequired && paymentStatus !== 'paid' && initialStatus === 'confirmed') {
    initialStatus = 'placed';
  }

  const initialNote = orderType === 'dine_in'
    ? `Dine-In Order placed from ${tableNumber || 'Table'} via Table QR`
    : orderType === 'counter'
    ? `In-store counter billing order placed via POS (${paymentMethod.toUpperCase()})`
    : orderType === 'takeaway'
    ? `Takeaway Order placed for in-store pickup (${paymentMethod.toUpperCase()})`
    : `Delivery Order placed via Online Web (${paymentMethod.toUpperCase()})`;

  // 3. Find or Create Customer (Scoped to Restaurant Tenant)
  const customerRecord = await findOrCreateCustomer(
    {
      ...payload.customer,
      name: payload.customer?.name || (orderType === 'counter' ? 'Counter Customer' : 'Customer'),
      phone: payload.customer?.phone || (orderType === 'counter' ? '+910000000000' : '+919999999999'),
      tableNumber,
    },
    restaurantId
  );

  // Resolve snapshot of current tenant payment destination for immutable auditing
  const tenantPaymentSettings = await getRestaurantPaymentSettings(restaurantId).catch(() => null);
  const merchantUpiSnapshot = tenantPaymentSettings?.merchantUpiId || tenantPaymentSettings?.upiId;
  const merchantNameSnapshot = tenantPaymentSettings?.merchantDisplayName || '';
  const paymentDestinationSnapshot = {
    provider: tenantPaymentSettings?.directUpiProvider || (payload.paymentMethod === 'razorpay' ? 'RAZORPAY' : 'DIRECT_UPI'),
    upiId: merchantUpiSnapshot,
    merchantName: merchantNameSnapshot,
    directUpiEnabled: tenantPaymentSettings?.directUpiEnabled,
    capturedAt: new Date().toISOString(),
  };

  // 4. PostgreSQL Transaction
  const pgClient = await getClient();
  if (pgClient && isPostgresRunning()) {
    try {
      await pgClient.query('BEGIN');

      // Insert Order with UUID primary key and unique human-readable order_number
      const insertOrderSql = `
        INSERT INTO orders (
          id, order_number, restaurant_id, branch_id, customer_id,
          order_type, entry_source, table_number, table_id, status,
          payment_method, payment_status, payment_id,
          item_total, tax, delivery_fee, discount, coupon_code, grand_total,
          restaurant_subtotal, platform_markup_total, customer_items_total,
          restaurant_share, platform_share, settlement_status,
          estimated_delivery_time_minutes, kot_number, kot_station, waiter_name,
          customer_snapshot, customer_latitude, customer_longitude,
          customer_location_accuracy, customer_location_captured_at, customer_location_source,
          confirmed_at,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16, $17, $18, $19,
          $20, $21, $22,
          $23, $24, $25,
          $26, $27, $28, $29,
          $30, $31, $32,
          $33, $34, $35,
          $36,
          NOW(), NOW()
        ) RETURNING *;
      `;

      const isUuid = (val?: string | null) =>
        typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

      const orderValues = [
        internalOrderId,
        orderNumber,
        restaurantId,
        isUuid(branchId) ? branchId : null,
        customerRecord.id,
        orderType,
        entrySource,
        tableNumber || (orderType === 'dine_in' ? 'Table 1' : null),
        isUuid(tableId) ? tableId : null,
        initialStatus,
        paymentMethod,
        paymentStatus,
        payload.paymentId || null,
        paymentSummary.customerItemsTotal,
        tax,
        deliveryFee,
        discount,
        payload.couponCode || null,
        grandTotal,
        paymentSummary.restaurantSubtotal,
        paymentSummary.platformMarkupTotal,
        paymentSummary.customerItemsTotal,
        paymentSummary.restaurantShare,
        paymentSummary.platformShare,
        orderType === 'delivery' ? 'PENDING' : 'NOT_APPLICABLE',
        orderType === 'delivery' ? 30 : 15,
        kotNumber,
        kotStation,
        orderType === 'dine_in' ? 'Ramesh (Captain)' : null,
        JSON.stringify({
          name: customerRecord.name,
          phone: customerRecord.phone,
          email: customerRecord.email,
          address: customerRecord.address,
          landmark: customerRecord.landmark,
          tableNumber,
          tableId,
          latitude: customerLat ?? undefined,
          longitude: customerLng ?? undefined,
          accuracy: customerAccuracy ?? undefined,
          locationCapturedAt: customerCapturedAt ?? undefined,
          locationSource: customerSource ?? undefined,
        }),
        customerLat,
        customerLng,
        customerAccuracy,
        customerCapturedAt,
        customerSource,
        (initialStatus === 'confirmed' || (initialStatus as string) === 'accepted') ? new Date().toISOString() : null,
      ];

      const orderResult = await pgClient.query(insertOrderSql, orderValues);
      const insertedOrder = orderResult.rows[0];

      // Insert Order Items with Foreign Key to menu_items and Price Snapshots
      const itemRows: any[] = [];
      for (const pItem of processedItems) {
        const insertItemSql = `
          INSERT INTO order_items (
            order_id, restaurant_id, menu_item_id, item_name,
            quantity, unit_price, selected_shape, selected_crust,
            spice_level, addons, special_instructions,
            base_unit_price, platform_markup_unit,
            base_unit_price_paise, platform_markup_unit_paise, customer_unit_price_paise,
            base_line_total_paise, platform_markup_line_total_paise, customer_line_total_paise,
            created_at
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11,
            $12, $13,
            $14, $15, $16,
            $17, $18, $19,
            NOW()
          ) RETURNING *;
        `;
        // For ALL NEW orders:
        // base_unit_price_paise = actual menu_items.price converted to paise
        // platform_markup_unit_paise = 0
        // customer_unit_price_paise = base_unit_price_paise
        // unit_price = actual menu_items.price
        const baseUnitPricePaise = pItem.pricing.baseUnitPricePaise;
        const platformMarkupUnitPaise = 0;
        const customerUnitPricePaise = baseUnitPricePaise;
        const unitPrice = pItem.pricing.baseUnitPrice;
        const baseUnitPrice = unitPrice;
        const platformMarkupUnit = 0;
        const baseLineTotalPaise = pItem.pricing.baseLineTotalPaise;
        const platformMarkupLineTotalPaise = 0;
        const customerLineTotalPaise = baseLineTotalPaise;

        const itemValues = [
          internalOrderId,
          restaurantId,
          pItem.resolvedMenuItemUuid,
          pItem.itemName,
          pItem.pricing.quantity,
          unitPrice,
          pItem.shapeCode,
          pItem.item.selectedCrust || null,
          pItem.item.spiceLevel || null,
          JSON.stringify(pItem.item.addons || []),
          pItem.item.specialInstructions || null,
          baseUnitPrice,
          platformMarkupUnit,
          baseUnitPricePaise,
          platformMarkupUnitPaise,
          customerUnitPricePaise,
          baseLineTotalPaise,
          platformMarkupLineTotalPaise,
          customerLineTotalPaise,
        ];
        const itemRes = await pgClient.query(insertItemSql, itemValues);
        itemRows.push(itemRes.rows[0]);
      }

      // Insert Initial Status History
      const insertHistorySql = `
        INSERT INTO order_status_history (order_id, restaurant_id, status, note, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING *;
      `;
      const histRes = await pgClient.query(insertHistorySql, [internalOrderId, restaurantId, initialStatus, initialNote]);

      // Insert KOT Record
      const insertKotSql = `
        INSERT INTO kots (restaurant_id, branch_id, order_id, kot_number, station, print_count, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 0, 'active', NOW(), NOW())
        RETURNING *;
      `;
      await pgClient.query(insertKotSql, [restaurantId, branchId, internalOrderId, kotNumber, kotStation]);

      // Insert Payment Record if payment exists
      if (payload.paymentId || payload.paymentMethod === 'razorpay') {
        const insertPaymentSql = `
          INSERT INTO payments (order_id, restaurant_id, provider, provider_order_id, provider_payment_id, amount, currency, payment_method, status, created_at, updated_at)
          VALUES ($1, $2, 'razorpay', $3, $4, $5, 'INR', $6, $7, NOW(), NOW());
        `;
        await pgClient.query(insertPaymentSql, [
          internalOrderId,
          restaurantId,
          payload.paymentId || null,
          payload.paymentId || null,
          grandTotal,
          payload.paymentMethod,
          paymentStatus === 'paid' ? 'captured' : 'created',
        ]);
      }

      await pgClient.query('COMMIT');

      // Record transaction and splits in Phase 6 payment ledger after commit
      await paymentLedgerService.recordTransaction({
        orderId: internalOrderId,
        restaurantId,
        branchId,
        provider: payload.paymentMethod || 'cash',
        providerOrderId: payload.paymentId || undefined,
        providerPaymentId: payload.paymentId || undefined,
        customerPaidAmount: grandTotal,
        restaurantShare: paymentSummary.restaurantShare,
        platformShare: paymentSummary.platformShare,
        paymentStatus: paymentStatus === 'paid' ? 'PAID' : 'PENDING',
        merchantUpiSnapshot,
        merchantNameSnapshot,
        paymentDestinationSnapshot,
      });

      const assembled = await assembleOrderObject(insertedOrder, itemRows, histRes.rows, customerRecord);
      if (assembled.status === 'confirmed' || assembled.paymentStatus === 'paid') {
        await createPrintJobsForOrder(assembled, {
          reason: assembled.paymentStatus === 'paid' ? 'online_paid' : 'confirmed',
        }).catch((err) => console.error('[OrderService] Error triggering print jobs on order creation:', err));
      }
      return assembled;
    } catch (err) {
      await pgClient.query('ROLLBACK');
      console.error('[OrderService] Transaction failed, rolled back:', err);
      throw err;
    } finally {
      pgClient.release();
    }
  }

  // In-Memory Multi-Tenant Store Execution (Fallback)
  const newOrderRow = {
    id: internalOrderId,
    order_number: orderNumber,
    restaurant_id: restaurantId,
    branch_id: branchId,
    customer_id: customerRecord.id,
    order_type: orderType,
    entry_source: entrySource,
    table_number: tableNumber || (orderType === 'dine_in' ? 'Table 1' : null),
    table_id: tableId || null,
    status: initialStatus,
    payment_method: payload.paymentMethod,
    payment_status: paymentStatus,
    payment_id: payload.paymentId || null,
    item_total: paymentSummary.customerItemsTotal,
    tax: tax,
    delivery_fee: deliveryFee,
    discount: discount,
    coupon_code: payload.couponCode || null,
    grand_total: grandTotal,
    restaurant_subtotal: paymentSummary.restaurantSubtotal,
    platform_markup_total: paymentSummary.platformMarkupTotal,
    customer_items_total: paymentSummary.customerItemsTotal,
    restaurant_share: paymentSummary.restaurantShare,
    platform_share: paymentSummary.platformShare,
    settlement_status: orderType === 'delivery' ? 'PENDING' : 'NOT_APPLICABLE',
    estimated_delivery_time_minutes: orderType === 'delivery' ? 30 : 15,
    kot_number: kotNumber,
    kot_station: kotStation,
    waiter_name: orderType === 'dine_in' ? 'Ramesh (Captain)' : null,
    kot_print_count: 0,
    receipt_print_count: 0,
    customer_latitude: customerLat,
    customer_longitude: customerLng,
    customer_location_accuracy: customerAccuracy,
    customer_location_captured_at: customerCapturedAt,
    customer_location_source: customerSource,
    customer_snapshot: {
      name: customerRecord.name,
      phone: customerRecord.phone,
      email: customerRecord.email,
      address: customerRecord.address,
      landmark: customerRecord.landmark,
      tableNumber: payload.tableNumber,
      latitude: customerLat ?? undefined,
      longitude: customerLng ?? undefined,
      accuracy: customerAccuracy ?? undefined,
      locationCapturedAt: customerCapturedAt ?? undefined,
      locationSource: customerSource ?? undefined,
    },
    confirmed_at: (initialStatus === 'confirmed' || (initialStatus as string) === 'accepted') ? new Date().toISOString() : null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  inMemoryDb.orders.unshift(newOrderRow);

  const insertedItemRows: any[] = [];
  for (const pItem of processedItems) {
    const baseUnitPricePaise = pItem.pricing.baseUnitPricePaise;
    const baseUnitPrice = pItem.pricing.baseUnitPrice;
    const itemRow = {
      id: crypto.randomUUID(),
      order_id: internalOrderId,
      restaurant_id: restaurantId,
      menu_item_id: pItem.resolvedMenuItemUuid || pItem.item.menuItem?.id || null,
      item_name: pItem.itemName,
      quantity: pItem.pricing.quantity,
      unit_price: baseUnitPrice,
      base_unit_price: baseUnitPrice,
      platform_markup_unit: 0,
      base_unit_price_paise: baseUnitPricePaise,
      platform_markup_unit_paise: 0,
      customer_unit_price_paise: baseUnitPricePaise,
      base_line_total_paise: pItem.pricing.baseLineTotalPaise,
      platform_markup_line_total_paise: 0,
      customer_line_total_paise: pItem.pricing.baseLineTotalPaise,
      selected_shape: pItem.shapeCode,
      selected_crust: pItem.item.selectedCrust || null,
      spice_level: pItem.item.spiceLevel || null,
      addons: pItem.item.addons || [],
      special_instructions: pItem.item.specialInstructions || null,
      created_at: new Date().toISOString(),
    };
    inMemoryDb.order_items.push(itemRow);
    insertedItemRows.push(itemRow);
  }

  const histRow = {
    id: crypto.randomUUID(),
    order_id: internalOrderId,
    restaurant_id: restaurantId,
    status: initialStatus,
    note: initialNote,
    created_at: new Date().toISOString(),
  };
  inMemoryDb.order_status_history.push(histRow);

  inMemoryDb.kots.push({
    id: crypto.randomUUID(),
    restaurant_id: restaurantId,
    branch_id: branchId,
    order_id: internalOrderId,
    kot_number: kotNumber,
    station: kotStation,
    print_count: 0,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (payload.paymentId || payload.paymentMethod === 'razorpay') {
    inMemoryDb.payments.push({
      id: crypto.randomUUID(),
      order_id: internalOrderId,
      restaurant_id: restaurantId,
      provider: 'razorpay',
      provider_order_id: payload.paymentId,
      provider_payment_id: payload.paymentId,
      amount: grandTotal,
      currency: 'INR',
      payment_method: payload.paymentMethod,
      status: paymentStatus === 'paid' ? 'captured' : 'created',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // In-memory payment ledger record
  await paymentLedgerService.recordTransaction({
    orderId: internalOrderId,
    restaurantId,
    branchId,
    provider: payload.paymentMethod || 'cash',
    providerOrderId: payload.paymentId || undefined,
    providerPaymentId: payload.paymentId || undefined,
    customerPaidAmount: grandTotal,
    restaurantShare: paymentSummary.restaurantShare,
    platformShare: paymentSummary.platformShare,
    paymentStatus: paymentStatus === 'paid' ? 'PAID' : 'PENDING',
    merchantUpiSnapshot,
    merchantNameSnapshot,
    paymentDestinationSnapshot,
  });

  const assembled = await assembleOrderObject(newOrderRow, insertedItemRows, [histRow], customerRecord);
  if (assembled.status === 'confirmed' || assembled.paymentStatus === 'paid') {
    await createPrintJobsForOrder(assembled, {
      reason: assembled.paymentStatus === 'paid' ? 'online_paid' : 'confirmed',
    }).catch((err) => console.error('[OrderService] Error triggering print jobs on in-memory order creation:', err));
  }
  return assembled;
}

export async function getOrders(
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  branchId?: string,
  status?: string,
  limit: number = 50
): Promise<Order[]> {
  if (isPostgresRunning()) {
    try {
      let sql = `
        SELECT o.*, c.name as cust_name, c.phone as cust_phone, c.email as cust_email, c.address as cust_address, c.landmark as cust_landmark
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE o.restaurant_id = $1
      `;
      const params: any[] = [restaurantId];

      if (branchId) {
        params.push(branchId);
        sql += ` AND (o.branch_id = $${params.length} OR o.branch_id IS NULL)`;
      }

      if (status && status !== 'all') {
        params.push(status);
        sql += ` AND o.status = $${params.length}`;
      }

      sql += ` ORDER BY o.created_at DESC LIMIT ${Math.min(limit, 100)};`;

      const orderRows = (await query(sql, params)).rows;
      if (orderRows.length === 0) return [];

      const orderIds = orderRows.map((r) => r.id);
      const [allItemsRes, allHistRes, feedbackMap] = await Promise.all([
        query(
          `SELECT oi.*, mi.item_code, mi.category, mi.dietary_type, mi.description
           FROM order_items oi
           LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
           WHERE oi.order_id = ANY($1)`,
          [orderIds]
        ),
        query(
          `SELECT * FROM order_status_history WHERE order_id = ANY($1) ORDER BY created_at ASC`,
          [orderIds]
        ),
        getFeedbackRequestsForOrders(orderIds),
      ]);

      const itemsByOrderId = new Map<string, any[]>();
      for (const it of allItemsRes.rows) {
        const list = itemsByOrderId.get(it.order_id) || [];
        list.push(it);
        itemsByOrderId.set(it.order_id, list);
      }

      const historyByOrderId = new Map<string, any[]>();
      for (const h of allHistRes.rows) {
        const list = historyByOrderId.get(h.order_id) || [];
        list.push(h);
        historyByOrderId.set(h.order_id, list);
      }

      const results: Order[] = [];
      for (const row of orderRows) {
        const itemRows = itemsByOrderId.get(row.id) || [];
        const histRows = historyByOrderId.get(row.id) || [];
        const fbRec = feedbackMap[row.id];
        const custObj = row.cust_phone
          ? {
              name: row.cust_name,
              phone: row.cust_phone,
              email: row.cust_email,
              address: row.cust_address,
              landmark: row.cust_landmark,
            }
          : undefined;
        const orderObj = await assembleOrderObject(row, itemRows, histRows, custObj, fbRec);
        results.push(orderObj);
      }
      return results;
    } catch (err) {
      console.error('[OrderService] Error fetching orders from PG, fallback to in-memory:', err);
    }
  }

  // In-Memory Fallback
  let filtered = inMemoryDb.orders.filter((o) => o.restaurant_id === restaurantId);
  if (branchId) {
    filtered = filtered.filter((o) => o.branch_id === branchId || !o.branch_id);
  }
  if (status && status !== 'all') {
    filtered = filtered.filter((o) => o.status === status);
  }

  const feedbackMap = await getFeedbackRequestsForOrders(filtered.map((o) => o.id));
  const results: Order[] = [];
  for (const o of filtered) {
    const items = inMemoryDb.order_items.filter((it) => it.order_id === o.id);
    const history = inMemoryDb.order_status_history.filter((h) => h.order_id === o.id);
    const cust = inMemoryDb.customers.find((c) => c.id === o.customer_id);
    const fbRec = feedbackMap[o.id];
    const orderObj = await assembleOrderObject(o, items, history, cust, fbRec);
    results.push(orderObj);
  }
  return results;
}

export async function getOrderById(orderIdentifier: string, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<Order | null> {
  if (isPostgresRunning()) {
    try {
      // Query by UUID id OR human-readable order_number
      const orderRes = await query(
        `SELECT o.*, c.name as cust_name, c.phone as cust_phone, c.email as cust_email, c.address as cust_address, c.landmark as cust_landmark, c.latitude as cust_latitude, c.longitude as cust_longitude
         FROM orders o
         LEFT JOIN customers c ON o.customer_id = c.id
         WHERE (o.id::text = $1 OR o.order_number = $1) AND o.restaurant_id = $2
         LIMIT 1`,
        [orderIdentifier, restaurantId]
      );
      if (orderRes.rows.length === 0) return null;
      const row = orderRes.rows[0];

      const itemRows = (await query(
        `SELECT oi.*, mi.item_code, mi.category, mi.dietary_type, mi.description
         FROM order_items oi
         LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
         WHERE oi.order_id = $1`,
        [row.id]
      )).rows;
      const histRows = (await query(`SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC`, [row.id])).rows;
      const custObj = row.cust_phone ? {
        name: row.cust_name,
        phone: row.cust_phone,
        email: row.cust_email,
        address: row.cust_address,
        landmark: row.cust_landmark,
        latitude: row.cust_latitude ?? row.customer_latitude,
        longitude: row.cust_longitude ?? row.customer_longitude,
      } : undefined;

      const fbRec = await getFeedbackRequestForOrder(row.id);
      return assembleOrderObject(row, itemRows, histRows, custObj, fbRec);
    } catch (err) {
      console.error('[OrderService] Error in getOrderById PG:', err);
    }
  }

  const row = inMemoryDb.orders.find(
    (o) => (o.id === orderIdentifier || o.order_number === orderIdentifier) && o.restaurant_id === restaurantId
  );
  if (!row) return null;

  const items = inMemoryDb.order_items.filter((it) => it.order_id === row.id);
  const history = inMemoryDb.order_status_history.filter((h) => h.order_id === row.id);
  const cust = inMemoryDb.customers.find((c) => c.id === row.customer_id);
  const fbRec = await getFeedbackRequestForOrder(row.id);
  return assembleOrderObject(row, items, history, cust, fbRec);
}

export async function updateOrderCustomerLocation(
  orderIdentifier: string,
  location: {
    latitude: number;
    longitude: number;
    address?: string;
    accuracy?: number;
    locationCapturedAt?: string;
    locationSource?: CustomerLocationSource;
  },
  restaurantId: string = DEFAULT_RESTAURANT_ID
): Promise<Order | null> {
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);

  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Valid numerical latitude and longitude are required');
  }
  if (lat < -90 || lat > 90) {
    throw new Error('Latitude must be between -90 and 90');
  }
  if (lng < -180 || lng > 180) {
    throw new Error('Longitude must be between -180 and 180');
  }

  const accuracy = location.accuracy !== undefined && location.accuracy !== null && !isNaN(Number(location.accuracy)) ? Number(location.accuracy) : null;
  const capturedAt = location.locationCapturedAt ? new Date(location.locationCapturedAt).toISOString() : new Date().toISOString();
  const source = location.locationSource || 'device_gps';

  if (isPostgresRunning()) {
    try {
      const updateSql = `
        UPDATE orders
        SET
          customer_latitude = $1::numeric,
          customer_longitude = $2::numeric,
          customer_location_accuracy = $3::numeric,
          customer_location_captured_at = $4::timestamp,
          customer_location_source = $5::varchar,
          customer_snapshot = COALESCE(customer_snapshot, '{}'::jsonb) || jsonb_build_object(
            'latitude', $1::numeric,
            'longitude', $2::numeric,
            'accuracy', $3::numeric,
            'locationCapturedAt', $4::text,
            'locationSource', $5::text,
            'address', COALESCE($6::text, customer_snapshot->>'address')
          ),
          updated_at = NOW()
        WHERE (id::text = $7::text OR order_number = $7::text) AND restaurant_id = $8::uuid
        RETURNING id, customer_id;
      `;
      const res = await query(updateSql, [lat, lng, accuracy, capturedAt, source, location.address || null, orderIdentifier, restaurantId]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        if (row.customer_id) {
          await query(
            `UPDATE customers SET latitude = $1, longitude = $2, address = COALESCE($3, address), updated_at = NOW() WHERE id = $4`,
            [lat, lng, location.address || null, row.customer_id]
          );
        }
        return await getOrderById(row.id, restaurantId);
      }
    } catch (err) {
      console.error('[OrderService] Error in updateOrderCustomerLocation PG:', err);
    }
  }

  // In-memory fallback
  const ord = inMemoryDb.orders.find(
    (o) => (o.id === orderIdentifier || o.order_number === orderIdentifier) && o.restaurant_id === restaurantId
  );
  if (ord) {
    ord.customer_latitude = lat;
    ord.customer_longitude = lng;
    ord.customer_location_accuracy = accuracy;
    ord.customer_location_captured_at = capturedAt;
    ord.customer_location_source = source;
    ord.customer_snapshot = {
      ...(ord.customer_snapshot || {}),
      latitude: lat,
      longitude: lng,
      accuracy: accuracy ?? undefined,
      locationCapturedAt: capturedAt,
      locationSource: source,
      address: location.address || ord.customer_snapshot?.address,
    };
    ord.updated_at = new Date().toISOString();
    if (ord.customer_id) {
      const cust = inMemoryDb.customers.find((c) => c.id === ord.customer_id);
      if (cust) {
        cust.latitude = lat;
        cust.longitude = lng;
        if (location.address) cust.address = location.address;
        cust.updated_at = new Date().toISOString();
      }
    }
    return await getOrderById(ord.id, restaurantId);
  }

  return null;
}

export async function updateOrderStatus(
  orderIdentifier: string,
  newStatus: OrderStatus,
  note?: string,
  restaurantId: string = DEFAULT_RESTAURANT_ID
): Promise<Order | null> {
  const defaultNote =
    newStatus === 'confirmed'
      ? 'Order accepted by Kitchen'
      : newStatus === 'baking'
      ? 'Baking Pocket Pizzas & Wok frying Chinese dishes'
      : newStatus === 'packing'
      ? 'Food packaged in insulated thermal boxes'
      : newStatus === 'out_for_delivery'
      ? 'Delivery rider picked up order'
      : newStatus === 'ready_for_pickup'
      ? 'Order is ready at takeaway counter'
      : newStatus === 'delivered'
      ? 'Delivered to customer'
      : newStatus === 'cancelled'
      ? 'Order cancelled'
      : `Status changed to ${newStatus}`;

  const finalNote = note || defaultNote;

  // CRITICAL ORDER RULE:
  // If payment_required === true && payment_status !== "paid",
  // the order MUST NOT transition to confirmed state.
  const existingOrder = await getOrderById(orderIdentifier, restaurantId);
  if (existingOrder && newStatus === 'confirmed') {
    const isOnlinePayment = ['razorpay', 'upi', 'direct_upi'].includes(existingOrder.paymentMethod);
    if (isOnlinePayment && existingOrder.paymentStatus !== 'paid') {
      throw new Error(`Cannot confirm order: Online payment is pending verification (payment_status: ${existingOrder.paymentStatus}).`);
    }
  }

  const isConfirmed = newStatus === 'confirmed' || newStatus === 'accepted';
  const isCompleted = newStatus === 'delivered' || newStatus === 'completed';

  if (isPostgresRunning()) {
    try {
      const updateRes = await query(
        `UPDATE orders
         SET status = $1,
             confirmed_at = CASE WHEN $4::boolean AND confirmed_at IS NULL THEN NOW() ELSE confirmed_at END,
             completed_at = CASE WHEN $5::boolean AND completed_at IS NULL THEN NOW() ELSE completed_at END,
             updated_at = NOW()
         WHERE (id::text = $2 OR order_number = $2) AND restaurant_id = $3
         RETURNING *`,
        [newStatus, orderIdentifier, restaurantId, isConfirmed, isCompleted]
      );
      if (updateRes.rows.length === 0) return null;
      const order = updateRes.rows[0];

      // Add status history entry
      await query(
        `INSERT INTO order_status_history (order_id, restaurant_id, status, note, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [order.id, restaurantId, newStatus, finalNote]
      );

      // If cancelled or completed, update KOT status
      if (newStatus === 'delivered' || newStatus === 'cancelled') {
        await query(
          `UPDATE kots SET status = $1, updated_at = NOW() WHERE order_id = $2 AND restaurant_id = $3`,
          [newStatus === 'delivered' ? 'completed' : 'cancelled', order.id, restaurantId]
        );
      }

      // Automatically schedule WhatsApp feedback 2 hours after completion
      if (isCompleted) {
        const compTime = order.completed_at ? new Date(order.completed_at) : new Date();
        await scheduleOrderFeedback(order, compTime).catch((err) =>
          console.error('[OrderService] Error auto-scheduling feedback:', err.message)
        );
      }

      const updatedOrder = await getOrderById(order.id, restaurantId);
      if (updatedOrder && newStatus === 'confirmed') {
        await createPrintJobsForOrder(updatedOrder, { reason: 'confirmed' }).catch((err) =>
          console.error('[OrderService] Error triggering print jobs on order confirm:', err)
        );
      }

      return updatedOrder;
    } catch (err) {
      console.error('[OrderService] Error updating status in PG:', err);
    }
  }

  // In Memory
  const orderIdx = inMemoryDb.orders.findIndex(
    (o) => (o.id === orderIdentifier || o.order_number === orderIdentifier) && o.restaurant_id === restaurantId
  );
  if (orderIdx === -1) return null;

  const orderId = inMemoryDb.orders[orderIdx].id;
  inMemoryDb.orders[orderIdx].status = newStatus;
  inMemoryDb.orders[orderIdx].updated_at = new Date().toISOString();

  if (isConfirmed && !inMemoryDb.orders[orderIdx].confirmed_at) {
    inMemoryDb.orders[orderIdx].confirmed_at = new Date().toISOString();
  }
  if (isCompleted && !inMemoryDb.orders[orderIdx].completed_at) {
    inMemoryDb.orders[orderIdx].completed_at = new Date().toISOString();
  }

  inMemoryDb.order_status_history.push({
    id: crypto.randomUUID(),
    order_id: orderId,
    restaurant_id: restaurantId,
    status: newStatus,
    note: finalNote,
    created_at: new Date().toISOString(),
  });

  const kot = inMemoryDb.kots.find((k) => k.order_id === orderId);
  if (kot) {
    kot.status = newStatus === 'delivered' ? 'completed' : newStatus === 'cancelled' ? 'cancelled' : 'active';
  }

  if (isCompleted) {
    const compTime = inMemoryDb.orders[orderIdx].completed_at
      ? new Date(inMemoryDb.orders[orderIdx].completed_at)
      : new Date();
    await scheduleOrderFeedback(inMemoryDb.orders[orderIdx], compTime).catch((err) =>
      console.error('[OrderService] Error auto-scheduling feedback in-mem:', err.message)
    );
  }

  const inMemUpdated = await getOrderById(orderId, restaurantId);
  if (inMemUpdated && newStatus === 'confirmed') {
    await createPrintJobsForOrder(inMemUpdated, { reason: 'confirmed' }).catch((err) =>
      console.error('[OrderService] Error triggering print jobs on order confirm in-memory:', err)
    );
  }

  return inMemUpdated;
}

export async function cancelOrderIfPending(
  orderIdentifier: string,
  note: string = 'Cancelled by customer (wrongly placed)',
  restaurantId: string = DEFAULT_RESTAURANT_ID
): Promise<Order | null> {
  if (isPostgresRunning()) {
    try {
      const updateRes = await query(
        `UPDATE orders SET status = 'cancelled', updated_at = NOW()
         WHERE (id::text = $1 OR order_number = $1)
           AND restaurant_id = $2
           AND LOWER(status) IN ('placed', 'pending')
         RETURNING *`,
        [orderIdentifier, restaurantId]
      );
      if (updateRes.rows.length === 0) return null;
      const order = updateRes.rows[0];

      await query(
        `INSERT INTO order_status_history (order_id, restaurant_id, status, note, created_at)
         VALUES ($1, $2, 'cancelled', $3, NOW())`,
        [order.id, restaurantId, note]
      );

      await query(
        `UPDATE kots SET status = 'cancelled', updated_at = NOW() WHERE order_id = $1 AND restaurant_id = $2`,
        [order.id, restaurantId]
      );

      return await getOrderById(order.id, restaurantId);
    } catch (err) {
      console.error('[OrderService] Error in cancelOrderIfPending PG:', err);
      return null;
    }
  }

  // In-Memory fallback
  const orderIdx = inMemoryDb.orders.findIndex(
    (o) =>
      (o.id === orderIdentifier || o.order_number === orderIdentifier) &&
      o.restaurant_id === restaurantId &&
      ['placed', 'pending'].includes((o.status || '').toLowerCase())
  );
  if (orderIdx === -1) return null;

  const orderId = inMemoryDb.orders[orderIdx].id;
  inMemoryDb.orders[orderIdx].status = 'cancelled';
  inMemoryDb.orders[orderIdx].updated_at = new Date().toISOString();

  inMemoryDb.order_status_history.push({
    id: crypto.randomUUID(),
    order_id: orderId,
    restaurant_id: restaurantId,
    status: 'cancelled',
    note,
    created_at: new Date().toISOString(),
  });

  const kot = inMemoryDb.kots.find((k) => k.order_id === orderId);
  if (kot) {
    kot.status = 'cancelled';
  }

  return await getOrderById(orderId, restaurantId);
}

export async function deleteOrder(orderIdentifier: string, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<boolean> {
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `DELETE FROM orders WHERE (id::text = $1 OR order_number = $1) AND restaurant_id = $2`,
        [orderIdentifier, restaurantId]
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      console.error('[OrderService] Error deleting order in PG:', err);
    }
  }

  const order = inMemoryDb.orders.find(
    (o) => (o.id === orderIdentifier || o.order_number === orderIdentifier) && o.restaurant_id === restaurantId
  );
  if (!order) return false;

  const realId = order.id;
  const initialLen = inMemoryDb.orders.length;
  inMemoryDb.orders = inMemoryDb.orders.filter((o) => o.id !== realId);
  inMemoryDb.order_items = inMemoryDb.order_items.filter((it) => it.order_id !== realId);
  inMemoryDb.order_status_history = inMemoryDb.order_status_history.filter((h) => h.order_id !== realId);
  inMemoryDb.kots = inMemoryDb.kots.filter((k) => k.order_id !== realId);
  inMemoryDb.payments = inMemoryDb.payments.filter((p) => p.order_id !== realId);
  return inMemoryDb.orders.length < initialLen;
}

export async function deleteKot(orderIdentifier: string, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<boolean> {
  if (isPostgresRunning()) {
    try {
      const res = await query(
        `DELETE FROM kots
         WHERE (order_id::text = $1 OR order_id IN (SELECT id FROM orders WHERE order_number = $1)) AND restaurant_id = $2`,
        [orderIdentifier, restaurantId]
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      console.error('[OrderService] Error deleting kot in PG:', err);
    }
  }

  const order = inMemoryDb.orders.find(
    (o) => (o.id === orderIdentifier || o.order_number === orderIdentifier) && o.restaurant_id === restaurantId
  );
  const realId = order ? order.id : orderIdentifier;

  const initialLen = inMemoryDb.kots.length;
  inMemoryDb.kots = inMemoryDb.kots.filter((k) => !(k.order_id === realId && k.restaurant_id === restaurantId));
  return inMemoryDb.kots.length < initialLen;
}

export async function markPaymentSuccess(
  orderIdentifier: string,
  paymentId: string,
  restaurantId?: string
): Promise<boolean> {
  if (isPostgresRunning()) {
    try {
      const sql = restaurantId
        ? `UPDATE orders
           SET payment_status = 'paid',
               payment_id = $1,
               status = CASE WHEN status = 'placed' THEN 'confirmed' ELSE status END,
               updated_at = NOW()
           WHERE (id::text = $2 OR order_number = $2) AND (restaurant_id = $3 OR $3 IS NULL)
           RETURNING id, restaurant_id`
        : `UPDATE orders
           SET payment_status = 'paid',
               payment_id = $1,
               status = CASE WHEN status = 'placed' THEN 'confirmed' ELSE status END,
               updated_at = NOW()
           WHERE (id::text = $2 OR order_number = $2)
           RETURNING id, restaurant_id`;

      const params = restaurantId ? [paymentId, orderIdentifier, restaurantId] : [paymentId, orderIdentifier];
      const updateRes = await query(sql, params);

      if (updateRes.rows.length > 0) {
        const realId = updateRes.rows[0].id;
        const realRestaurantId = updateRes.rows[0].restaurant_id;

        await query(
          `UPDATE payments SET status = 'captured', provider_payment_id = $1, updated_at = NOW()
           WHERE order_id = $2`,
          [paymentId, realId]
        );

        // Server-side payment verification succeeded: trigger KOT & Bill print jobs
        const verifiedOrder = await getOrderById(realId, realRestaurantId);
        if (verifiedOrder) {
          await createPrintJobsForOrder(verifiedOrder, { reason: 'online_paid' }).catch((err) =>
            console.error('[OrderService] Error triggering print jobs on verified online payment:', err)
          );
        }
      }
      return true;
    } catch (err) {
      console.error('[OrderService] Error marking payment success in PG:', err);
    }
  }

  const order = inMemoryDb.orders.find(
    (o) => (o.id === orderIdentifier || o.order_number === orderIdentifier) && (!restaurantId || o.restaurant_id === restaurantId)
  );
  if (order) {
    order.payment_status = 'paid';
    order.payment_id = paymentId;
    if (order.status === 'placed') {
      order.status = 'confirmed';
    }
    order.updated_at = new Date().toISOString();

    const pay = inMemoryDb.payments.find((p) => p.order_id === order.id);
    if (pay) {
      pay.status = 'captured';
      pay.provider_payment_id = paymentId;
      pay.updated_at = new Date().toISOString();
    }

    const verifiedOrder = await getOrderById(order.id, order.restaurant_id);
    if (verifiedOrder) {
      await createPrintJobsForOrder(verifiedOrder, { reason: 'online_paid' }).catch((err) =>
        console.error('[OrderService] Error triggering print jobs on verified online payment in-memory:', err)
      );
    }
  }

  return true;
}
