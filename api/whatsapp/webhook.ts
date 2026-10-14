import { handleWhatsAppVerification, handleWhatsAppWebhookEvent } from '../../server/services/whatsappWebhookService.js';

export default async function handler(req: any, res: any) {
  // Prevent any caching or redirection proxies
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'GET') {
    return handleWhatsAppVerification(req, res);
  }

  if (req.method === 'POST') {
    return handleWhatsAppWebhookEvent(req, res);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).send('Method Not Allowed');
}
