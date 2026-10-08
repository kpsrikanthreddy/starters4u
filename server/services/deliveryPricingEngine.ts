import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import {
  toPaise,
  toRupees,
  calculateDeliveryMarkupRupees,
  calculateDeliveryMarkupPaise,
  calculateDeliverySellingPricePaise,
  getDeliveryPricing,
  calculateItemLinePricing,
  calculateOrderPaymentSummary,
  DEFAULT_PRICE_BAND_SIZE_PAISE,
  DEFAULT_MARKUP_STEP_PAISE,
} from '../../src/utils/deliveryPricing.js';
import type {
  PriceSnapshot,
  OrderPaymentSplitSummary,
} from '../../src/utils/deliveryPricing.js';

export {
  toPaise,
  toRupees,
  calculateDeliveryMarkupRupees,
  calculateDeliveryMarkupPaise,
  calculateDeliverySellingPricePaise,
  getDeliveryPricing,
  calculateItemLinePricing,
  calculateOrderPaymentSummary,
};
export type {
  PriceSnapshot,
  OrderPaymentSplitSummary,
};

export interface PlatformPricingConfig {
  id: string;
  priceBandSizeRupees: number;
  markupStepRupees: number;
  isActive: boolean;
}

let cachedConfig: PlatformPricingConfig | null = null;
let cacheTime = 0;

/**
 * Fetch current platform pricing configuration (cached for 60 seconds).
 */
export async function getPlatformPricingConfig(): Promise<PlatformPricingConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTime < 60000) {
    return cachedConfig;
  }

  if (isPostgresRunning()) {
    try {
      const res = await query(
        `SELECT id, price_band_size_rupees, markup_step_rupees, is_active
         FROM platform_pricing_config
         WHERE is_active = true
         ORDER BY updated_at DESC LIMIT 1`
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        cachedConfig = {
          id: row.id,
          priceBandSizeRupees: Number(row.price_band_size_rupees || 100),
          markupStepRupees: Number(row.markup_step_rupees || 10),
          isActive: Boolean(row.is_active),
        };
        cacheTime = now;
        return cachedConfig;
      }
    } catch (err) {
      console.warn('[DeliveryPricingEngine] Could not load platform_pricing_config from DB:', err);
    }
  }

  const inMem = inMemoryDb.platform_pricing_config?.[0];
  cachedConfig = {
    id: inMem?.id || 'default',
    priceBandSizeRupees: Number(inMem?.price_band_size_rupees || 100),
    markupStepRupees: Number(inMem?.markup_step_rupees || 10),
    isActive: inMem?.is_active ?? true,
  };
  cacheTime = now;
  return cachedConfig;
}

/**
 * Authoritative server-side price evaluation for any menu item.
 * For all new orders:
 * base_unit_price_paise = actual menu_items.price converted to paise
 * platform_markup_unit_paise = 0
 * customer_unit_price_paise = base_unit_price_paise
 * unit_price = actual menu_items.price
 */
export async function getAuthoritativeItemPrice(
  basePrice: number,
  orderType: string
): Promise<{
  baseUnitPricePaise: number;
  platformMarkupUnitPaise: number;
  customerUnitPricePaise: number;
  baseUnitPrice: number;
  platformMarkupUnit: number;
  customerUnitPrice: number;
}> {
  const basePaise = toPaise(basePrice);
  const priceRupees = toRupees(basePaise);

  return {
    baseUnitPricePaise: basePaise,
    platformMarkupUnitPaise: 0,
    customerUnitPricePaise: basePaise,
    baseUnitPrice: priceRupees,
    platformMarkupUnit: 0,
    customerUnitPrice: priceRupees,
  };
}
