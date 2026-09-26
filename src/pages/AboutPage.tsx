import React from 'react';
import { SeoRouteConfig } from '../types/seoTypes';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { SeoFaqSection } from '../components/SeoFaqSection';
import { BUSINESS_INFO, getFormattedLocation } from '../config/businessInfo';
import {
  UtensilsCrossed,
  ShieldCheck,
  Flame,
  Layers,
  Sparkles,
  MapPin,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface AboutPageProps {
  routeConfig: SeoRouteConfig;
}

export const AboutPage: React.FC<AboutPageProps> = ({ routeConfig }) => {
  return (
    <div className="min-h-screen bg-stone-50">
      <Breadcrumbs items={routeConfig.breadcrumbs} />

      <header className="bg-white border-b border-stone-200 py-10 sm:py-14 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Our Story & Operations</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 font-display">
            {routeConfig.h1}
          </h1>
          <p className="text-stone-600 text-base sm:text-lg mt-3 leading-relaxed">
            Starters4U is the dedicated online ordering platform connecting food lovers directly to MOZZ Chinese & Pizzateria in {BUSINESS_INFO.locality}, {BUSINESS_INFO.city}.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Section 1: Platform & Restaurant Relationship */}
        <section className="bg-white rounded-2xl p-6 sm:p-8 border border-stone-200 shadow-xs">
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900 font-display mb-3">
            The Relationship Between Starters4U & MOZZ
          </h2>
          <p className="text-stone-600 text-sm sm:text-base leading-relaxed mb-4">
            <strong>Starters4U</strong> was developed as a modern, high-performance digital ordering technology system tailored specifically for <strong>MOZZ Chinese & Pizzateria</strong>. It powers online delivery ordering, takeaway scheduling, and digital QR table menus for in-restaurant diners.
          </p>
          <p className="text-stone-600 text-sm sm:text-base leading-relaxed">
            By ordering through Starters4U, customers bypass third-party aggregator markups, receiving real-time kitchen updates, accurate menu availability, and direct customer care from the MOZZ culinary team.
          </p>
        </section>

        {/* Section 2: Culinary Concept */}
        <section className="bg-white rounded-2xl p-6 sm:p-8 border border-stone-200 shadow-xs">
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900 font-display mb-4">
            Our Two Culinary Specializations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-stone-50 p-5 rounded-xl border border-stone-200">
              <div className="flex items-center gap-2 font-bold text-stone-900 text-base mb-2">
                <Layers className="w-5 h-5 text-rose-600" />
                <span>Korean Pocket Pizzas</span>
              </div>
              <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
                Handcrafted pocket crusts baked with folded, sealed edges. By enclosing cheese and rich savory toppings, pocket pizzas remain hotter for longer and avoid messy topping spills during eating.
              </p>
              <div className="mt-4">
                <a
                  href="/korean-pocket-pizza-hyderabad"
                  className="text-xs font-semibold text-rose-700 hover:text-rose-800 flex items-center gap-1"
                >
                  <span>Learn about R, C, S pocket shapes</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="bg-stone-50 p-5 rounded-xl border border-stone-200">
              <div className="flex items-center gap-2 font-bold text-stone-900 text-base mb-2">
                <Flame className="w-5 h-5 text-amber-600" />
                <span>Indo-Chinese Wok Kitchen</span>
              </div>
              <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
                High-heat wok cooking that balances fiery garlic, ginger, green chillies, and savory soy sauces. Featuring Manchurian, Chilli Paneer, Chicken 65, Chicken Majestic, and wok fried rice.
              </p>
              <div className="mt-4">
                <a
                  href="/chinese-starters-gachibowli"
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
                >
                  <span>Explore Chinese starters</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Kitchen Standards */}
        <section className="bg-white rounded-2xl p-6 sm:p-8 border border-stone-200 shadow-xs">
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900 font-display mb-4">
            Our Kitchen Standards
          </h2>
          <div className="space-y-4 text-stone-600 text-sm sm:text-base leading-relaxed">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <strong className="text-stone-900 block font-semibold">Clear Menu Demarcation</strong>
                Distinct vegetarian and non-vegetarian sections are clearly labeled throughout the menu.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <strong className="text-stone-900 block font-semibold">Cooked Fresh to Order</strong>
                Pizzas are baked upon order placement and wok dishes are tossed fresh, ensuring peak crispness and warmth.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <strong className="text-stone-900 block font-semibold">Local Gachibowli Presence</strong>
                Based in {getFormattedLocation()}, serving our local Gachibowli community.
              </div>
            </div>
          </div>
        </section>
      </main>

      <SeoFaqSection faqs={routeConfig.faqs} />
    </div>
  );
};
