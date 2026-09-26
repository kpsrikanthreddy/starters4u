import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
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
} from 'lucide-react';

export const SettingsSection: React.FC = () => {
  const { user, restaurant, adminFetch, refreshProfile } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'payments' | 'subscription' | 'seo'>('profile');

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

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [profRes, payRes, subRes] = await Promise.all([
          adminFetch('/api/admin/settings'),
          adminFetch('/api/admin/payment-settings'),
          adminFetch('/api/admin/subscription'),
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
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAll();
  }, [adminFetch]);

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
    </div>
  );
};
