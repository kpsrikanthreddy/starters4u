import crypto from 'crypto';
import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import { JWT_SECRET } from '../config.js';

// Derive 256-bit encryption key from server secret
const ENCRYPTION_KEY = crypto.createHash('sha256').update(JWT_SECRET).digest();

/**
 * Encrypt sensitive token using AES-256-GCM
 */
export function encryptAccessToken(token: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Decrypt sensitive token using AES-256-GCM (server-side only)
 */
export function decryptAccessToken(encrypted: string, ivHex: string, authTagHex: string): string | null {
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[WhatsAppCoexistence] Failed to decrypt access token:', err);
    return null;
  }
}

/**
 * Normalizes Indian mobile number to E.164 format (+919032670077)
 * Accepts 10-digit number without requiring the user to type +91.
 */
export function normalizeIndianPhoneNumber(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  return digits ? `+91${digits}` : '';
}

export interface WhatsAppIntegrationPublicInfo {
  connected: boolean;
  restaurantId: string;
  provider: string;
  connectionMode: 'COEXISTENCE';
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
  displayPhoneNumber?: string;
  whatsappBusinessNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONNECTED' | 'SETUP_INCOMPLETE' | 'ACTION_REQUIRED' | 'PENDING';
  connectedAt?: string;
  updatedAt?: string;
}

export interface CoexistenceOnboardParams {
  code: string;
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
  whatsapp_business_number?: string;
  session_data?: any;
}

class WhatsAppCoexistenceService {
  /**
   * Get public Meta App and Configuration parameters for Embedded Signup
   */
  public getPublicConfig() {
    const appId =
      process.env.META_APP_ID ||
      process.env.WHATSAPP_APP_ID ||
      process.env.VITE_META_APP_ID ||
      process.env.FACEBOOK_APP_ID ||
      '1928586071146037';

    // Fixed Starters4U Facebook Login for Business Configuration ID
    const configId = '1869728914394014';

    return {
      appId,
      configId,
      featureType: 'whatsapp_business_app_onboarding',
      sessionInfoVersion: '3',
      connectionMode: 'COEXISTENCE',
    };
  }

  /**
   * Save or update the restaurant's existing WhatsApp Business App number.
   * NOTE: Does NOT mark integration as CONNECTED.
   * Only stores the normalized number for coexistence onboarding.
   */
  public async saveBusinessNumber(restaurantId: string, rawPhone: string): Promise<WhatsAppIntegrationPublicInfo> {
    if (!restaurantId) throw new Error('Restaurant ID is required');
    const normalized = normalizeIndianPhoneNumber(rawPhone);
    if (!normalized || normalized.replace(/\D/g, '').length < 10) {
      throw new Error('Please enter a valid 10-digit mobile number');
    }

    try {
      const sql = `
        INSERT INTO restaurant_whatsapp_integrations (
          restaurant_id, provider, connection_mode, whatsapp_business_number,
          status, updated_at
        ) VALUES (
          $1, 'META', 'COEXISTENCE', $2,
          'DISCONNECTED', NOW()
        )
        ON CONFLICT (restaurant_id) DO UPDATE SET
          whatsapp_business_number = EXCLUDED.whatsapp_business_number,
          updated_at = NOW()
        RETURNING *;
      `;
      const res = await query(sql, [restaurantId, normalized]);
      if (res.rows && res.rows.length > 0) {
        return this.getIntegrationStatus(restaurantId);
      }
    } catch (err: any) {
      if (!isPostgresRunning()) {
        if (!inMemoryDb.restaurant_whatsapp_integrations) {
          inMemoryDb.restaurant_whatsapp_integrations = [];
        }
        const existing = inMemoryDb.restaurant_whatsapp_integrations.find(
          (i: any) => i.restaurant_id === restaurantId
        );
        if (existing) {
          existing.whatsapp_business_number = normalized;
          existing.updated_at = new Date().toISOString();
        } else {
          inMemoryDb.restaurant_whatsapp_integrations.push({
            id: crypto.randomUUID(),
            restaurant_id: restaurantId,
            provider: 'META',
            connection_mode: 'COEXISTENCE',
            whatsapp_business_number: normalized,
            status: 'DISCONNECTED',
            updated_at: new Date().toISOString(),
          });
        }
        return this.getIntegrationStatus(restaurantId);
      }
      throw err;
    }

    return this.getIntegrationStatus(restaurantId);
  }

