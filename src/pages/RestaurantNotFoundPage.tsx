import React from 'react';
import { Store, ArrowLeft, Home } from 'lucide-react';

interface RestaurantNotFoundPageProps {
  slug?: string;
  onNavigateHome: () => void;
}

export const RestaurantNotFoundPage: React.FC<RestaurantNotFoundPageProps> = ({ slug, onNavigateHome }) => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-6 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
          <Store className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-bold tracking-wider uppercase text-rose-600">Restaurant Not Found</span>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {slug ? `"${slug}" is not available` : 'Restaurant Not Found'}
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            The restaurant URL you followed does not exist, may have changed, or is no longer listed on Starters4U.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onNavigateHome}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm"
          >
            <Home className="w-4 h-4" />
            Go to MOZZ Flagship
          </button>
        </div>
      </div>
    </div>
  );
};
