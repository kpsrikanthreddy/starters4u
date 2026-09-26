import React, { useState, useEffect, useCallback } from 'react';
import {
  UtensilsCrossed,
  Store,
  ArrowRight,
  ShieldCheck,
  Bike,
  Clock,
  Sparkles,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { MarketplaceHero } from '../../components/marketplace/MarketplaceHero';
import { CuisineScroller } from '../../components/marketplace/CuisineScroller';
import {
  RestaurantCard,
  PublicRestaurantCardItem,
} from '../../components/marketplace/RestaurantCard';

interface MarketplaceHomeProps {
  onNavigate: (path: string) => void;
}

export const MarketplaceHome: React.FC<MarketplaceHomeProps> = ({ onNavigate }) => {
  const [restaurants, setRestaurants] = useState<PublicRestaurantCardItem[]>([]);
  const [categories, setCategories] = useState<string[]>([
    'All',
    'Chinese',
    'Pizza',
    'Momos',
    'Biryani',
    'South Indian',
    'North Indian',
    'Fast Food',
  ]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedLocality, setSelectedLocality] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRestaurants = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'All') {
        params.set('cuisine', selectedCategory);
      }
      if (selectedLocality) {
        params.set('locality', selectedLocality);
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }
      params.set('limit', '20');

      const url = `/api/public/restaurants?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load restaurants (${res.status})`);
      }
      const data = await res.json();
      setRestaurants(data.restaurants || []);
      if (data.availableCategories && Array.isArray(data.availableCategories) && data.availableCategories.length > 0) {
        setCategories(data.availableCategories);
      }
    } catch (err: any) {
      console.error('Error fetching public restaurants:', err);
      setError(err.message || 'Unable to connect to restaurant directory.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, selectedLocality, searchQuery]);

  useEffect(() => {
    fetchRestaurants();
  }, [fetchRestaurants]);

  const handleResetFilters = () => {
    setSelectedCategory('All');
    setSelectedLocality('');
    setSearchQuery('');
  };

  return (
    <div className="bg-stone-50 min-h-screen">
      {/* 1. Compact Hero with Search & Locality Chips */}
      <MarketplaceHero
        selectedLocality={selectedLocality}
        onSelectLocality={setSelectedLocality}
        onSelectRestaurant={(slug) => onNavigate(`/r/${slug}`)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
        {/* 2. Cuisine Category Filter Scroller */}
        <section aria-label="Cuisine Filters">
          <CuisineScroller
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />
        </section>

        {/* 3. Core Feed: Restaurants Near You */}
        <section aria-label="Available Restaurants" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200/80 pb-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
                {selectedCategory !== 'All' ? `${selectedCategory} Kitchens` : 'Available Restaurants'}
                {selectedLocality ? ` in ${selectedLocality}` : ' in Hyderabad'}
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                {isLoading
                  ? 'Checking kitchen availability...'
                  : `${restaurants.length} verified ${
                      restaurants.length === 1 ? 'kitchen' : 'kitchens'
                    } ready for direct ordering`}
              </p>
            </div>

            {(selectedCategory !== 'All' || selectedLocality || searchQuery) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="self-start sm:self-auto text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset all filters</span>
              </button>
            )}
          </div>

          {/* Loading Skeleton */}
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-stone-200 p-4 space-y-4 animate-pulse h-80"
                >
                  <div className="h-44 bg-stone-200 rounded-xl" />
                  <div className="h-4 bg-stone-200 rounded w-2/3" />
                  <div className="h-3 bg-stone-100 rounded w-1/2" />
                  <div className="h-3 bg-stone-100 rounded w-3/4" />
                </div>
              ))}
            </div>
          )}

          {/* Error Message */}
          {!isLoading && error && (
            <div className="p-6 bg-white rounded-2xl border border-stone-200 text-center space-y-3">
              <p className="text-sm font-semibold text-stone-800">{error}</p>
              <button
                type="button"
                onClick={fetchRestaurants}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg text-xs font-semibold hover:bg-stone-800"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && restaurants.length === 0 && (
            <div className="p-10 bg-white rounded-2xl border border-stone-200 text-center max-w-md mx-auto space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-stone-900">No restaurants match your search</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                We couldn't find any active kitchens matching{' '}
                <span className="font-semibold text-stone-800">
                  {searchQuery || selectedCategory || selectedLocality}
                </span>
                . Try changing your cuisine filter or resetting your search.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-colors shadow-xs"
              >
                Show All Hyderabad Restaurants
              </button>
            </div>
          )}

          {/* Restaurant Grid */}
          {!isLoading && !error && restaurants.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {restaurants.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  onSelect={(slug) => onNavigate(`/r/${slug}`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 4. Featured Flagship Spotlight (Subtle & Honest) */}
        <section
          aria-label="Flagship Kitchen Spotlight"
          className="bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-sm"
        >
          <div className="max-w-2xl space-y-4 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-500/30">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Starters4U Flagship Storefront</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              MOZZ Chinese & Pizzateria
            </h3>

            <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
              The original kitchen where Starters4U began in Gachibowli, Hyderabad. Famous
              for Korean-style pocket pizzas in Rectangular, Circular, and Square crusts, wok-tossed
              Indo-Chinese starters, fried rice, noodles, and steamed momos.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('/r/mozz')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
              >
                <span>Visit MOZZ Storefront</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('/menu')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold border border-stone-700 transition-colors cursor-pointer"
              >
                <span>Explore MOZZ Menu</span>
              </button>
            </div>
          </div>

          {/* Background decorative accent */}
          <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-10 translate-y-10">
            <UtensilsCrossed className="w-80 h-80 text-white" />
          </div>
        </section>

        {/* 5. How Starters4U Works (Simple 3 Steps) */}
        <section aria-label="How Starters4U Works" className="space-y-6 pt-4">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              How Starters4U Works
            </h2>
            <p className="text-xs text-stone-500">
              Direct connection between customers and neighborhood kitchens.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-3 shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h4 className="text-sm font-bold text-stone-900">Choose Your Kitchen</h4>
              <p className="text-xs text-stone-600 leading-relaxed">
                Explore local partner restaurants, view verified operating hours, and browse
                transparent digital menus with clear pricing.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-3 shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h4 className="text-sm font-bold text-stone-900">Customize & Order</h4>
              <p className="text-xs text-stone-600 leading-relaxed">
                Tailor dish preferences, pizza crust shapes, and spicy levels. Pay seamlessly
                via UPI, debit/credit cards, or cash on delivery.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-3 shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h4 className="text-sm font-bold text-stone-900">Fresh Preparation & Live Tracking</h4>
              <p className="text-xs text-stone-600 leading-relaxed">
                Orders are sent directly to the kitchen's digital display. Watch live status
                updates from prep to dispatch on your screen.
              </p>
            </div>
          </div>
        </section>

        {/* 6. Partner with Us CTA Banner */}
        <section
          aria-label="Restaurant Partner Onboarding"
          className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xs"
        >
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold">
              <Store className="w-3.5 h-3.5" />
              <span>For Food Entrepreneurs & Kitchens</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              Grow Your Food Business with Starters4U
            </h3>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              Launch your own dedicated online storefront at <span className="font-mono text-stone-800">/r/:yourname</span>.
              Get automated Kitchen Order Tickets (KOT), direct UPI/Card payments, and table QR ordering.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('/onboarding')}
              className="px-5 py-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold text-center transition-colors cursor-pointer"
            >
              Open Your Restaurant
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/restaurant-admin')}
              className="px-4 py-3 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold text-center transition-colors cursor-pointer"
            >
              Partner Login
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
