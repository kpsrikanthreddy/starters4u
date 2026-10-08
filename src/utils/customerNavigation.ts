import { QRSessionInfo } from '../types';

export const QR_SESSION_STORAGE_PREFIX = 'starters4u_verified_qr_session_';

/**
 * Returns scoped sessionStorage key for a restaurant
 */
export function getScopedSessionStorageKey(restaurantSlug: string = 'mozz'): string {
  const clean = (restaurantSlug || 'mozz').toLowerCase().trim();
  return `${QR_SESSION_STORAGE_PREFIX}${clean}`;
}

export interface StoredVerifiedQrSession {
  token: string;
  restaurantSlug: string;
  restaurantId?: string;
  branchId?: string;
  tableId?: string;
  tableNumber?: string;
  source: string;
  orderMode: string;
  savedAt: number;
}

/**
 * Backs up verified QR session to sessionStorage for the current tab
 * Never trusted alone; backend validation (/api/qr/validate) is always required.
 */
export function saveVerifiedQrSession(restaurantSlug: string, session: QRSessionInfo): void {
  if (typeof window === 'undefined' || !session.token || !session.isVerified) return;
  try {
    const slug = (restaurantSlug || session.restaurantSlug || 'mozz').toLowerCase().trim();
    const key = getScopedSessionStorageKey(slug);
    const data: StoredVerifiedQrSession = {
      token: session.token,
      restaurantSlug: slug,
      restaurantId: session.restaurantId,
      branchId: session.branchId,
      tableId: session.tableId,
      tableNumber: session.tableNumber,
      source: session.source,
      orderMode: session.orderMode,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('[customerNavigation] Failed to save QR session backup:', e);
  }
}

/**
 * Reads stored QR session backup from sessionStorage
 */
export function getStoredQrSession(restaurantSlug: string = 'mozz'): StoredVerifiedQrSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const slug = (restaurantSlug || 'mozz').toLowerCase().trim();
    const key = getScopedSessionStorageKey(slug);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === 'string' && parsed.token.includes('.')) {
      return parsed;
    }
  } catch {}
  return null;
}

/**
 * Clears stored QR session backup from sessionStorage
 */
export function clearStoredQrSession(restaurantSlug: string = 'mozz'): void {
  if (typeof window === 'undefined') return;
  try {
    const slug = (restaurantSlug || 'mozz').toLowerCase().trim();
    const key = getScopedSessionStorageKey(slug);
    sessionStorage.removeItem(key);
  } catch {}
}

/**
 * Central customer navigation helper
 * Preserves tenant route and signed token for verified QR sessions.
 * Never adds token for unverified or normal online web customers.
 * Canonical menu route is always /r/:restaurantSlug/menu.
 */
export function buildCustomerNavigationUrl(
  targetPath: string,
  qrSession?: QRSessionInfo | null,
  currentRestaurantSlug?: string
): string {
  // Determine effective slug
  let slug = (currentRestaurantSlug || qrSession?.restaurantSlug || 'mozz').toLowerCase().trim();
  if (slug.startsWith('/r/')) {
    const parts = slug.split('/');
    slug = parts[2] || 'mozz';
  }

  // Parse target path and query string
  let path = targetPath || '/';
  let query = '';
  const qIdx = path.indexOf('?');
  if (qIdx !== -1) {
    query = path.slice(qIdx + 1);
    path = path.slice(0, qIdx);
  }

  // Canonicalize menu paths: /menu -> /r/:slug/menu
  if (path === '/menu' || path === 'menu') {
    path = `/r/${slug}/menu`;
  } else if (path.startsWith('/menu/')) {
    path = `/r/${slug}/menu`;
  } else if (path === '/' && qrSession?.isVerified && qrSession.source === 'table_qr') {
    // Preserve restaurant context for verified Table QR customers
    path = `/r/${slug}`;
  }

  const searchParams = new URLSearchParams(query);

  // Preserve signed token ONLY for verified QR sessions
  if (qrSession?.isVerified && qrSession.token && qrSession.source !== 'online_web') {
    searchParams.set('token', qrSession.token);
  } else {
    // Never append invalid/unverified tokens
    searchParams.delete('token');
    searchParams.delete('t');
  }

  const finalQuery = searchParams.toString();
  return finalQuery ? `${path}?${finalQuery}` : path;
}
