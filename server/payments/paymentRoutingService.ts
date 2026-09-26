import { directUpiService } from './directUpiService.js';
import QRCode from 'qrcode';

export type PaymentChannel = 'dine_in' | 'takeaway' | 'counter' | 'delivery';
export type PaymentProvider = 'RAZORPAY' | 'DIRECT_UPI' | 'CASH' | 'MARKETPLACE';

export interface PaymentRoutingConfig {
  dineIn: PaymentProvider;
  takeaway: PaymentProvider;
  counterOnline: PaymentProvider;
  delivery: PaymentProvider;
}

export interface RouteCheckoutParams {
  orderType: string;
  paymentMethod?: string;
  restaurantId: string;
  restaurantSlug?: string;
  restaurantName?: string;
  amount?: number;
  orderNumber?: string;
  paymentSettings: {
    isCashEnabled?: boolean;
    isUpiEnabled?: boolean;
    isOnlineEnabled?: boolean;
    directUpiEnabled?: boolean;
    directUpiProvider?: string;
    merchantUpiId?: string;
    upiId?: string;
    merchantDisplayName?: string;
  };
  isRazorpayConfigured: () => boolean;
  getRazorpayKeyId: () => string;
}

export interface PaymentRouteResult {
  success: boolean;
  route: 'RAZORPAY' | 'DIRECT_RESTAURANT_UPI' | 'CASH' | 'MARKETPLACE_PROVIDER';
  paymentMethod: string;
  providerName: string;
  channelProvider: PaymentProvider;
  keyId?: string;
  isRazorpayAvailable: boolean;
  isCashEnabled: boolean;
  isUpiEnabled: boolean;
  isOnlineEnabled: boolean;
  directUpiConfigured: boolean;
  directUpiActive: boolean;
  paymentId?: string;
  orderNumber?: string;
  paymentStatus?: string;
  directUpi?: any;
  error?: string;
}

/**
 * Authoritative Payment Routing Service Layer
 * Enforces server-authoritative routing per order channel.
 *
 * Current Production Configuration:
 * - DINE_IN: RAZORPAY
 * - TAKEAWAY: RAZORPAY
 * - COUNTER (ONLINE): RAZORPAY
 * - COUNTER (CASH): CASH
 * - DELIVERY: MARKETPLACE (Phase 6 marketplace provider architecture)
 *
 * Direct UPI implementation remains 100% preserved, intact, and ready for future activation
 * via simple configuration switch without rewriting checkout.
 */
export class PaymentRoutingService {
  private config: PaymentRoutingConfig;

  constructor() {
    this.config = {
      dineIn: (process.env.DINE_IN_PAYMENT_PROVIDER as PaymentProvider) || 'RAZORPAY',
      takeaway: (process.env.TAKEAWAY_PAYMENT_PROVIDER as PaymentProvider) || 'RAZORPAY',
      counterOnline: (process.env.COUNTER_ONLINE_PAYMENT_PROVIDER as PaymentProvider) || 'RAZORPAY',
      delivery: (process.env.DELIVERY_PAYMENT_PROVIDER as PaymentProvider) || 'MARKETPLACE',
    };
  }

