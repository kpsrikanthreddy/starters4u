import { Response } from 'express';

export interface AdminEventPayload {
  event: string;
  restaurant_id: string;
  branch_id?: string;
  order_id: string;
  order_number: string;
  restaurant_share?: number;
  platform_share?: number;
  customer_paid?: number;
  payment_status: string;
  timestamp: string;
  data?: any;
}

interface SseClient {
  id: string;
  restaurantId: string;
  branchId?: string;
  res: Response;
  connectedAt: Date;
}

export class RealtimeNotificationService {
  private clients: Map<string, SseClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Send keepalive heartbeat every 25 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 25000);
  }

  public registerClient(
    clientIdOrRestId: string,
    restaurantIdOrRes: string | Response,
    branchId?: string,
    maybeRes?: Response
  ): () => void {
    let clientId = '';
    let restaurantId = '';
    let branch: string | undefined = undefined;
    let res: Response;

    if (typeof restaurantIdOrRes === 'string') {
      clientId = clientIdOrRestId;
      restaurantId = restaurantIdOrRes;
      branch = branchId;
      res = maybeRes!;
    } else {
      clientId = 'client_' + Math.random().toString(36).substring(2, 9);
      restaurantId = clientIdOrRestId;
      branch = branchId;
      res = restaurantIdOrRes;
    }

    const client: SseClient = {
      id: clientId,
      restaurantId,
      branchId: branch,
      res,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);

    // Send initial connected event
    this.sendToClient(client, 'CONNECTED', {
      message: 'Real-time restaurant notifications connected',
      restaurantId,
      branchId: branch,
      timestamp: new Date().toISOString(),
    });

    // Cleanup callback on disconnect
    return () => {
      this.clients.delete(clientId);
    };
  }

  public publishRestaurantEvent(
    restaurantId: string,
    eventOrPayload: string | any,
    maybePayload?: any
  ): void {
    let eventName = 'PAYMENT_EVENT';
    let payload: any = {};

    if (typeof eventOrPayload === 'string') {
      eventName = eventOrPayload;
      payload = maybePayload || {};
    } else {
      payload = eventOrPayload || {};
      eventName = payload.event || payload.type || 'PAYMENT_EVENT';
    }

    const eventData = JSON.stringify({
      ...payload,
      event: eventName,
      type: payload.type || eventName,
      timestamp: payload.timestamp || new Date().toISOString(),
    });

    let recipientCount = 0;
    for (const client of this.clients.values()) {
      if (client.restaurantId === restaurantId || restaurantId === 'ALL') {
        if (!payload.branch_id || !client.branchId || client.branchId === payload.branch_id) {
          try {
            client.res.write(`event: ${eventName}\n`);
            client.res.write(`data: ${eventData}\n\n`);
            recipientCount++;
          } catch (err) {
            console.error(`[RealtimeNotificationService] Failed to send event to client ${client.id}:`, err);
            this.clients.delete(client.id);
          }
        }
      }
    }

    console.info(`[RealtimeNotificationService] Broadcast event '${eventName}' to ${recipientCount} clients for restaurant ${restaurantId}`);
  }

  private sendToClient(client: SseClient, eventName: string, data: any): void {
    try {
      client.res.write(`event: ${eventName}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.clients.delete(client.id);
    }
  }

  private sendHeartbeat(): void {
    for (const [id, client] of this.clients.entries()) {
      try {
        client.res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  public getConnectedClientsCount(restaurantId?: string): number {
    if (!restaurantId) return this.clients.size;
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.restaurantId === restaurantId) count++;
    }
    return count;
  }
}

export const realtimeNotificationService = new RealtimeNotificationService();
