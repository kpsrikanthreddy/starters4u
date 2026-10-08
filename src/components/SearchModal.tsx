import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { useRestaurant } from '../context/RestaurantContext';
import { MenuItem, DietaryType, CartItem } from '../types';
import { buildCustomerNavigationUrl } from '../utils/customerNavigation';
import {
  Search,
  X,
  Plus,
  Flame,
  Utensils,
  Sparkles,
  ArrowRight,
  SlidersHorizontal,
  ShoppingBag,
} from 'lucide-react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToMenu?: (query?: string) => void;
  initialQuery?: string;
}

const POPULAR_SEARCH_TAGS = [
  'Pocket Pizza',
  'Veg Manchurian',
  'Chicken 65',
  'Schezwan Fried Rice',
  'Hakka Noodles',
  'Chilli Paneer',
  'Momos',
  'Cheese Maggie',
];

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onNavigateToMenu,
  initialQuery = '',
}) => {
  const { menu, cart, itemCount, setIsCartOpen, addToCart, openCustomizer, qrSession } = useStore();
  const { isFlagship, restaurantSlug, getTenantUrl } = useRestaurant();
  const [query, setQuery] = useState(initialQuery);
  const [dietaryFilter, setDietaryFilter] = useState<DietaryType | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const popularTags = useMemo(() => {
    if (isFlagship) return POPULAR_SEARCH_TAGS;
    const itemNames = menu.slice(0, 8).map((m) => m.name);
    return itemNames.length > 0 ? itemNames : POPULAR_SEARCH_TAGS;
  }, [isFlagship, menu]);

  // Auto-focus input on open and sync initialQuery
  useEffect(() => {
    if (isOpen) {
      if (initialQuery) {
        setQuery(initialQuery);
      }
      setTimeout(() => {
        inputRef.current?.focus();
        if (initialQuery && inputRef.current) {
          inputRef.current.setSelectionRange(initialQuery.length, initialQuery.length);
        }
      }, 50);
    } else {
      setQuery('');
      setDietaryFilter('all');
    }
  }, [isOpen, initialQuery]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filter items matching the query and dietary filter from live menu
  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();

    return menu.filter((item) => {
      // Hide out of stock items
      if (item.inStock === false) {
        return false;
      }
      if (dietaryFilter !== 'all' && item.dietary !== dietaryFilter) {
        return false;
      }
      if (!trimmed) {
        return true;
      }
      const matchesName = item.name.toLowerCase().includes(trimmed);
      const matchesDesc = (item.description || '').toLowerCase().includes(trimmed);
      const matchesCat = (item.category || '').toLowerCase().replace(/_/g, ' ').includes(trimmed);
      return matchesName || matchesDesc || matchesCat;
    });
  }, [menu, query, dietaryFilter]);

  if (!isOpen) return null;

  const handleAddItem = (item: MenuItem) => {
    if (item.isPocketPizza) {
      openCustomizer(item);
      onClose();
    } else {
      const newCartItem: CartItem = {
        cartItemId: `${item.id}-std-${Date.now()}`,
        menuItem: item,
        addons: [],
        unitPrice: item.price || 0,
        quantity: 1,
      };
      addToCart(newCartItem);
    }
  };

  const handleGoToFullMenu = () => {
    const trimmed = query.trim();
    if (onNavigateToMenu) {
      onNavigateToMenu(trimmed);
    } else {
      const slug = (restaurantSlug || 'mozz').toLowerCase();
      const menuPath = trimmed
        ? `/r/${slug}/menu?q=${encodeURIComponent(trimmed)}`
        : `/r/${slug}/menu`;
      const target = buildCustomerNavigationUrl(menuPath, qrSession, slug);
      window.location.href = target;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 pt-16 sm:pt-20">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Dishes and Pizzas"
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[82vh] z-10 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Search Header Bar */}
        <div className="p-3 sm:p-4 border-b border-stone-200 bg-stone-50/80">
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Search Icon Badge */}
            <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-400 text-slate-950 shadow-xs shrink-0">
              <Search className="w-5 h-5 stroke-[2.5]" />
            </div>

            {/* Search Input */}
            <div className="relative flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for pizza, momos, Chinese, fried rice..."
                className="w-full pl-3 pr-8 py-2 sm:py-2.5 bg-white border border-stone-300 rounded-xl text-xs sm:text-sm md:text-base text-stone-900 placeholder:text-stone-400 placeholder:truncate focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-medium h-10 sm:h-11"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 transition"
                  aria-label="Clear search input"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Cart Button */}
            <button
              type="button"
              onClick={() => {
                setIsCartOpen(true);
                onClose();
              }}
              id="search-popup-cart-btn"
              className="flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3.5 h-10 sm:h-11 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-600 active:from-rose-700 active:to-rose-600 text-white font-bold text-xs sm:text-sm shadow-sm shadow-rose-600/20 active:scale-95 transition-all shrink-0 cursor-pointer"
              title="View Cart"
              aria-label={`View Cart${itemCount > 0 ? ` (${itemCount} items)` : ''}`}
            >
              <div className="relative flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
                {itemCount > 0 && (
                  <span className="absolute -top-2 -right-2.5 bg-amber-400 text-slate-950 font-black text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center shadow-xs leading-none">
                    {itemCount}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline font-bold">Cart</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-xl transition shrink-0 h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center cursor-pointer"
              aria-label="Close search dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Dietary Filters & Tag Suggestions */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200/60">
            {/* Dietary Tabs */}
            <div className="inline-flex items-center bg-white p-0.5 rounded-lg border border-stone-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDietaryFilter('all')}
                className={`px-2.5 py-1 rounded-md transition ${
                  dietaryFilter === 'all'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setDietaryFilter('veg')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                  dietaryFilter === 'veg'
                    ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-300'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>Veg</span>
              </button>
              <button
                type="button"
                onClick={() => setDietaryFilter('non-veg')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                  dietaryFilter === 'non-veg'
                    ? 'bg-rose-50 text-rose-700 font-bold border border-rose-300'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-600" />
                <span>Non-Veg</span>
              </button>
            </div>

            {/* Results Count & Shortcut Info */}
            <div className="text-xs text-stone-500 font-medium flex items-center gap-2">
              <span>{searchResults.length} {searchResults.length === 1 ? 'dish' : 'dishes'} found</span>
              <span className="hidden sm:inline text-stone-300">•</span>
              <span className="hidden sm:inline text-stone-400">ESC to close</span>
            </div>
          </div>
        </div>

        {/* Popular searches suggestions (shown when query is empty) */}
        {!query && (
          <div className="px-4 py-2.5 bg-amber-50/50 border-b border-amber-100 flex items-center gap-2 overflow-x-auto scrollbar-none text-xs">
            <span className="font-bold text-amber-950 shrink-0 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-600" /> Popular:
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {popularTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setQuery(tag)}
                  className="px-2.5 py-1 bg-white hover:bg-amber-100/80 border border-amber-200 text-stone-700 hover:text-amber-900 rounded-full font-medium transition"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 divide-y divide-stone-100">
          {searchResults.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Utensils className="w-10 h-10 text-stone-300 mx-auto mb-2.5" />
              <p className="text-sm font-bold text-stone-800">No dishes match “{query}”</p>
              <p className="text-xs text-stone-500 mt-1">
                Try searching for general keywords like “paneer”, “chicken”, “rice”, or “pizza”.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setDietaryFilter('all');
                }}
                className="mt-3 px-3.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-bold text-stone-700 transition"
              >
                Clear Search
              </button>
            </div>
          ) : (
            searchResults.map((item) => {
              const displayPrice = item.isPocketPizza && item.prices
                ? item.prices.R
                : (item.price || 0);

              const isVeg = item.dietary === 'veg';
              const isEgg = item.dietary === 'egg';

              return (
                <div
                  key={item.id}
                  className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 group hover:bg-stone-50 p-2 rounded-xl transition"
                >
                  {/* Item Image / Veg-Badge & Title */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-lg object-cover bg-stone-100 shrink-0 border border-stone-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0 text-stone-400">
                        <Utensils className="w-5 h-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {/* Veg / Non-Veg icon */}
                        <span
                          className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                            isVeg
                              ? 'border-emerald-600 bg-emerald-50'
                              : isEgg
                              ? 'border-amber-600 bg-amber-50'
                              : 'border-rose-600 bg-rose-50'
                          }`}
                          title={item.dietary.toUpperCase()}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isVeg
                                ? 'bg-emerald-600'
                                : isEgg
                                ? 'bg-amber-600'
                                : 'bg-rose-600'
                            }`}
                          />
                        </span>

                        <h4 className="font-bold text-stone-900 text-sm truncate group-hover:text-rose-600 transition">
                          {item.name}
                        </h4>

                        {item.isPocketPizza && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold uppercase shrink-0">
                            Pocket Pizza
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">
                        {item.description}
                      </p>

                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className="font-extrabold text-stone-900">
                          ₹{displayPrice}
                          {item.isPocketPizza && (
                            <span className="text-[10px] font-normal text-stone-500 ml-1">
                              (R, C, S shapes)
                            </span>
                          )}
                        </span>
                        {item.badge && (
                          <span className="text-[10px] text-rose-600 font-semibold">
                            • {item.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Add to Cart / Customize Button */}
                  <button
                    type="button"
                    onClick={() => handleAddItem(item)}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1 shrink-0 shadow-2xs hover:shadow-xs"
                    aria-label={`Add ${item.name} to cart`}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>{item.isPocketPizza ? 'Customize' : 'Add'}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer: Link to Full Menu */}
        <div className="p-3 sm:p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3">
          <span className="text-xs text-stone-500">
            Need advanced filters and shapes?
          </span>
          <button
            type="button"
            onClick={handleGoToFullMenu}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition"
          >
            <span>View in Full Menu</span>
            <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
