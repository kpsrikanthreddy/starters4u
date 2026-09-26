import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
import {
  Truck,
  MapPin,
  Clock,
  DollarSign,
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

export const DeliverySection: React.FC = () => {
  const { adminFetch } = useAdminAuth();
  const [settings, setSettings] = useState<any>({
    deliveryEnabled: true,
    deliveryRadiusKm: 5,
    minOrderValue: 200,
    baseDeliveryFee: 40,
    freeDeliveryThreshold: 500,
    estimatedDeliveryMinutes: 35,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    adminFetch('/api/admin/delivery-settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSettings(data);
      })
      .catch((err) => console.error('Error fetching delivery settings:', err))
      .finally(() => setIsLoading(false));
  }, [adminFetch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      const res = await adminFetch('/api/admin/delivery-settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSavedSuccess(true);
        soundService.playChime('notification');
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        alert('Failed to update delivery settings.');
      }
    } catch (err: any) {
      alert(`Error saving delivery settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-slate-900">
              Delivery Operations & Fees
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
              Tenant Scoped
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure delivery radius, minimum order thresholds, and rider service fees for your outlet.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
        {/* Toggle Delivery */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-slate-900">Enable In-House Delivery</div>
              <p className="text-xs text-slate-500">
                Allow customers to place direct delivery orders from your menu store.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.deliveryEnabled}
              onChange={(e) => setSettings({ ...settings, deliveryEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600" />
          </label>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>Delivery Radius (km)</span>
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={settings.deliveryRadiusKm || 5}
              onChange={(e) => setSettings({ ...settings, deliveryRadiusKm: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:ring-2 focus:ring-rose-500 text-slate-900"
            />
            <p className="text-[10px] text-slate-400 mt-1">Maximum delivery coverage from outlet branch.</p>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Estimated Delivery Time (mins)</span>
            </label>
            <input
              type="number"
              min="10"
              max="180"
              value={settings.estimatedDeliveryMinutes || 35}
              onChange={(e) =>
                setSettings({ ...settings, estimatedDeliveryMinutes: Number(e.target.value) })
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:ring-2 focus:ring-rose-500 text-slate-900"
            />
            <p className="text-[10px] text-slate-400 mt-1">Displayed to customer at checkout.</p>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
              <span>Minimum Order Value (₹)</span>
            </label>
            <input
              type="number"
              min="0"
              value={settings.minOrderValue || 0}
              onChange={(e) => setSettings({ ...settings, minOrderValue: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:ring-2 focus:ring-rose-500 text-slate-900"
            />
            <p className="text-[10px] text-slate-400 mt-1">Minimum subtotal needed to place a delivery order.</p>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
              <span>Base Delivery Fee (₹)</span>
            </label>
            <input
              type="number"
              min="0"
              value={settings.baseDeliveryFee || 0}
              onChange={(e) => setSettings({ ...settings, baseDeliveryFee: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:ring-2 focus:ring-rose-500 text-slate-900"
            />
            <p className="text-[10px] text-slate-400 mt-1">Standard rider fee applied to delivery orders.</p>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
              <span>Free Delivery Threshold (₹)</span>
            </label>
            <input
              type="number"
              min="0"
              value={settings.freeDeliveryThreshold || 0}
              onChange={(e) =>
                setSettings({ ...settings, freeDeliveryThreshold: Number(e.target.value) })
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:ring-2 focus:ring-rose-500 text-slate-900"
            />
            <p className="text-[10px] text-slate-400 mt-1">Orders above this amount enjoy zero delivery charge.</p>
          </div>
        </div>

        {/* Save button and feedback */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            {savedSuccess && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Delivery settings saved successfully!</span>
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition flex items-center gap-2 shadow-md shadow-rose-900/20"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
