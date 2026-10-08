import React from 'react';
import {
  UtensilsCrossed,
  MapPin,
  ShieldCheck,
  Store,
  ExternalLink,
} from 'lucide-react';
import { BUSINESS_INFO } from '../../config/businessInfo';

interface MarketplaceFooterProps {
  onNavigate?: (path: string) => void;
}

export const MarketplaceFooter: React.FC<MarketplaceFooterProps> = ({
  onNavigate = (path) => {
    window.location.href = path;
  },
}) => {
  return (
    <footer className="bg-stone-900 text-stone-300 pt-12 pb-10 border-t border-stone-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-stone-800">
          {/* Brand & City Details */}
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center text-white">
                <UtensilsCrossed className="w-4 h-4" />
              </div>
              <span className="text-xl font-black text-white tracking-tight">
                Starters<span className="text-rose-500">4U</span>
              </span>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              Hyderabad's multi-restaurant online food ordering platform. Direct kitchen
              ordering, transparent prices, and instant live tracking.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-stone-400 pt-1">
              <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>Hyderabad, Telangana, India</span>
            </div>
          </div>

          {/* Quick Ordering Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Explore & Order
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="/restaurants"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/restaurants');
                  }}
                  className="hover:text-white transition-colors"
                >
                  All Restaurants
                </a>
              </li>
              <li>
                <a
                  href="/r/mozz"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/r/mozz');
                  }}
                  className="hover:text-white transition-colors flex items-center gap-1"
                >
                  <span>MOZZ Chinese & Pizzateria</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 font-semibold">
                    Flagship
                  </span>
                </a>
              </li>
              <li>
                <a
                  href="/track"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/track');
                  }}
                  className="hover:text-white transition-colors"
                >
                  Track Existing Order
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/contact');
                  }}
                  className="hover:text-white transition-colors"
                >
                  Contact Support
                </a>
              </li>
            </ul>
          </div>

          {/* Restaurant Partners */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              For Restaurants
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="/onboarding"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/onboarding');
                  }}
                  className="text-amber-400 hover:text-amber-300 font-medium transition-colors flex items-center gap-1"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Partner with Starters4U</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Legal Policies */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Policies & Terms
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="/privacy-policy"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/privacy-policy');
                  }}
                  className="hover:text-white transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="/terms-and-conditions"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/terms-and-conditions');
                  }}
                  className="hover:text-white transition-colors"
                >
                  Terms and Conditions
                </a>
              </li>
              <li>
                <a
                  href="/refund-and-cancellation-policy"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/refund-and-cancellation-policy');
                  }}
                  className="hover:text-white transition-colors"
                >
                  Refund and Cancellation
                </a>
              </li>
              <li>
                <a
                  href="/delivery-information"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/delivery-information');
                  }}
                  className="hover:text-white transition-colors"
                >
                  Delivery Information
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright line */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
          <p>© {new Date().getFullYear()} Starters4U Platform. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Secure 256-bit Encrypted Ordering</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
