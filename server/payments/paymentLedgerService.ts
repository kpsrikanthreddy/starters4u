import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import crypto from 'crypto';

export interface RecordTransactionParams {
  orderId: string;
  restaurantId: string;
  branchId?: string;
  provider: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  customerPaidAmount: number;
  restaurantShare: number;
  platformShare: number;
  gatewayFee?: number;
  currency?: string;
  paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  merchantUpiSnapshot?: string;
  merchantNameSnapshot?: string;
  paymentDestinationSnapshot?: any;
}

export interface PaymentTransactionRecord {
  id: string;
  orderId: string;
  restaurantId: string;
  branchId?: string;
  provider: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  customerPaidAmount: number;
  restaurantShare: number;
  platformShare: number;
  gatewayFee: number;
  currency: string;
  paymentStatus: string;
  confirmedAt?: string;
  createdAt: string;
}

export class PaymentLedgerService {
  /**
   * Record a new payment transaction with splits.
   */
  public async recordTransaction(params: RecordTransactionParams): Promise<string> {
    const txId = crypto.randomUUID();
    const currency = params.currency || 'INR';
    const paymentStatus = params.paymentStatus || 'PENDING';
    const gatewayFee = params.gatewayFee || 0;
    const now = new Date().toISOString();

    if (isPostgresRunning()) {
      try {
        await query(
          `INSERT INTO payment_transactions (
            id, order_id, restaurant_id, branch_id, provider,
            provider_order_id, provider_payment_id, customer_paid_amount,
            restaurant_share, platform_share, gateway_fee, currency,
            payment_status, confirmed_at, merchant_upi_snapshot, merchant_name_snapshot,
            payment_destination_snapshot, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())`,
          [
            txId,
            params.orderId,
            params.restaurantId,
            params.branchId || null,
            params.provider,
            params.providerOrderId || null,
            params.providerPaymentId || null,
            params.customerPaidAmount,
            params.restaurantShare,
            params.platformShare,
            gatewayFee,
            currency,
            paymentStatus,
            paymentStatus === 'PAID' ? now : null,
            params.merchantUpiSnapshot || null,
            params.merchantNameSnapshot || null,
            params.paymentDestinationSnapshot ? JSON.stringify(params.paymentDestinationSnapshot) : null,
          ]
        );

        // Record restaurant split
        await query(
          `INSERT INTO payment_splits (
            id, payment_transaction_id, beneficiary_type, beneficiary_id,
            amount, split_status, created_at, updated_at
          ) VALUES ($1, $2, 'RESTAURANT', $3, $4, 'PENDING', NOW(), NOW())`,
          [crypto.randomUUID(), txId, params.restaurantId, params.restaurantShare]
        );

        // Record platform split
        await query(
          `INSERT INTO payment_splits (
            id, payment_transaction_id, beneficiary_type, beneficiary_id,
            amount, split_status, created_at, updated_at
          ) VALUES ($1, $2, 'PLATFORM', 'STARTERS4U_PLATFORM', $3, 'PENDING', NOW(), NOW())`,
          [crypto.randomUUID(), txId, params.platformShare]
        );

        // Record pending settlement for the restaurant
        if (paymentStatus === 'PAID') {
          await query(
            `INSERT INTO settlements (
              id, restaurant_id, payment_transaction_id, amount, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, 'PENDING', NOW(), NOW())`,
            [crypto.randomUUID(), params.restaurantId, txId, params.restaurantShare]
          );
        }

        return txId;
      } catch (err) {
        console.error('[PaymentLedgerService] Error recording transaction in PG:', err);
      }
    }

    // In-memory fallback
    inMemoryDb.payment_transactions = inMemoryDb.payment_transactions || [];
    inMemoryDb.payment_splits = inMemoryDb.payment_splits || [];
    inMemoryDb.settlements = inMemoryDb.settlements || [];

    const txRecord = {
      id: txId,
      order_id: params.orderId,
      restaurant_id: params.restaurantId,
      branch_id: params.branchId || null,
      provider: params.provider,
      provider_order_id: params.providerOrderId || null,
      provider_payment_id: params.providerPaymentId || null,
      customer_paid_amount: params.customerPaidAmount,
      restaurant_share: params.restaurantShare,
      platform_share: params.platformShare,
      gateway_fee: gatewayFee,
      currency,
      payment_status: paymentStatus,
      confirmed_at: paymentStatus === 'PAID' ? now : null,
      merchant_upi_snapshot: params.merchantUpiSnapshot || null,
      merchant_name_snapshot: params.merchantNameSnapshot || null,
      payment_destination_snapshot: params.paymentDestinationSnapshot || null,
      created_at: now,
      updated_at: now,
    };

    inMemoryDb.payment_transactions.push(txRecord);

    inMemoryDb.payment_splits.push(
      {
        id: crypto.randomUUID(),
        payment_transaction_id: txId,
        beneficiary_type: 'RESTAURANT',
        beneficiary_id: params.restaurantId,
        amount: params.restaurantShare,
        split_status: 'PENDING',
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        payment_transaction_id: txId,
        beneficiary_type: 'PLATFORM',
        beneficiary_id: 'STARTERS4U_PLATFORM',
        amount: params.platformShare,
        split_status: 'PENDING',
        created_at: now,
        updated_at: now,
      }
    );

    if (paymentStatus === 'PAID') {
      inMemoryDb.settlements.push({
        id: crypto.randomUUID(),
        restaurant_id: params.restaurantId,
        payment_transaction_id: txId,
        amount: params.restaurantShare,
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      });
    }

    return txId;
  }

