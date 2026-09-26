import React, { useState, useMemo } from 'react';
import { SeoRouteConfig } from '../types/seoTypes';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { SeoFaqSection } from '../components/SeoFaqSection';
import { FoodCard } from '../components/FoodCard';
import { useStore } from '../context/StoreContext';
import { MenuItem, DietaryType } from '../types';
import { isCategoryMatch } from '../utils/categoryUtils';
import {
  Flame,
  Utensils,
  Sparkles,
  ShieldCheck,
  Clock,
  MapPin,
  Search,
  ArrowRight,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface ChineseSpecialsPageProps {
  routeConfig: SeoRouteConfig;
}

interface ChineseCategoryConfig {
  id: string;
  categoryKey: string;
  title: string;
  shortLabel: string;
  tagline: string;
  description: string;
  icon: React.ReactNode;
}

const CHINESE_CATEGORIES: ChineseCategoryConfig[] = [
  {
    id: 'starters',
    categoryKey: 'chinese_starters',
    title: 'Indo-Chinese Starters',
    shortLabel: 'Starters',
    tagline: 'Wok-Tossed Appetizers',
    description: 'Crispy Manchurian, Chilli Paneer, Garlic Chicken, Chicken 65 and spicy wok starters.',
    icon: <Flame className="w-4 h-4 text-amber-500" />,
  },
  {
    id: 'fried-rice',
    categoryKey: 'fried_rice',
    title: 'Fried Rice',
    shortLabel: 'Fried Rice',
    tagline: 'Fragrant Wok Basmati Rice',
    description: 'Classic Veg, Egg, Chicken, and Schezwan fried rice tossed on intense wok flames.',
    icon: <Utensils className="w-4 h-4 text-emerald-500" />,
  },
  {
    id: 'noodles',
    categoryKey: 'noodles',
    title: 'Noodles',
    shortLabel: 'Noodles',
    tagline: 'Street-Style Hakka & Schezwan',
    description: 'Fresh stir-fried Hakka and spicy Schezwan noodles with farm vegetables and tender chicken.',
    icon: <Sparkles className="w-4 h-4 text-rose-500" />,
  },
  {
    id: 'maggies',
    categoryKey: 'maggie',
    title: 'Maggies',
    shortLabel: 'Maggies',
    tagline: 'Desi Wok Specials',
    description: 'Indo-Chinese and street-style spiced Maggies loaded with cheese, veggies, and chicken.',
    icon: <Flame className="w-4 h-4 text-orange-500" />,
  },
  {
    id: 'momos',
    categoryKey: 'momos',
    title: 'Momos',
    shortLabel: 'Momos',
    tagline: 'Steamed, Fried & Peri Peri',
    description: 'Authentic dumplings packed with seasoned fillings, served with fiery homemade chutney.',
    icon: <Sparkles className="w-4 h-4 text-amber-500" />,
  },
];

export const ChineseSpecialsPage: React.FC<ChineseSpecialsPageProps> = ({ routeConfig }) => {
  const { menu } = useStore();
  const [dietaryFilter, setDietaryFilter] = useState<DietaryType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Extract all active in-stock Chinese items
  const activeMenu = useMemo(() => {
    return menu.filter((m) => m.inStock !== false);
  }, [menu]);

  const allChineseItems = useMemo(() => {
    return activeMenu.filter((m) =>
      CHINESE_CATEGORIES.some((c) => isCategoryMatch(m.category, c.categoryKey))
    );
  }, [activeMenu]);

  // Filter items based on dietary and search criteria
  const filteredCategoryData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return CHINESE_CATEGORIES.map((cat) => {
      const items = activeMenu.filter((item) => {
        if (!isCategoryMatch(item.category, cat.categoryKey)) return false;
        if (dietaryFilter !== 'all' && item.dietary !== dietaryFilter) return false;
        if (q) {
          const matchName = item.name.toLowerCase().includes(q);
          const matchDesc = (item.description || '').toLowerCase().includes(q);
          if (!matchName && !matchDesc) return false;
        }
        return true;
      });

      return {
        ...cat,
        items,
        totalInCat: activeMenu.filter((m) => isCategoryMatch(m.category, cat.categoryKey)).length,
      };
    });
  }, [activeMenu, dietaryFilter, searchQuery]);

  const totalFilteredCount = useMemo(() => {
    return filteredCategoryData.reduce((acc, cat) => acc + cat.items.length, 0);
  }, [filteredCategoryData]);

  const scrollToCategory = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = 80;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-16">
      {/* Breadcrumbs for SEO */}
      <Breadcrumbs items={routeConfig.breadcrumbs} />

      {/* Hero / Header Section */}
      <header className="relative bg-gradient-to-b from-stone-900 via-stone-950 to-stone-900 text-white py-10 sm:py-14 px-4 sm:px-6 overflow-hidden border-b border-stone-800">
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#EA580C_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-rose-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs font-bold uppercase tracking-wider mb-4">
            <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Wok-Fired Indo-Chinese Kitchen • Gachibowli</span>
          </div>

          {/* Page Heading & Supporting Text */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white font-display tracking-tight">
            MOZZ Chinese Specials
          </h1>

          <p className="text-stone-300 text-base sm:text-lg mt-3 max-w-3xl leading-relaxed font-normal">
            Explore Chinese starters, fried rice, noodles, Maggies and momos in Gachibowli.
          </p>

          {/* Key Kitchen Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-6 pt-6 border-t border-stone-800/80 text-xs sm:text-sm text-stone-300">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Strict Veg &amp; Non-Veg Segregated Kitchen</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Fresh Cooked to Order on High Flames</span>
            </div>
            <div className="flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Direct Doorstep Delivery in Gachibowli</span>
            </div>
          </div>
        </div>
      </header>

      {/* Sticky Interactive Filter & Category Navigation Bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Category Jump Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs font-medium">
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold shrink-0 transition"
              >
                All Chinese ({allChineseItems.length})
              </button>
              {CHINESE_CATEGORIES.map((cat) => {
                const count = activeMenu.filter((m) => isCategoryMatch(m.category, cat.categoryKey)).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => scrollToCategory(`cat-${cat.id}`)}
                    className="px-3 py-1.5 rounded-lg bg-stone-50 hover:bg-rose-50 border border-stone-200 hover:border-rose-200 text-stone-700 hover:text-rose-600 shrink-0 transition flex items-center gap-1.5"
                  >
                    <span>{cat.shortLabel}</span>
                    <span className="text-[10px] font-bold text-stone-400">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Dietary Filter & Search Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Dietary Pills */}
              <div className="inline-flex items-center bg-stone-100 p-0.5 rounded-lg text-xs font-medium border border-stone-200">
                <button
                  type="button"
                  onClick={() => setDietaryFilter('all')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    dietaryFilter === 'all'
                      ? 'bg-white text-stone-900 shadow-xs font-bold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  All ({allChineseItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDietaryFilter('veg')}
                  className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                    dietaryFilter === 'veg'
                      ? 'bg-emerald-50 text-emerald-700 font-bold shadow-xs'
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
                      ? 'bg-rose-50 text-rose-700 font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-600" />
                  <span>Non-Veg</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDietaryFilter('egg')}
                  className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                    dietaryFilter === 'egg'
                      ? 'bg-amber-50 text-amber-700 font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Egg</span>
                </button>
              </div>

              {/* Quick Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search dishes..."
                  className="pl-8 pr-3 py-1 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:bg-white w-28 sm:w-36 transition"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Categories and Items View */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-12 sm:space-y-16">
        {totalFilteredCount === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center max-w-lg mx-auto mt-10">
            <Utensils className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-stone-800">No Chinese dishes match your filter</h3>
            <p className="text-stone-500 text-sm mt-1">
              Try adjusting your dietary filter or search query to see available dishes.
            </p>
            <button
              type="button"
              onClick={() => {
                setDietaryFilter('all');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 transition"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredCategoryData.map((cat, idx) => {
            if (cat.items.length === 0) return null;

            return (
              <section
                key={cat.id}
                id={`cat-${cat.id}`}
                className="scroll-mt-24 pt-4 first:pt-0"
                aria-label={cat.title}
              >
                {/* Category Header */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between pb-4 mb-6 border-b border-stone-200 gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex items-center justify-center w-6 h-6 rounded-md bg-stone-100 border border-stone-200">
                        {cat.icon}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-rose-600">
                        {idx + 1}. {cat.tagline}
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 font-display">
                      {cat.title}
                    </h2>
                    <p className="text-stone-600 text-xs sm:text-sm mt-1 max-w-2xl">
                      {cat.description}
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                      {cat.items.length} {cat.items.length === 1 ? 'Dish' : 'Dishes'}
                    </span>
                  </div>
                </div>

                {/* Grid of Dishes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                  {cat.items.map((item) => (
                    <FoodCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>

      {/* Explore Other Menu Sections on Starters4U */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 pt-10 border-t border-stone-200">
        <h3 className="text-base sm:text-lg font-bold text-stone-900 font-display mb-4">
          Explore Other Dishes on Starters4U
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <a
            href="/pizza-gachibowli"
            className="p-4 rounded-xl bg-white border border-stone-200 hover:border-rose-400 hover:bg-rose-50/30 text-stone-800 text-xs sm:text-sm font-semibold transition flex items-center justify-between group shadow-xs"
          >
            <span>Korean Pocket Pizzas</span>
            <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition" />
          </a>
          <a
            href="/menu"
            className="p-4 rounded-xl bg-white border border-stone-200 hover:border-rose-400 hover:bg-rose-50/30 text-stone-800 text-xs sm:text-sm font-semibold transition flex items-center justify-between group shadow-xs"
          >
            <span>Full Food Menu</span>
            <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition" />
          </a>
          <a
            href="/delivery-information"
            className="p-4 rounded-xl bg-white border border-stone-200 hover:border-rose-400 hover:bg-rose-50/30 text-stone-800 text-xs sm:text-sm font-semibold transition flex items-center justify-between group shadow-xs"
          >
            <span>Delivery &amp; Packaging Info</span>
            <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition" />
          </a>
          <a
            href="/about"
            className="p-4 rounded-xl bg-white border border-stone-200 hover:border-rose-400 hover:bg-rose-50/30 text-stone-800 text-xs sm:text-sm font-semibold transition flex items-center justify-between group shadow-xs"
          >
            <span>About MOZZ Kitchen</span>
            <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition" />
          </a>
        </div>
      </section>

      {/* SEO FAQs */}
      <div className="mt-12">
        <SeoFaqSection faqs={routeConfig.faqs} />
      </div>
    </div>
  );
};