  public getConfig(): PaymentRoutingConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<PaymentRoutingConfig>): PaymentRoutingConfig {
    this.config = {
      ...this.config,
      ...updates,
    };
    return this.getConfig();
  }

  /**
   * Resolves authoritative provider for a given order channel and payment method
   */
  public resolveProviderForChannel(orderType: string, paymentMethod?: string): PaymentProvider {
    const normalizedType = (orderType || '').toLowerCase().trim();
    const normalizedMethod = (paymentMethod || '').toLowerCase().trim();

    if (normalizedType === 'counter' && (normalizedMethod === 'cash' || normalizedMethod === 'cod')) {
      return 'CASH';
    }

    switch (normalizedType) {
      case 'dine_in':
        return this.config.dineIn;
      case 'takeaway':
        return this.config.takeaway;
      case 'counter':
        return this.config.counterOnline;
      case 'delivery':
        return this.config.delivery;
      default:
        return 'RAZORPAY';
    }
  }

  /**
   * Checks if Direct UPI is actively used for customer checkout for the given orderType
   */
  public isDirectUpiActiveForChannel(orderType: string): boolean {
    const provider = this.resolveProviderForChannel(orderType);
    return provider === 'DIRECT_UPI';
  }

  /**
   * Full route checkout resolver called by POST /api/payments/route-checkout
   */
  public async resolvePaymentRoute(params: RouteCheckoutParams): Promise<PaymentRouteResult> {
    const {
      orderType,
      paymentMethod,
      restaurantId,
      restaurantName,
      amount = 0,
      orderNumber,
      paymentSettings,
      isRazorpayConfigured,
      getRazorpayKeyId,
    } = params;

    const channelProvider = this.resolveProviderForChannel(orderType, paymentMethod);
    const merchantUpi = (paymentSettings.merchantUpiId || paymentSettings.upiId || '').trim();
    const directUpiConfigured = Boolean(merchantUpi.length > 0);
    const hasRazorpay = isRazorpayConfigured();
    const razorpayKeyId = hasRazorpay ? getRazorpayKeyId() : undefined;

    // 1. Counter Cash Flow
    if (channelProvider === 'CASH') {
      return {
        success: true,
        route: 'CASH',
        paymentMethod: 'cash',
        providerName: 'CASH',
        channelProvider: 'CASH',
        isRazorpayAvailable: hasRazorpay,
        keyId: razorpayKeyId,
        isCashEnabled: paymentSettings.isCashEnabled !== false,
        isUpiEnabled: paymentSettings.isUpiEnabled !== false,
        isOnlineEnabled: paymentSettings.isOnlineEnabled !== false,
        directUpiConfigured,
        directUpiActive: false,
      };
    }

    // 2. Future Direct UPI Switch: If channel is configured to DIRECT_UPI and restaurant has it enabled
    if (channelProvider === 'DIRECT_UPI' && paymentSettings.directUpiEnabled && directUpiConfigured) {
      const merchantDisplayName = (paymentSettings.merchantDisplayName || restaurantName || 'Restaurant').trim();
      const numAmount = Number(amount) || 0;
      const formattedAmount = numAmount > 0 ? numAmount.toFixed(2) : '0.00';
      const orderIdentifier = orderNumber ? String(orderNumber) : `S4U${Math.floor(10000 + Math.random() * 90000)}`;

      const paymentAttempt = await directUpiService.createAttempt({
        restaurantId,
        amount: numAmount,
        orderNumber: orderIdentifier,
        merchantUpiId: merchantUpi,
        merchantDisplayName,
        provider: paymentSettings.directUpiProvider || 'DIRECT_UPI',
      });

      const encode = (val: string) => encodeURIComponent(val.trim());
      const queryParts: string[] = [
        `pa=${encode(merchantUpi)}`,
        `pn=${encode(merchantDisplayName)}`,
        `am=${formattedAmount}`,
        `cu=INR`,
        `tn=${encode(`Order ${orderIdentifier}`)}`,
      ];
      const queryString = queryParts.join('&');
      const upiIntentUri = `upi://pay?${queryString}`;

      return {
        success: true,
        route: 'DIRECT_RESTAURANT_UPI',
        paymentMethod: 'upi',
        providerName: 'DIRECT_UPI',
        channelProvider: 'DIRECT_UPI',
        paymentId: paymentAttempt.id,
        orderNumber: paymentAttempt.orderNumber,
        paymentStatus: paymentAttempt.status,
        directUpi: {
          paymentId: paymentAttempt.id,
          orderNumber: paymentAttempt.orderNumber,
          status: paymentAttempt.status,
          amount: paymentAttempt.amount,
          provider: paymentSettings.directUpiProvider || 'GOOGLE_PAY_BUSINESS',
          merchantUpiId: merchantUpi,
          merchantDisplayName,
          upiIntentUri,
          googlePayIntentUri: `upi://pay?${queryString}`,
          phonePeIntentUri: `phonepe://upi/pay?${queryString}`,
          paytmIntentUri: `paytmmp://upi/pay?${queryString}`,
          bhimIntentUri: `bhim://upi/pay?${queryString}`,
        },
        isRazorpayAvailable: hasRazorpay,
        keyId: razorpayKeyId,
        isCashEnabled: paymentSettings.isCashEnabled !== false,
        isUpiEnabled: true,
        isOnlineEnabled: paymentSettings.isOnlineEnabled !== false,
        directUpiConfigured: true,
        directUpiActive: true,
      };
    }

    // 3. Current Default Production Flow: RAZORPAY for Dine-in, Takeaway, Counter (online), and MARKETPLACE
    return {
      success: true,
      route: channelProvider === 'MARKETPLACE' ? 'MARKETPLACE_PROVIDER' : 'RAZORPAY',
      paymentMethod: 'razorpay',
      providerName: 'RAZORPAY',
      channelProvider,
      keyId: razorpayKeyId,
      isRazorpayAvailable: hasRazorpay,
      isCashEnabled: paymentSettings.isCashEnabled !== false,
      isUpiEnabled: paymentSettings.isUpiEnabled !== false,
      isOnlineEnabled: paymentSettings.isOnlineEnabled !== false,
      directUpiConfigured,
      directUpiActive: false, // Direct UPI is preserved in DB but inactive for checkout
    };
  }
}

export const paymentRoutingService = new PaymentRoutingService();
