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
  if (orderType !== 'delivery' || basePaise <= 0) {
    return {
      baseUnitPricePaise: basePaise,
      platformMarkupUnitPaise: 0,
      customerUnitPricePaise: basePaise,
      baseUnitPrice: toRupees(basePaise),
      platformMarkupUnit: 0,
      customerUnitPrice: toRupees(basePaise),
    };
  }

  const config = await getPlatformPricingConfig();
  const bandSizePaise = config.priceBandSizeRupees * 100;
  const markupStepPaise = config.markupStepRupees * 100;

  const markupPaise = calculateDeliveryMarkupPaise(basePaise, bandSizePaise, markupStepPaise);
  const customerPaise = basePaise + markupPaise;

  return {
    baseUnitPricePaise: basePaise,
    platformMarkupUnitPaise: markupPaise,
    customerUnitPricePaise: customerPaise,
    baseUnitPrice: toRupees(basePaise),
    platformMarkupUnit: toRupees(markupPaise),
    customerUnitPrice: toRupees(customerPaise),
  };
}
