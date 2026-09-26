import React from 'react';
import { MenuItem } from '../types';
import { FoodCard } from './FoodCard';
import { Utensils } from 'lucide-react';

interface SeoFoodGridProps {
  items: MenuItem[];
  title?: string;
  description?: string;
  emptyMessage?: string;
}

export const SeoFoodGrid: React.FC<SeoFoodGridProps> = ({
  items,
  title,
  description,
  emptyMessage = 'No items found matching this selection.',
}) => {
  if (!items || items.length === 0) {
    return (
      <div className="py-8 text-center text-stone-500 text-sm">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <section className="py-8 sm:py-12" aria-label={title || 'Featured Dishes'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {title && (
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-2 text-primary-700 font-semibold text-xs tracking-wider uppercase mb-1">
              <Utensils className="w-3.5 h-3.5" />
              <span>Available to Order Online</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 font-display">
              {title}
            </h2>
            {description && (
              <p className="text-stone-600 text-sm sm:text-base mt-1 max-w-2xl">
                {description}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {items.map((item) => (
            <FoodCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
};
