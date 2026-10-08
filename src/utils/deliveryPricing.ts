/**
 * Starters4U Delivery Pricing Engine
 *
 * All monetary math is integer-safe using paise (1 Rupee = 100 paise)
 * to eliminate floating-point rounding errors.
 *
 * NOTE: The old platform markup slab calculation (e.g. ₹99 -> +₹10 markup, ₹137 -> +₹20 markup)
 * has been permanently removed/disabled for all new orders.
 *
 * For ALL NEW orders:
 *   base_unit_price_paise = actual menu_items.price converted to paise
 *   platform_markup_unit_paise = 0
 *   customer_unit_price_paise = base_unit_price_paise
 *   unit_price = actual menu_items.price
 *
 * Historical order items remain unmodified for audit and financial reconciliation.
 */

export const DEFAULT_PRICE_BAND_SIZE_RUPEES = 100;
export const DEFAULT_MARKUP_STEP_RUPEES = 10;
export const DEFAULT_PRICE_BAND_SIZE_PAISE = 10000;
export const DEFAULT_MARKUP_STEP_PAISE = 1000;

export interface PriceSnapshot {
  baseUnitPricePaise: number;
  platformMarkupUnitPaise: number;
  customerUnitPricePaise: number;

  baseLineTotalPaise: number;
  platformMarkupLineTotalPaise: number;
  customerLineTotalPaise: number;

  // Convenience rupee representations (formatted to 2 decimal places)
  baseUnitPrice: number;
  platformMarkupUnit: number;
  customerUnitPrice: number;

  baseLineTotal: number;
  platformMarkupLineTotal: number;
  customerLineTotal: number;

  quantity: number;
}

export interface OrderPaymentSplitSummary {
  restaurantSubtotal: number;
  platformMarkupTotal: number;
  customerItemsTotal: number;

  restaurantSubtotalPaise: number;
  platformMarkupTotalPaise: number;
  customerItemsTotalPaise: number;

  deliveryFee: number;
  tax: number;
  discount: number;

  customerPayableTotal: number;
  restaurantShare: number;
  platformShare: number;

  customerPayableTotalPaise: number;
  restaurantSharePaise: number;
  platformSharePaise: number;
}