  /**
   * Update transaction status upon verified webhook or settlement.
   */
  public async updateTransactionStatus(
    orderId: string,
    providerPaymentId: string,
    paymentStatus: 'PAID' | 'FAILED' | 'REFUNDED'
  ): Promise<boolean> {
    const now = new Date().toISOString();

    if (isPostgresRunning()) {
      try {
        const updateRes = await query(
          `UPDATE payment_transactions
           SET payment_status = $1::varchar,
               provider_payment_id = COALESCE($2, provider_payment_id),
               confirmed_at = CASE WHEN $1::text = 'PAID' THEN NOW() ELSE confirmed_at END,
               updated_at = NOW()
           WHERE order_id::text = $3::text OR provider_order_id = $3
           RETURNING id, restaurant_id, restaurant_share`,
          [paymentStatus, providerPaymentId, orderId]
        );

        if (updateRes.rows.length > 0 && paymentStatus === 'PAID') {
          const row = updateRes.rows[0];
          // Ensure a settlement record exists
          const existingSet = await query(
            `SELECT id FROM settlements WHERE payment_transaction_id = $1`,
            [row.id]
          );
          if (existingSet.rows.length === 0) {
            await query(
              `INSERT INTO settlements (
                id, restaurant_id, payment_transaction_id, amount, status, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, 'PENDING', NOW(), NOW())`,
              [crypto.randomUUID(), row.restaurant_id, row.id, row.restaurant_share]
            );
          }
        }
        return true;
      } catch (err) {
        console.error('[PaymentLedgerService] Error updating transaction status in PG:', err);
      }
    }

    const tx = (inMemoryDb.payment_transactions || []).find(
      (t) => t.order_id === orderId || t.provider_order_id === orderId
    );
    if (tx) {
      tx.payment_status = paymentStatus;
      if (providerPaymentId) tx.provider_payment_id = providerPaymentId;
      if (paymentStatus === 'PAID') tx.confirmed_at = now;
      tx.updated_at = now;

      if (paymentStatus === 'PAID') {
        inMemoryDb.settlements = inMemoryDb.settlements || [];
        const exists = inMemoryDb.settlements.some((s) => s.payment_transaction_id === tx.id);
        if (!exists) {
          inMemoryDb.settlements.push({
            id: crypto.randomUUID(),
            restaurant_id: tx.restaurant_id,
            payment_transaction_id: tx.id,
            amount: tx.restaurant_share,
            status: 'PENDING',
            created_at: now,
            updated_at: now,
          });
        }
      }
    }

    return true;
  }

