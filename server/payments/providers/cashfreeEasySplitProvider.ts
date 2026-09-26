import crypto from 'crypto';
import {
  MarketplacePaymentProvider,
  CreatePaymentOrderOptions,
  PaymentOrderResult,
  WebhookVerificationResult,
} from '../MarketplacePaymentProvider.js';

/**
 * Cashfree Easy Split Provider Implementation
 * Official Docs: Cashfree Payments & Easy Split (API v2023-08-01)
 */
export class CashfreeEasySplitProvider implements MarketplacePaymentProvider {
  public readonly providerName = 'cashfree';

  private getClientId(): string {
    return process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_APP_ID || '';
  }

  private getClientSecret(): string {
    return process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY || '';
  }

  private getWebhookSecret(): string {
    return (
      process.env.CASHFREE_WEBHOOK_SECRET ||
      process.env.CASHFREE_CLIENT_SECRET ||
      process.env.CASHFREE_SECRET_KEY ||
      ''
    );
  }

  private getApiUrl(): string {
    const env = (process.env.CASHFREE_ENV || 'SANDBOX').toUpperCase();
    return env === 'PRODUCTION'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  public isConfigured(): boolean {
    const id = this.getClientId();
    const secret = this.getClientSecret();
    return Boolean(id && secret && id.trim().length > 0 && secret.trim().length > 0);
  }

  public async createOrder(options: CreatePaymentOrderOptions): Promise<PaymentOrderResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.providerName,
        providerOrderId: '',
        amount: options.amount,
        currency: options.currency || 'INR',
        error: 'Cashfree Easy Split credentials (CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET) are not configured on this server.',
      };
    }

    try {
      const payload: any = {
        order_id: options.orderNumber || options.orderId,
        order_amount: options.amount,
        order_currency: options.currency || 'INR',
        customer_details: {
          customer_id: options.customer.id || options.customer.phone || 'cust_' + Date.now(),
          customer_name: options.customer.name,
          customer_email: options.customer.email || 'customer@starters4u.com',
          customer_phone: options.customer.phone.replace(/\D/g, '').slice(-10),
        },
        order_meta: {
          return_url: options.returnUrl || `${process.env.APP_URL || ''}/order-status/${options.orderId}?order_id={order_id}`,
        },
        order_note: `Starters4U Order ${options.orderNumber}`,
      };

      // Easy Split configuration if vendor is configured
      if (options.restaurantShare > 0) {
        payload.order_splits = [
          {
            vendor_id: `vendor_${options.restaurantId.replace(/-/g, '').slice(0, 12)}`,
            amount: options.restaurantShare,
          },
        ];
      }

      const res = await fetch(`${this.getApiUrl()}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': this.getClientId(),
          'x-client-secret': this.getClientSecret(),
          'x-api-version': '2023-08-01',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          provider: this.providerName,
          providerOrderId: '',
          amount: options.amount,
          currency: options.currency || 'INR',
          error: data.message || `Cashfree returned HTTP ${res.status}`,
          rawResponse: data,
        };
      }

      return {
        success: true,
        provider: this.providerName,
        providerOrderId: data.cf_order_id ? String(data.cf_order_id) : data.order_id,
        amount: data.order_amount || options.amount,
        currency: data.order_currency || 'INR',
        clientSecret: data.payment_session_id,
        paymentUrl: data.payments?.url,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.providerName,
        providerOrderId: '',
        amount: options.amount,
        currency: options.currency || 'INR',
        error: err.message || 'Error communicating with Cashfree API',
      };
    }
  }

  public async getPaymentStatus(providerOrderId: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Cashfree Easy Split is not configured');
    }
    const res = await fetch(`${this.getApiUrl()}/orders/${providerOrderId}/payments`, {
      headers: {
        'x-client-id': this.getClientId(),
        'x-client-secret': this.getClientSecret(),
        'x-api-version': '2023-08-01',
      },
    });
    return await res.json();
  }

  /**
   * Official Cashfree Webhook Signature Verification
   * Signature is HMAC-SHA256 of timestamp + rawBody using client secret.
   */
  public async verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | Buffer
  ): Promise<WebhookVerificationResult> {
    const rawBodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    let parsed: any;
    try {
      parsed = JSON.parse(rawBodyString);
    } catch {
      return {
        isValid: false,
        eventId: 'err_parse',
        eventType: 'unknown',
        status: 'FAILED',
        rawPayload: null,
        error: 'Invalid JSON webhook body',
      };
    }

    const eventId = (headers['x-webhook-event-id'] as string) || parsed.event_id || `cf_evt_${Date.now()}`;
    const eventType = parsed.type || (headers['x-webhook-event-type'] as string) || 'PAYMENT_SUCCESS_WEBHOOK';

    const secret = this.getWebhookSecret();
    if (!secret) {
      return {
        isValid: false,
        eventId,
        eventType,
        status: 'FAILED',
        rawPayload: parsed,
        error: 'Cashfree webhook secret is not configured on this server',
      };
    }

    const signature = (headers['x-webhook-signature'] as string) || '';
    const timestamp = (headers['x-webhook-timestamp'] as string) || '';

    // Verify HMAC-SHA256 signature
    const signaturePayload = timestamp ? `${timestamp}${rawBodyString}` : rawBodyString;
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('base64');

    // Also check hex digest fallback
    const computedSignatureHex = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');

    const isValid = signature === computedSignature || signature === computedSignatureHex;

    const dataObj = parsed.data || parsed;
    const orderData = dataObj.order || {};
    const paymentData = dataObj.payment || {};

    const isSuccess =
      paymentData.payment_status === 'SUCCESS' ||
      orderData.order_status === 'PAID' ||
      eventType === 'PAYMENT_SUCCESS_WEBHOOK';

    return {
      isValid,
      eventId,
      eventType,
      providerOrderId: orderData.order_id || parsed.order_id,
      providerPaymentId: paymentData.cf_payment_id
        ? String(paymentData.cf_payment_id)
        : paymentData.payment_id
        ? String(paymentData.payment_id)
        : undefined,
      orderId: orderData.order_tags?.app_order_id || orderData.order_id,
      amount: paymentData.payment_amount || orderData.order_amount,
      currency: paymentData.payment_currency || orderData.order_currency || 'INR',
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      paymentMethod: paymentData.payment_group,
      rawPayload: parsed,
    };
  }

  public async getSettlementStatus(settlementId: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Cashfree Easy Split is not configured');
    }
    const res = await fetch(`${this.getApiUrl()}/easy-split/settlements/${settlementId}`, {
      headers: {
        'x-client-id': this.getClientId(),
        'x-client-secret': this.getClientSecret(),
        'x-api-version': '2023-08-01',
      },
    });
    return await res.json();
  }
}
