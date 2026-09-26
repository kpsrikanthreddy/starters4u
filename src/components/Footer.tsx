import React from 'react';
import { MapPin, ShieldCheck, Heart, Clock, Utensils, Bike } from 'lucide-react';
import { useRestaurant } from '../context/RestaurantContext';
import { BUSINESS_INFO, getFormattedLocation } from '../config/businessInfo';

interface FooterProps {
  onNavigate?: (view: 'menu' | 'track') => void;
  onOpenShapeGuide?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenShapeGuide }) => {
  const {
    restaurantName,
    tagline,
    selectedBranch,
    isFlagship,
    phone,
    address,
    getTenantUrl,
    isDeliveryEnabled,
    isTakeawayEnabled,
    isDineInEnabled,
  } = useRestaurant();

  return (
    <footer className="bg-stone-950 border-t border-stone-850 text-stone-400 text-xs mt-16 pt-12 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Info */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-black bg-gradient-to-r from-amber-400 via-rose-400 to-amber-200 bg-clip-text text-transparent">
                {isFlagship ? 'MOZZ' : restaurantName}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-stone-900 text-stone-300 font-semibold border border-stone-800">
                {isFlagship ? 'Chinese & Pizzateria' : (selectedBranch?.name || 'Kitchen')}
              </span>
            </div>

            <p className="text-xs text-stone-400 leading-relaxed">
              {isFlagship ? (
                <>
                  {BUSINESS_INFO.tagline}
                  <br />
                  Korean-Style Pocket Pizzas baked fresh to order in 3 custom shapes (R, C, S), along with wok-tossed Indo-Chinese starters, noodles, and fried rice.
                </>
              ) : (
                tagline || 'Experience authentic craft cuisine freshly prepared with passion.'
              )}
            </p>

            <div className="pt-2">
              <span className="inline-block text-xs font-semibold text-primary-400 bg-stone-900 px-2.5 py-1 rounded-md border border-stone-800">
                Online ordering powered by Starters4U.
              </span>
            </div>
          </div>

          {/* Service Modes or Pocket Pizza Shapes */}
          {isFlagship ? (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Korean Pocket Pizzas
              </h4>
              <ul className="space-y-2 text-xs">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-amber-400">[R]</span>
                  <span><strong>Rectangular:</strong> Regular handheld pocket (Serves 1–2)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-amber-400">[C]</span>
                  <span><strong>Circular:</strong> Classic shape (Serves 2–3)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-amber-400">[S]</span>
                  <span><strong>Square:</strong> Signature party share (Serves 3–4)</span>
                </li>
              </ul>
              <div className="pt-1">
                <a
                  href="/korean-pocket-pizza-hyderabad"
                  className="text-amber-400 hover:text-amber-300 underline font-semibold text-xs transition"
                >
                  Read Shape & Crust Guide →
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Services & Ordering
              </h4>
              <ul className="space-y-2 text-xs text-stone-300">
                <li className="flex items-center gap-2">
                  <Bike className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>Home Delivery:</strong> {isDeliveryEnabled ? 'Available' : 'Unavailable'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-amber-400 shrink-0" />
                  <span><strong>Takeaway Pickup:</strong> {isTakeawayEnabled ? 'Available' : 'Unavailable'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-rose-400 shrink-0" />
                  <span><strong>Dine-In:</strong> {isDineInEnabled ? 'Active at tables' : 'Counter only'}</span>
                </li>
              </ul>
              <div className="pt-1 text-stone-400 text-[11px]">
                Operating daily: 11:00 AM – 11:30 PM
              </div>
            </div>
          )}

          {/* Restaurant Location */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Restaurant Location
            </h4>
            <div className="space-y-2 text-xs text-stone-400">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>{isFlagship ? BUSINESS_INFO.restaurantName : restaurantName}</strong>
                  <br />
                  {isFlagship ? getFormattedLocation() : (selectedBranch?.address || address)}
                </span>
              </div>
              {phone && (
                <div className="text-[11px] text-stone-400 pl-6">
                  Phone: {phone}
                </div>
              )}
              <div className="flex items-start gap-2 pt-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Clear vegetarian & non-vegetarian menu labeling.</span>
              </div>
            </div>
          </div>

          {/* Specialized Food Categories & Navigation */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Explore Menu
            </h4>
            <div className="grid grid-cols-1 gap-1.5 text-xs">
              <a href={getTenantUrl('/menu')} className="text-stone-300 hover:text-amber-400 transition">
                Full Food Menu
              </a>
              {isFlagship ? (
                <>
                  <a href="/chinese-specials-gachibowli" className="text-stone-300 hover:text-amber-400 transition">
                    MOZZ Chinese Specials
                  </a>
                  <a href="/chinese-starters-gachibowli" className="text-stone-300 hover:text-amber-400 transition">
                    Chinese Starters in Gachibowli
                  </a>
                  <a href="/veg-starters-gachibowli" className="text-stone-300 hover:text-amber-400 transition">
                    Vegetarian Starters
                  </a>
                  <a href="/non-veg-starters-gachibowli" className="text-stone-300 hover:text-amber-400 transition">
                    Non-Veg Chicken Starters
                  </a>
                  <a href="/pizza-gachibowli" className="text-stone-300 hover:text-amber-400 transition">
                    Korean Pocket Pizzas
                  </a>
                  <a href="/momos-gachibowli" className="text-stone-300 hover:text-amber-400 transition">
                    Steamed & Fried Momos
                  </a>
                </>
              ) : (
                <>
                  <a href={getTenantUrl('/track')} className="text-stone-300 hover:text-amber-400 transition">
                    Live Order Tracker
                  </a>
                  <a href="/about" className="text-stone-300 hover:text-amber-400 transition">
                    About the Platform
                  </a>
                  <a href="/contact" className="text-stone-300 hover:text-amber-400 transition">
                    Support & Feedback
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Legal and Information Links */}
        <div className="pt-6 border-t border-stone-900 flex flex-wrap items-center justify-between gap-4 text-xs text-stone-500">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href="/about" className="hover:text-stone-300 transition">About Us</a>
            <span>•</span>
            <a href="/contact" className="hover:text-stone-300 transition">Contact</a>
            <span>•</span>
            <a href="/delivery-information" className="hover:text-stone-300 transition">Delivery Information</a>
            <span>•</span>
            <a href="/privacy-policy" className="hover:text-stone-300 transition">Privacy Policy</a>
            <span>•</span>
            <a href="/terms-and-conditions" className="hover:text-stone-300 transition">Terms & Conditions</a>
            <span>•</span>
            <a href="/refund-and-cancellation-policy" className="hover:text-stone-300 transition">Refund & Cancellation</a>
          </div>
          <div>
            <span>Online ordering powered by Starters4U.</span>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="pt-4 border-t border-stone-900/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-stone-600">
          <div>
            © 2026 {BUSINESS_INFO.restaurantName}. All rights reserved. Razorpay UPI integrated.
          </div>
          <div className="flex items-center gap-1 text-stone-500">
            <span>Prepared fresh in {BUSINESS_INFO.locality}, {BUSINESS_INFO.city}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
