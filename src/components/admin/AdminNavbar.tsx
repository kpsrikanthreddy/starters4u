import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useStore } from '../../context/StoreContext';
import {
  LogOut,
  Volume2,
  VolumeX,
  ExternalLink,
  ShieldCheck,
  Building2,
  MapPin,
  Sparkles,
  Layers,
  ChevronDown,
} from 'lucide-react';

interface AdminNavbarProps {
  onNavigateToPlatformAdmin?: () => void;
}

export const AdminNavbar: React.FC<AdminNavbarProps> = ({ onNavigateToPlatformAdmin }) => {
  const { user, restaurant, logout, adminFetch } = useAdminAuth();
  const { soundEnabled, toggleSound } = useStore();
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    adminFetch('/api/admin/branches')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setBranches(data);
      })
      .catch(() => {});
  }, [adminFetch]);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'superadmin';
  const restaurantName = restaurant?.name || user?.restaurantName || 'Restaurant Admin';
  const restaurantSlug = restaurant?.slug || user?.restaurantSlug || 'mozz';
  const isMozz = restaurantSlug === 'mozz' || restaurantName.toLowerCase().includes('mozz');

  // Compute 2-character initials for logo badge
  const initials = restaurantName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'RA';

  const customerWebsiteUrl = isMozz ? '/' : `/r/${restaurantSlug}`;

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Multi-Tenant Info */}
          <div className="flex items-center space-x-3">
            {/* Dynamic Restaurant Logo / Badge */}
            {restaurant?.logoUrl ? (
              <img
                src={restaurant.logoUrl}
                alt={restaurantName}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-xl object-cover border border-slate-700 shadow-md"
              />
            ) : isMozz ? (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-amber-500 p-0.5 shadow-md flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[9px] flex flex-col items-center justify-center p-0.5">
                  <span className="text-[11px] font-black text-amber-400 leading-none">
                    m<span className="text-rose-500">O</span>zz
                  </span>
                  <span className="text-[6px] font-bold text-slate-300 uppercase">OS</span>
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-0.5 shadow-md flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[9px] flex flex-col items-center justify-center p-0.5">
                  <span className="text-xs font-black tracking-wider text-indigo-300 leading-none">
                    {initials}
                  </span>
                  <span className="text-[6px] font-bold text-slate-400 uppercase">POS</span>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
                  {restaurantName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Tenant Scoped
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-rose-400" />
                  {user?.branchName || (branches[0]?.name ? branches[0].name : 'Main Outlet')}
                </span>
                <span>•</span>
                <span className="text-slate-300 font-medium">Logged in as: {user?.name}</span>
              </div>
            </div>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Super Admin Switcher Pill */}
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', '/platform-admin');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-bold transition"
                title="Open Global Starters4U Platform Admin Portal"
              >
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Super Admin Portal</span>
              </button>
            )}

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={toggleSound}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title={soundEnabled ? 'Mute Audio Chimes' : 'Enable Audio Chimes'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>

            {/* Role Badge */}
            <div className="hidden md:flex items-center px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300">
              <span className="text-[10px] uppercase font-mono font-bold text-amber-400">
                {user?.role || 'RESTAURANT_OWNER'}
              </span>
            </div>

            {/* View Customer Website Link */}
            <a
              href={customerWebsiteUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden lg:flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition border border-slate-700"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Customer Website</span>
            </a>

            {/* Logout Button */}
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-200 text-xs font-bold transition"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
