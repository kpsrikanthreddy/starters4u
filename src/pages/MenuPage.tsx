import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { SeoRouteConfig } from '../types/seoTypes';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { SeoFaqSection } from '../components/SeoFaqSection';
import { FoodCard } from '../components/FoodCard';
import { useStore } from '../context/StoreContext';
import { useRestaurant } from '../context/RestaurantContext';
import { FoodCategory, DietaryType } from '../types';
import {
  normalizeCategorySlug,
  isCategoryMatch,
  getActiveCategoryTabs,
} from '../utils/categoryUtils';
import { Search, SlidersHorizontal, Utensils, Check, ChevronLeft, ChevronRight } from 'lucide-react';

interface MenuPageProps {
  routeConfig: SeoRouteConfig;
  currentPath?: string;
}

export const normalizeCategoryParam = (rawCategory: string | null | undefined): string => {
  return normalizeCategorySlug(rawCategory);
};

export const MenuPage: React.FC<MenuPageProps> = ({ routeConfig, currentPath }) => {
  const { menu, qrSession } = useStore();
  const { restaurantSlug } = useRestaurant();
  const effectiveSlug = (restaurantSlug || 'mozz').toLowerCase();

  const getInitialCategory = (): string => {
    if (typeof window === 'undefined') return 'all';
    const query = currentPath && currentPath.includes('?')
      ? currentPath.split('?')[1]
      : window.location.search;
    const params = new URLSearchParams(query);
    const cat = params.get('category');
    return normalizeCategoryParam(cat);
  };

  const getInitialSearch = () => {
    if (typeof window === 'undefined') return '';
    const query = currentPath && currentPath.includes('?')
      ? currentPath.split('?')[1]
      : window.location.search;
    const params = new URLSearchParams(query);
    return params.get('q') || params.get('search') || '';
  };

  const [selectedCategory, setSelectedCategory] = useState<string>(getInitialCategory);
  const [dietaryFilter, setDietaryFilter] = useState<DietaryType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>(getInitialSearch);

  // Sync category and search query state when currentPath prop changes
  React.useEffect(() => {
    const query = currentPath && currentPath.includes('?')
      ? currentPath.split('?')[1]
      : (typeof window !== 'undefined' ? window.location.search : '');
    const params = new URLSearchParams(query);
    const cat = params.get('category');
    if (cat) {
      setSelectedCategory(normalizeCategoryParam(cat));
    }
    const q = params.get('q') || params.get('search');
    if (q !== null && q !== undefined) {
      setSearchQuery(q);
    }
  }, [currentPath]);

  // Support browser Back/Forward navigation (popstate)
  React.useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('category');
      setSelectedCategory(normalizeCategoryParam(cat));
      const q = params.get('q') || params.get('search') || '';
      setSearchQuery(q);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Active category tabs derived from live menu (including any custom created categories)
  const categoryTabs = useMemo(() => {
    return getActiveCategoryTabs(menu, false);
  }, [menu]);

  // Horizontal scroll state & ref for category tabs
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const timer = setTimeout(checkScroll, 100);
    const el = categoryScrollRef.current;
    if (!el) return () => clearTimeout(timer);

    const handleResize = () => checkScroll();
    window.addEventListener('resize', handleResize);

    const ro = new ResizeObserver(() => checkScroll());
    ro.observe(el);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
    };
  }, [checkScroll, categoryTabs, selectedCategory]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const scrollAmount = Math.max(el.clientWidth * 0.65, 200);
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  // Safe fallback if category in URL does not exist in active menu categories
  React.useEffect(() => {
    if (selectedCategory !== 'all' && categoryTabs.length > 0) {
      const exists =
        categoryTabs.some(
          (cat) =>
            cat.id === selectedCategory ||
            normalizeCategorySlug(cat.id) === normalizeCategorySlug(selectedCategory)
        ) || selectedCategory === 'pocket_pizzas';

      if (!exists) {
        setSelectedCategory('all');
        if (typeof window !== 'undefined' && window.history) {
          const currentParams = new URLSearchParams(window.location.search);
          currentParams.delete('category');
          if (qrSession?.isVerified && qrSession.token && qrSession.source !== 'online_web') {
            currentParams.set('token', qrSession.token);
          }
          const qs = currentParams.toString();
          const newUrl = qs ? `/r/${effectiveSlug}/menu?${qs}` : `/r/${effectiveSlug}/menu`;
          window.history.replaceState({ category: 'all' }, '', newUrl);
        }
      }
    }
  }, [categoryTabs, selectedCategory, effectiveSlug, qrSession]);

  const handleSelectCategory = (catId: string) => {
    const normalized = normalizeCategoryParam(catId);
    setSelectedCategory(normalized);
    if (typeof window !== 'undefined' && window.history) {
      const currentParams = new URLSearchParams(window.location.search);
      if (normalized === 'all') {
        currentParams.delete('category');
      } else {
        currentParams.set('category', normalized);
      }
      if (qrSession?.isVerified && qrSession.token && qrSession.source !== 'online_web') {
        currentParams.set('token', qrSession.token);
      }
      const qs = currentParams.toString();
      const newUrl = qs ? `/r/${effectiveSlug}/menu?${qs}` : `/r/${effectiveSlug}/menu`;
      window.history.pushState({ category: normalized }, '', newUrl);
    }
  };

  const activeInStockCount = useMemo(() => {
    return menu.filter((item) => item.inStock !== false).length;
  }, [menu]);

  const filteredItems = useMemo(() => {
    return menu.filter((item) => {
      // Requirement 5: Only hide items when in_stock === false
      if (item.inStock === false) {
        return false;
      }

      // Category match with normalized slug comparison
      if (selectedCategory !== 'all' && !isCategoryMatch(item.category, selectedCategory)) {
        return false;
      }

      // Dietary match
      if (dietaryFilter !== 'all' && item.dietary !== dietaryFilter) {
        return false;
      }

      // Search match
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = (item.description || '').toLowerCase().includes(query);
        const matchesCat = (item.category || '').toLowerCase().includes(query);
        return matchesName || matchesDesc || matchesCat;
      }
      return true;
    });
  }, [menu, selectedCategory, dietaryFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-stone-50">
      <Breadcrumbs items={routeConfig.breadcrumbs} />

      {/* Header Banner */}
      <header className="bg-white border-b border-stone-200 py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md mb-2">
            <Utensils className="w-3.5 h-3.5" />
            <span>Complete Food Menu</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-stone-900 font-display">
            {routeConfig.h1}
          </h1>
          <p className="text-stone-600 text-sm sm:text-base mt-2 max-w-3xl leading-relaxed">
            Browse our full selection of Korean-style pocket pizzas, Indo-Chinese starters, wok-tossed fried rice, noodles, and Himalayan momos prepared fresh in Gachibowli, Hyderabad. All items are available for direct online ordering and takeaway.
          </p>

          {/* Search & Dietary Bar */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-4 border-t border-stone-100">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search dishes, ingredients (e.g., paneer, chicken)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition"
              />
            </div>

            {/* Dietary Filter Buttons */}
            <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setDietaryFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  dietaryFilter === 'all'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                All Dishes
              </button>
              <button
                type="button"
                onClick={() => setDietaryFilter('veg')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  dietaryFilter === 'veg'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Veg Only</span>
              </button>
              <button
                type="button"
                onClick={() => setDietaryFilter('non-veg')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  dietaryFilter === 'non-veg'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>Non-Veg Only</span>
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="relative mt-4 flex items-center">
            {canScrollLeft && (
              <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center pr-2 pl-0.5 bg-gradient-to-r from-white via-white/95 to-transparent rounded-l-xl">
                <button
                  type="button"
                  onClick={() => handleScroll('left')}
                  aria-label="Scroll left"
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-white text-stone-700 hover:text-stone-900 border border-stone-200 shadow-md hover:bg-stone-50 transition active:scale-95 cursor-pointer touch-manipulation"
                >
                  <ChevronLeft className="w-5 h-5 text-stone-700" />
                </button>
              </div>
            )}

            <div
              ref={categoryScrollRef}
              onScroll={checkScroll}
              className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none scroll-smooth w-full"
            >
              <button
                type="button"
                onClick={() => handleSelectCategory('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition flex items-center gap-2 cursor-pointer shadow-xs ${
                  selectedCategory === 'all'
                    ? 'bg-rose-600 text-white shadow-md ring-2 ring-rose-600 font-extrabold'
                    : 'bg-white text-stone-700 hover:text-stone-950 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                <span>✨</span>
                <span>All Categories</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                    selectedCategory === 'all' ? 'bg-white/25 text-white' : 'bg-stone-100 text-stone-600 border border-stone-200'
                  }`}
                >
                  {activeInStockCount}
                </span>
              </button>

              {categoryTabs.map((cat) => {
                const isSelected =
                  selectedCategory === cat.id ||
                  normalizeCategorySlug(selectedCategory) === normalizeCategorySlug(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectCategory(cat.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition flex items-center gap-2 cursor-pointer shadow-xs ${
                      isSelected
                        ? 'bg-rose-600 text-white shadow-md ring-2 ring-rose-600 font-extrabold'
                        : 'bg-white text-stone-700 hover:text-stone-950 hover:bg-stone-100 border border-stone-200'
                    }`}
                  >
                    <span className="text-sm">{cat.icon}</span>
                    <span>{cat.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                        isSelected ? 'bg-white/25 text-white' : 'bg-stone-100 text-stone-600 border border-stone-200'
                      }`}
                    >
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {canScrollRight && (
              <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center pl-2 pr-0.5 bg-gradient-to-l from-white via-white/95 to-transparent rounded-r-xl">
                <button
                  type="button"
                  onClick={() => handleScroll('right')}
                  aria-label="Scroll right"
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-white text-stone-700 hover:text-stone-900 border border-stone-200 shadow-md hover:bg-stone-50 transition active:scale-95 cursor-pointer touch-manipulation"
                >
                  <ChevronRight className="w-5 h-5 text-stone-700" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Menu Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs text-stone-500 font-medium">
            Showing <strong className="text-stone-900">{filteredItems.length}</strong> items
          </span>
          {(selectedCategory !== 'all' || dietaryFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setDietaryFilter('all');
                setSearchQuery('');
              }}
              className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
            >
              Reset Filters
            </button>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-stone-200">
            <Utensils className="w-8 h-8 text-stone-400 mx-auto mb-3" />
            <p className="text-stone-700 font-medium">No menu items match your criteria.</p>
            <p className="text-stone-500 text-xs mt-1">Try clearing your search query or filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredItems.map((item) => (
              <FoodCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>

      {/* Crawlable Landing Pages Directory */}
      <section className="bg-white border-t border-stone-200 py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-lg font-bold text-stone-900 font-display mb-4">
            Specialized Menu Guides & In-Depth Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { title: 'Chinese Starters in Gachibowli', path: '/chinese-starters-gachibowli' },
              { title: 'Vegetarian Starters (Paneer, Mushroom)', path: '/veg-starters-gachibowli' },
              { title: 'Non-Veg Starters (Chicken Specials)', path: '/non-veg-starters-gachibowli' },
              { title: 'Korean Pocket Pizzas in Gachibowli', path: '/pizza-gachibowli' },
              { title: 'Korean Pocket Pizza R, C, S Guide', path: '/korean-pocket-pizza-hyderabad' },
              { title: 'Steamed & Fried Momos in Gachibowli', path: '/momos-gachibowli' },
            ].map((link) => (
              <a
                key={link.path}
                href={link.path}
                className="p-3 rounded-xl border border-stone-200 hover:border-primary-400 hover:bg-primary-50/30 text-stone-800 hover:text-primary-700 text-xs sm:text-sm font-semibold transition"
              >
                {link.title} →
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <SeoFaqSection faqs={routeConfig.faqs} />
    </div>
  );
};