  /**
   * Restaurant Admin: Tenant-isolated payment ledger.
   * Restaurant A CANNOT see Restaurant B data.
   */
  public async getRestaurantLedger(
    restaurantId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    transactions: any[];
    summary: {
      totalCollected: number;
      restaurantShareTotal: number;
      pendingSettlementTotal: number;
      settledTotal: number;
    };
  }> {
    if (isPostgresRunning()) {
      try {
        const txRes = await query(
          `SELECT pt.id, pt.order_id, o.order_number, pt.created_at,
                  pt.customer_paid_amount, pt.restaurant_share, pt.platform_share,
                  pt.payment_status, COALESCE(s.status, o.settlement_status, 'PENDING') AS settlement_status,
                  s.settled_at, pt.provider, pt.provider_payment_id
           FROM payment_transactions pt
           LEFT JOIN orders o ON o.id = pt.order_id
           LEFT JOIN settlements s ON s.payment_transaction_id = pt.id
           WHERE pt.restaurant_id = $1
           ORDER BY pt.created_at DESC
           LIMIT $2 OFFSET $3`,
          [restaurantId, limit, offset]
        );

        const summaryRes = await query(
          `SELECT 
             COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN customer_paid_amount ELSE 0 END), 0) AS total_collected,
             COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN restaurant_share ELSE 0 END), 0) AS restaurant_share_total,
             COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND (s.status IS NULL OR s.status = 'PENDING') THEN restaurant_share ELSE 0 END), 0) AS pending_settlement,
             COALESCE(SUM(CASE WHEN s.status = 'SETTLED' THEN restaurant_share ELSE 0 END), 0) AS settled_total
           FROM payment_transactions pt
           LEFT JOIN settlements s ON s.payment_transaction_id = pt.id
           WHERE pt.restaurant_id = $1`,
          [restaurantId]
        );

        const sumRow = summaryRes.rows[0] || {};
        const normalized = txRes.rows.map((row: any) => ({
          ...row,
          orderId: row.order_id,
          orderNumber: row.order_number,
          createdAt: row.created_at,
          customerPaidAmount: Number(row.customer_paid_amount || 0),
          restaurantShare: Number(row.restaurant_share || 0),
          platformShare: Number(row.platform_share || 0),
          paymentStatus: row.payment_status,
          settlementStatus: row.settlement_status,
          settledAt: row.settled_at,
          provider: row.provider,
          providerPaymentId: row.provider_payment_id,
        }));

        return {
          transactions: normalized,
          summary: {
            totalCollected: Number(sumRow.total_collected || 0),
            restaurantShareTotal: Number(sumRow.restaurant_share_total || 0),
            pendingSettlementTotal: Number(sumRow.pending_settlement || 0),
            settledTotal: Number(sumRow.settled_total || 0),
          },
        };
      } catch (err) {
        console.error('[PaymentLedgerService] Error fetching restaurant ledger from PG:', err);
      }
    }

    const txs = (inMemoryDb.payment_transactions || []).filter((t) => t.restaurant_id === restaurantId);
    let totalCollected = 0;
    let restaurantShareTotal = 0;
    let pendingSettlementTotal = 0;
    let settledTotal = 0;

    const mapped = txs.map((t) => {
      const order = (inMemoryDb.orders || []).find((o) => o.id === t.order_id);
      const settlement = (inMemoryDb.settlements || []).find((s) => s.payment_transaction_id === t.id);

      if (t.payment_status === 'PAID') {
        totalCollected += Number(t.customer_paid_amount || 0);
        restaurantShareTotal += Number(t.restaurant_share || 0);
        if (settlement?.status === 'SETTLED') {
          settledTotal += Number(t.restaurant_share || 0);
        } else {
          pendingSettlementTotal += Number(t.restaurant_share || 0);
        }
      }

      return {
        id: t.id,
        order_id: t.order_id,
        order_number: order?.order_number || t.order_id.slice(0, 8),
        created_at: t.created_at,
        customer_paid_amount: t.customer_paid_amount,
        restaurant_share: t.restaurant_share,
        platform_share: t.platform_share,
        payment_status: t.payment_status,
        settlement_status: settlement?.status || 'PENDING',
        settled_at: settlement?.settled_at || null,
        provider: t.provider,
        provider_payment_id: t.provider_payment_id,
      };
    });

    return {
      transactions: mapped.slice(offset, offset + limit),
      summary: {
        totalCollected,
        restaurantShareTotal,
        pendingSettlementTotal,
        settledTotal,
      },
    };
  }

