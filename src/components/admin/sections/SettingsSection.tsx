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

  // Meta SDK initialization & safety timeout tracking
  const fbSdkInitializedRef = useRef<boolean>(false);
  const fbSdkLoadingRef = useRef<boolean>(false);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Captured Meta Embedded Signup session data (populated via postMessage from Facebook/Meta)
  const capturedSessionRef = useRef<{
    wabaId?: string;
    phoneNumberId?: string;
    businessId?: string;
    status?: string;
  }>({});

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

  // Listen for Meta Embedded Signup session information using window message events
  useEffect(() => {
    const handleMetaMessage = (event: MessageEvent) => {
      // Validate event origin is from Facebook/Meta before processing it
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
        return;
      }

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;

        // Meta Embedded Signup emits events like WA_EMBEDDED_SIGNUP or session payloads
        if (data.type === 'WA_EMBEDDED_SIGNUP' || data.event === 'FINISH' || data.phone_number_id || data.waba_id) {
          const payload = data.data || data;
          const wabaId = payload.waba_id || payload.wabaId;
          const phoneNumberId = payload.phone_number_id || payload.phoneNumberId;
          const businessId = payload.business_id || payload.businessId;
          const status = payload.status || payload.current_step || data.event;

          console.log('[WhatsApp Coexistence] Embedded Signup event:', data.type || data.event || 'session_info', status || 'received');

          capturedSessionRef.current = {
            ...capturedSessionRef.current,
            ...(wabaId ? { wabaId: String(wabaId) } : {}),
            ...(phoneNumberId ? { phoneNumberId: String(phoneNumberId) } : {}),
            ...(businessId ? { businessId: String(businessId) } : {}),
            ...(status ? { status: String(status) } : {}),
          };
        }
      } catch {
        // Non-JSON message from external frame, safely ignore
      }
    };

    window.addEventListener('message', handleMetaMessage);
    return () => {
      window.removeEventListener('message', handleMetaMessage);
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }
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

      if (window.FB && fbSdkInitializedRef.current) {
        console.log('[WhatsApp Coexistence] FB SDK status: ready');
        resolve(true);
        return;
      }

      if (fbSdkLoadingRef.current) {
        const checkInterval = setInterval(() => {
          if (window.FB && fbSdkInitializedRef.current) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(Boolean(window.FB && fbSdkInitializedRef.current));
        }, 8000);
        return;
      }

      fbSdkLoadingRef.current = true;
      const metaAppId = appId || '1869728914394014';

      const doInit = () => {
        try {
          if (window.FB) {
            window.FB.init({
              appId: metaAppId,
              cookie: true,
              xfbml: true,
              version: 'v21.0',
            });
            fbSdkInitializedRef.current = true;
            fbSdkLoadingRef.current = false;
            console.log('[WhatsApp Coexistence] FB SDK status: ready');
            resolve(true);
          } else {
            fbSdkLoadingRef.current = false;
            console.error('[WhatsApp Coexistence] window.FB not available on initialization');
            resolve(false);
          }
        } catch (err) {
          fbSdkLoadingRef.current = false;
          console.error('[WhatsApp Coexistence] Error during FB.init:', err);
          resolve(false);
        }
      };

      if (window.FB) {
        doInit();
        return;
      }

      window.fbAsyncInit = function () {
        doInit();
      };

      if (!document.getElementById('facebook-jssdk')) {
        const js = document.createElement('script');
        js.id = 'facebook-jssdk';
        js.src = 'https://connect.facebook.net/en_US/sdk.js';
        js.async = true;
        js.defer = true;
        js.onload = () => {
          if (window.FB && !fbSdkInitializedRef.current) {
            doInit();
          }
        };
        js.onerror = (err) => {
          fbSdkLoadingRef.current = false;
          console.error('[WhatsApp Coexistence] Failed to load Meta SDK script:', err);
          resolve(false);
        };
        document.body.appendChild(js);
      } else {
        if (window.FB) {
          doInit();
        }
      }
    });
  }, []);

  // Pre-load Meta SDK as soon as the WhatsApp tab becomes active
  useEffect(() => {
    if (activeTab === 'whatsapp' && !fbSdkInitializedRef.current) {
      initMetaSdk(whatsAppConfig?.appId || '');
    }
  }, [activeTab, whatsAppConfig, initMetaSdk]);

  // Launch Meta Embedded Signup for WhatsApp Business App Coexistence
  const handleConnectWhatsApp = async () => {
    console.log('[WhatsApp Coexistence] Connect clicked');
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

    // 2. Verify Meta JavaScript SDK exists and FB.init has completed
    // Do NOT set the button to loading until the SDK is ready
    let isReady = Boolean(
      typeof window !== 'undefined' &&
        window.FB &&
        typeof window.FB.login === 'function' &&
        fbSdkInitializedRef.current
    );

    if (!isReady) {
      console.log('[WhatsApp Coexistence] FB SDK status: not_ready (initializing)');
      const initialized = await initMetaSdk(whatsAppConfig?.appId || '');
      isReady = Boolean(
        initialized &&
          typeof window !== 'undefined' &&
          window.FB &&
          typeof window.FB.login === 'function'
      );
    }

    console.log('[WhatsApp Coexistence] FB SDK status:', isReady ? 'ready' : 'failed');

    if (!isReady || !window.FB || typeof window.FB.login !== 'function') {
      console.error('[WhatsApp Coexistence] Real error: Meta Facebook SDK failed to initialize or window.FB is unavailable');
      setIsConnectingWhatsApp(false);
      setWhatsAppError('Unable to load Meta login. Please refresh and try again.');
      return;
    }

    // 3. Set connecting immediately before FB.login()
    setIsConnectingWhatsApp(true);

    // 4. Start 30-second safety timeout so UI never remains permanently in connecting state
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
    }
    safetyTimeoutRef.current = setTimeout(() => {
      console.warn('[WhatsApp Coexistence] Embedded Signup timed out after 30 seconds');
      setIsConnectingWhatsApp(false);
      setWhatsAppError('Meta connection timed out. If the popup was blocked by your browser, please allow popups and try again.');
    }, 30000);

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

    // Reset session capture
    capturedSessionRef.current = {};

    console.log('[WhatsApp Coexistence] Launching Embedded Signup');

    try {
      window.FB.login(
        async (response: any) => {
          // Clear 30s safety timeout immediately upon callback
          if (safetyTimeoutRef.current) {
            clearTimeout(safetyTimeoutRef.current);
            safetyTimeoutRef.current = null;
          }

          console.log('[WhatsApp Coexistence] FB.login callback:', {
            status: response?.status,
            hasAuthResponse: Boolean(response?.authResponse),
            hasCode: Boolean(response?.authResponse?.code),
          });

          try {
            if (response && response.authResponse && response.authResponse.code) {
              const code = response.authResponse.code;
              const onboardRes = await adminFetch('/api/admin/whatsapp/onboard-coexistence', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  code,
                  wabaId: capturedSessionRef.current.wabaId,
                  phoneNumberId: capturedSessionRef.current.phoneNumberId,
                  businessId: capturedSessionRef.current.businessId,
                  whatsappBusinessNumber: cleanNumber,
                }),
              });

              const result = await onboardRes.json();
              if (onboardRes.ok && result.success) {
                setWhatsAppIntegration(result.integration);
                setWhatsAppSuccess(
                  'WhatsApp Business App successfully connected in Coexistence mode!'
                );
                soundService.playChime('notification');
              } else {
                setWhatsAppError(result.error || 'Failed to complete WhatsApp onboarding');
              }
            } else {
              // Popup cancelled, closed, or Meta error
              if (response?.status === 'unknown') {
                setWhatsAppError('WhatsApp connection window was closed or cancelled.');
              } else {
                setWhatsAppError(
                  response?.error_message ||
                    'Could not obtain authorization code from Meta. Please retry.'
                );
              }
            }
          } catch (postErr: any) {
            console.error('[WhatsApp Coexistence] Backend verification failure:', postErr);
            setWhatsAppError(postErr?.message || 'Error communicating with Starters4U server');
          } finally {
            // Reset connecting state in all callback outcomes
            setIsConnectingWhatsApp(false);
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
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      console.error('[WhatsApp Coexistence] JavaScript exception launching FB.login:', launchErr);
      setIsConnectingWhatsApp(false);
      setWhatsAppError('Unable to load Meta login. Please refresh and try again.');
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
                {whatsAppIntegration?.status === 'CONNECTED' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
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
            {whatsAppIntegration?.status === 'CONNECTED' ? (
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
                      {whatsAppIntegration.whatsappBusinessNumber || whatsAppIntegration.displayPhoneNumber || profile?.phone || 'Connected'}
                    </div>
                    {whatsAppIntegration.verifiedName && (
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
