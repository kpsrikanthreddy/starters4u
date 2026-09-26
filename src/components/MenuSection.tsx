import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { FoodCategory, DietaryType, PizzaShape } from '../types';
import { FoodCard } from './FoodCard';
import {
  isCategoryMatch,
  normalizeCategorySlug,
  getActiveCategoryTabs,
} from '../utils/categoryUtils';
import {
  Search,
  Sparkles,
  Flame,
  UtensilsCrossed,
  Filter,
  X,
  Layers,
} from 'lucide-react';

interface MenuSectionProps {
  selectedCategory: FoodCategory | 'all' | string;
  onSelectCategory: (cat: FoodCategory | 'all' | string) => void;
  onOpenShapeGuide: () => void;
}

export const MenuSection: React.FC<MenuSectionProps> = ({
  selectedCategory,
  onSelectCategory,
  onOpenShapeGuide,
}) => {
  const { menu } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<DietaryType | 'all'>('all');
  const [onlyPocketPizzas, setOnlyPocketPizzas] = useState(false);

  // Dynamic category tabs based on active menu items
  const categoryTabs = useMemo(() => {
    return getActiveCategoryTabs(menu, true);
  }, [menu]);

  // Filtered menu logic
  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      // Requirement 5: Only hide items when in_stock === false
      if (item.inStock === false) {
        return false;
      }

      // Category filter with normalized slug matching
      if (selectedCategory !== 'all' && !isCategoryMatch(item.category, selectedCategory)) {
        return false;
      }

      // Pocket pizza only toggle
      if (onlyPocketPizzas && !item.isPocketPizza) {
        return false;
      }

      // Dietary filter
      if (dietaryFilter !== 'all' && item.dietary !== dietaryFilter) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = (item.description || '').toLowerCase().includes(query);
        const matchesCategory = (item.category || '').toLowerCase().includes(query);
        if (!matchesName && !matchesDesc && !matchesCategory) {
          return false;
        }
      }

      return true;
    });
  }, [menu, selectedCategory, dietaryFilter, onlyPocketPizzas, searchQuery]);

  return (
    <section id="menu-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Category Scrollable Filter Tabs */}
      <div className="bg-white/90 backdrop-blur-md p-2 rounded-2xl border border-slate-200 shadow-xs sticky top-18 z-30">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
          {categoryTabs.map((tab) => {
            const isSelected =
              selectedCategory === tab.id ||
              normalizeCategorySlug(selectedCategory) === normalizeCategorySlug(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onSelectCategory(tab.id);
                  if (tab.id.includes('pocket_pizza') || tab.id === 'dessert_pizza') {
                    setOnlyPocketPizzas(false);
                  }
                }}
                className={`px-4 py-2.5 rounded-xl font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-md ring-2 ring-rose-600 font-extrabold'
                    : 'bg-white text-slate-700 hover:text-slate-950 hover:bg-slate-100 border border-slate-200/90'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                    isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Secondary Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        {/* Search input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Margherita, Chicken 65, Fried Rice..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:bg-white transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dietary Filters & Korean Pocket Pizza Quick Toggle */}
        <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end text-xs">
          {/* Veg Only */}
          <button
            onClick={() => setDietaryFilter(dietaryFilter === 'veg' ? 'all' : 'veg')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition ${
              dietaryFilter === 'veg'
                ? 'bg-emerald-50 border border-emerald-500 text-emerald-700 shadow-xs'
                : 'bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Veg</span>
          </button>

          {/* Non-Veg Only */}
          <button
            onClick={() => setDietaryFilter(dietaryFilter === 'non-veg' ? 'all' : 'non-veg')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition ${
              dietaryFilter === 'non-veg'
                ? 'bg-rose-50 border border-rose-500 text-rose-700 shadow-xs'
                : 'bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Non-Veg</span>
          </button>

          {/* Shape Guide Trigger */}
          <button
            onClick={onOpenShapeGuide}
            className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300/80 text-amber-800 hover:bg-amber-100 font-bold transition flex items-center gap-1"
          >
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            <span>Shapes [R, C, S]</span>
          </button>
        </div>
      </div>

      {/* Menu Section Heading */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-extrabold text-slate-900 capitalize">
            {selectedCategory === 'all' ? 'All Delicacies' : selectedCategory.replace(/_/g, ' ')}
          </h2>
          <span className="text-xs text-slate-500 font-semibold">
            ({filteredMenu.length} dishes available)
          </span>
        </div>

        {selectedCategory.includes('pocket_pizza') && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-rose-600 font-semibold">
            <span>R = Rectangular</span>
            <span>•</span>
            <span>C = Circular</span>
            <span>•</span>
            <span>S = Square</span>
          </div>
        )}
      </div>

      {/* Menu Grid */}
      {filteredMenu.length === 0 ? (
        <div className="py-20 text-center bg-white border border-slate-200 rounded-3xl p-8 shadow-xs">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">No Dishes Matched Your Filters</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            Try clearing search keywords or switching between Veg and Non-Veg filters.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setDietaryFilter('all');
              onSelectCategory('all');
            }}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition shadow-xs"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredMenu.map((item) => (
            <FoodCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
};
