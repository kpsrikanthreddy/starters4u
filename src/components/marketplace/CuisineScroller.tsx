import React from 'react';
import {
  Utensils,
  Pizza,
  Flame,
  Coffee,
  Sparkles,
  Soup,
  Sandwich,
  Cake,
} from 'lucide-react';

interface CuisineScrollerProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

const CUISINE_ICONS: Record<string, React.ReactNode> = {
  All: <Utensils className="w-3.5 h-3.5" />,
  Chinese: <Soup className="w-3.5 h-3.5" />,
  Pizza: <Pizza className="w-3.5 h-3.5" />,
  Momos: <Flame className="w-3.5 h-3.5" />,
  Biryani: <Sparkles className="w-3.5 h-3.5" />,
  'South Indian': <Coffee className="w-3.5 h-3.5" />,
  'North Indian': <Flame className="w-3.5 h-3.5" />,
  'Fast Food': <Sandwich className="w-3.5 h-3.5" />,
  Desserts: <Cake className="w-3.5 h-3.5" />,
};

export const CuisineScroller: React.FC<CuisineScrollerProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
}) => {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight">
          Explore by Cuisine
        </h2>
        <span className="text-xs text-stone-500 font-medium hidden sm:inline">
          Filter active kitchens
        </span>
      </div>

      {/* Horizontal scroll container on mobile, flex-wrap on larger displays */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {categories.map((cat) => {
          const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
          const icon = CUISINE_ICONS[cat] || <Utensils className="w-3.5 h-3.5" />;

          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold transition-all duration-150 border cursor-pointer select-none ${
                isSelected
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <span className={isSelected ? 'text-white' : 'text-stone-500'}>
                {icon}
              </span>
              <span className="whitespace-nowrap">{cat}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
