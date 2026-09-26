/**
 * Starters4U Delivery Pricing Engine (Phase 6)
 *
 * Implements server-authoritative and client-display delivery markup bands.
 * All monetary math is integer-safe using paise (1 Rupee = 100 paise)
 * to eliminate floating-point rounding errors.
 *
 * Pricing Formula:
 * ₹0.01 – ₹99.99   (+₹10 markup)
 * ₹100  – ₹199.99  (+₹20 markup)
 * ₹200  – ₹299.99  (+₹30 markup)
 * ₹300  – ₹399.99  (+₹40 markup)
 * ₹400  – ₹499.99  (+₹50 markup)
 * ₹500  – ₹599.99  (+₹60 markup)
 * ... continuing in steps of ₹10 per ₹100 band.
 *
 * Conceptually: platform_markup = (floor(base_price / 100) + 1) * 10
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
 */
export function calculateDeliveryMarkupRupees(
  basePriceRupees: number,
  bandSizeRupees: number = DEFAULT_PRICE_BAND_SIZE_RUPEES,
  markupStepRupees: number = DEFAULT_MARKUP_STEP_RUPEES
): number {
  if (basePriceRupees <= 0) return 0;
  const bandIndex = Math.floor(basePriceRupees / bandSizeRupees);
  return (bandIndex + 1) * markupStepRupees;
}

/**
 * Calculate the delivery markup in paise for a given base price in paise.
 * Integer-safe band calculation.
 */
export function calculateDeliveryMarkupPaise(
  basePricePaise: number,
  bandSizePaise: number = DEFAULT_PRICE_BAND_SIZE_PAISE,
  markupStepPaise: number = DEFAULT_MARKUP_STEP_PAISE
): number {
  if (basePricePaise <= 0) return 0;
  const bandIndex = Math.floor(basePricePaise / bandSizePaise);
  return (bandIndex + 1) * markupStepPaise;
}

/**
 * Calculate the customer delivery price in paise.
 */
export function calculateDeliverySellingPricePaise(
  basePricePaise: number,
  bandSizePaise: number = DEFAULT_PRICE_BAND_SIZE_PAISE,
  markupStepPaise: number = DEFAULT_MARKUP_STEP_PAISE
): number {
  if (basePricePaise <= 0) return 0;
  return basePricePaise + calculateDeliveryMarkupPaise(basePricePaise, bandSizePaise, markupStepPaise);
}

/**
 * Calculate delivery pricing for a single item (in Rupees).
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
  if (orderType !== 'delivery' || basePaise <= 0) {
    return {
      basePrice: toRupees(basePaise),
      markup: 0,
      sellingPrice: toRupees(basePaise),
    };
  }

  const markupPaise = calculateDeliveryMarkupPaise(basePaise);
  const sellingPaise = basePaise + markupPaise;

  return {
    basePrice: toRupees(basePaise),
    markup: toRupees(markupPaise),
    sellingPrice: toRupees(sellingPaise),
  };
}

/**
 * Calculate complete, immutable price snapshots for an order line item.
 */
export function calculateItemLinePricing(
  baseUnitPriceRupees: number,
  quantity: number,
  orderType: string = 'delivery'
): PriceSnapshot {
  const qty = Math.max(1, Math.floor(quantity || 1));
  const baseUnitPricePaise = toPaise(baseUnitPriceRupees);

  let platformMarkupUnitPaise = 0;
  if (orderType === 'delivery') {
    platformMarkupUnitPaise = calculateDeliveryMarkupPaise(baseUnitPricePaise);
  }

  const customerUnitPricePaise = baseUnitPricePaise + platformMarkupUnitPaise;

  const baseLineTotalPaise = baseUnitPricePaise * qty;
  const platformMarkupLineTotalPaise = platformMarkupUnitPaise * qty;
  const customerLineTotalPaise = customerUnitPricePaise * qty;

  return {
    baseUnitPricePaise,
    platformMarkupUnitPaise,
    customerUnitPricePaise,
    baseLineTotalPaise,
    platformMarkupLineTotalPaise,
    customerLineTotalPaise,
    baseUnitPrice: toRupees(baseUnitPricePaise),
    platformMarkupUnit: toRupees(platformMarkupUnitPaise),
    customerUnitPrice: toRupees(customerUnitPricePaise),
    baseLineTotal: toRupees(baseLineTotalPaise),
    platformMarkupLineTotal: toRupees(platformMarkupLineTotalPaise),
    customerLineTotal: toRupees(customerLineTotalPaise),
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