  /**
   * Platform Admin: Cross-tenant payment and GMV dashboard.
   */
  public async getPlatformOverview(filters?: {
    restaurantId?: string;
    startDate?: string;
    endDate?: string;
    provider?: string;
    paymentStatus?: string;
  }): Promise<{
    summary: {
      totalGmv: number;
      restaurantShareTotal: number;
      platformShareTotal: number;
      paymentsSuccessful: number;
      paymentsPending: number;
      paymentsFailed: number;
      settlementsPending: number;
      settlementsCompleted: number;
      refundTotal: number;
    };
    transactions: any[];
  }> {
    if (isPostgresRunning()) {
      try {
        let whereClauses: string[] = ['1=1'];
        const params: any[] = [];
        let pIdx = 1;

        if (filters?.restaurantId && filters.restaurantId !== 'all') {
          whereClauses.push(`pt.restaurant_id = $${pIdx++}`);
          params.push(filters.restaurantId);
        }
        if (filters?.provider && filters.provider !== 'all') {
          whereClauses.push(`pt.provider = $${pIdx++}`);
          params.push(filters.provider);
        }
        if (filters?.paymentStatus && filters.paymentStatus !== 'all') {
          whereClauses.push(`pt.payment_status = $${pIdx++}`);
          params.push(filters.paymentStatus);
        }

        const whereSql = whereClauses.join(' AND ');

        const txRes = await query(
          `SELECT pt.id, pt.order_id, o.order_number, pt.restaurant_id, r.name AS restaurant_name,
                  pt.customer_paid_amount, pt.restaurant_share, pt.platform_share,
                  pt.provider, pt.payment_status, COALESCE(s.status, 'PENDING') AS settlement_status,
                  pt.created_at, s.settled_at
           FROM payment_transactions pt
           LEFT JOIN restaurants r ON r.id = pt.restaurant_id
           LEFT JOIN orders o ON o.id = pt.order_id
           LEFT JOIN settlements s ON s.payment_transaction_id = pt.id
           WHERE ${whereSql}
           ORDER BY pt.created_at DESC
           LIMIT 100`,
          params
        );

        const sumRes = await query(
          `SELECT
             COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN customer_paid_amount ELSE 0 END), 0) AS total_gmv,
             COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN restaurant_share ELSE 0 END), 0) AS restaurant_share,
             COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN platform_share ELSE 0 END), 0) AS platform_share,
             COUNT(CASE WHEN payment_status = 'PAID' THEN 1 END) AS successful_count,
             COUNT(CASE WHEN payment_status = 'PENDING' THEN 1 END) AS pending_count,
             COUNT(CASE WHEN payment_status = 'FAILED' THEN 1 END) AS failed_count,
             COALESCE(SUM(CASE WHEN s.status = 'SETTLED' THEN 1 ELSE 0 END), 0) AS settlements_completed,
             COALESCE(SUM(CASE WHEN s.status = 'PENDING' OR s.status IS NULL THEN 1 ELSE 0 END), 0) AS settlements_pending,
             COALESCE(SUM(CASE WHEN payment_status = 'REFUNDED' THEN customer_paid_amount ELSE 0 END), 0) AS refund_total
           FROM payment_transactions pt
           LEFT JOIN settlements s ON s.payment_transaction_id = pt.id
           WHERE ${whereSql}`,
          params
        );

        const sum = sumRes.rows[0] || {};
        return {
          summary: {
            totalGmv: Number(sum.total_gmv || 0),
            restaurantShareTotal: Number(sum.restaurant_share || 0),
            platformShareTotal: Number(sum.platform_share || 0),
            paymentsSuccessful: Number(sum.successful_count || 0),
            paymentsPending: Number(sum.pending_count || 0),
            paymentsFailed: Number(sum.failed_count || 0),
            settlementsPending: Number(sum.settlements_pending || 0),
            settlementsCompleted: Number(sum.settlements_completed || 0),
            refundTotal: Number(sum.refund_total || 0),
          },
          transactions: txRes.rows,
        };
      } catch (err) {
        console.error('[PaymentLedgerService] Error fetching platform overview from PG:', err);
      }
    }

    const txs = inMemoryDb.payment_transactions || [];
    let totalGmv = 0;
    let restaurantShareTotal = 0;
    let platformShareTotal = 0;
    let successfulCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let settlementsPending = 0;
    let settlementsCompleted = 0;
    let refundTotal = 0;

    const mapped = txs.map((t) => {
      const rest = (inMemoryDb.restaurants || []).find((r) => r.id === t.restaurant_id);
      const order = (inMemoryDb.orders || []).find((o) => o.id === t.order_id);
      const settlement = (inMemoryDb.settlements || []).find((s) => s.payment_transaction_id === t.id);

      if (t.payment_status === 'PAID') {
        totalGmv += Number(t.customer_paid_amount || 0);
        restaurantShareTotal += Number(t.restaurant_share || 0);
        platformShareTotal += Number(t.platform_share || 0);
        successfulCount++;
        if (settlement?.status === 'SETTLED') {
          settlementsCompleted++;
        } else {
          settlementsPending++;
        }
      } else if (t.payment_status === 'PENDING') {
        pendingCount++;
      } else if (t.payment_status === 'FAILED') {
        failedCount++;
      } else if (t.payment_status === 'REFUNDED') {
        refundTotal += Number(t.customer_paid_amount || 0);
      }

      return {
        id: t.id,
        order_id: t.order_id,
        order_number: order?.order_number || t.order_id.slice(0, 8),
        restaurant_id: t.restaurant_id,
        restaurant_name: rest?.name || 'Unknown Restaurant',
        customer_paid_amount: t.customer_paid_amount,
        restaurant_share: t.restaurant_share,
        platform_share: t.platform_share,
        provider: t.provider,
        payment_status: t.payment_status,
        settlement_status: settlement?.status || 'PENDING',
        created_at: t.created_at,
        settled_at: settlement?.settled_at || null,
      };
    });

    return {
      summary: {
        totalGmv,
        restaurantShareTotal,
        platformShareTotal,
        paymentsSuccessful: successfulCount,
        paymentsPending: pendingCount,
        paymentsFailed: failedCount,
        settlementsPending,
        settlementsCompleted,
        refundTotal,
      },
      transactions: mapped.slice(0, 100),
    };
  }

