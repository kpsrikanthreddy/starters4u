import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
import { RestaurantWhatsAppIntegration } from '../../../types';
import {
  Building2,
  CreditCard,
  Crown,
  Save,
  CheckCircle2,
  MapPin,
  Phone,
  Mail,
  Receipt,
  FileCheck,
  ShieldCheck,
  Zap,
  Globe,
  Copy,
  ExternalLink,
  Share2,
  AlertCircle,
  Check,
  QrCode,
  History,
  Lock,
  Info,
  MessageSquare,
  Smartphone,
  Loader2,
  Unlink,
} from 'lucide-react';

/**
 * Safely inspect and log object structure/key names for debugging Meta payloads
 * STRICTLY REDACTS all sensitive strings (tokens, codes, secrets, credentials)
 */
function getObjectStructure(obj: any, depth = 0): any {
  if (depth > 3 || obj === null || typeof obj !== 'object') {
    return typeof obj;
  }
  if (Array.isArray(obj)) {
    return `Array[${obj.length}]`;
  }
  const result: Record<string, any> = {};
  for (const k of Object.keys(obj)) {
    if (/code|token|secret|password|auth/i.test(k)) {
      result[k] = '[REDACTED]';
    } else if (typeof obj[k] === 'object' && obj[k] !== null) {
      result[k] = getObjectStructure(obj[k], depth + 1);
    } else {
      result[k] = typeof obj[k];
    }
  }
  return result;
}

/**
 * Deep search payload graph for WABA ID, Phone Number ID, and Business ID across any Meta nesting
 */
function extractIdsFromPayload(obj: any): { wabaId?: string; phoneNumberId?: string; businessId?: string } {
  if (!obj || typeof obj !== 'object') return {};
  let wabaId: string | undefined;
  let phoneNumberId: string | undefined;
  let businessId: string | undefined;

  const queue: any[] = [obj];
  const visited = new Set();
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object' || visited.has(cur)) continue;
    visited.add(cur);

    if (!wabaId) {
      if (cur.waba_id) wabaId = String(cur.waba_id);
      else if (cur.wabaId) wabaId = String(cur.wabaId);
      else if (cur.whatsapp_business_account_id) wabaId = String(cur.whatsapp_business_account_id);
      else if (cur.messaging_account_id) wabaId = String(cur.messaging_account_id);
      else if (Array.isArray(cur.waba_ids) && cur.waba_ids.length > 0) wabaId = String(cur.waba_ids[0]);
    }

    if (!phoneNumberId) {
      if (cur.phone_number_id) phoneNumberId = String(cur.phone_number_id);
      else if (cur.phoneNumberId) phoneNumberId = String(cur.phoneNumberId);
      else if (Array.isArray(cur.phone_number_ids) && cur.phone_number_ids.length > 0) phoneNumberId = String(cur.phone_number_ids[0]);
    }

    if (!businessId) {
      if (cur.business_id) businessId = String(cur.business_id);
      else if (cur.businessId) businessId = String(cur.businessId);
    }

    for (const k of Object.keys(cur)) {
      if (cur[k] && typeof cur[k] === 'object') {
        queue.push(cur[k]);
      }
    }
  }

  return { wabaId, phoneNumberId, businessId };
}

