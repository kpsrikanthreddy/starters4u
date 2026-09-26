import React from 'react';
import {
  MapPin,
  Clock,
  Bike,
  ShoppingBag,
  Utensils,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

export interface PublicRestaurantCardItem {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  logoUrl?: string;
  bannerUrl?: string;
  cuisines: string[];
  locality: string;
  address?: string;
  city: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  isOpen?: boolean | null;
  businessHours?: {
    open: string;
    close: string;
    days?: string[];
  };
  isDeliveryEnabled: boolean;
  isTakeawayEnabled: boolean;
  isDineInEnabled: boolean;
  isFlagship?: boolean;
}

interface RestaurantCardProps {
  restaurant: PublicRestaurantCardItem;
  onSelect: (slug: string) => void;
}

export const RestaurantCard: React.FC<RestaurantCardProps> = ({
  restaurant,
  onSelect,
}) => {
  const defaultBanner =
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80';
  const defaultLogo =
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=150&auto=format&fit=crop&q=80';

  const banner = restaurant.bannerUrl || restaurant.logoUrl || defaultBanner;
  const logo = restaurant.logoUrl || defaultLogo;

  return (
    <a
      href={`/r/${restaurant.slug}`}
      onClick={(e) => {
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          onSelect(restaurant.slug);
        }
      }}
      className="block group h-full no-underline text-inherit"
    >
      <article className="bg-white rounded-2xl border border-stone-200 hover:border-stone-300 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer flex flex-col h-full">
        {/* Banner & Logo Cover */}
        <div className="relative h-44 sm:h-48 w-full bg-stone-100 overflow-hidden shrink-0">
          <img
            src={banner}
            alt={restaurant.name}
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/20 to-transparent" />

          {/* Status Chip (Open / Closed) */}
          {restaurant.isOpen !== null && restaurant.isOpen !== undefined && (
            <div className="absolute top-3 left-3">
              {restaurant.isOpen ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-600/90 backdrop-blur-xs text-white shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Open Now
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-stone-900/80 backdrop-blur-xs text-stone-200 shadow-xs">
                  <Clock className="w-3 h-3 text-amber-400" />
                  Closed
                  {restaurant.businessHours?.open && (
                    <span className="text-[10px] text-stone-300 font-normal ml-0.5">
                      (Opens {restaurant.businessHours.open})
                    </span>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Flagship Badge if MOZZ */}
          {restaurant.isFlagship && (
            <div className="absolute top-3 right-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/95 text-stone-950 shadow-xs uppercase tracking-wider">
                Flagship Kitchen
              </span>
            </div>
          )}

          {/* Floating Brand Logo */}
          <div className="absolute -bottom-3 left-4">
            <div className="w-12 h-12 rounded-xl border-2 border-white bg-white shadow-sm overflow-hidden flex items-center justify-center">
              <img
                src={logo}
                alt={`${restaurant.name} logo`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        {/* Card Content */}
        <div className="p-4 sm:p-5 pt-5 flex-1 flex flex-col justify-between">
          <div>
            {/* Restaurant Title & Locality */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-base sm:text-lg font-bold text-stone-900 group-hover:text-rose-600 transition-colors line-clamp-1">
                {restaurant.name}
              </h3>
            </div>

            {/* Location details */}
            <div className="flex items-center gap-1 text-xs text-stone-500 mb-2.5">
              <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="line-clamp-1">
                {restaurant.locality ? `${restaurant.locality}, Hyderabad` : 'Hyderabad, Telangana'}
              </span>
              {restaurant.distanceKm !== undefined && (
                <span className="text-stone-400 shrink-0">• {restaurant.distanceKm} km</span>
              )}
            </div>

            {/* Tagline / Specialties */}
            {restaurant.tagline && (
              <p className="text-xs text-stone-600 line-clamp-2 mb-3 leading-relaxed">
                {restaurant.tagline}
              </p>
            )}

            {/* Cuisines Tags */}
            {restaurant.cuisines && restaurant.cuisines.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {restaurant.cuisines.slice(0, 4).map((cuisine) => (
                  <span
                    key={cuisine}
                    className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 text-[11px] font-medium"
                  >
                    {cuisine}
                  </span>
                ))}
                {restaurant.cuisines.length > 4 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-500 text-[10px]">
                    +{restaurant.cuisines.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Footer: Service Badges & View Storefront Button */}
          <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
            {/* Service Availability Badges */}
            <div className="flex items-center gap-2 text-[11px] text-stone-500">
              {restaurant.isDeliveryEnabled && (
                <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium">
                  <Bike className="w-3 h-3 text-emerald-600" />
                  Delivery
                </span>
              )}
              {restaurant.isTakeawayEnabled && (
                <span className="inline-flex items-center gap-1 text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md font-medium">
                  <ShoppingBag className="w-3 h-3 text-stone-500" />
                  Takeaway
                </span>
              )}
              {restaurant.isDineInEnabled && (
                <span className="hidden sm:inline-flex items-center gap-1 text-stone-600 bg-stone-50 px-2 py-0.5 rounded-md font-medium">
                  <Utensils className="w-3 h-3 text-stone-400" />
                  Dine-in
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 text-xs font-bold text-rose-600 group-hover:translate-x-0.5 transition-transform shrink-0">
              <span>View Menu</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </article>
    </a>
  );
};