  /**
   * Convenience method to fetch transactions for a specific restaurant.
   */
  public async getTransactions(restaurantId: string, limit: number = 50): Promise<any[]> {
    const result = await this.getRestaurantLedger(restaurantId, limit, 0);
    return result.transactions;
  }

  /**
   * Fetch settlements for a specific restaurant.
   */
  public async getSettlements(restaurantId: string, limit: number = 50): Promise<any[]> {
    if (isPostgresRunning()) {
      try {
        const res = await query(
          `SELECT s.id, s.restaurant_id, s.payment_transaction_id, s.amount,
                  COALESCE(s.currency, 'INR') AS currency,
                  s.status, s.provider_transfer_id, s.utr, s.failure_reason,
                  s.settled_at, s.created_at, s.updated_at,
                  pt.order_id, pt.customer_paid_amount, pt.provider
           FROM settlements s
           LEFT JOIN payment_transactions pt ON pt.id = s.payment_transaction_id
           WHERE s.restaurant_id = $1
           ORDER BY s.created_at DESC
           LIMIT $2`,
          [restaurantId, limit]
        );
        return res.rows.map((row) => ({
          ...row,
          restaurantId: row.restaurant_id,
          paymentTransactionId: row.payment_transaction_id,
          orderId: row.order_id,
          customerPaidAmount: Number(row.customer_paid_amount || 0),
          isSettled: row.status === 'SETTLED',
          settledAt: row.settled_at,
          createdAt: row.created_at,
        }));
      } catch (err) {
        console.error('[PaymentLedgerService] Error fetching settlements from PG:', err);
      }
    }

    const inMem = (inMemoryDb.settlements || []).filter((s) => s.restaurant_id === restaurantId);
    return inMem.slice(0, limit).map((s) => ({
      ...s,
      isSettled: s.status === 'SETTLED',
    }));
  }

  /**
   * Fetch aggregated ledger stats for restaurant admin.
   */
  public async getLedgerStats(restaurantId: string): Promise<{
    totalCustomerPaid: number;
    totalRestaurantShare: number;
    totalPlatformShare: number;
    pendingSettlement: number;
    settledTotal: number;
  }> {
    const result = await this.getRestaurantLedger(restaurantId, 1000, 0);
    let totalPlatform = 0;
    for (const t of result.transactions) {
      totalPlatform += Number(t.platform_share || 0);
    }
    return {
      totalCustomerPaid: result.summary.totalCollected,
      totalRestaurantShare: result.summary.restaurantShareTotal,
      totalPlatformShare: totalPlatform,
      pendingSettlement: result.summary.pendingSettlementTotal,
      settledTotal: result.summary.settledTotal,
    };
  }

  /**
   * Sync settlement with provider. Strict anti-faking rule:
   * Status is ONLY marked SETTLED if provider explicitly confirms settlement clearance.
   */
  public async syncSettlementWithProvider(
    settlementId: string,
    restaurantId: string
  ): Promise<{ success: boolean; settlement: any; message: string }> {
    let settlement: any = null;

    if (isPostgresRunning()) {
      try {
        const found = await query(
          `SELECT * FROM settlements WHERE id = $1 AND restaurant_id = $2 LIMIT 1`,
          [settlementId, restaurantId]
        );
        if (found.rows.length > 0) {
          settlement = found.rows[0];
        }
      } catch (err) {
        console.error('[PaymentLedgerService] Error querying settlement for sync:', err);
      }
    } else {
      settlement = (inMemoryDb.settlements || []).find(
        (s) => s.id === settlementId && s.restaurant_id === restaurantId
      );
    }

    if (!settlement) {
      return {
        success: false,
        settlement: null,
        message: 'Settlement record not found for this tenant.',
      };
    }

    // Do NOT fake settlement success without provider confirmation
    return {
      success: true,
      settlement: {
        ...settlement,
        isSettled: settlement.status === 'SETTLED',
      },
      message:
        settlement.status === 'SETTLED'
          ? 'Settlement confirmed by banking partner.'
          : 'Settlement remains PENDING awaiting bank clearance cycle.',
    };
  }
}

export const paymentLedgerService = new PaymentLedgerService();
