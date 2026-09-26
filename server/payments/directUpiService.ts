import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import crypto from 'crypto';

export type PaymentAttemptStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';

export interface PaymentAttempt {
  id: string; // payment_id
  orderId?: string | null;
  orderNumber: string;
  restaurantId: string;
  amount: number;
  currency: string;
  merchantUpiId: string;
  merchantDisplayName: string;
  provider: string;
  status: PaymentAttemptStatus;
  providerTransactionId?: string | null; // UTR or provider transaction ID
  failureReason?: string | null;
  createdAt: string;
  verifiedAt?: string | null;
  updatedAt: string;
}

export interface CreatePaymentAttemptParams {
  restaurantId: string;
  amount: number;
  orderNumber?: string;
  orderId?: string;
  merchantUpiId: string;
  merchantDisplayName: string;
  provider?: string;
}

const EXPIRATION_WINDOW_MS = 15 * 60 * 1000; // 15 minutes session TTL

export class DirectUpiService {
  /**
   * Generates a new server-registered payment attempt session
   */
  public async createAttempt(params: CreatePaymentAttemptParams): Promise<PaymentAttempt> {
    const paymentId = `pay_upi_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const orderNumber = params.orderNumber || `S4U${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();
    const currency = 'INR';
    const provider = params.provider || 'DIRECT_UPI';

    const attempt: PaymentAttempt = {
      id: paymentId,
      orderId: params.orderId || null,
      orderNumber,
      restaurantId: params.restaurantId,
      amount: Number(params.amount),
      currency,
      merchantUpiId: params.merchantUpiId.trim(),
      merchantDisplayName: params.merchantDisplayName.trim(),
      provider,
      status: 'pending',
      providerTransactionId: null,
      failureReason: null,
      createdAt: now,
      verifiedAt: null,
      updatedAt: now,
    };

    if (isPostgresRunning()) {
      try {
        await query(
          `INSERT INTO payment_attempts (
            id, order_id, order_number, restaurant_id, amount, currency,
            merchant_upi_id, merchant_display_name, provider, status,
            provider_transaction_id, failure_reason, created_at, verified_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NULL, NOW())`,
          [
            attempt.id,
            attempt.orderId,
            attempt.orderNumber,
            attempt.restaurantId,
            attempt.amount,
            attempt.currency,
            attempt.merchantUpiId,
            attempt.merchantDisplayName,
            attempt.provider,
            attempt.status,
            attempt.providerTransactionId,
            attempt.failureReason,
          ]
        );
      } catch (err: any) {
        console.error('[DirectUpiService] Error inserting payment attempt in PG:', err.message);
      }
    }

    inMemoryDb.payment_attempts = inMemoryDb.payment_attempts || [];
    inMemoryDb.payment_attempts.push({ ...attempt });

    return attempt;
  }

  /**
   * Retrieves payment attempt and checks expiration if pending
   */
  public async getAttempt(paymentId: string): Promise<PaymentAttempt | null> {
    if (!paymentId) return null;

    if (isPostgresRunning()) {
      try {
        const res = await query(
          `SELECT * FROM payment_attempts WHERE id = $1 LIMIT 1`,
          [paymentId]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          let status = row.status as PaymentAttemptStatus;
          const createdAtMs = new Date(row.created_at).getTime();

          // Check if session has expired
          if (status === 'pending' && Date.now() - createdAtMs > EXPIRATION_WINDOW_MS) {
            status = 'expired';
            await query(
              `UPDATE payment_attempts SET status = 'expired', failure_reason = 'Payment session expired', updated_at = NOW() WHERE id = $1`,
              [paymentId]
            );
          }

          return {
            id: row.id,
            orderId: row.order_id,
            orderNumber: row.order_number,
            restaurantId: row.restaurant_id,
            amount: Number(row.amount),
            currency: row.currency,
            merchantUpiId: row.merchant_upi_id,
            merchantDisplayName: row.merchant_display_name,
            provider: row.provider,
            status,
            providerTransactionId: row.provider_transaction_id,
            failureReason: row.failure_reason,
            createdAt: row.created_at,
            verifiedAt: row.verified_at,
            updatedAt: row.updated_at,
          };
        }
      } catch (err: any) {
        console.error('[DirectUpiService] Error querying payment attempt in PG:', err.message);
      }
    }

    // In-memory fallback
    const mem = (inMemoryDb.payment_attempts || []).find((p) => p.id === paymentId);
    if (!mem) return null;

    const createdAtMs = new Date(mem.createdAt || mem.created_at).getTime();
    if (mem.status === 'pending' && Date.now() - createdAtMs > EXPIRATION_WINDOW_MS) {
      mem.status = 'expired';
      mem.failureReason = 'Payment session expired';
      mem.updatedAt = new Date().toISOString();
    }

    return {
      id: mem.id,
      orderId: mem.orderId || mem.order_id || null,
      orderNumber: mem.orderNumber || mem.order_number,
      restaurantId: mem.restaurantId || mem.restaurant_id,
      amount: Number(mem.amount),
      currency: mem.currency || 'INR',
      merchantUpiId: mem.merchantUpiId || mem.merchant_upi_id,
      merchantDisplayName: mem.merchantDisplayName || mem.merchant_display_name,
      provider: mem.provider || 'DIRECT_UPI',
      status: mem.status as PaymentAttemptStatus,
      providerTransactionId: mem.providerTransactionId || mem.provider_transaction_id || null,
      failureReason: mem.failureReason || mem.failure_reason || null,
      createdAt: mem.createdAt || mem.created_at,
      verifiedAt: mem.verifiedAt || mem.verified_at || null,
      updatedAt: mem.updatedAt || mem.updated_at,
    };
  }

  /**
   * Safely cancels payment attempt upon customer cancellation
   */
  public async cancelAttempt(paymentId: string, reason: string = 'Payment cancelled by customer'): Promise<PaymentAttempt | null> {
    const now = new Date().toISOString();

    if (isPostgresRunning()) {
      try {
        await query(
          `UPDATE payment_attempts
           SET status = 'cancelled', failure_reason = $1, updated_at = NOW()
           WHERE id = $2 AND status = 'pending'`,
          [reason, paymentId]
        );
      } catch (err: any) {
        console.error('[DirectUpiService] Error cancelling payment attempt in PG:', err.message);
      }
    }

    const mem = (inMemoryDb.payment_attempts || []).find((p) => p.id === paymentId);
    if (mem && mem.status === 'pending') {
      mem.status = 'cancelled';
      mem.failureReason = reason;
      mem.updatedAt = now;
    }

    return this.getAttempt(paymentId);
  }

  /**
   * Authoritatively verifies a payment attempt via backend provider / webhook
   * CRITICAL SECURITY RULE: NEVER called by unverified client callback or user assertion
   */
  public async markPaymentVerified(
    paymentId: string,
    providerTransactionId: string,
    verifiedAmount?: number
  ): Promise<PaymentAttempt | null> {
    const attempt = await this.getAttempt(paymentId);
    if (!attempt) return null;

    if (verifiedAmount !== undefined && Math.abs(Number(attempt.amount) - Number(verifiedAmount)) > 1.0) {
      console.warn(`[DirectUpiService] Verified amount mismatch for ${paymentId}: expected ${attempt.amount}, got ${verifiedAmount}`);
      return null;
    }

    const now = new Date().toISOString();

    if (isPostgresRunning()) {
      try {
        await query(
          `UPDATE payment_attempts
           SET status = 'paid', provider_transaction_id = $1, verified_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [providerTransactionId, paymentId]
        );
      } catch (err: any) {
        console.error('[DirectUpiService] Error marking payment verified in PG:', err.message);
      }
    }

    const mem = (inMemoryDb.payment_attempts || []).find((p) => p.id === paymentId);
    if (mem) {
      mem.status = 'paid';
      mem.providerTransactionId = providerTransactionId;
      mem.verifiedAt = now;
      mem.updatedAt = now;
    }

    return this.getAttempt(paymentId);
  }

  /**
   * Links a created order ID to the payment attempt
   */
  public async linkOrderToAttempt(paymentId: string, orderId: string): Promise<void> {
    if (isPostgresRunning()) {
      try {
        await query(
          `UPDATE payment_attempts SET order_id = $1, updated_at = NOW() WHERE id = $2`,
          [orderId, paymentId]
        );
      } catch (err: any) {
        console.error('[DirectUpiService] Error linking order to attempt in PG:', err.message);
      }
    }

    const mem = (inMemoryDb.payment_attempts || []).find((p) => p.id === paymentId);
    if (mem) {
      mem.orderId = orderId;
      mem.order_id = orderId;
      mem.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Authoritative check: returns true ONLY IF the payment attempt is verified paid in database
   */
  public async isPaymentAttemptVerified(paymentId?: string | null): Promise<boolean> {
    if (!paymentId) return false;
    const attempt = await this.getAttempt(paymentId);
    return Boolean(attempt && attempt.status === 'paid' && attempt.verifiedAt);
  }
}

export const directUpiService = new DirectUpiService();