/** Convert rupees to integer paise */
export function toPaise(rupees: number | string): number {
  const n = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/** Convert integer paise to standard rupee number */
export function toRupees(paise: number): number {
  if (!paise || isNaN(paise)) return 0;
  return Math.round(paise) / 100;
}

/**
 * Calculate the delivery markup in rupees for a given base price in rupees.
 * NOTE: Platform markup is disabled for all new orders (platform_markup_unit_paise = 0).
 */
export function calculateDeliveryMarkupRupees(
  basePriceRupees: number,
  bandSizeRupees: number = DEFAULT_PRICE_BAND_SIZE_RUPEES,
  markupStepRupees: number = DEFAULT_MARKUP_STEP_RUPEES
): number {
  return 0;
}

/**
 * Calculate the delivery markup in paise for a given base price in paise.
 * NOTE: Platform markup is disabled for all new orders (platform_markup_unit_paise = 0).
 */
export function calculateDeliveryMarkupPaise(
  basePricePaise: number,
  bandSizePaise: number = DEFAULT_PRICE_BAND_SIZE_PAISE,
  markupStepPaise: number = DEFAULT_MARKUP_STEP_PAISE
): number {
  return 0;
}

/**
 * Calculate the customer delivery price in paise.
 * With platform markup set to 0, customer delivery price equals base price.
 */
export function calculateDeliverySellingPricePaise(
  basePricePaise: number,
  bandSizePaise: number = DEFAULT_PRICE_BAND_SIZE_PAISE,
  markupStepPaise: number = DEFAULT_MARKUP_STEP_PAISE
): number {
  if (basePricePaise <= 0) return 0;
  return basePricePaise;
}

/**
 * Calculate delivery pricing for a single item (in Rupees).
 * Platform markup is 0 for all new orders.
 */
export function getDeliveryPricing(
  basePriceRupees: number,
  orderType: string = 'delivery'
): {
  basePrice: number;
  markup: number;
  sellingPrice: number;
} {
  const basePaise = toPaise(basePriceRupees);
  const price = toRupees(basePaise);
  return {
    basePrice: price,
    markup: 0,
    sellingPrice: price,
  };
}

/**
 * Calculate complete, immutable price snapshots for an order line item.
 * For all new orders:
 * base_unit_price_paise = actual menu_items.price converted to paise
 * platform_markup_unit_paise = 0
 * customer_unit_price_paise = base_unit_price_paise
 * unit_price = actual menu_items.price
 */
export function calculateItemLinePricing(
  baseUnitPriceRupees: number,
  quantity: number,
  orderType: string = 'delivery'
): PriceSnapshot {
  const qty = Math.max(1, Math.floor(quantity || 1));
  const baseUnitPricePaise = toPaise(baseUnitPriceRupees);

  // Platform markup is disabled (0 paise) for all orders.
  const platformMarkupUnitPaise = 0;
  const customerUnitPricePaise = baseUnitPricePaise;

  const baseLineTotalPaise = baseUnitPricePaise * qty;
  const platformMarkupLineTotalPaise = 0;
  const customerLineTotalPaise = baseLineTotalPaise;

  const baseUnitPrice = toRupees(baseUnitPricePaise);
  const baseLineTotal = toRupees(baseLineTotalPaise);

  return {
    baseUnitPricePaise,
    platformMarkupUnitPaise: 0,
    customerUnitPricePaise,
    baseLineTotalPaise,
    platformMarkupLineTotalPaise: 0,
    customerLineTotalPaise,
    baseUnitPrice,
    platformMarkupUnit: 0,
    customerUnitPrice: baseUnitPrice,
    baseLineTotal,
    platformMarkupLineTotal: 0,
    customerLineTotal: baseLineTotal,
    quantity: qty,
  };
}

/**
 * Calculate order-level payment splits and summaries.
 */
export function calculateOrderPaymentSummary(params: {
  orderType: string;
  itemSnapshots: PriceSnapshot[];
  deliveryFee?: number;
  tax?: number;
  discount?: number;
}): OrderPaymentSplitSummary {
  const { orderType, itemSnapshots, deliveryFee = 0, tax = 0, discount = 0 } = params;

  let totalBasePaise = 0;
  let totalMarkupPaise = 0;
  let totalCustomerItemsPaise = 0;

  for (const item of itemSnapshots) {
    totalBasePaise += item.baseLineTotalPaise;
    totalMarkupPaise += item.platformMarkupLineTotalPaise;
    totalCustomerItemsPaise += item.customerLineTotalPaise;
  }

  const deliveryFeePaise = toPaise(deliveryFee);
  const taxPaise = toPaise(tax);
  const discountPaise = toPaise(discount);

  // Customer payable = customerItemsTotal + deliveryFee + tax - discount
  const customerPayablePaise = Math.max(
    0,
    totalCustomerItemsPaise + deliveryFeePaise + taxPaise - discountPaise
  );

  let restaurantSharePaise = 0;
  let platformSharePaise = 0;

  if (orderType === 'delivery') {
    // Delivery marketplace split:
    // Restaurant gets: totalBase (food value) + tax (passed through) - restaurant discount if any
    // Starters4U gets: totalMarkup + delivery fee (if any collected)
    restaurantSharePaise = totalBasePaise + taxPaise;
    // If discount was applied to the order, handle it fairly: discount reduces customer payable
    platformSharePaise = totalMarkupPaise + deliveryFeePaise;
    
    // Safety check: restaurantShare + platformShare must equal customerPayable
    const diff = customerPayablePaise - (restaurantSharePaise + platformSharePaise);
    if (diff !== 0) {
      // Adjust platform share by difference so restaurant base share is never silently compromised
      platformSharePaise += diff;
      if (platformSharePaise < 0) {
        restaurantSharePaise += platformSharePaise;
        platformSharePaise = 0;
      }
    }
  } else {
    // Dine-in / Takeaway / Counter: Restaurant receives 100% of customer payment directly
    restaurantSharePaise = customerPayablePaise;
    platformSharePaise = 0;
  }

  return {
    restaurantSubtotal: toRupees(totalBasePaise),
    platformMarkupTotal: toRupees(totalMarkupPaise),
    customerItemsTotal: toRupees(totalCustomerItemsPaise),
    restaurantSubtotalPaise: totalBasePaise,
    platformMarkupTotalPaise: totalMarkupPaise,
    customerItemsTotalPaise: totalCustomerItemsPaise,
    deliveryFee: toRupees(deliveryFeePaise),
    tax: toRupees(taxPaise),
    discount: toRupees(discountPaise),
    customerPayableTotal: toRupees(customerPayablePaise),
    restaurantShare: toRupees(restaurantSharePaise),
    platformShare: toRupees(platformSharePaise),
    customerPayableTotalPaise: customerPayablePaise,
    restaurantSharePaise: restaurantSharePaise,
    platformSharePaise: platformSharePaise,
  };
}
