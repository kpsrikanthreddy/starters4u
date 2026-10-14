import crypto from 'crypto';
import {
  updateFeedbackStatusByMessageId,
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

  // 6. Safe server logging (NEVER log the actual verify token)
  console.info('WhatsApp webhook verification request received');
  console.info(`mode=${mode}`);
  console.info(`tokenMatch=${tokenMatch}`);
  console.info(`challengePresent=${challengePresent}`);

  // 2. Return HTTP 200 with ONLY hub.challenge as plain text if valid, else 403
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
 * Handles Meta WhatsApp Cloud API webhook events (POST).
 * Processes message delivery status callbacks and incoming customer quick-replies.
 */
export async function handleWhatsAppWebhookEvent(req: any, res: any) {
  try {
    const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
    const signature = req.headers?.['x-hub-signature-256'] as string;

    // Optional Meta signature verification if WHATSAPP_APP_SECRET is configured
    if (appSecret && signature) {
      const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      const expectedSig = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
      if (signature !== expectedSig) {
        console.warn('[WhatsAppWebhook] Warning: Signature verification failed');
        return res.status(401).send('Invalid signature');
      }
    }

    const body = req.body;
    if (body?.object === 'whatsapp_business_account' || body?.entry) {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change?.value;

          // 1. Handle Message Status Callbacks: sent, delivered, read, failed
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

          // 2. Handle Incoming Customer Responses (Quick reply buttons, interactive buttons, text replies)
          if (value?.messages && Array.isArray(value.messages)) {
            for (const msg of value.messages) {
              const fromPhone = msg.from;
              const replyMessageId = msg.id;
              const replyContextWamid = msg.context?.id;

              let buttonText: string | undefined;
              let buttonPayload: string | undefined;
              let textBody: string | undefined;

              if (msg.type === 'button') {
                buttonText = msg.button?.text;
                buttonPayload = msg.button?.payload;
              } else if (msg.type === 'interactive') {
                if (msg.interactive?.type === 'button_reply') {
                  buttonText = msg.interactive?.button_reply?.title;
                  buttonPayload = msg.interactive?.button_reply?.id;
                } else if (msg.interactive?.type === 'list_reply') {
                  buttonText = msg.interactive?.list_reply?.title;
                  buttonPayload = msg.interactive?.list_reply?.id;
                }
              } else if (msg.type === 'text') {
                textBody = msg.text?.body;
              }

              if (fromPhone && replyMessageId) {
                await processCustomerFeedbackResponse({
                  replyMessageId,
                  replyContextWamid,
                  fromPhone,
                  buttonText,
                  buttonPayload,
                  textBody,
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
