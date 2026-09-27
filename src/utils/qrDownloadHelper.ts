import QRCode from 'qrcode';

export type StandCardTheme = 'obsidian_gold' | 'ruby_rose' | 'clean_minimal';

export interface StandCardOptions {
  title?: string;
  subtitle?: string;
  badgeLabel?: string;
  identifier: string; // e.g. "Table 4" or "Counter Express"
  subText?: string;
  qrUrl: string;
  theme?: StandCardTheme;
  tableName?: string;
  restaurantLogoText?: string;
  includeAcrylicBase?: boolean;
}

/**
 * Generates a clean Data URL for a high-contrast QR Code
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
 * Renders a full, restaurant-ready acrylic table stand / tent card on an HTML5 canvas and exports as PNG.
 * Formatted for standard 4x6" and 5x7" acrylic tabletop displays at high DPI (1200 x 1800).
 */
export async function generateTableStandDataURL(options: StandCardOptions): Promise<string> {
  const width = 1200;
  const height = 1800;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  const isCounter = options.identifier.toLowerCase().includes('counter');
  const theme: StandCardTheme = options.theme || (isCounter ? 'ruby_rose' : 'obsidian_gold');

  // Define Palette according to chosen Theme
  let bgGradient: [string, string, string];
  let primaryAccent: string;
  let secondaryAccent: string;
  let borderGlow: string;
  let textColorPrimary: string;
  let textColorSecondary: string;
  let stepBadgeBg: string;
  let stepBadgeText: string;

  if (theme === 'clean_minimal') {
    bgGradient = ['#ffffff', '#f8fafc', '#f1f5f9'];
    primaryAccent = '#0f172a';
    secondaryAccent = '#e11d48';
    borderGlow = 'rgba(15, 23, 42, 0.12)';
    textColorPrimary = '#0f172a';
    textColorSecondary = '#475569';
    stepBadgeBg = '#0f172a';
    stepBadgeText = '#ffffff';
  } else if (theme === 'ruby_rose') {
    bgGradient = ['#3b0714', '#1c1917', '#09090b'];
    primaryAccent = '#f43f5e';
    secondaryAccent = '#fbbf24';
    borderGlow = 'rgba(244, 63, 94, 0.4)';
    textColorPrimary = '#ffffff';
    textColorSecondary = '#fda4af';
    stepBadgeBg = '#f43f5e';
    stepBadgeText = '#ffffff';
  } else {
    // obsidian_gold (Default)
    bgGradient = ['#0b0f19', '#151928', '#07090e'];
    primaryAccent = '#f59e0b';
    secondaryAccent = '#fbbf24';
    borderGlow = 'rgba(245, 158, 11, 0.4)';
    textColorPrimary = '#ffffff';
    textColorSecondary = '#fcd34d';
    stepBadgeBg = '#f59e0b';
    stepBadgeText = '#0f172a';
  }

  // 1. Background Fill
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, bgGradient[0]);
  grad.addColorStop(0.5, bgGradient[1]);
  grad.addColorStop(1, bgGradient[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle radial ambient light behind the QR card
  const radialGlow = ctx.createRadialGradient(width / 2, 850, 50, width / 2, 850, 550);
  radialGlow.addColorStop(0, borderGlow);
  radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radialGlow;
  ctx.fillRect(0, 300, width, 1100);

  // Outer decorative border
  ctx.strokeStyle = borderGlow;
  ctx.lineWidth = 14;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  // Inner hairline border
  ctx.strokeStyle = theme === 'clean_minimal' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(52, 52, width - 104, height - 104);

  // Corner decorative flourishes
  const cornerSize = 40;
  ctx.strokeStyle = primaryAccent;
  ctx.lineWidth = 4;
  // Top-left
  ctx.beginPath();
  ctx.moveTo(60, 60 + cornerSize);
  ctx.lineTo(60, 60);
  ctx.lineTo(60 + cornerSize, 60);
  ctx.stroke();
  // Top-right
  ctx.beginPath();
  ctx.moveTo(width - 60 - cornerSize, 60);
  ctx.lineTo(width - 60, 60);
  ctx.lineTo(width - 60, 60 + cornerSize);
  ctx.stroke();
  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(60, height - 60 - cornerSize);
  ctx.lineTo(60, height - 60);
  ctx.lineTo(60 + cornerSize, height - 60);
  ctx.stroke();
  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(width - 60 - cornerSize, height - 60);
  ctx.lineTo(width - 60, height - 60);
  ctx.lineTo(width - 60, height - 60 - cornerSize);
  ctx.stroke();

  // 2. Header Section
  ctx.textAlign = 'center';

  // Service Pill Badge (top)
  const badgeY = 115;
  const badgeText = isCounter ? '🛍️  EXPRESS TAKEAWAY  🛍️' : '🍽️  CONTACTLESS DINE-IN SERVICE  🍽️';
  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const badgeMetrics = ctx.measureText(badgeText);
  const badgeWidth = badgeMetrics.width + 70;
  const badgeHeight = 52;

  ctx.fillStyle = primaryAccent;
  ctx.beginPath();
  ctx.roundRect((width - badgeWidth) / 2, badgeY, badgeWidth, badgeHeight, 26);
  ctx.fill();

  ctx.fillStyle = stepBadgeText;
  ctx.fillText(badgeText, width / 2, badgeY + 36);

  // Restaurant Name
  ctx.fillStyle = textColorPrimary;
  ctx.font = '900 68px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const brandTitle = (options.title || 'MOZZ PIZZATERIA').toUpperCase();
  ctx.fillText(brandTitle, width / 2, 260);

  // Tagline / Cuisine
  ctx.fillStyle = textColorSecondary;
  ctx.font = '600 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(options.subtitle || 'Dine-In • Pocket Pizzas • Starters • Express Takeaway', width / 2, 310);

  // 3. Prominent Table Banner Plaque
  const tableBoxY = 360;
  const tableBoxHeight = 140;
  const tableBoxWidth = width - 200;

  const tableGrad = ctx.createLinearGradient(
    (width - tableBoxWidth) / 2,
    tableBoxY,
    (width + tableBoxWidth) / 2,
    tableBoxY + tableBoxHeight
  );
  if (theme === 'clean_minimal') {
    tableGrad.addColorStop(0, 'rgba(15, 23, 42, 0.05)');
    tableGrad.addColorStop(1, 'rgba(15, 23, 42, 0.02)');
  } else {
    tableGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    tableGrad.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
  }

  ctx.fillStyle = tableGrad;
  ctx.beginPath();
  ctx.roundRect((width - tableBoxWidth) / 2, tableBoxY, tableBoxWidth, tableBoxHeight, 28);
  ctx.fill();

  ctx.strokeStyle = primaryAccent;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Identifier (e.g. TABLE 5)
  ctx.fillStyle = textColorPrimary;
  ctx.font = '900 72px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(options.identifier.toUpperCase(), width / 2, tableBoxY + 82);

  // Subtext under table number
  ctx.fillStyle = textColorSecondary;
  ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const tableArea = options.tableName ? `${options.tableName} • ` : '';
  ctx.fillText(
    isCounter ? 'Place order at counter for express packing' : `${tableArea}Direct Kitchen KOT & Table Delivery`,
    width / 2,
    tableBoxY + 120
  );

  // 4. White Center QR Card
  const qrCardY = 540;
  const qrCardSize = 720;
  const qrCardX = (width - qrCardSize) / 2;

  // QR Card Drop Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 15;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(qrCardX, qrCardY, qrCardSize, qrCardSize, 40);
  ctx.fill();
  ctx.restore();

  // Scan Finder Corner Brackets on the QR Card
  const bracketSize = 50;
  const bracketInset = 35;
  ctx.strokeStyle = primaryAccent;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';

  // Top-left
  ctx.beginPath();
  ctx.moveTo(qrCardX + bracketInset, qrCardY + bracketInset + bracketSize);
  ctx.lineTo(qrCardX + bracketInset, qrCardY + bracketInset);
  ctx.lineTo(qrCardX + bracketInset + bracketSize, qrCardY + bracketInset);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(qrCardX + qrCardSize - bracketInset - bracketSize, qrCardY + bracketInset);
  ctx.lineTo(qrCardX + qrCardSize - bracketInset, qrCardY + bracketInset);
  ctx.lineTo(qrCardX + qrCardSize - bracketInset, qrCardY + bracketInset + bracketSize);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(qrCardX + bracketInset, qrCardY + qrCardSize - bracketInset - bracketSize);
  ctx.lineTo(qrCardX + bracketInset, qrCardY + qrCardSize - bracketInset);
  ctx.lineTo(qrCardX + bracketInset + bracketSize, qrCardY + qrCardSize - bracketInset);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(qrCardX + qrCardSize - bracketInset - bracketSize, qrCardY + qrCardSize - bracketInset);
  ctx.lineTo(qrCardX + qrCardSize - bracketInset, qrCardY + qrCardSize - bracketInset);
  ctx.lineTo(qrCardX + qrCardSize - bracketInset, qrCardY + qrCardSize - bracketInset - bracketSize);
  ctx.stroke();

  // QR Code Image
  const qrDataUrl = await generateQRDataURL(options.qrUrl, 640);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = qrDataUrl;
  });

  const qrInnerMargin = 60;
  const qrRenderSize = qrCardSize - qrInnerMargin * 2;
  ctx.drawImage(img, qrCardX + qrInnerMargin, qrCardY + qrInnerMargin - 20, qrRenderSize, qrRenderSize);

  // Call to Action Banner on QR Card
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('SCAN TO ORDER & PAY', width / 2, qrCardY + qrCardSize - 50);

  // Supported scanning apps line
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Works with any Camera  •  GPay  •  PhonePe  •  Paytm  •  UPI', width / 2, qrCardY + qrCardSize - 22);

  // 5. Instruction Steps
  const stepsY = 1320;
  ctx.fillStyle = textColorPrimary;
  ctx.font = '900 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('HOW TO ORDER AT YOUR TABLE', width / 2, stepsY);

  const stepItems = [
    { num: '1', title: 'SCAN QR CODE', desc: 'Use your smartphone camera or any UPI scanner' },
    { num: '2', title: 'CUSTOMIZE ORDER', desc: 'Select pocket pizzas, starters, crusts & beverages' },
    { num: '3', title: 'INSTANT KITCHEN KOT', desc: 'Pay online or cash — sent straight to our chefs' },
  ];

  stepItems.forEach((step, idx) => {
    const itemY = stepsY + 65 + idx * 72;
    const startX = 220;

    // Number Circle
    ctx.fillStyle = stepBadgeBg;
    ctx.beginPath();
    ctx.arc(startX, itemY - 6, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = stepBadgeText;
    ctx.font = '900 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(step.num, startX, itemY + 3);

    // Step text
    ctx.textAlign = 'left';
    ctx.fillStyle = textColorPrimary;
    ctx.font = '900 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(step.title, startX + 46, itemY - 14);

    ctx.fillStyle = textColorSecondary;
    ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(step.desc, startX + 46, itemY + 14);
  });

  // 6. Security & Verification Footer
  const footerY = 1680;
  ctx.textAlign = 'center';
  ctx.strokeStyle = theme === 'clean_minimal' ? 'rgba(0,0,0,0.1)' : 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(100, footerY - 25);
  ctx.lineTo(width - 100, footerY - 25);
  ctx.stroke();

  ctx.fillStyle = textColorSecondary;
  ctx.font = '700 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('🔒 Cryptographically Verified Table Session  •  Authoritative Table UUID', width / 2, footerY + 10);

  ctx.fillStyle = theme === 'clean_minimal' ? '#94a3b8' : 'rgba(255, 255, 255, 0.45)';
  ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Powered by Starters4U Smart Restaurant Platform  •  starters4u.in', width / 2, footerY + 40);

  return canvas.toDataURL('image/png');
}

/**
 * Downloads a complete, branded Table Stand PNG card
 */
export async function downloadTableStandImage(options: StandCardOptions, filename: string): Promise<void> {
  const dataUrl = await generateTableStandDataURL(options);
  triggerDownload(dataUrl, filename);
}