export const SettingsSection: React.FC = () => {
  const { user, restaurant, adminFetch, refreshProfile } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'payments' | 'subscription' | 'seo' | 'whatsapp'>('profile');

  // Restaurant Profile
  const [profile, setProfile] = useState<any>({
    name: '',
    tagline: '',
    phone: '',
    email: '',
    address: '',
    fssaiLicense: '',
    gstin: '',
    currency: 'INR',
    slug: '',
    seoStatus: null,
  });

  // Payments
  const [paymentSettings, setPaymentSettings] = useState<any>({
    upiId: '',
    upiMerchantName: '',
    directUpiEnabled: true,
    directUpiProvider: 'GENERIC',
    merchantUpiId: '',
    merchantDisplayName: '',
    razorpayKeyId: '',
    codEnabled: true,
    upiEnabled: true,
  });

  const [paymentChangeReason, setPaymentChangeReason] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showAuditLogs, setShowAuditLogs] = useState<boolean>(false);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  // Subscription
  const [subscription, setSubscription] = useState<any>(null);

  // WhatsApp Coexistence Integration State
  const [whatsAppIntegration, setWhatsAppIntegration] = useState<RestaurantWhatsAppIntegration | null>(null);
  const [whatsAppConfig, setWhatsAppConfig] = useState<{ appId: string; configId: string } | null>(null);
  const [whatsappMobileNumber, setWhatsappMobileNumber] = useState('');
  const [isConnectingWhatsApp, setIsConnectingWhatsApp] = useState(false);
  const [isDisconnectingWhatsApp, setIsDisconnectingWhatsApp] = useState(false);
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [whatsAppSuccess, setWhatsAppSuccess] = useState<string | null>(null);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // Synchronization tracking for Meta Embedded Signup (Auth code + FINISH session event)
  const authCodeRef = useRef<string | null>(null);
  const finishSessionRef = useRef<{
    wabaId?: string;
    phoneNumberId?: string;
    businessId?: string;
    rawData?: any;
  } | null>(null);
  const finishReceivedRef = useRef<boolean>(false);
  const submissionTriggeredRef = useRef<boolean>(false);
  const whatsappMobileNumberRef = useRef<string>(whatsappMobileNumber);
  const fbSdkInitializedRef = useRef<boolean>(false);
  const fbSdkLoadingRef = useRef<boolean>(false);
  const executeBackendOnboardingRef = useRef<(code: string, sessionInfo: any) => Promise<void>>((async () => {}) as any);

  useEffect(() => {
    whatsappMobileNumberRef.current = whatsappMobileNumber;
  }, [whatsappMobileNumber]);

  const isWhatsAppConnected = Boolean(
    whatsAppIntegration?.status === 'CONNECTED' &&
    whatsAppIntegration?.wabaId &&
    whatsAppIntegration?.phoneNumberId
  );

  const isWhatsAppSetupIncomplete = Boolean(
    whatsAppIntegration &&
    !isWhatsAppConnected &&
    (
      whatsAppIntegration.status === 'SETUP_INCOMPLETE' ||
      whatsAppIntegration.status === 'ACTION_REQUIRED' ||
      whatsAppIntegration.status === 'PENDING' ||
      (whatsAppIntegration.status === 'CONNECTED' && (!whatsAppIntegration.wabaId || !whatsAppIntegration.phoneNumberId)) ||
      Boolean(whatsAppIntegration.businessId || whatsAppIntegration.whatsappBusinessNumber)
    )
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    soundService.playChime('notification');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const fetchAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const res = await adminFetch('/api/admin/payment-settings/audit');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Execute onboarding persistence and validation against backend
  const executeBackendOnboarding = useCallback(
    async (
      code: string,
      sessionInfo: { wabaId?: string; phoneNumberId?: string; businessId?: string; rawData?: any }
    ) => {
      if (submissionTriggeredRef.current) return;
      submissionTriggeredRef.current = true;

      const cleanNumber = (whatsappMobileNumberRef.current || '').replace(/\D/g, '');

      try {
        const onboardRes = await adminFetch('/api/admin/whatsapp/onboard-coexistence', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            waba_id: sessionInfo?.wabaId,
            phone_number_id: sessionInfo?.phoneNumberId,
            business_id: sessionInfo?.businessId,
            session_data: sessionInfo?.rawData,
            whatsapp_business_number: cleanNumber,
          }),
        });

        const result = await onboardRes.json();
        console.log('[WA EMBEDDED] Backend response status:', onboardRes.status);
        if (
          onboardRes.ok &&
          result.success &&
          result.integration?.status === 'CONNECTED' &&
          result.integration?.wabaId &&
          result.integration?.phoneNumberId
        ) {
          setWhatsAppIntegration(result.integration);
          setWhatsAppSuccess('WhatsApp Business App successfully connected in Coexistence mode!');
          soundService.playChime('notification');
        } else {
          // If setup is incomplete or missing IDs, allow future submission
          submissionTriggeredRef.current = false;
          if (result.integration) {
            setWhatsAppIntegration(result.integration);
          }
          setWhatsAppError(
            result.message ||
              result.error ||
              'Setup incomplete: Meta WhatsApp Business Account (WABA) or Phone Number ID verification is incomplete. Please click Continue WhatsApp Setup to finish.'
          );
        }
      } catch (postErr: any) {
        submissionTriggeredRef.current = false;
        console.error('[WA EMBEDDED] Backend verification failure:', postErr);
        setWhatsAppError(postErr?.message || 'Error communicating with Starters4U server');
      } finally {
        setIsConnectingWhatsApp(false);
      }
    },
    [adminFetch]
  );

  useEffect(() => {
    executeBackendOnboardingRef.current = executeBackendOnboarding;
  }, [executeBackendOnboarding]);

  // Listen for Meta Embedded Signup session information using window message events
  // Keep the listener active for the entire Embedded Signup process
  useEffect(() => {
    const handleMetaMessage = (event: MessageEvent) => {
      // 1. Direct popup callback from whatsapp-callback.html (same-origin message)
      if (event.origin === window.location.origin && event.data?.type === 'WA_EMBEDDED_SIGNUP_AUTH_RESPONSE') {
        const { code, error } = event.data;
        if (code) {
          console.log('[WA EMBEDDED] Auth callback received (direct popup)');
          authCodeRef.current = code;
          adminFetch('/api/admin/whatsapp/store-auth-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          }).catch(() => {});

          if (finishReceivedRef.current && finishSessionRef.current) {
            executeBackendOnboardingRef.current(code, finishSessionRef.current);
          }
        } else if (error) {
          setIsConnectingWhatsApp(false);
          setWhatsAppError(error || 'Meta authorization was cancelled or failed.');
        }
        return;
      }

      // 2. Validate event origin is from Facebook/Meta before processing it
      const isMetaOrigin = /^https:\/\/([a-zA-Z0-9-]+\.)?facebook\.com$/i.test(event.origin);
      if (!isMetaOrigin) {
        return;
      }

      console.log('[WA EMBEDDED] message received');
      console.log('[WA EMBEDDED] origin:', event.origin);
      console.log('[WA EMBEDDED] data type:', typeof event.data);

      let parsedData: any = null;
      if (typeof event.data === 'string') {
        try {
          parsedData = JSON.parse(event.data);
        } catch {
          // Ignore non-JSON Meta internal strings (e.g., debug/transport frames)
          return;
        }
      } else if (typeof event.data === 'object' && event.data !== null) {
        parsedData = event.data;
      } else {
        return;
      }

      // If nested 'data' is also a JSON string, parse it safely
      let innerData = parsedData.data;
      if (typeof innerData === 'string') {
        try {
          innerData = JSON.parse(innerData);
          parsedData = { ...parsedData, data: innerData };
        } catch {}
      }

      const eventType = parsedData.type || parsedData.event_type || innerData?.type || '';
      const eventName = parsedData.event || parsedData.action || innerData?.event || innerData?.action || parsedData.current_step || '';

      console.log('[WA EMBEDDED] parsed event type:', eventType || 'unspecified');
      console.log('[WA EMBEDDED] parsed event name:', eventName || 'unspecified');
      console.log('[WA EMBEDDED] data structure:', JSON.stringify(getObjectStructure(parsedData)));

      const ids = extractIdsFromPayload(parsedData);

      const isFinish =
        String(eventName).toUpperCase() === 'FINISH' ||
        String(eventType).toUpperCase() === 'FINISH' ||
        String(parsedData.current_step || '').toUpperCase() === 'FINISH' ||
        Boolean(ids.wabaId && ids.phoneNumberId);

      console.log('[WA EMBEDDED] FINISH detected:', isFinish ? 'yes' : 'no');
      console.log('[WA EMBEDDED] waba_id present:', ids.wabaId ? 'yes' : 'no');
      console.log('[WA EMBEDDED] phone_number_id present:', ids.phoneNumberId ? 'yes' : 'no');
      console.log('[WA EMBEDDED] business_id present:', ids.businessId ? 'yes' : 'no');

      if (isFinish) {
        const sessionInfo = {
          wabaId: ids.wabaId,
          phoneNumberId: ids.phoneNumberId,
          businessId: ids.businessId,
          rawData: parsedData,
        };

        finishSessionRef.current = sessionInfo;
        finishReceivedRef.current = true;

        if (authCodeRef.current) {
          executeBackendOnboardingRef.current(authCodeRef.current, sessionInfo);
        } else {
          console.log('[WA EMBEDDED] FINISH session data stored, waiting for auth response...');
          // If FB.login callback is slightly delayed after popup closes, attempt submission
          setTimeout(() => {
            if (!submissionTriggeredRef.current) {
              executeBackendOnboardingRef.current(authCodeRef.current || '', sessionInfo);
            }
          }, 2000);
        }
      } else if (
        String(eventName).toUpperCase() === 'CANCEL' ||
        String(eventType).toUpperCase() === 'CANCEL'
      ) {
        setIsConnectingWhatsApp(false);
        setWhatsAppError('WhatsApp onboarding was cancelled.');
      } else if (
        String(eventName).toUpperCase() === 'ERROR' ||
        String(eventType).toUpperCase() === 'ERROR'
      ) {
        setIsConnectingWhatsApp(false);
        const errorMsg =
          parsedData.error_message ||
          parsedData.data?.error_message ||
          innerData?.error_message ||
          'Meta encountered an error during onboarding. Please try again.';
        setWhatsAppError(errorMsg);
      }
    };

    window.addEventListener('message', handleMetaMessage);
    return () => {
      window.removeEventListener('message', handleMetaMessage);
    };
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [profRes, payRes, subRes, waStatusRes, waCfgRes] = await Promise.all([
          adminFetch('/api/admin/settings'),
          adminFetch('/api/admin/payment-settings'),
          adminFetch('/api/admin/subscription'),
          adminFetch('/api/admin/whatsapp/status'),
          adminFetch('/api/admin/whatsapp/config'),
        ]);

        if (profRes.ok) {
          const d = await profRes.json();
          if (d) setProfile(d);
        }

        if (payRes.ok) {
          const d = await payRes.json();
          if (d) {
            setPaymentSettings({
              ...d,
              directUpiEnabled: d.directUpiEnabled !== false,
              directUpiProvider: d.directUpiProvider || 'GENERIC',
              merchantUpiId: d.merchantUpiId || d.upiId || '',
              merchantDisplayName: d.merchantDisplayName || d.upiMerchantName || '',
            });
          }
        }

        if (subRes.ok) {
          const d = await subRes.json();
          if (d) setSubscription(d);
        }

        if (waStatusRes.ok) {
          const d = await waStatusRes.json();
          if (d) {
            setWhatsAppIntegration(d);
            if (d.whatsappBusinessNumber) {
              const clean = d.whatsappBusinessNumber.replace(/\D/g, '');
              const tenDigits = clean.length >= 10 ? clean.slice(-10) : clean;
              setWhatsappMobileNumber(tenDigits);
            }
          }
        }

        if (waCfgRes.ok) {
          const d = await waCfgRes.json();
          if (d) {
            setWhatsAppConfig(d);
            initMetaSdk(d.appId || '');
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAll();
  }, [adminFetch]);

  // Initialize Meta Facebook JavaScript SDK only once using Starters4U Meta App ID
  const initMetaSdk = useCallback((appId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve(false);
        return;
      }

      // If already initialized and FB.login is ready, resolve immediately
      if (window.FB && typeof window.FB.login === 'function') {
        fbSdkInitializedRef.current = true;
        console.log('[WhatsApp Coexistence] FB SDK status: ready');
        resolve(true);
        return;
      }

      const metaAppId = appId || '1928586071146037';

      const doInit = () => {
        try {
          if (window.FB) {
            window.FB.init({
              appId: metaAppId,
              cookie: true,
              xfbml: false,
              version: 'v21.0',
            });
            fbSdkInitializedRef.current = true;
            fbSdkLoadingRef.current = false;
            console.log('[WhatsApp Coexistence] FB SDK status: ready');
            resolve(true);
          } else {
            fbSdkLoadingRef.current = false;
            resolve(false);
          }
        } catch (err) {
          // If init throws or was already called, check if FB.login is available
          fbSdkLoadingRef.current = false;
          if (window.FB && typeof window.FB.login === 'function') {
            fbSdkInitializedRef.current = true;
            resolve(true);
          } else {
            console.warn('[WhatsApp Coexistence] FB.init note:', err);
            resolve(false);
          }
        }
      };

      if (window.FB) {
        doInit();
        return;
      }

      window.fbAsyncInit = function () {
        doInit();
      };

      const existingScript = document.getElementById('facebook-jssdk') as HTMLScriptElement | null;
      if (!existingScript) {
        fbSdkLoadingRef.current = true;
        const js = document.createElement('script');
        js.id = 'facebook-jssdk';
        js.src = 'https://connect.facebook.net/en_US/sdk.js';
        js.async = true;
        js.defer = true;
        js.crossOrigin = 'anonymous';
        js.onload = () => {
          if (window.FB) {
            doInit();
          }
        };
        js.onerror = (err) => {
          fbSdkLoadingRef.current = false;
          console.warn('[WhatsApp Coexistence] Meta SDK script not accessible (adblocker/tracking protection):', err);
          resolve(false);
        };
        document.body.appendChild(js);
      }

      // Check with polling for up to 2 seconds so UI is never blocked
      let elapsed = 0;
      const pollTimer = setInterval(() => {
        elapsed += 100;
        if (window.FB && typeof window.FB.login === 'function') {
          clearInterval(pollTimer);
          fbSdkInitializedRef.current = true;
          fbSdkLoadingRef.current = false;
          resolve(true);
        } else if (elapsed >= 2000) {
          clearInterval(pollTimer);
          fbSdkLoadingRef.current = false;
          resolve(Boolean(window.FB && typeof window.FB.login === 'function'));
        }
      }, 100);
    });
  }, []);

  // Pre-load Meta SDK as soon as the WhatsApp tab becomes active
  useEffect(() => {
    if (activeTab === 'whatsapp' && !fbSdkInitializedRef.current) {
      initMetaSdk(whatsAppConfig?.appId || '');
    }
  }, [activeTab, whatsAppConfig, initMetaSdk]);

  // Direct OAuth Dialog Popup for WhatsApp Business Coexistence
  const launchDirectPopup = useCallback(
    (configId: string, appId: string, cleanNumber: string) => {
      try {
        const redirectUri = window.location.origin + '/whatsapp-callback.html';
        const extras = JSON.stringify({
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        });
        const popupUrl =
          `https://www.facebook.com/v21.0/dialog/oauth?` +
          `client_id=${encodeURIComponent(appId)}&` +
          `config_id=${encodeURIComponent(configId)}&` +
          `response_type=code&` +
          `override_default_response_type=true&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `extras=${encodeURIComponent(extras)}`;

        const width = 600;
        const height = 750;
        const left = Math.max(0, Math.floor((window.innerWidth - width) / 2 + window.screenX));
        const top = Math.max(0, Math.floor((window.innerHeight - height) / 2 + window.screenY));

        console.log('[WhatsApp Coexistence] Launching direct Embedded Signup popup');
        const popup = window.open(
          popupUrl,
          'MetaWhatsAppCoexistenceOnboarding',
          `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,resizable=yes`
        );

        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          setIsConnectingWhatsApp(false);
          setWhatsAppError('Popup was blocked by your browser. Please allow popups for this site and click Connect again.');
          return;
        }

        // Monitor popup closure
        const pollTimer = setInterval(() => {
          if (popup.closed) {
            clearInterval(pollTimer);
            setTimeout(() => {
              setIsConnectingWhatsApp((prev) => {
                if (prev && !finishReceivedRef.current) {
                  return false;
                }
                return false;
              });
            }, 1000);
          }
        }, 500);
      } catch (popupErr: any) {
        setIsConnectingWhatsApp(false);
        console.error('[WhatsApp Coexistence] Failed to open popup window:', popupErr);
        setWhatsAppError('Unable to open Meta login window. Please allow popups and try again.');
      }
    },
    []
  );

  // Launch Meta Embedded Signup for WhatsApp Business App Coexistence
  const handleConnectWhatsApp = async () => {
    console.log('[WA EMBEDDED] Login started');
    setWhatsAppError(null);
    setWhatsAppSuccess(null);

    // 1. First validate the 10-digit restaurant WhatsApp number
    const cleanNumber = whatsappMobileNumber.replace(/\D/g, '');
    if (cleanNumber.length !== 10) {
      setWhatsAppError('Please enter a valid 10-digit mobile number before connecting.');
      return;
    }
    const normalizedPhone = `+91${cleanNumber}`;
    console.log('[WhatsApp Coexistence] Phone normalized: ' + normalizedPhone);

    // Reset session and code state
    authCodeRef.current = null;
    finishSessionRef.current = null;
    finishReceivedRef.current = false;
    submissionTriggeredRef.current = false;

    // 2. Check Meta JavaScript SDK availability
    let isReady = Boolean(
      typeof window !== 'undefined' &&
        window.FB &&
        typeof window.FB.login === 'function'
    );

    if (!isReady) {
      console.log('[WhatsApp Coexistence] FB SDK status: not_ready (initializing)');
      const initialized = await initMetaSdk(whatsAppConfig?.appId || '');
      isReady = Boolean(
        initialized ||
          (typeof window !== 'undefined' &&
            window.FB &&
            typeof window.FB.login === 'function')
      );
    }

    console.log('[WhatsApp Coexistence] FB SDK status:', isReady ? 'ready' : 'fallback_popup');

    // 3. Set connecting state (Do NOT set an active-onboarding timeout while popup is open)
    setIsConnectingWhatsApp(true);

    // Pre-save draft business number in background (fire-and-forget, non-blocking)
    adminFetch('/api/admin/whatsapp/business-number', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber: cleanNumber,
      }),
    }).catch((err) => {
      console.warn('[WhatsApp Coexistence] Background draft number save notice:', err?.message || err);
    });

    const configId = whatsAppConfig?.configId || '1869728914394014';
    const metaAppId = whatsAppConfig?.appId || '1928586071146037';

    // If FB SDK is available, use FB.login with standard config
    if (isReady && window.FB && typeof window.FB.login === 'function') {
      try {
        window.FB.login(
          (response: any) => {
            console.log('[WA EMBEDDED] Auth callback received');

            if (response && response.authResponse && response.authResponse.code) {
              const code = response.authResponse.code;
              authCodeRef.current = code;

              // Cache authorization code on backend temporarily
              adminFetch('/api/admin/whatsapp/store-auth-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
              }).catch((err) => {
                console.warn('[WA EMBEDDED] Notice: could not pre-cache auth code:', err);
              });

              if (finishReceivedRef.current && finishSessionRef.current) {
                // If FINISH event was already received with IDs, execute onboarding immediately
                executeBackendOnboardingRef.current(code, finishSessionRef.current);
              } else {
                // Keep auth code ready and wait for user to click Meta's blue Finish button
                console.log('[WA EMBEDDED] Auth code stored, waiting for Embedded Signup FINISH event...');
              }
            } else {
              if (!finishReceivedRef.current) {
                setIsConnectingWhatsApp(false);
                if (response?.status === 'unknown') {
                  setWhatsAppError('WhatsApp connection window was closed.');
                } else {
                  setWhatsAppError(
                    response?.error_message ||
                      'Could not obtain authorization code from Meta. Please retry.'
                  );
                }
              }
            }
          },
          {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              featureType: 'whatsapp_business_app_onboarding',
              sessionInfoVersion: '3',
            },
          }
        );
      } catch (launchErr: any) {
        console.warn('[WhatsApp Coexistence] FB.login exception, launching direct popup fallback:', launchErr);
        launchDirectPopup(configId, metaAppId, cleanNumber);
      }
    } else {
      // Seamless direct popup fallback (handles browsers with adblockers blocking connect.facebook.net)
      launchDirectPopup(configId, metaAppId, cleanNumber);
    }
  };

  // Disconnect handler with confirmation
  const handleConfirmDisconnect = async () => {
    setIsDisconnectingWhatsApp(true);
    setWhatsAppError(null);
    try {
      const res = await adminFetch('/api/admin/whatsapp/disconnect', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWhatsAppIntegration(data.integration);
        setShowDisconnectModal(false);
        setWhatsAppSuccess('WhatsApp Business App disconnected successfully.');
        soundService.playChime('notification');
      } else {
        setWhatsAppError(data.error || 'Failed to disconnect WhatsApp integration');
      }
    } catch (err: any) {
      setWhatsAppError(err.message || 'Network error while disconnecting');
    } finally {
      setIsDisconnectingWhatsApp(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      const res = await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSavedSuccess(true);
        soundService.playChime('notification');
        await refreshProfile();
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        alert('Failed to update restaurant settings.');
      }
    } catch (err: any) {
      alert(`Error saving profile: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePayments = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      const payload = {
        ...paymentSettings,
        upiId: paymentSettings.merchantUpiId || paymentSettings.upiId,
        upiMerchantName: paymentSettings.merchantDisplayName || paymentSettings.upiMerchantName,
        reason: paymentChangeReason || 'Updated via Restaurant Admin Settings',
      };
      const res = await adminFetch('/api/admin/payment-settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSavedSuccess(true);
        soundService.playChime('notification');
        setPaymentChangeReason('');
        if (showAuditLogs) {
          await fetchAuditLogs();
        }
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        alert('Failed to update payment settings.');
      }
    } catch (err: any) {
      alert(`Error saving payment settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-900">
            Restaurant Outlet Settings
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure restaurant identity, billing details, payment gateways, and subscription tier.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl text-xs font-bold">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'profile' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'payments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Payments
          </button>
          <button
            onClick={() => setActiveTab('subscription')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'subscription' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Plan & Tier
          </button>
          <button
            onClick={() => setActiveTab('seo')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'seo' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>SEO & Links</span>
          </button>
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'whatsapp' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-600'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp Integration</span>
          </button>
        </div>
      </div>

      {/* Profile Form */}
      {activeTab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Restaurant Legal Name *
              </label>
              <input
                type="text"
                required
                value={profile.name || ''}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900 focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Tagline / Brand Subtitle
              </label>
              <input
                type="text"
                value={profile.tagline || ''}
                onChange={(e) => setProfile({ ...profile, tagline: e.target.value })}
                placeholder="Authentic Pizzas & Sizzling Starters"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                value={profile.phone || ''}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Public / Support Email
              </label>
              <input
                type="email"
                value={profile.email || ''}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="contact@restaurant.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Address
              </label>
              <input
                type="text"
                value={profile.address || ''}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                placeholder="Street Address, City, State, PIN"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                FSSAI License #
              </label>
              <input
                type="text"
                value={profile.fssaiLicense || ''}
                onChange={(e) => setProfile({ ...profile, fssaiLicense: e.target.value })}
                placeholder="14-digit FSSAI number"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-slate-900 focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                GSTIN Tax Number
              </label>
              <input
                type="text"
                value={profile.gstin || ''}
                onChange={(e) => setProfile({ ...profile, gstin: e.target.value })}
                placeholder="GST Identification Number"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-slate-900 focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              {savedSuccess && (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Profile updated successfully!</span>
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition flex items-center gap-2 shadow-md shadow-rose-900/20"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Payments Form */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSavePayments}
            className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6"
          >
            {/* Header info */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Payment Gateways & Direct Settlement</h3>
                  <p className="text-xs text-slate-500">Configure customer direct-to-merchant UPI & online payment processing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextState = !showAuditLogs;
                  setShowAuditLogs(nextState);
                  if (nextState) fetchAuditLogs();
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <History className="w-4 h-4 text-slate-500" />
                <span>{showAuditLogs ? 'Hide Audit Trail' : 'View Audit Trail'}</span>
              </button>
            </div>

            {/* Current Active Checkout Routing & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Direct Merchant UPI</div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-900">
                    {paymentSettings.merchantUpiId || paymentSettings.upiId ? (
                      <span className="text-emerald-700 flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Configured ({paymentSettings.merchantUpiId || paymentSettings.upiId})</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 flex items-center gap-1.5 font-semibold">
                        <AlertCircle className="w-4 h-4 text-slate-400" />
                        <span>Not Configured</span>
                      </span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    Stored for Future Use
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 shadow-2xs space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Current Checkout Provider</div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-extrabold text-blue-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span>Razorpay</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                    Active Checkout
                  </span>
                </div>
              </div>
            </div>

            {/* Direct UPI Inactive / Informational Banner */}
            <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-950 text-xs flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-extrabold text-amber-950">
                  Direct UPI is currently not used for customer checkout.
                </p>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  Online Dine-in, Takeaway and Counter payments are processed through Razorpay. All Direct UPI settings, merchant VPA (<strong className="font-mono">{paymentSettings.merchantUpiId || paymentSettings.upiId || '8179620607@okbizaxis'}</strong>), and audit records remain stored for future activation.
                </p>
              </div>
            </div>

            {/* Direct UPI Section */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Direct Merchant UPI (0% Fee, Instant Settlement)</h4>
                    <p className="text-[11px] text-slate-500">Payments route directly into the restaurant's bank account with immutable transaction snapshotting.</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paymentSettings.directUpiEnabled !== false}
                    onChange={(e) =>
                      setPaymentSettings({ ...paymentSettings, directUpiEnabled: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-2">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    UPI Provider
                  </label>
                  <select
                    value={paymentSettings.directUpiProvider || 'GENERIC'}
                    onChange={(e) =>
                      setPaymentSettings({ ...paymentSettings, directUpiProvider: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                  >
                    <option value="GENERIC">Generic UPI / Any Bank VPA</option>
                    <option value="PHONEPE">PhonePe for Business</option>
                    <option value="PAYTM">Paytm for Business</option>
                    <option value="GOOGLE_PAY">Google Pay for Business</option>
                    <option value="BHIM">BHIM / NPCI Official</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    Merchant UPI ID (VPA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={paymentSettings.merchantUpiId || paymentSettings.upiId || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPaymentSettings({
                        ...paymentSettings,
                        merchantUpiId: val,
                        upiId: val,
                      });
                    }}
                    placeholder="e.g. restaurant@okaxis"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 font-mono text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Verified handle where customer UPI transfers land.
                  </p>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    Merchant Display Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={paymentSettings.merchantDisplayName || paymentSettings.upiMerchantName || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPaymentSettings({
                        ...paymentSettings,
                        merchantDisplayName: val,
                        upiMerchantName: val,
                      });
                    }}
                    placeholder="e.g. MOZZ Restaurant"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Payee name shown on customer's PhonePe/GPay screen.
                  </p>
                </div>
              </div>
            </div>

            {/* Additional Gateway Config */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  Razorpay Key ID (Card / Netbanking - Optional)
                </label>
                <input
                  type="text"
                  value={paymentSettings.razorpayKeyId || ''}
                  onChange={(e) =>
                    setPaymentSettings({ ...paymentSettings, razorpayKeyId: e.target.value })
                  }
                  placeholder="rzp_live_..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  Reason for Update (Audit Log)
                </label>
                <input
                  type="text"
                  value={paymentChangeReason}
                  onChange={(e) => setPaymentChangeReason(e.target.value)}
                  placeholder="e.g. Updated current bank account UPI handle"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                {savedSuccess && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Payment settings & audit log successfully saved!</span>
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition flex items-center gap-2 shadow-md shadow-rose-900/20 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Payment Settings'}</span>
              </button>
            </div>
          </form>

          {/* Audit Logs Accordion */}
          {showAuditLogs && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-amber-600" />
                  <h4 className="text-sm font-bold text-slate-900">Payment Settings Audit History</h4>
                </div>
                <button
                  type="button"
                  onClick={fetchAuditLogs}
                  disabled={loadingAudit}
                  className="text-xs text-rose-600 font-semibold hover:underline"
                >
                  {loadingAudit ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {loadingAudit ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading audit history...</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 text-slate-400 text-xs text-center">
                  No payment setting changes recorded in audit history yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                    <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase">
                      <tr>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3">UPI ID (VPA)</th>
                        <th className="p-3">Merchant Name</th>
                        <th className="p-3">Direct UPI Status</th>
                        <th className="p-3">Changed By</th>
                        <th className="p-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono text-[11px] text-slate-600">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900">
                            {log.merchant_upi_id || log.upi_id || '—'}
                          </td>
                          <td className="p-3 text-slate-800 font-medium">
                            {log.merchant_display_name || log.upi_merchant_name || '—'}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.direct_upi_enabled !== false
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {log.direct_upi_enabled !== false ? 'ENABLED' : 'DISABLED'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">
                            {log.changed_by_name || log.changed_by_role || 'Admin'}
                          </td>
                          <td className="p-3 text-slate-500 italic max-w-xs truncate">
                            {log.reason || 'Settings modified'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Subscription Tier */}
      {activeTab === 'subscription' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <Crown className="w-8 h-8 text-amber-600 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-slate-900">
                  {subscription?.plan || 'Enterprise / Multi-Outlet Pro'}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                  {subscription?.status || 'Active'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Full POS Suite, Unlimited QR Codes, Thermal Print Agents, and Cloud Analytics.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Billing Cycle</div>
              <div className="font-black text-slate-900 text-sm mt-0.5">Monthly SaaS</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Tenant License</div>
              <div className="font-black text-slate-900 text-sm mt-0.5">Starters4U Verified</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Support Level</div>
              <div className="font-black text-slate-900 text-sm mt-0.5">Priority 24/7</div>
            </div>
          </div>
        </div>
      )}

      {/* SEO & Public Links */}
      {activeTab === 'seo' && (
        <div className="space-y-5">
          {/* Main URLs Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-rose-600" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  Public Storefront & Google Business Ordering Links
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Share these official canonical URLs with your customers, on social media, and on Google Business Profile.
              </p>
            </div>

            {/* Public Restaurant URL */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  Public Restaurant Page
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                  SEO Ready & Sitemap Included
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`https://www.starters4u.in/r/${profile.slug || restaurant?.slug || ''}`}
                  className="w-full text-xs font-mono font-bold bg-white text-slate-800 px-3 py-2 rounded-lg border border-slate-200 select-all"
                />
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `https://www.starters4u.in/r/${profile.slug || restaurant?.slug || ''}`,
                      'publicUrl'
                    )
                  }
                  className="shrink-0 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  {copiedKey === 'publicUrl' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <a
                  href={`/r/${profile.slug || restaurant?.slug || ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 border border-slate-200"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open</span>
                </a>
              </div>
              <p className="text-[11px] text-slate-500">
                Direct landing page featuring your brand identity, operating hours, cuisines, and digital menu entry.
              </p>
            </div>

            {/* Google Business Ordering URL */}
            <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-rose-600" />
                  Google Business Ordering URL
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-black">
                  Recommended for Google Profile
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`https://www.starters4u.in/r/${profile.slug || restaurant?.slug || ''}/menu`}
                  className="w-full text-xs font-mono font-bold bg-white text-rose-950 px-3 py-2 rounded-lg border border-rose-300 select-all"
                />
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `https://www.starters4u.in/r/${profile.slug || restaurant?.slug || ''}/menu`,
                      'orderingUrl'
                    )
                  }
                  className="shrink-0 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  {copiedKey === 'orderingUrl' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Google Ordering URL</span>
                    </>
                  )}
                </button>
                <a
                  href={`/r/${profile.slug || restaurant?.slug || ''}/menu`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-3 py-2 rounded-lg bg-white hover:bg-rose-100/50 text-rose-700 text-xs font-bold transition flex items-center gap-1.5 border border-rose-200"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open</span>
                </a>
              </div>
              <p className="text-[11px] text-rose-800">
                Direct link that opens your interactive digital menu. Paste this URL into your Google Business Profile to receive direct orders with zero commission.
              </p>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                How to Add this Ordering URL to Google Business Profile:
              </h4>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700">
                <li>
                  Go to <strong className="text-slate-900">Google Business Profile</strong> (
                  <a
                    href="https://business.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-rose-600 hover:underline inline-flex items-center gap-0.5"
                  >
                    business.google.com <ExternalLink className="w-3 h-3 inline" />
                  </a>
                  ) and sign in.
                </li>
                <li>
                  Click <strong className="text-slate-900">Edit profile</strong> and navigate to{' '}
                  <strong className="text-slate-900">Online ordering</strong> (or <strong className="text-slate-900">Food ordering</strong> / <strong className="text-slate-900">Menu link</strong>).
                </li>
                <li>
                  Click <strong className="text-slate-900">Add link</strong> or edit the existing link, and paste your Starters4U Menu URL above:
                  <div className="mt-1 font-mono text-[11px] bg-white p-2 rounded border border-slate-200 text-slate-900 break-all">
                    https://www.starters4u.in/r/{profile.slug || restaurant?.slug || ''}/menu
                  </div>
                </li>
                <li>
                  Click <strong className="text-slate-900">Save</strong>. Google will review and activate your ordering link on Google Maps and Google Search.
                </li>
              </ol>

              {/* Crucial Disclaimers */}
              <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Important Notice:</p>
                  <p className="text-[11px] leading-relaxed">
                    • <strong>Manual Profile Update Required:</strong> Starters4U does <em>not</em> automatically modify your external Google Business Profile. You must paste the link above into your Google account directly.
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    • <strong>Search Engine Discovery:</strong> Your restaurant is automatically published in Starters4U’s dynamic <code className="text-amber-900">sitemap.xml</code> for search crawler discovery. Google determines actual indexation and ranking schedules according to its webmaster guidelines.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SEO Readiness & Canonical Details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              SEO System Status & Technical Verification
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Public Storefront</div>
                <div className="font-black text-emerald-600 text-sm mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ACTIVE</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Live customer ordering enabled</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Restaurant Slug</div>
                <div className="font-mono font-black text-slate-900 text-sm mt-0.5">
                  {profile.slug || restaurant?.slug || '—'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Permanent URL identifier</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Sitemap.xml Status</div>
                <div className="font-black text-emerald-600 text-sm mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>INCLUDED</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Published dynamically to Google</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Indexability</div>
                <div className="font-black text-emerald-600 text-sm mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>INDEX, FOLLOW</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Crawlers invited to index</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 sm:col-span-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Canonical URLs</div>
                <div className="font-mono text-[11px] text-slate-700 mt-0.5 break-all">
                  https://www.starters4u.in/r/{profile.slug || restaurant?.slug || ''}
                </div>
                <div className="font-mono text-[11px] text-slate-500 mt-0.5 break-all">
                  https://www.starters4u.in/r/{profile.slug || restaurant?.slug || ''}/menu
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Integration Tab */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          {whatsAppSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-semibold">{whatsAppSuccess}</span>
              </div>
              <button
                type="button"
                onClick={() => setWhatsAppSuccess(null)}
                className="text-emerald-700 hover:text-emerald-900 font-bold ml-3"
              >
                Dismiss
              </button>
            </div>
          )}

          {whatsAppError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <span className="font-semibold">{whatsAppError}</span>
              </div>
              <button
                type="button"
                onClick={() => setWhatsAppError(null)}
                className="text-rose-700 hover:text-rose-900 font-bold ml-3"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 shadow-xs">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">WhatsApp Business</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Connect your restaurant's existing WhatsApp Business App number to Starters4U.
                  </p>
                </div>
              </div>

              {/* Status pill */}
              <div className="flex items-center gap-2">
                {isWhatsAppConnected ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                  </span>
                ) : isWhatsAppSetupIncomplete ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Setup incomplete
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Not Connected
                  </span>
                )}
              </div>
            </div>

            {/* Content: Connected vs Not Connected */}
            {isWhatsAppConnected ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</div>
                    <div className="font-bold text-emerald-600 text-sm mt-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Connected
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">Verified with Meta Platform</div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mode</div>
                    <div className="font-bold text-slate-900 text-sm mt-1 flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                      Coexistence
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">App + API active simultaneously</div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phone</div>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-1">
                      {whatsAppIntegration?.whatsappBusinessNumber || whatsAppIntegration?.displayPhoneNumber || profile?.phone || 'Connected'}
                    </div>
                    {whatsAppIntegration?.verifiedName && (
                      <div className="text-[11px] text-slate-500 mt-1 truncate">
                        {whatsAppIntegration.verifiedName}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100 text-slate-700 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Coexistence Active
                  </h4>
                  <p className="text-xs text-slate-600">
                    Your staff can continue answering chats on the WhatsApp Business mobile app as normal. Starters4U handles automated receipts, table ordering notifications, and customer feedback alongside your daily mobile usage.
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Need to disconnect or reconfigure this WhatsApp integration?
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDisconnectModal(true)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {isWhatsAppSetupIncomplete && (
                  <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-bold text-xs uppercase tracking-wider">Setup Action Required</span>
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Your restaurant's Meta authorization is registered
                      {whatsAppIntegration?.businessId ? ` (Business ID: ${whatsAppIntegration.businessId})` : ''}, but the WhatsApp Business Account (WABA) or Phone Number ID verification did not complete.
                    </p>
                    <p className="text-xs text-amber-700">
                      Click <strong>Continue WhatsApp Setup</strong> below to re-open Meta's Embedded Signup and finish linking your WhatsApp account.
                    </p>
                  </div>
                )}

                <div className="p-5 rounded-2xl bg-emerald-50/40 border border-emerald-100 space-y-3">
                  <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    WhatsApp Business App Coexistence
                  </h4>
                  <ul className="text-xs space-y-2 text-slate-700 list-disc list-inside">
                    <li>
                      <span className="font-semibold text-slate-900">Restaurant keeps using its existing WhatsApp Business mobile app.</span>
                    </li>
                    <li>
                      <span className="font-semibold text-slate-900">Starters4U can also use WhatsApp Business Platform APIs.</span>
                    </li>
                    <li>
                      <span className="font-semibold text-slate-900">Do NOT migrate/disconnect/delete the restaurant's existing WhatsApp Business App account.</span>
                    </li>
                  </ul>
                </div>

                {/* WhatsApp Business Number Input Form */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                      <span>WhatsApp Business Number</span>
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                        Country
                      </label>
                      <div className="flex items-center px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 font-medium text-slate-800 text-xs shadow-2xs">
                        <span>India (+91)</span>
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                        Mobile Number
                      </label>
                      <input
                        type="tel"
                        value={whatsappMobileNumber}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setWhatsappMobileNumber(val);
                          if (whatsAppError) setWhatsAppError(null);
                        }}
                        placeholder="9032670077"
                        maxLength={10}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 font-mono text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 tracking-wide shadow-2xs"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span>Example: 9032670077</span>
                        <span className="font-mono text-slate-400">{whatsappMobileNumber.length}/10</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    Enter the WhatsApp Business number currently used by your restaurant.
                  </p>
                </div>

                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    onClick={handleConnectWhatsApp}
                    disabled={isConnectingWhatsApp || whatsappMobileNumber.replace(/\D/g, '').length !== 10}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs shadow-sm hover:shadow transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isConnectingWhatsApp ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connecting with Meta...
                      </>
                    ) : isWhatsAppSetupIncomplete ? (
                      <>
                        <MessageSquare className="w-4 h-4" />
                        Continue WhatsApp Setup
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4" />
                        Connect WhatsApp Business
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-slate-500">
                    Opens Meta's secure Embedded Signup modal. Uses Starters4U's official Meta Login Configuration.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">Disconnect WhatsApp Business?</h3>
                <p className="text-xs text-slate-500">Requires restaurant admin confirmation</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                This action will pause Starters4U's integration with your WhatsApp Business number.
              </p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 font-medium">
                Your mobile WhatsApp Business App and chat history will remain completely untouched and active on your phone.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                disabled={isDisconnectingWhatsApp}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                disabled={isDisconnectingWhatsApp}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDisconnectingWhatsApp ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  'Confirm Disconnect'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
