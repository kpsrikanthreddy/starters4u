/**
 * Marketplace Payment Provider Abstraction
 * Phase 6 Architecture
 */

export interface SplitBeneficiary {
  type: 'RESTAURANT' | 'PLATFORM';
  vendorId: string;
  amount: number; // in rupees
  percentage?: number;
}

export interface CreatePaymentOrderOptions {
  orderId: string;
  orderNumber: string;
  amount: number; // in rupees
  currency?: string;
  customer: {
    id?: string;
    name: string;
    email?: string;
    phone: string;
  };
  restaurantId: string;
  branchId?: string;
  restaurantShare: number;
  platformShare: number;
  returnUrl?: string;
  notes?: Record<string, string>;
}

export interface PaymentOrderResult {
  success: boolean;
  provider: string;
  providerOrderId: string;
  amount: number;
  currency: string;
  clientSecret?: string;
  paymentUrl?: string;
  rawResponse?: any;
  error?: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  eventId: string;
  eventType: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'REFUNDED' | 'OTHER';
  paymentMethod?: string;
  rawPayload: any;
  error?: string;
}

export interface MarketplacePaymentProvider {
  readonly providerName: string;
  isConfigured(): boolean;
  createOrder(options: CreatePaymentOrderOptions): Promise<PaymentOrderResult>;
  getPaymentStatus(providerOrderId: string): Promise<any>;
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string | Buffer): Promise<WebhookVerificationResult>;
  createOrSyncVendor?(vendorData: any): Promise<any>;
  getSettlementStatus?(settlementId: string): Promise<any>;
  refundPayment?(paymentId: string, amount: number, reason?: string): Promise<any>;
}
