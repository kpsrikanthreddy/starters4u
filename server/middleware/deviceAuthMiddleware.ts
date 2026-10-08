import { Request, Response, NextFunction } from 'express';
import { authenticateDeviceToken, validateAndConsumeStreamTicket } from '../services/printService.js';
import type { PrintDevice } from '../types/printTypes.js';

declare global {
  namespace Express {
    interface Request {
      device?: PrintDevice;
    }
  }
}

/**
 * Validates the device secret token from Bearer header,
 * or validates a short-lived single-use stream ticket (?ticket=) for SSE streams.
 * Notice: Long-lived tokens in query strings (?token=) are explicitly rejected for security.
 */
export async function requireDeviceAuth(req: Request, res: Response, next: NextFunction) {
  // Reject long-lived tokens in query strings to prevent token leakage in URL logs
  if (req.query.token) {
    return res.status(401).json({
      error: 'Insecure authentication attempt',
      details: 'Long-lived device tokens must be sent via Authorization: Bearer <token> header or use a short-lived stream ticket (?ticket=).',
    });
  }

  // 1. Check for short-lived, single-use stream ticket (e.g. for EventSource /api/print-agent/events?ticket=...)
  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket.trim() : undefined;
  if (ticket) {
    try {
      const device = await validateAndConsumeStreamTicket(ticket);
      if (!device) {
        return res.status(401).json({
          error: 'Invalid or expired stream ticket',
          details: 'Stream tickets are single-use and expire after 60 seconds. Request a new ticket via POST /api/print-agent/stream-ticket.',
        });
      }
      req.device = device;
      return next();
    } catch (err: any) {
      console.error('[DeviceAuth] Error validating stream ticket:', err);
      return res.status(500).json({ error: 'Failed to validate stream ticket', details: err.message });
    }
  }

  // 2. Extract device secret token
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  } else if (typeof req.headers['x-device-token'] === 'string') {
    token = req.headers['x-device-token'].trim();
  } else if (req.body && typeof req.body.deviceToken === 'string') {
    token = req.body.deviceToken.trim();
  } else if (req.body && typeof req.body.token === 'string') {
    token = req.body.token.trim();
  }

  if (!token) {
    return res.status(401).json({
      error: 'Device authentication required',
      details: 'Provide Authorization: Bearer <device_token> header.',
    });
  }

  try {
    const device = await authenticateDeviceToken(token);
    if (!device) {
      return res.status(401).json({
        error: 'Invalid or deactivated print device token',
      });
    }

    req.device = device;
    next();
  } catch (err: any) {
    console.error('[DeviceAuth] Error authenticating device:', err);
    res.status(500).json({ error: 'Failed to authenticate print device', details: err.message });
  }
}
