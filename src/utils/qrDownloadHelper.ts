import QRCode from 'qrcode';

export interface StandCardOptions {
  title?: string;
  subtitle?: string;
  badgeLabel?: string;
  identifier: string; // e.g. "Table 4" or "Counter Express"
  subText?: string;
  qrUrl: string;
  themeColor?: string;
}

/**
 * Generates a clean Data URL for a QR Code
 */
export async function generateQRDataURL(url: string, size: number = 800): Promise<string> {
  try {
    return await QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });
  } catch (err) {
    console.error('Failed to generate QR Data URL:', err);
    throw err;
  }
}

/**
 * Triggers direct browser download for a Data URL
 */
export function triggerDownload(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads a high-resolution QR code PNG
 */
export async function downloadQRImage(url: string, filename: string, size: number = 1024): Promise<void> {
  const dataUrl = await generateQRDataURL(url, size);
  triggerDownload(dataUrl, filename);
}

/**
 * Renders a full, restaurant-ready acrylic table stand / tent card on an HTML5 canvas and exports as PNG
 */
export async function generateTableStandDataURL(options: StandCardOptions): Promise<string> {
  const width = 1000;
  const height = 1400;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // 1. Background Gradient (Sleek Dark Slate & Warm Amber/Rose)
  const isCounter = options.identifier.toLowerCase().includes('counter');
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  if (isCounter) {
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.5, '#1e1b4b');
    bgGrad.addColorStop(1, '#0f172a');
  } else {
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.45, '#1c1917');
    bgGrad.addColorStop(1, '#1e1b4b');
  }

  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Outer decorative border
  ctx.strokeStyle = isCounter ? 'rgba(59, 130, 246, 0.4)' : 'rgba(245, 158, 11, 0.4)';
  ctx.lineWidth = 12;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(44, 44, width - 88, height - 88);

  // 2. Header Brand Banner
  ctx.textAlign = 'center';

  // Decorative top pill badge
  const badgeY = 95;
  const badgeText = isCounter ? '🛍️ EXPRESS TAKEAWAY' : '🍽️ DINE-IN SERVICE';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const badgeMetrics = ctx.measureText(badgeText);
  const badgeWidth = badgeMetrics.width + 60;
  const badgeHeight = 44;

  ctx.fillStyle = isCounter ? '#2563eb' : '#d97706';
  ctx.beginPath();
  ctx.roundRect((width - badgeWidth) / 2, badgeY, badgeWidth, badgeHeight, 22);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(badgeText, width / 2, badgeY + 30);

  // Brand Name
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText((options.title || 'RESTAURANT').toUpperCase(), width / 2, 210);

  // Tagline
  ctx.fillStyle = isCounter ? '#93c5fd' : '#fcd34d';
  ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(options.subtitle || 'Dine-In • Express Takeaway • Online Ordering', width / 2, 252);

  // 3. Central Table/Identifier Banner
  const tableBoxY = 295;
  const tableBoxHeight = 115;
  const tableBoxWidth = width - 180;

  const tableGrad = ctx.createLinearGradient((width - tableBoxWidth) / 2, tableBoxY, (width + tableBoxWidth) / 2, tableBoxY + tableBoxHeight);
  if (isCounter) {
    tableGrad.addColorStop(0, 'rgba(37, 99, 235, 0.25)');
    tableGrad.addColorStop(1, 'rgba(59, 130, 246, 0.15)');
  } else {
    tableGrad.addColorStop(0, 'rgba(217, 119, 6, 0.25)');
    tableGrad.addColorStop(1, 'rgba(245, 158, 11, 0.15)');
  }

  ctx.fillStyle = tableGrad;
  ctx.beginPath();
  ctx.roundRect((width - tableBoxWidth) / 2, tableBoxY, tableBoxWidth, tableBoxHeight, 24);
  ctx.fill();

  ctx.strokeStyle = isCounter ? 'rgba(96, 165, 250, 0.8)' : 'rgba(251, 191, 36, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect((width - tableBoxWidth) / 2, tableBoxY, tableBoxWidth, tableBoxHeight, 24);
  ctx.stroke();

  // Identifier text
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 58px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(options.identifier.toUpperCase(), width / 2, tableBoxY + 74);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(isCounter ? 'Orders placed will be packed for takeaway' : 'Direct Kitchen KOT & Table Delivery', width / 2, tableBoxY + 102);

  // 4. White Card Containing QR Code
  const qrCardY = 445;
  const qrCardSize = 570;
  const qrCardX = (width - qrCardSize) / 2;

  // Outer shadow & background
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(qrCardX, qrCardY, qrCardSize, qrCardSize, 36);
  ctx.fill();

  // QR Code Image
  const qrDataUrl = await generateQRDataURL(options.qrUrl, 500);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = qrDataUrl;
  });

  const qrInnerMargin = 35;
  const qrRenderSize = qrCardSize - qrInnerMargin * 2;
  ctx.drawImage(img, qrCardX + qrInnerMargin, qrCardY + qrInnerMargin - 15, qrRenderSize, qrRenderSize);

  // Text under QR inside white card
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('SCAN WITH CAMERA OR SCANNER', width / 2, qrCardY + qrCardSize - 32);

  // 5. Instruction Steps
  const stepsY = 1060;
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('HOW TO ORDER AT YOUR TABLE', width / 2, stepsY);

  const stepItems = [
    { num: '1', text: 'Scan QR with any Camera or UPI App' },
    { num: '2', text: 'Pick Pocket Pizzas, Starters & Add-ons' },
    { num: '3', text: 'Pay Online or Cash • Sent directly to Kitchen' },
  ];

  ctx.font = '600 21px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  stepItems.forEach((step, idx) => {
    const itemY = stepsY + 50 + (idx * 44);
    
    // Number circle
    const circleX = 140;
    ctx.fillStyle = isCounter ? '#3b82f6' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(circleX, itemY - 7, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = '900 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(step.num, circleX, itemY - 1);

    // Step text
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 21px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(step.text, circleX + 30, itemY);
    ctx.textAlign = 'center';
  });

  // 6. Footer bar
  const footerY = 1320;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, footerY - 20);
  ctx.lineTo(width - 80, footerY - 20);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '500 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('🔒 Cryptographically Verified QR Session • starters4u.in', width / 2, footerY + 12);

  return canvas.toDataURL('image/png');
}

/**
 * Downloads a complete, branded Table Stand PNG card
 */
export async function downloadTableStandImage(options: StandCardOptions, filename: string): Promise<void> {
  const dataUrl = await generateTableStandDataURL(options);
  triggerDownload(dataUrl, filename);
}
