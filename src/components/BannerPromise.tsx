import React from 'react';
import { Sparkles, Flame, ShieldCheck, ArrowRight, Award, Layers, Utensils, Clock, MapPin } from 'lucide-react';
import { FoodCategory } from '../types';
import { useRestaurant } from '../context/RestaurantContext';

interface BannerPromiseProps {
  onSelectCategory: (cat: FoodCategory) => void;
  onOpenShapeGuide: () => void;
}

export const BannerPromise: React.FC<BannerPromiseProps> = ({
  onSelectCategory,
  onOpenShapeGuide,
}) => {
  const { restaurantName, tagline, selectedBranch, isFlagship } = useRestaurant();

  if (!isFlagship) {
    return (
      <div className="relative overflow-hidden bg-slate-50/60 border-b border-slate-200 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left Hero Card - Restaurant Spotlight */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none text-9xl font-black text-white select-none">
                {restaurantName.slice(0, 4).toUpperCase()}
              </div>

              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-950/50 border border-indigo-800/60 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-3">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Featured Partner Kitchen</span>
              </div>

              <div className="text-xs sm:text-sm font-medium text-slate-400 tracking-wide mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                <span>Order Online from {restaurantName} on Starters4U</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-3">
                Crafted with Passion.{' '}
                <span className="bg-gradient-to-r from-amber-400 via-rose-400 to-indigo-300 bg-clip-text text-transparent">
                  Savor Every Bite.
                </span>
              </h1>

              <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6 max-w-xl">
                {tagline || 'Discover authentic chef-crafted specialties, freshly cooked and delivered hot to your doorstep.'}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => onSelectCategory('chinese_starters')}
                  className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-bold text-sm shadow-md shadow-rose-950/30 flex items-center gap-2 transition duration-200 cursor-pointer"
                >
                  <span>Explore Kitchen Menu</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right Showcase Card - Branch & Promises */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-6 h-6 text-indigo-600" />
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{restaurantName}</h3>
                      <p className="text-[11px] text-indigo-600 font-medium">{selectedBranch?.name || 'Main Kitchen'}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                    OPEN NOW
                  </span>
                </div>

                <p className="text-xs text-slate-600 mb-4 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{selectedBranch?.address || 'Verified Kitchen Location'}</span>
                </p>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span>Daily Service: 11:00 AM – 11:30 PM</span>
                  </span>
                  <span className="font-bold text-slate-900">7 Days</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-800">
                    Kitchen Standards
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    <span><strong className="text-slate-800">Fresh Ingredients:</strong> Sourced daily for peak flavor</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    <span><strong className="text-slate-800">Cooked to Order:</strong> Prepared fresh upon receipt</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    <span><strong className="text-slate-800">Direct Tracking:</strong> Live status alerts from kitchen to door</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-slate-50/60 border-b border-slate-200 py-8 px-4 sm:px-6 lg:px-8">
      {/* Background subtle glowing gradient orbs */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Main Hero Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left Hero Card - Korean Pocket Pizzas */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none text-9xl font-black text-white select-none">
              MOZZ
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs font-bold uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Introducing Korean-Style Pocket Pizzas</span>
            </div>

            {/* Subtle branding & ordering context */}
            <div className="text-xs sm:text-sm font-medium text-slate-400 tracking-wide mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              <span>Order Online from MOZZ Chinese & Pizzateria on Starters4U</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-3">
              Freshly Baked.{' '}
              <span className="bg-gradient-to-r from-[#FF4B72] via-[#FF8533] to-[#FACC15] bg-clip-text text-transparent">
                Loaded with Love.
              </span>
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6 max-w-xl">
              Discover Korean-Style Pocket Pizzas baked inside hand-folded dough with cheese and savory fillings.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => onSelectCategory('pocket_pizza_veg')}
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#E1144B] to-[#EA580C] hover:from-[#D01042] hover:to-[#D94E08] text-white font-bold text-sm shadow-md shadow-rose-950/30 flex items-center gap-2 transition duration-200 cursor-pointer"
              >
                <span>Order Pocket Pizzas</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a
                href="/chinese-specials-gachibowli"
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#E1144B] to-[#EA580C] hover:from-[#D01042] hover:to-[#D94E08] text-white font-bold text-sm shadow-md shadow-rose-950/30 flex items-center gap-2 transition duration-200 cursor-pointer"
              >
                <span>Order MOZZ Chinese Special</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Right Showcase Card - MOZZ Chinese & Promises */}
          <div className="lg:col-span-5 space-y-4">
            {/* Chinese Wok Spotlight */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🐉</span>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">MOZZ CHINESE</h3>
                    <p className="text-[11px] text-rose-600 font-medium">Different Flavors. Same Love.</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-bold">
                  WOK FIRED
                </span>
              </div>

              <p className="text-xs text-slate-600 mb-4">
                Sizzling Manchurian, Chilli Paneer, Garlic Chicken 65, Schezwan Fried Rice, Hakka Noodles & Steamed Momos starting at just ₹69!
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => onSelectCategory('chinese_starters')}
                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 text-center transition"
                >
                  Starters (₹99+)
                </button>
                <button
                  onClick={() => onSelectCategory('fried_rice')}
                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 text-center transition"
                >
                  Fried Rice (₹89+)
                </button>
                <button
                  onClick={() => onSelectCategory('momos')}
                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 text-center transition"
                >
                  Momo's (₹77+)
                </button>
              </div>
            </div>

            {/* 5 Promises Ribbon */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-widest text-slate-800">
                  Our Culinary Promise
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  <span><strong className="text-slate-800">Fresh Dough:</strong> Prepared daily in-house</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  <span><strong className="text-slate-800">100% In-House:</strong> Proprietary cheese blend for max stretch</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  <span><strong className="text-slate-800">Freshly Baked:</strong> Stone-deck oven fire to order</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
