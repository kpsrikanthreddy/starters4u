import React from 'react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ArrowLeft, Home, ShoppingBag, Search } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-stone-50">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: '404 - Page Not Found', path: '/404' }]} />

      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-stone-200 text-stone-700 rounded-full flex items-center justify-center mx-auto mb-4 font-black text-2xl">
          404
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-stone-900 font-display mb-3">
          Page Not Found (404)
        </h1>
        <p className="text-stone-600 text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto">
          The page you requested does not exist or may have been moved. You can return to our homepage or explore our food menu below.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="/"
            className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs sm:text-sm font-semibold transition flex items-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>Return to Homepage</span>
          </a>
          <a
            href="/menu"
            className="px-5 py-2.5 rounded-xl bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 text-xs sm:text-sm font-semibold transition flex items-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Browse Full Menu</span>
          </a>
        </div>

        <div className="mt-12 pt-8 border-t border-stone-200 text-left">
          <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-3">
            Popular Pages
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
            <a href="/chinese-starters-gachibowli" className="text-primary-700 hover:underline p-1">
              • Chinese Starters in Gachibowli
            </a>
            <a href="/pizza-gachibowli" className="text-primary-700 hover:underline p-1">
              • Korean Pocket Pizzas
            </a>
            <a href="/veg-starters-gachibowli" className="text-primary-700 hover:underline p-1">
              • Vegetarian Starters (Paneer, Mushroom)
            </a>
            <a href="/momos-gachibowli" className="text-primary-700 hover:underline p-1">
              • Steamed & Fried Momos
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};