  /**
   * Retrieve active WhatsApp Coexistence integration for a specific restaurant
   */
  public async getIntegrationStatus(restaurantId: string): Promise<WhatsAppIntegrationPublicInfo> {
    if (!restaurantId) {
      return {
        connected: false,
        restaurantId: '',
        provider: 'META',
        connectionMode: 'COEXISTENCE',
        status: 'NOT_CONNECTED',
      };
    }

    try {
      const res = await query(
        `SELECT id, restaurant_id, provider, connection_mode, waba_id, phone_number_id,
                business_id, display_phone_number, whatsapp_business_number, verified_name, quality_rating,
                status, connected_at, updated_at
         FROM restaurant_whatsapp_integrations
         WHERE restaurant_id = $1
         LIMIT 1`,
        [restaurantId]
      );

      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        const hasValidIds = Boolean(
          row.waba_id && String(row.waba_id).trim() &&
          row.phone_number_id && String(row.phone_number_id).trim()
        );
        const isConnected = row.status === 'CONNECTED' && hasValidIds;
        let effectiveStatus: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONNECTED' | 'SETUP_INCOMPLETE' | 'ACTION_REQUIRED' | 'PENDING' = 'NOT_CONNECTED';
        if (isConnected) {
          effectiveStatus = 'CONNECTED';
        } else if (row.status === 'CONNECTED' && !hasValidIds) {
          effectiveStatus = 'SETUP_INCOMPLETE';
        } else if (row.status === 'ACTION_REQUIRED' || row.status === 'PENDING') {
          effectiveStatus = 'SETUP_INCOMPLETE';
        } else {
          effectiveStatus = row.status || 'NOT_CONNECTED';
        }

        return {
          connected: isConnected,
          restaurantId: row.restaurant_id,
          provider: row.provider || 'META',
          connectionMode: 'COEXISTENCE',
          wabaId: row.waba_id || undefined,
          phoneNumberId: row.phone_number_id || undefined,
          businessId: row.business_id || undefined,
          displayPhoneNumber: row.display_phone_number || undefined,
          whatsappBusinessNumber: row.whatsapp_business_number || undefined,
          verifiedName: row.verified_name || undefined,
          qualityRating: row.quality_rating || undefined,
          status: effectiveStatus,
          connectedAt: isConnected && row.connected_at ? new Date(row.connected_at).toISOString() : undefined,
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
        };
      }
    } catch (err: any) {
      // In-memory fallback if table is not yet created or local testing
      if (!isPostgresRunning()) {
        const inMem = (inMemoryDb.restaurant_whatsapp_integrations || []).find(
          (i: any) => i.restaurant_id === restaurantId
        );
        if (inMem) {
          const hasValidIds = Boolean(
            inMem.waba_id && String(inMem.waba_id).trim() &&
            inMem.phone_number_id && String(inMem.phone_number_id).trim()
          );
          const isConnected = inMem.status === 'CONNECTED' && hasValidIds;
          let effectiveStatus: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONNECTED' | 'SETUP_INCOMPLETE' | 'ACTION_REQUIRED' | 'PENDING' = 'NOT_CONNECTED';
          if (isConnected) {
            effectiveStatus = 'CONNECTED';
          } else if (inMem.status === 'CONNECTED' && !hasValidIds) {
            effectiveStatus = 'SETUP_INCOMPLETE';
          } else if (inMem.status === 'ACTION_REQUIRED' || inMem.status === 'PENDING') {
            effectiveStatus = 'SETUP_INCOMPLETE';
          } else {
            effectiveStatus = inMem.status || 'NOT_CONNECTED';
          }

          return {
            connected: isConnected,
            restaurantId: inMem.restaurant_id,
            provider: inMem.provider || 'META',
            connectionMode: 'COEXISTENCE',
            wabaId: inMem.waba_id,
            phoneNumberId: inMem.phone_number_id,
            businessId: inMem.business_id,
            displayPhoneNumber: inMem.display_phone_number,
            whatsappBusinessNumber: inMem.whatsapp_business_number,
            verifiedName: inMem.verified_name,
            qualityRating: inMem.quality_rating,
            status: effectiveStatus,
            connectedAt: isConnected && inMem.connected_at ? inMem.connected_at : undefined,
            updatedAt: inMem.updated_at,
          };
        }
      }
      console.warn('[WhatsAppCoexistence] Error fetching integration status:', err.message);
    }

