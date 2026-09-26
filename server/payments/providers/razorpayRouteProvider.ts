import crypto from 'crypto';
import Razorpay from 'razorpay';
import {
  MarketplacePaymentProvider,
  CreatePaymentOrderOptions,
  PaymentOrderResult,
  WebhookVerificationResult,
} from '../MarketplacePaymentProvider.js';

/**
 * Razorpay & Razorpay Route Provider Implementation
 * Preserves full backward-compatibility with existing MOZZ Razorpay setup.
 */
export class RazorpayRouteProvider implements MarketplacePaymentProvider {
  public readonly providerName = 'razorpay';
  private instance: any = null;

  private getKeyId(): string {
    return process.env.RAZORPAY_KEY_ID || '';
  }

  private getKeySecret(): string {
    return process.env.RAZORPAY_KEY_SECRET || '';
  }

  private getWebhookSecret(): string {
    return process.env.RAZORPAY_WEBHOOK_SECRET || this.getKeySecret();
  }

  public isConfigured(): boolean {
    const keyId = this.getKeyId();
    const keySecret = this.getKeySecret();
    return Boolean(keyId && keySecret && keyId.trim().length > 0 && keySecret.trim().length > 0);
  }

  private getInstance(): any {
    if (!this.instance && this.isConfigured()) {
      this.instance = new Razorpay({
        key_id: this.getKeyId(),
        key_secret: this.getKeySecret(),
      });
    }
    return this.instance;
  }

  public async createOrder(options: CreatePaymentOrderOptions): Promise<PaymentOrderResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.providerName,
        providerOrderId: '',
        amount: options.amount,
        currency: options.currency || 'INR',
        error: 'Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are not configured on this server.',
      };
    }

    try {
      const razorpay = this.getInstance();
      const amountPaise = Math.round(options.amount * 100);

      // Unique receipt length limit is 40 chars in Razorpay
      const receipt = `rcpt_${(options.orderNumber || options.orderId).replace(/[^a-zA-Z0-9]/g, '').slice(-30)}`;

      const orderOptions: any = {
        amount: amountPaise,
        currency: options.currency || 'INR',
        receipt,
        notes: {
          order_id: options.orderId,
          order_number: options.orderNumber,
          restaurant_id: options.restaurantId,
          restaurant_share: String(options.restaurantShare),
          platform_share: String(options.platformShare),
          ...(options.notes || {}),
        },
      };

      const order = await razorpay.orders.create(orderOptions);

      return {
        success: true,
        provider: this.providerName,
        providerOrderId: order.id,
        amount: options.amount,
        currency: options.currency || 'INR',
        rawResponse: order,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.providerName,
        providerOrderId: '',
        amount: options.amount,
        currency: options.currency || 'INR',
        error: err.message || 'Error creating Razorpay order',
      };
    }
  }

  public async getPaymentStatus(providerOrderId: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Razorpay is not configured');
    }
    const razorpay = this.getInstance();
    return await razorpay.orders.fetchPayments(providerOrderId);
  }

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
        error: 'Invalid JSON webhook payload',
      };
    }

    const eventId = (headers['x-razorpay-event-id'] as string) || parsed.id || `rzp_evt_${Date.now()}`;
    const eventType = parsed.event || 'payment.captured';

    if (!this.isConfigured()) {
      return {
        isValid: false,
        eventId,
        eventType,
        status: 'FAILED',
        rawPayload: parsed,
        error: 'Razorpay is not configured on this server',
      };
    }

    const signature = (headers['x-razorpay-signature'] as string) || '';
    const secret = this.getWebhookSecret();

    let isValid = false;
    if (signature && secret) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBodyString)
        .digest('hex');
      isValid = expectedSignature === signature;
    }

    const paymentEntity = parsed.payload?.payment?.entity || {};
    const orderEntity = parsed.payload?.order?.entity || {};

    const isSuccess =
      eventType === 'payment.captured' ||
      eventType === 'order.paid' ||
      paymentEntity.status === 'captured';

    return {
      isValid,
      eventId,
      eventType,
      providerOrderId: paymentEntity.order_id || orderEntity.id,
      providerPaymentId: paymentEntity.id,
      orderId: paymentEntity.notes?.order_id || orderEntity.notes?.order_id,
      amount: paymentEntity.amount ? paymentEntity.amount / 100 : undefined,
      currency: paymentEntity.currency || 'INR',
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      paymentMethod: paymentEntity.method,
      rawPayload: parsed,
    };
  }

  public async refundPayment(paymentId: string, amount: number, reason?: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Razorpay is not configured');
    }
    const razorpay = this.getInstance();
    const amountPaise = Math.round(amount * 100);
    return await razorpay.payments.refund(paymentId, {
      amount: amountPaise,
      notes: { reason: reason || 'Customer cancellation' },
    });
  }
}
