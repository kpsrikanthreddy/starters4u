import React, { useState } from 'react';
import {
  MapPin,
  UtensilsCrossed,
  Store,
  Search,
  Clock,
  Menu,
  X,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { useRestaurant } from '../../context/RestaurantContext';

interface MarketplaceHeaderProps {
  onSearchClick?: () => void;
  onNavigate?: (path: string) => void;
}

export const MarketplaceHeader: React.FC<MarketplaceHeaderProps> = ({
  onSearchClick,
  onNavigate = (path) => {
    window.location.href = path;
  },
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);
  const [trackOrderId, setTrackOrderId] = useState('');
  const { itemCount, grandTotal } = useStore();
  const { restaurantSlug, isFlagship } = useRestaurant();

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = trackOrderId.trim();
    if (!clean) return;
    setIsTrackModalOpen(false);
    onNavigate(`/track?orderId=${encodeURIComponent(clean)}`);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20 gap-3">
            {/* Brand Logo & City Indicator */}
            <div className="flex items-center gap-3 sm:gap-6 min-w-0">
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('/');
                }}
                className="flex items-center gap-2 group focus:outline-hidden"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center text-white shadow-sm shadow-rose-200 group-hover:scale-105 transition-transform duration-200">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xl sm:text-2xl font-black tracking-tight text-stone-900 group-hover:text-rose-600 transition-colors">
                    Starters<span className="text-rose-600">4U</span>
                  </span>
                  <span className="text-[10px] sm:text-xs font-medium text-stone-500 tracking-wider uppercase -mt-1 hidden sm:inline">
                    Multi-Restaurant Food Platform
                  </span>
                </div>
              </a>

              {/* City Indicator Badge */}
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-100 border border-stone-200/80 text-xs font-medium text-stone-700">
                <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Hyderabad, Telangana</span>
              </div>
            </div>

            {/* Desktop Navigation & Actions */}
            <div className="hidden lg:flex items-center gap-3">
              {/* Quick Search Trigger */}
              {onSearchClick && (
                <button
                  type="button"
                  onClick={onSearchClick}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:text-stone-800 hover:border-stone-300 text-xs font-medium transition-colors"
                >
                  <Search className="w-3.5 h-3.5 text-stone-400" />
                  <span>Search restaurants or dishes...</span>
                  <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-stone-100 rounded text-stone-400">
                    /
                  </kbd>
                </button>
              )}

              {/* Track Order */}
              <button
                type="button"
                onClick={() => setIsTrackModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 hover:text-stone-900 transition-colors"
              >
                <Clock className="w-3.5 h-3.5 text-stone-500" />
                <span>Track Order</span>
              </button>

              {/* Restaurant Partner Onboarding */}
              <a
                href="/onboarding"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('/onboarding');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors"
              >
                <Store className="w-3.5 h-3.5 text-stone-600" />
                <span>Open a Restaurant</span>
              </a>

              {/* Active Cart indicator (if customer has active items from a storefront) */}
              {itemCount > 0 && (
                <a
                  href={isFlagship ? '/r/mozz/menu' : `/r/${restaurantSlug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(isFlagship ? '/r/mozz/menu' : `/r/${restaurantSlug}`);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Cart ({itemCount}) • ₹{grandTotal}</span>
                </a>
              )}
            </div>

            {/* Mobile Header Actions */}
            <div className="flex items-center gap-2 lg:hidden">
              {itemCount > 0 && (
                <a
                  href={isFlagship ? '/r/mozz/menu' : `/r/${restaurantSlug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(isFlagship ? '/r/mozz/menu' : `/r/${restaurantSlug}`);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>{itemCount}</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                aria-label="Toggle Navigation Menu"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-stone-200 bg-white px-4 pt-3 pb-5 space-y-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-50 text-xs font-medium text-stone-600">
              <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Ordering in Hyderabad, Telangana</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsTrackModalOpen(true);
                }}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-stone-200 text-stone-800 text-xs font-semibold hover:bg-stone-50"
              >
                <Clock className="w-4 h-4 text-stone-500" />
                <span>Track Order</span>
              </button>

              <a
                href="/r/mozz"
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  onNavigate('/r/mozz');
                }}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-stone-200 text-stone-800 text-xs font-semibold hover:bg-stone-50"
              >
                <UtensilsCrossed className="w-4 h-4 text-rose-600" />
                <span>MOZZ Store</span>
              </a>
            </div>

            <div className="pt-2 border-t border-stone-100 flex flex-col gap-2">
              <a
                href="/onboarding"
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  onNavigate('/onboarding');
                }}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-rose-50 text-rose-900 text-xs font-bold"
              >
                <span className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-rose-600" />
                  <span>Open Your Restaurant</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-rose-600 bg-white px-2 py-0.5 rounded-full border border-rose-200">
                  Join Free
                </span>
              </a>
            </div>
          </div>
        )}
      </header>

      {/* Track Order Quick Modal */}
      {isTrackModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-stone-900">Track Food Order</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTrackModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-stone-600 mb-4">
              Enter your Order Number (e.g. MOZZ-1001) or order ID to view live kitchen and delivery status.
            </p>

            <form onSubmit={handleTrackSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Order Number / Order ID
                </label>
                <input
                  type="text"
                  value={trackOrderId}
                  onChange={(e) => setTrackOrderId(e.target.value)}
                  placeholder="e.g. MOZZ-1042"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTrackModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!trackOrderId.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  Track Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