    return {
      connected: false,
      restaurantId,
      provider: 'META',
      connectionMode: 'COEXISTENCE',
      status: 'NOT_CONNECTED',
    };
  }

  /**
   * Process and finalize WhatsApp Business App Coexistence Onboarding
   * Exchanges authorization code server-side and stores encrypted credentials
   */
  public async onboardCoexistence(
    restaurantId: string,
    params: CoexistenceOnboardParams,
    fallbackPhoneNumber?: string
  ): Promise<WhatsAppIntegrationPublicInfo> {
    if (!restaurantId) {
      throw new Error('Restaurant ID is required for WhatsApp coexistence onboarding');
    }
    if (!params.code) {
      throw new Error('Authorization code from Meta is required');
    }

    const { code, waba_id, phone_number_id, business_id, session_data } = params;

    let accessToken: string | null = null;
    let displayPhoneNumber = fallbackPhoneNumber || '';
    let verifiedName = '';
    let qualityRating = 'UNKNOWN';
    let resolvedWabaId = waba_id || '';
    let resolvedPhoneNumberId = phone_number_id || '';
    let resolvedBusinessId = business_id || '';

    // Inspect session_data for extracted fields if top-level parameters were omitted
    if (session_data && typeof session_data === 'object') {
      resolvedWabaId = resolvedWabaId || session_data.waba_id || session_data.wabaId || '';
      resolvedPhoneNumberId = resolvedPhoneNumberId || session_data.phone_number_id || session_data.phoneNumberId || '';
      resolvedBusinessId = resolvedBusinessId || session_data.business_id || session_data.businessId || '';
      if (session_data.display_phone_number || session_data.displayPhoneNumber) {
        displayPhoneNumber = session_data.display_phone_number || session_data.displayPhoneNumber;
      }
    }

    const appId =
      process.env.META_APP_ID || process.env.WHATSAPP_APP_ID || process.env.VITE_META_APP_ID || '1928586071146037';
    const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;

    // Server-side code exchange with Meta Graph API when credentials exist
    if (appId && appSecret && code) {
      try {
        console.info(`[WhatsAppCoexistence] Exchanging authorization code with Meta for restaurant ${restaurantId}...`);
        const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${encodeURIComponent(
          appId
        )}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;

        const tokenRes = await fetch(tokenUrl);
        const tokenData = await tokenRes.json().catch(() => ({}));

        if (tokenRes.ok && tokenData.access_token) {
          accessToken = tokenData.access_token;
          console.info(`[WhatsAppCoexistence] Successfully exchanged token with Meta for restaurant ${restaurantId}`);

          // Query Meta Graph API for Phone Number metadata if phone_number_id is available
          if (resolvedPhoneNumberId) {
            try {
              const phoneUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(
                resolvedPhoneNumberId
              )}?fields=display_phone_number,verified_name,quality_rating&access_token=${encodeURIComponent(accessToken)}`;
              const phoneRes = await fetch(phoneUrl);
              const phoneData = await phoneRes.json().catch(() => ({}));
              if (phoneRes.ok && phoneData) {
                if (phoneData.display_phone_number) displayPhoneNumber = phoneData.display_phone_number;
                if (phoneData.verified_name) verifiedName = phoneData.verified_name;
                if (phoneData.quality_rating) qualityRating = phoneData.quality_rating;
              }
            } catch (err: any) {
              console.warn('[WhatsAppCoexistence] Warning: Could not fetch phone details from Meta:', err.message);
            }
          } else if (resolvedWabaId) {
            // If phone_number_id was not provided in session, query WABA for owned phone numbers
            try {
              const wabaPhonesUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(
                resolvedWabaId
              )}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`;
              const wabaPhonesRes = await fetch(wabaPhonesUrl);
              const wabaPhonesData = await wabaPhonesRes.json().catch(() => ({}));
              if (wabaPhonesRes.ok && Array.isArray(wabaPhonesData.data) && wabaPhonesData.data.length > 0) {
                const firstPhone = wabaPhonesData.data[0];
                resolvedPhoneNumberId = firstPhone.id || resolvedPhoneNumberId;
                if (firstPhone.display_phone_number) displayPhoneNumber = firstPhone.display_phone_number;
                if (firstPhone.verified_name) verifiedName = firstPhone.verified_name;
                if (firstPhone.quality_rating) qualityRating = firstPhone.quality_rating;
              }
            } catch (err: any) {
              console.warn('[WhatsAppCoexistence] Warning: Could not query WABA phone numbers:', err.message);
            }
          }
        } else {
          console.warn('[WhatsAppCoexistence] Meta token exchange responded with:', tokenData);
        }
      } catch (err: any) {
        console.error('[WhatsAppCoexistence] Error during Meta code exchange:', err.message);
      }
    }

    // Encrypt token if available
    let encryptedToken: string | null = null;
    let ivHex: string | null = null;
    let authTagHex: string | null = null;

    if (accessToken) {
      const encryptedObj = encryptAccessToken(accessToken);
      encryptedToken = encryptedObj.encrypted;
      ivHex = encryptedObj.iv;
      authTagHex = encryptedObj.authTag;
    }

    const rawBusinessNumber = params.whatsapp_business_number || fallbackPhoneNumber || '';
    const normalizedBusinessNumber = rawBusinessNumber ? normalizeIndianPhoneNumber(rawBusinessNumber) : '';
    if (!displayPhoneNumber && normalizedBusinessNumber) {
      displayPhoneNumber = normalizedBusinessNumber;
    }

    const now = new Date().toISOString();

    // Validate returned Meta identifiers
    const hasValidIds = Boolean(
      resolvedWabaId && String(resolvedWabaId).trim() &&
      resolvedPhoneNumberId && String(resolvedPhoneNumberId).trim()
    );

    const determinedStatus: 'CONNECTED' | 'ACTION_REQUIRED' = hasValidIds ? 'CONNECTED' : 'ACTION_REQUIRED';

    // Persist into database with ON CONFLICT UPDATE
    try {
      const sql = `
        INSERT INTO restaurant_whatsapp_integrations (
          restaurant_id, provider, connection_mode, waba_id, phone_number_id,
          business_id, display_phone_number, whatsapp_business_number, verified_name, quality_rating,
          status, encrypted_access_token, token_iv, token_auth_tag,
          raw_setup_data, connected_at, updated_at
        ) VALUES (
          $1, 'META', 'COEXISTENCE', $2, $3,
          $4, $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, ${hasValidIds ? 'NOW()' : 'NULL'}, NOW()
        )
        ON CONFLICT (restaurant_id) DO UPDATE SET
          provider = 'META',
          connection_mode = 'COEXISTENCE',
          waba_id = COALESCE(NULLIF(EXCLUDED.waba_id, ''), restaurant_whatsapp_integrations.waba_id),
          phone_number_id = COALESCE(NULLIF(EXCLUDED.phone_number_id, ''), restaurant_whatsapp_integrations.phone_number_id),
          business_id = COALESCE(NULLIF(EXCLUDED.business_id, ''), restaurant_whatsapp_integrations.business_id),
          display_phone_number = COALESCE(NULLIF(EXCLUDED.display_phone_number, ''), restaurant_whatsapp_integrations.display_phone_number),
          whatsapp_business_number = COALESCE(NULLIF(EXCLUDED.whatsapp_business_number, ''), restaurant_whatsapp_integrations.whatsapp_business_number),
          verified_name = COALESCE(NULLIF(EXCLUDED.verified_name, ''), restaurant_whatsapp_integrations.verified_name),
          quality_rating = COALESCE(NULLIF(EXCLUDED.quality_rating, ''), restaurant_whatsapp_integrations.quality_rating),
          status = $9,
          encrypted_access_token = COALESCE(EXCLUDED.encrypted_access_token, restaurant_whatsapp_integrations.encrypted_access_token),
          token_iv = COALESCE(EXCLUDED.token_iv, restaurant_whatsapp_integrations.token_iv),
          token_auth_tag = COALESCE(EXCLUDED.token_auth_tag, restaurant_whatsapp_integrations.token_auth_tag),
          raw_setup_data = EXCLUDED.raw_setup_data,
          connected_at = ${hasValidIds ? 'COALESCE(restaurant_whatsapp_integrations.connected_at, NOW())' : 'NULL'},
          updated_at = NOW()
        RETURNING *;
      `;

      const res = await query(sql, [
        restaurantId,
        resolvedWabaId || null,
        resolvedPhoneNumberId || null,
        resolvedBusinessId || null,
        displayPhoneNumber || null,
        normalizedBusinessNumber || null,
        verifiedName || null,
        qualityRating || null,
        determinedStatus,
        encryptedToken,
        ivHex,
        authTagHex,
        JSON.stringify(session_data || {}),
      ]);

      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        const effectiveStatus = hasValidIds ? 'CONNECTED' : 'SETUP_INCOMPLETE';
        return {
          connected: hasValidIds,
          restaurantId: row.restaurant_id,
          provider: 'META',
          connectionMode: 'COEXISTENCE',
          wabaId: row.waba_id || undefined,
          phoneNumberId: row.phone_number_id || undefined,
          businessId: row.business_id || undefined,
          displayPhoneNumber: row.display_phone_number || undefined,
          whatsappBusinessNumber: row.whatsapp_business_number || normalizedBusinessNumber || undefined,
          verifiedName: row.verified_name || undefined,
          qualityRating: row.quality_rating || undefined,
          status: effectiveStatus,
          connectedAt: hasValidIds && row.connected_at ? new Date(row.connected_at).toISOString() : undefined,
          updatedAt: new Date(row.updated_at).toISOString(),
        };
      }
    } catch (err: any) {
      console.warn('[WhatsAppCoexistence] DB write warning, updating in-memory store:', err.message);
      if (!inMemoryDb.restaurant_whatsapp_integrations) {
        inMemoryDb.restaurant_whatsapp_integrations = [];
      }
      const existingIdx = inMemoryDb.restaurant_whatsapp_integrations.findIndex(
        (i: any) => i.restaurant_id === restaurantId
      );
      const record = {
        id: crypto.randomUUID(),
        restaurant_id: restaurantId,
        provider: 'META',
        connection_mode: 'COEXISTENCE',
        waba_id: resolvedWabaId,
        phone_number_id: resolvedPhoneNumberId,
        business_id: resolvedBusinessId,
        display_phone_number: displayPhoneNumber,
        whatsapp_business_number: normalizedBusinessNumber,
        verified_name: verifiedName,
        quality_rating: qualityRating,
        status: determinedStatus,
        encrypted_access_token: encryptedToken,
        token_iv: ivHex,
        token_auth_tag: authTagHex,
        raw_setup_data: session_data || {},
        connected_at: hasValidIds ? now : undefined,
        updated_at: now,
      };
      if (existingIdx >= 0) {
        inMemoryDb.restaurant_whatsapp_integrations[existingIdx] = {
          ...inMemoryDb.restaurant_whatsapp_integrations[existingIdx],
          ...record,
        };
      } else {
        inMemoryDb.restaurant_whatsapp_integrations.push(record);
      }
      const effectiveStatus = hasValidIds ? 'CONNECTED' : 'SETUP_INCOMPLETE';
      return {
        connected: hasValidIds,
        restaurantId,
        provider: 'META',
        connectionMode: 'COEXISTENCE',
        wabaId: resolvedWabaId || undefined,
        phoneNumberId: resolvedPhoneNumberId || undefined,
        businessId: resolvedBusinessId || undefined,
        displayPhoneNumber: displayPhoneNumber || undefined,
        whatsappBusinessNumber: normalizedBusinessNumber || undefined,
        verifiedName: verifiedName || undefined,
        qualityRating: qualityRating || undefined,
        status: effectiveStatus,
        connectedAt: hasValidIds ? now : undefined,
        updatedAt: now,
      };
    }
  }

  /**
   * Disconnect WhatsApp integration from Starters4U
   * Non-destructive: Does NOT delete/migrate the merchant's WhatsApp Business mobile app account.
   */
  public async disconnect(restaurantId: string): Promise<boolean> {
    if (!restaurantId) return false;

    try {
      await query(
        `UPDATE restaurant_whatsapp_integrations
         SET status = 'DISCONNECTED', updated_at = NOW()
         WHERE restaurant_id = $1`,
        [restaurantId]
      );
    } catch (err: any) {
      console.warn('[WhatsAppCoexistence] Disconnect DB warning:', err.message);
    }

    if (!isPostgresRunning() && inMemoryDb.restaurant_whatsapp_integrations) {
      const rec = inMemoryDb.restaurant_whatsapp_integrations.find(
        (i: any) => i.restaurant_id === restaurantId
      );
      if (rec) {
        rec.status = 'DISCONNECTED';
        rec.updated_at = new Date().toISOString();
      }
    }

    return true;
  }

  /**
   * Platform Admin View: Get WhatsApp status across all restaurants
   */
  public async getAllRestaurantIntegrations(): Promise<any[]> {
    try {
      const res = await query(`
        SELECT r.id AS restaurant_id, r.name AS restaurant_name, r.slug AS restaurant_slug,
               COALESCE(w.status, 'NOT_CONNECTED') AS whatsapp_status,
               w.connection_mode, w.display_phone_number, w.waba_id, w.phone_number_id,
               w.business_id, w.connected_at, w.updated_at
        FROM restaurants r
        LEFT JOIN restaurant_whatsapp_integrations w ON r.id = w.restaurant_id
        ORDER BY r.name ASC
      `);
      return res.rows || [];
    } catch (err: any) {
      console.warn('[WhatsAppCoexistence] Error getting all integrations:', err.message);
      // Fallback
      return inMemoryDb.restaurants.map((r: any) => {
        const w = (inMemoryDb.restaurant_whatsapp_integrations || []).find((i: any) => i.restaurant_id === r.id);
        return {
          restaurant_id: r.id,
          restaurant_name: r.name,
          restaurant_slug: r.slug,
          whatsapp_status: w?.status || 'NOT_CONNECTED',
          connection_mode: w?.connection_mode || 'COEXISTENCE',
          display_phone_number: w?.display_phone_number,
          waba_id: w?.waba_id,
          phone_number_id: w?.phone_number_id,
          business_id: w?.business_id,
          connected_at: w?.connected_at,
          updated_at: w?.updated_at,
        };
      });
    }
  }
}

export const whatsappCoexistenceService = new WhatsAppCoexistenceService();
