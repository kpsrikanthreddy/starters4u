import crypto from 'crypto';
import { initializeDatabase } from '../db.js';
import {
  updateFeedbackStatusByMessageId,
  normalizeRating,
  getFeedbackRequestByOutboundWamid,
  atomicallyUpdateFeedbackRating,
  handleAcceptedFeedbackFollowup,
  processCustomerFeedbackResponse,
} from './feedbackService.js';

/**
 * Handles Meta WhatsApp Cloud API webhook verification (GET).
 *
 * Meta sends:
 *  - hub.mode
 *  - hub.verify_token
 *  - hub.challenge
 *
 * Expected behavior:
 * 1. Read WHATSAPP_VERIFY_TOKEN from the SERVER environment.
 * 2. If hub.mode === "subscribe" AND hub.verify_token === process.env.WHATSAPP_VERIFY_TOKEN:
 *    return HTTP 200 with ONLY the hub.challenge value as plain text.
 *    Otherwise return HTTP 403.
 * 3. Safe logging:
 *    "WhatsApp webhook verification request received"
 *    mode=<mode>
 *    tokenMatch=true/false
 *    challengePresent=true/false
 *    (NEVER log the actual verify token)
 */
export function handleWhatsAppVerification(req: any, res: any) {
  // Support both Express req.query and direct URL query parameter parsing
  let mode: string | undefined = req.query?.['hub.mode'];
  let token: string | undefined = req.query?.['hub.verify_token'];
  let challenge: string | undefined = req.query?.['hub.challenge'];

  if ((!mode || !token || challenge === undefined) && req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      mode = mode || parsedUrl.searchParams.get('hub.mode') || undefined;
      token = token || parsedUrl.searchParams.get('hub.verify_token') || undefined;
      const parsedChallenge = parsedUrl.searchParams.get('hub.challenge');
      if (parsedChallenge !== null && challenge === undefined) {
        challenge = parsedChallenge;
      }
    } catch {
      // Fall through if URL parsing fails
    }
  }

  // 1. Read WHATSAPP_VERIFY_TOKEN from server environment (with fallback to legacy name or default secret for testing)
  const envToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const legacyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  const tokenMatch = Boolean(
    token && (
      (envToken && (token === envToken || token === envToken.trim())) ||
      (legacyToken && (token === legacyToken || token === legacyToken.trim())) ||
      (!envToken && !legacyToken && token === 'starters4u_feedback_webhook_secret')
    )
  );

  const challengePresent = challenge !== undefined && challenge !== null && challenge !== '';

  // Safe server logging (NEVER log the actual verify token)
  console.info('WhatsApp webhook verification request received');
  console.info(`mode=${mode}`);
  console.info(`tokenMatch=${tokenMatch}`);
  console.info(`challengePresent=${challengePresent}`);

  // Return HTTP 200 with ONLY hub.challenge as plain text if valid, else 403
  if (mode === 'subscribe' && tokenMatch && challengePresent) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(String(challenge));
  }

  if (typeof res.sendStatus === 'function') {
    return res.sendStatus(403);
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(403).send('Forbidden');
}

/**
 * Safely parses the request body across Express and Vercel Serverless Function environments.
 */
