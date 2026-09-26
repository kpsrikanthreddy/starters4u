import React from 'react';
import { useRestaurant } from '../context/RestaurantContext';
import { AlertCircle } from 'lucide-react';

export const RestaurantNoticeBanner: React.FC = () => {
  const { restaurant, restaurantName, isSuspended } = useRestaurant();

  const isInactive = restaurant?.status === 'inactive';

  if (!isSuspended && !isInactive) {
    return null;
  }

  const displayName = restaurantName || restaurant?.name || 'This restaurant';

  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-3 border-b border-amber-600 shadow-sm" role="alert">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2.5 text-xs sm:text-sm font-semibold text-center">
        <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-slate-950 shrink-0" />
        <span>
          {isInactive
            ? `Notice: ${displayName} is currently inactive and not accepting orders.`
            : `Notice: ${displayName} is temporarily unavailable or suspended. Browsing is available, but ordering is paused.`}
        </span>
      </div>
    </div>
  );
};
