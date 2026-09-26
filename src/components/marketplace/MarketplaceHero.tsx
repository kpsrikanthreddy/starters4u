import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  MapPin,
  UtensilsCrossed,
  ArrowRight,
  Loader2,
  Soup,
  Store,
} from 'lucide-react';

interface SearchResultItem {
  type: 'restaurant' | 'dish';
  id: string;
  name: string;
  subtext: string;
  slug: string;
  price?: number;
  dietary?: string;
  category?: string;
}

interface MarketplaceHeroProps {
  selectedLocality: string;
  onSelectLocality: (locality: string) => void;
  onSelectRestaurant: (slug: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const POPULAR_LOCALITIES = [
  'All Hyderabad',
  'Gachibowli',
  'Hitec City',
  'Kondapur',
  'Madhapur',
];

export const MarketplaceHero: React.FC<MarketplaceHeroProps> = ({
  selectedLocality,
  onSelectLocality,
  onSelectRestaurant,
  searchQuery,
  onSearchChange,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [liveResults, setLiveResults] = useState<{
    restaurants: SearchResultItem[];
    dishes: SearchResultItem[];
  }>({ restaurants: [], dishes: [] });
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);

  // Debounced search query fetch
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) {
      setLiveResults({ restaurants: [], dishes: [] });
      setIsSearching(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/public/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          const mappedRestaurants: SearchResultItem[] = (data.restaurants || []).map((r: any) => ({
            type: 'restaurant',
            id: r.id,
            name: r.name,
            subtext: r.locality ? `${r.locality} • ${r.cuisines?.slice(0, 2).join(', ')}` : 'Hyderabad',
            slug: r.slug,
          }));

          const mappedDishes: SearchResultItem[] = (data.dishes || []).map((d: any) => ({
            type: 'dish',
            id: d.id,
            name: d.name,
            subtext: d.restaurant ? `from ${d.restaurant.name}` : '',
            slug: d.restaurant?.slug || 'mozz',
            price: d.price,
            dietary: d.dietary,
          }));

          setLiveResults({
            restaurants: mappedRestaurants,
            dishes: mappedDishes,
          });
        }
      } catch (err) {
        console.error('Failed to execute search:', err);
      } finally {
        setIsSearching(false);
      }
    }, 220);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalResults = liveResults.restaurants.length + liveResults.dishes.length;

  return (
    <section className="relative bg-gradient-to-b from-stone-100/80 via-stone-50 to-white pt-8 pb-10 sm:pt-12 sm:pb-14 border-b border-stone-200/60">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        {/* Top Announcement Chip */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200/80 text-rose-700 text-xs font-semibold mb-4">
          <MapPin className="w-3.5 h-3.5 text-rose-600" />
          <span>Food Ordering Across Hyderabad</span>
        </div>

        {/* Primary Headline */}
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-stone-900 tracking-tight leading-tight mb-3">
          Delicious Food from <br className="hidden sm:inline" />
          <span className="text-rose-600">Top Local Kitchens</span>
        </h1>

        {/* Supporting description */}
        <p className="text-sm sm:text-base text-stone-600 max-w-2xl mx-auto mb-6 sm:mb-8 leading-relaxed">
          Order authentic meals directly from verified restaurants. Enjoy fresh preparation,
          transparent pricing, and real-time order tracking.
        </p>

        {/* Instant Search Bar */}
        <div className="relative max-w-2xl mx-auto mb-6 text-left" ref={dropdownRef}>
          <div className="relative flex items-center shadow-md rounded-2xl bg-white border border-stone-300 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20 transition-all duration-200">
            <div className="pl-4 text-stone-400">
              <Search className="w-5 h-5" />
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              placeholder="Search restaurants, cuisines, or dishes (e.g. biryani, pizza, momos)..."
              className="w-full py-3.5 sm:py-4 pl-3 pr-10 text-sm sm:text-base text-stone-900 placeholder:text-stone-400 bg-transparent rounded-2xl focus:outline-hidden"
            />

            {/* Clear Button / Loading Spinner */}
            <div className="pr-4 flex items-center">
              {isSearching ? (
                <Loader2 className="w-4 h-4 text-rose-600 animate-spin" />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                    setLiveResults({ restaurants: [], dishes: [] });
                  }}
                  className="p-1 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                  aria-label="Clear search query"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Live Search Suggestions Dropdown */}
          {isFocused && searchQuery.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-stone-200 z-50 overflow-hidden divide-y divide-stone-100 max-h-96 overflow-y-auto">
              {totalResults === 0 && !isSearching ? (
                <div className="p-6 text-center text-sm text-stone-500">
                  No matching restaurants or dishes found for{' '}
                  <span className="font-semibold text-stone-800">"{searchQuery}"</span>.
                </div>
              ) : (
                <>
                  {/* Matching Restaurants */}
                  {liveResults.restaurants.length > 0 && (
                    <div className="p-2 sm:p-3">
                      <div className="px-3 py-1 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                        Restaurants ({liveResults.restaurants.length})
                      </div>
                      {liveResults.restaurants.map((rest) => (
                        <button
                          key={rest.id}
                          type="button"
                          onClick={() => {
                            setIsFocused(false);
                            onSelectRestaurant(rest.slug);
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-stone-50 flex items-center justify-between gap-3 group transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                              <Store className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-stone-900 group-hover:text-rose-600 truncate">
                                {rest.name}
                              </p>
                              <p className="text-[11px] text-stone-500 truncate">
                                {rest.subtext}
                              </p>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-rose-600 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Matching Dishes */}
                  {liveResults.dishes.length > 0 && (
                    <div className="p-2 sm:p-3 bg-stone-50/50">
                      <div className="px-3 py-1 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                        Dishes ({liveResults.dishes.length})
                      </div>
                      {liveResults.dishes.map((dish) => (
                        <button
                          key={dish.id}
                          type="button"
                          onClick={() => {
                            setIsFocused(false);
                            onSelectRestaurant(dish.slug);
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white flex items-center justify-between gap-3 group transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                              <Soup className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-stone-900 group-hover:text-rose-600 truncate">
                                {dish.name}
                              </p>
                              <p className="text-[11px] text-stone-500 truncate">
                                {dish.subtext}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {dish.price !== undefined && (
                              <span className="text-xs font-bold text-stone-800">
                                ₹{dish.price}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Quick Locality Filtering Chips */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-stone-500 mr-1 hidden sm:inline">
            Popular Areas:
          </span>
          {POPULAR_LOCALITIES.map((loc) => {
            const isSelected =
              selectedLocality.toLowerCase() === loc.toLowerCase() ||
              (loc === 'All Hyderabad' && !selectedLocality);

            return (
              <button
                key={loc}
                type="button"
                onClick={() => onSelectLocality(loc === 'All Hyderabad' ? '' : loc)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  isSelected
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                }`}
              >
                {loc}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