async function parseRequestBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (Buffer.isBuffer(req.body)) {
      try {
        return JSON.parse(req.body.toString('utf-8'));
      } catch {
        return {};
      }
    }
    return req.body;
  }

  // If body is not attached, read from stream if available
  if (typeof req.on === 'function') {
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: any) => {
          data += chunk;
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Handles Meta WhatsApp Cloud API webhook events (POST).
 *
 * Implements:
 * 1. Safe production logging:
 *    "REAL WHATSAPP WEBHOOK RECEIVED"
 *    object
 *    entry count
 *    change.field
 *    message.type
 *    message.id
 *    message.from
 *    message.context.id
 *    button.text
 *    button.payload
 *    interactive.button_reply.id
 *    interactive.button_reply.title
 *    (Never logs access tokens or secrets)
 *
 * 2. Normalization of real Meta reply formats:
 *    - message.type === "button": message.button?.text || message.button?.payload
 *    - message.type === "interactive": message.interactive?.button_reply?.title || message.interactive?.button_reply?.id
 *    - Normalized to: GOOD, AVERAGE, BAD (case-insensitive)
 *
 * 3. Exact order correlation via message.context.id -> customer_feedback_requests.whatsapp_message_id
 *    (Does not depend only on customer phone number)
 *
 * 4. Atomic database update:
 *    feedback_rating, feedback_received_at, status = RESPONDED
 *    Only where feedback_rating IS NULL (first response wins)
 *
 * 5. Safe diagnostics logging:
 *    feedbackButtonReceived=true
 *    rating=GOOD/AVERAGE/BAD
 *    contextMessageIdPresent=true/false
 *    feedbackRequestFound=true/false
 *    databaseUpdateCount=<number>
 *
 * 6. Graceful HTTP 200 response to Meta even if feedback request cannot be resolved.
 */
export async function handleWhatsAppWebhookEvent(req: any, res: any) {
  try {
    // Ensure Database is initialized and connected before handling events
    try {
      await initializeDatabase();
    } catch (dbErr: any) {
      console.warn('[WhatsAppWebhook] Database connection notice:', dbErr.message);
    }

    const body = await parseRequestBody(req);

    // Optional Meta signature verification if WHATSAPP_APP_SECRET is configured
    const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
    const signature = req.headers?.['x-hub-signature-256'] as string;
    if (appSecret && signature) {
      const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(body));
      const expectedSig = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
      if (signature !== expectedSig) {
        console.warn('[WhatsAppWebhook] Warning: Signature verification failed');
        return res.status(401).send('Invalid signature');
      }
    }

    // 1. Safe Production Logging
    console.info('REAL WHATSAPP WEBHOOK RECEIVED');
    console.info(`object=${body?.object ?? 'undefined'}`);
    console.info(`entry count=${Array.isArray(body?.entry) ? body.entry.length : 0}`);

    if (body?.object === 'whatsapp_business_account' || body?.entry) {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change?.value;
          console.info(`change.field=${change?.field ?? 'undefined'}`);

          // Handle Message Status Callbacks: sent, delivered, read, failed
          if (value?.statuses && Array.isArray(value.statuses)) {
            for (const statusItem of value.statuses) {
              const messageId = statusItem.id;
              const rawStatus = (statusItem.status || '').toLowerCase();
              let mappedStatus: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | null = null;

              if (rawStatus === 'sent') mappedStatus = 'SENT';
              else if (rawStatus === 'delivered') mappedStatus = 'DELIVERED';
              else if (rawStatus === 'read') mappedStatus = 'READ';
              else if (rawStatus === 'failed') mappedStatus = 'FAILED';

              const errorMsg = statusItem.errors?.[0]?.title || statusItem.errors?.[0]?.message;

              if (messageId && mappedStatus) {
                await updateFeedbackStatusByMessageId(messageId, mappedStatus, errorMsg);
              }
            }
          }

          // Handle Incoming Customer Messages
          if (value?.messages && Array.isArray(value.messages)) {
            for (const msg of value.messages) {
              // Safe Production Logging for incoming message fields
              console.info(`message.type=${msg?.type ?? 'undefined'}`);
              console.info(`message.id=${msg?.id ?? 'undefined'}`);
              console.info(`message.from=${msg?.from ?? 'undefined'}`);
              console.info(`message.context.id=${msg?.context?.id ?? 'undefined'}`);
              console.info(`button.text=${msg?.button?.text ?? 'undefined'}`);
              console.info(`button.payload=${msg?.button?.payload ?? 'undefined'}`);
              console.info(`interactive.button_reply.id=${msg?.interactive?.button_reply?.id ?? 'undefined'}`);
              console.info(`interactive.button_reply.title=${msg?.interactive?.button_reply?.title ?? 'undefined'}`);

              // 2. Handle both possible real Meta reply formats
              let ratingText: string | undefined;
              if (msg.type === 'button') {
                ratingText = msg.button?.text || msg.button?.payload;
              } else if (msg.type === 'interactive') {
                ratingText = msg.interactive?.button_reply?.title || msg.interactive?.button_reply?.id;
              }

              const rating = normalizeRating(ratingText);

              if (rating) {
                // Customer clicked Good, Average, or Bad
                const contextId = msg.context?.id ? String(msg.context.id).trim() : undefined;
                const contextMessageIdPresent = Boolean(contextId);

                // 5. Safe diagnostics logs
                console.info('feedbackButtonReceived=true');
                console.info(`rating=${rating}`);
                console.info(`contextMessageIdPresent=${contextMessageIdPresent}`);

                let feedbackRequest: any = null;
                let databaseUpdateCount = 0;

                // 3. Use message.context.id to find customer_feedback_requests record
                if (contextMessageIdPresent && contextId) {
                  feedbackRequest = await getFeedbackRequestByOutboundWamid(contextId);
                }

                const feedbackRequestFound = Boolean(feedbackRequest);
                console.info(`feedbackRequestFound=${feedbackRequestFound}`);

                // 4. Atomically update feedback_rating, feedback_received_at, status = RESPONDED
                // Only where feedback_rating IS NULL
                if (feedbackRequest) {
                  databaseUpdateCount = await atomicallyUpdateFeedbackRating(
                    feedbackRequest.id,
                    rating,
                    msg.id
                  );

                  if (databaseUpdateCount === 1) {
                    console.info(`[WhatsAppWebhook] Accepted FIRST feedback response: ${rating} for order ${feedbackRequest.order_number || feedbackRequest.order_id}`);
                    await handleAcceptedFeedbackFollowup(feedbackRequest, rating);
                  } else {
                    console.info(`[WhatsAppWebhook] Duplicate feedback click ignored for order ${feedbackRequest.order_number || feedbackRequest.order_id}. Existing rating kept: ${feedbackRequest.feedback_rating}`);
                  }
                } else {
                  // 6. Log reason if feedback request cannot be resolved
                  console.warn(
                    `[WhatsAppWebhook] Feedback request could not be resolved for context.id="${contextId || ''}". Reason: ${
                      contextMessageIdPresent
                        ? 'No customer_feedback_requests record matches this outbound whatsapp_message_id'
                        : 'message.context.id is missing'
                    }`
                  );
                }

                // 5. Safe log databaseUpdateCount
                console.info(`databaseUpdateCount=${databaseUpdateCount}`);
              } else if (msg.type === 'text' && msg.text?.body) {
                // Customer sent a text reply (e.g. feedback comment or question)
                const fromPhone = msg.from;
                const replyMessageId = msg.id;
                const replyContextWamid = msg.context?.id;
                await processCustomerFeedbackResponse({
                  replyMessageId,
                  replyContextWamid,
                  fromPhone,
                  textBody: msg.text.body,
                });
              }
            }
          }
        }
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  } catch (err: any) {
    console.error('[WhatsAppWebhook] Error handling webhook payload:', err.message);
    return res.status(200).send('EVENT_RECEIVED'); // Meta requires 200 OK
  }
}
