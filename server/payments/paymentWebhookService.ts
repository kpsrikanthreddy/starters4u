import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import { paymentService } from './paymentService.js';
import { paymentLedgerService } from './paymentLedgerService.js';
import { realtimeNotificationService } from '../services/realtimeNotificationService.js';
import * as orderService from '../services/orderService.js';
import crypto from 'crypto';

export interface WebhookProcessResult {
  success: boolean;
  statusCode: number;
  message: string;
  eventId?: string;
  orderId?: string;
  paymentId?: string;
  error?: string;
}

export class PaymentWebhookService {
  /**
   * Authoritative webhook handler for all marketplace payment providers.
   */
  public async handleWebhook(
    providerName: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | Buffer
  ): Promise<WebhookProcessResult> {
    const provider = paymentService.getProvider(providerName);
    if (!provider) {
      return {
        success: false,
        statusCode: 400,
        message: `Unsupported payment provider: ${providerName}`,
      };
    }

    // 1. Signature & Payload Verification
    const verification = await provider.verifyWebhook(headers, rawBody);
    if (!verification.isValid) {
      console.warn(`[PaymentWebhookService] Invalid signature for provider '${providerName}':`, verification.error);
      return {
        success: false,
        statusCode: 401,
        message: 'Invalid webhook signature or unconfigured provider',
        error: verification.error,
      };
    }

    const { eventId, eventType, providerOrderId, providerPaymentId, orderId: rawOrderId, amount, currency, status } = verification;

    // 2. Idempotency Check in payment_webhook_events
    const isDuplicate = await this.checkAndRecordEvent(
      providerName,
      eventId,
      eventType,
      rawOrderId,
      verification.rawPayload,
      (headers['x-webhook-signature'] || headers['x-razorpay-signature']) as string
    );

    if (isDuplicate) {
      console.info(`[PaymentWebhookService] Replay event ${eventId} from ${providerName} safely skipped.`);
      return {
        success: true,
        statusCode: 200,
        message: 'Event already processed (idempotent)',
        eventId,
      };
    }

    // 3. Resolve Target Order in DB
    const orderIdentifier = rawOrderId || providerOrderId;
    if (!orderIdentifier) {
      return {
        success: false,
        statusCode: 400,
        message: 'Webhook payload missing identifiable order ID or provider order ID',
      };
    }

    const targetOrder = await this.findOrder(orderIdentifier);
    if (!targetOrder) {
      console.warn(`[PaymentWebhookService] Order not found for identifier '${orderIdentifier}'`);
      return {
        success: false,
        statusCode: 404,
        message: `Order not found: ${orderIdentifier}`,
      };
    }

    // 4. Verify Amount & Currency if provided
    if (amount !== undefined && amount !== null) {
      const orderAmount = Number(targetOrder.grand_total || targetOrder.total || 0);
      // Allow minor 1 rupee tolerance for integer rounding
      if (Math.abs(orderAmount - Number(amount)) > 1.0) {
        console.warn(`[PaymentWebhookService] Amount mismatch for order ${targetOrder.id}. Expected: ${orderAmount}, Received: ${amount}`);
        return {
          success: false,
          statusCode: 400,
          message: `Payment amount mismatch. Expected: ${orderAmount}, Received: ${amount}`,
        };
      }
    }

    if (currency && currency.toUpperCase() !== (targetOrder.currency || 'INR').toUpperCase()) {
      return {
        success: false,
        statusCode: 400,
        message: `Payment currency mismatch. Expected: ${targetOrder.currency || 'INR'}, Received: ${currency}`,
      };
    }

    // 5. Process Payment Status
    const activePaymentId = providerPaymentId || `pay_${providerName}_${Date.now()}`;

    if (status === 'SUCCESS') {
      // Mark payment success in orders & trigger KOT
      await orderService.markPaymentSuccess(targetOrder.id, activePaymentId, targetOrder.restaurant_id);

      // Update payment ledger & settlements
      await paymentLedgerService.updateTransactionStatus(targetOrder.id, activePaymentId, 'PAID');

      // 6. Broadcast Real-time Event to Restaurant Admin and POS
      const restaurantShare = Number(targetOrder.restaurant_share || targetOrder.item_total || targetOrder.grand_total || 0);
      const platformShare = Number(targetOrder.platform_share || 0);
      const customerPaid = Number(targetOrder.grand_total || targetOrder.customer_payable_total || amount || 0);

      realtimeNotificationService.publishRestaurantEvent(
        targetOrder.restaurant_id,
        'DELIVERY_PAYMENT_CONFIRMED',
        {
          event: 'DELIVERY_PAYMENT_CONFIRMED',
          restaurant_id: targetOrder.restaurant_id,
          branch_id: targetOrder.branch_id,
          order_id: targetOrder.id,
          order_number: targetOrder.order_number || targetOrder.id.slice(0, 8),
          restaurant_share: restaurantShare,
          platform_share: platformShare,
          customer_paid: customerPaid,
          payment_status: 'paid',
          timestamp: new Date().toISOString(),
          data: {
            customerName: targetOrder.customer_snapshot?.name || 'Customer',
            orderType: targetOrder.order_type,
            provider: providerName,
          },
        }
      );

      return {
        success: true,
        statusCode: 200,
        message: 'Payment verified successfully, ledger updated, and restaurant notified',
        eventId,
        orderId: targetOrder.id,
        paymentId: activePaymentId,
      };
    } else if (status === 'FAILED') {
      await paymentLedgerService.updateTransactionStatus(targetOrder.id, activePaymentId, 'FAILED');
      return {
        success: true,
        statusCode: 200,
        message: 'Payment failure recorded',
        eventId,
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: `Webhook event '${eventType}' acknowledged`,
      eventId,
    };
  }

  private async checkAndRecordEvent(
    provider: string,
    eventId: string,
    eventType: string,
    orderId?: string,
    payload?: any,
    signature?: string
  ): Promise<boolean> {
    if (isPostgresRunning()) {
      try {
        const res = await query(
          `INSERT INTO payment_webhook_events (
            id, provider, event_id, event_type, order_id, payload, signature, status, processed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PROCESSED', NOW())
          ON CONFLICT (provider, event_id) DO NOTHING
          RETURNING id`,
          [
            crypto.randomUUID(),
            provider,
            eventId,
            eventType,
            orderId || null,
            JSON.stringify(payload || {}),
            signature || null,
          ]
        );
        // If no row returned, it means a conflict occurred: already exists!
        return res.rows.length === 0;
      } catch (err) {
        console.error('[PaymentWebhookService] Error inserting webhook event into PG:', err);
      }
    }

    inMemoryDb.payment_webhook_events = inMemoryDb.payment_webhook_events || [];
    const exists = inMemoryDb.payment_webhook_events.some(
      (e) => e.provider === provider && e.event_id === eventId
    );
    if (exists) return true;

    inMemoryDb.payment_webhook_events.push({
      id: crypto.randomUUID(),
      provider,
      event_id: eventId,
      event_type: eventType,
      order_id: orderId,
      payload,
      signature,
      status: 'PROCESSED',
      created_at: new Date().toISOString(),
    });

    return false;
  }

  private async findOrder(identifier: string): Promise<any | null> {
    if (isPostgresRunning()) {
      try {
        const res = await query(
          `SELECT * FROM orders
           WHERE id::text = $1 OR order_number = $1 OR payment_id = $1
           LIMIT 1`,
          [identifier]
        );
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('[PaymentWebhookService] Error querying order in PG:', err);
      }
    }

    return (
      (inMemoryDb.orders || []).find(
        (o) => o.id === identifier || o.order_number === identifier || o.payment_id === identifier
      ) || null
    );
  }
}

export const paymentWebhookService = new PaymentWebhookService();
