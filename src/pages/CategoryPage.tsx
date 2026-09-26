import React from 'react';
import { SeoRouteConfig } from '../types/seoTypes';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { SeoFaqSection } from '../components/SeoFaqSection';
import { SeoFoodGrid } from '../components/SeoFoodGrid';
import { useStore } from '../context/StoreContext';
import { MenuItem } from '../types';
import { isCategoryMatch } from '../utils/categoryUtils';
import {
  Utensils,
  Flame,
  Layers,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

interface CategoryPageProps {
  routeConfig: SeoRouteConfig;
}

export const CategoryPage: React.FC<CategoryPageProps> = ({ routeConfig }) => {
  const { menu } = useStore();
  const path = routeConfig.path;

  // Filter items specifically based on the current landing route
  // Only include items where inStock !== false
  const activeMenu = menu.filter((m) => m.inStock !== false);

  let primaryItems: MenuItem[] = [];
  let secondaryItems: MenuItem[] = [];
  let editorialContent: {
    badge: string;
    leadText: string;
    highlights: Array<{ title: string; desc: string }>;
    relatedLinks: Array<{ title: string; path: string }>;
  };

  switch (path) {
    case '/chinese-restaurant-gachibowli':
      primaryItems = activeMenu.filter(
        (m) =>
          isCategoryMatch(m.category, 'chinese_starters') ||
          isCategoryMatch(m.category, 'fried_rice') ||
          isCategoryMatch(m.category, 'noodles')
      );
      editorialContent = {
        badge: 'Indo-Chinese Kitchen',
        leadText:
          'MOZZ Chinese & Pizzateria prepares high-heat Indo-Chinese specialties in Gachibowli, Hyderabad. Our kitchen balances aromatic garlic, ginger, green chillies, and soy sauces across classic wok-tossed dishes, from crispy starters to wholesome rice and noodle platters.',
        highlights: [
          {
            title: 'Wok-Tossed to Order',
            desc: 'Every portion of fried rice, Hakka noodles, and Manchurian is tossed on open-flame woks when your order arrives.',
          },
          {
            title: 'Clear Dietary Indicators',
            desc: 'Every item on our menu clearly displays dietary markers (Veg, Non-Veg, Egg) so customers can select dishes according to their dietary preferences.',
          },
          {
            title: 'Online Delivery & Counter Takeaway',
            desc: 'Order through Starters4U for delivery or convenient self-pickup at our Gachibowli store.',
          },
        ],
        relatedLinks: [
          { title: 'Chinese Starters in Gachibowli', path: '/chinese-starters-gachibowli' },
          { title: 'Veg Starters (Paneer, Mushroom)', path: '/veg-starters-gachibowli' },
          { title: 'Non-Veg Starters (Chicken Specials)', path: '/non-veg-starters-gachibowli' },
          { title: 'Steamed & Fried Momos', path: '/momos-gachibowli' },
        ],
      };
      break;

    case '/chinese-starters-gachibowli':
      primaryItems = activeMenu.filter(
        (m) => isCategoryMatch(m.category, 'chinese_starters')
      );
      editorialContent = {
        badge: 'Wok-Tossed Appetizers',
        leadText:
          'Discover our complete range of vegetarian and non-vegetarian Chinese starters in Gachibowli. Each dish features crisp textures, fragrant aromatics, and savory reductions tossed dry or semi-gravy in hot woks.',
        highlights: [
          {
            title: 'Vegetarian Delicacies',
            desc: 'Fresh cottage cheese in Chilli Paneer, crunchy Manchurian balls, and button mushrooms seasoned in ginger-garlic sauce.',
          },
          {
            title: 'Chicken Specialties',
            desc: 'Curd-mint marinated Chicken Majestic, caramelized Garlic Chicken, spicy Devil Chicken, and golden Chicken 65.',
          },
          {
            title: 'Signature Add-On Dips',
            desc: 'Pair your starters with extra Hot Schezwan Dip or Creamy Garlic Butter Dip for added depth.',
          },
        ],
        relatedLinks: [
          { title: 'Veg Starters Only', path: '/veg-starters-gachibowli' },
          { title: 'Non-Veg Starters Only', path: '/non-veg-starters-gachibowli' },
          { title: 'Chinese Restaurant Overview', path: '/chinese-restaurant-gachibowli' },
          { title: 'Korean Pocket Pizzas', path: '/pizza-gachibowli' },
        ],
      };
      break;

    case '/veg-starters-gachibowli':
      primaryItems = activeMenu.filter(
        (m) => isCategoryMatch(m.category, 'chinese_starters') && m.dietary === 'veg'
      );
      editorialContent = {
        badge: '100% Vegetarian Starters',
        leadText:
          'Our vegetarian Chinese starters are prepared with dairy paneer, whole button mushrooms, and garden vegetables, seasoned with aromatic Indo-Chinese sauces in Gachibowli.',
        highlights: [
          {
            title: 'Veg Manchurian (₹99)',
            desc: 'Crispy mixed-vegetable dumplings glazed in a savory dark soy, garlic, and fresh green chilli reduction.',
          },
          {
            title: 'Chilli Mushroom (₹99)',
            desc: 'Fresh whole button mushrooms tossed with crunchy capsicum, sliced onions, and aromatic sauces.',
          },
          {
            title: 'Paneer Trio (₹129 each)',
            desc: 'Choose between spicy Chilli Paneer, crunchy Paneer 65, or rich Kaju Paneer tossed with roasted cashews.',
          },
        ],
        relatedLinks: [
          { title: 'All Chinese Starters', path: '/chinese-starters-gachibowli' },
          { title: 'Vegetarian Pocket Pizzas', path: '/pizza-gachibowli' },
          { title: 'Veg & Paneer Momos', path: '/momos-gachibowli' },
          { title: 'Full Menu', path: '/menu' },
        ],
      };
      break;

    case '/non-veg-starters-gachibowli':
      primaryItems = activeMenu.filter(
        (m) => isCategoryMatch(m.category, 'chinese_starters') && m.dietary === 'non-veg'
      );
      editorialContent = {
        badge: 'Chicken Starters Selection',
        leadText:
          'From traditional street-style Chicken 65 to Hyderabadi-inspired Chicken Majestic, our non-vegetarian Chinese starters feature tender boneless chicken cooked in intensely seasoned reductions.',
        highlights: [
          {
            title: 'Chicken Majestic (₹179)',
            desc: 'Thin strips of boneless chicken marinated in spiced curd, mint, and curry leaves, wok-tossed dry.',
          },
          {
            title: 'Garlic Chicken (₹179)',
            desc: 'Chicken bites glazed with crushed golden garlic, scallions, black pepper, and light soy reduction.',
          },
          {
            title: 'Devil Chicken (₹179)',
            desc: 'Intense spicy preparation for chili enthusiasts, tossed with crushed red chilies and hot schezwan oil.',
          },
        ],
        relatedLinks: [
          { title: 'All Chinese Starters', path: '/chinese-starters-gachibowli' },
          { title: 'Chicken Pocket Pizzas', path: '/pizza-gachibowli' },
          { title: 'Chicken Momos', path: '/momos-gachibowli' },
          { title: 'Full Menu', path: '/menu' },
        ],
      };
      break;

    case '/pizza-gachibowli':
      primaryItems = activeMenu.filter(
        (m) => isCategoryMatch(m.category, 'pocket_pizza_veg') || isCategoryMatch(m.category, 'pocket_pizza_nonveg')
      );
      editorialContent = {
        badge: 'Korean Pocket Pizzas',
        leadText:
          'Order freshly baked Korean pocket pizzas in Gachibowli from MOZZ Chinese & Pizzateria. Available in three shape sizes with an enclosed crust edge designed for mess-free snacking.',
        highlights: [
          {
            title: 'Enclosed Handheld Crust',
            desc: 'Crust dough is folded and sealed around molten cheese and savory fillings, retaining heat and crispness.',
          },
          {
            title: 'Custom R, C, S Shapes',
            desc: 'Select [R] Rectangular for solo meals, [C] Circular for couples, or [S] Square for families and gatherings.',
          },
          {
            title: 'Veg & Non-Veg Varieties',
            desc: 'From Cheesy Margherita and Paneer Tikka to Spicy Chicken Mania and Absolute Butter Chicken.',
          },
        ],
        relatedLinks: [
          { title: 'Korean Pocket Pizza Hyderabad Guide', path: '/korean-pocket-pizza-hyderabad' },
          { title: 'Chinese Starters in Gachibowli', path: '/chinese-starters-gachibowli' },
          { title: 'Delivery Information', path: '/delivery-information' },
          { title: 'Full Menu', path: '/menu' },
        ],
      };
      break;

    case '/korean-pocket-pizza-hyderabad':
      primaryItems = activeMenu.filter(
        (m) => isCategoryMatch(m.category, 'pocket_pizza_veg') || isCategoryMatch(m.category, 'pocket_pizza_nonveg')
      );
      secondaryItems = activeMenu.filter((m) => isCategoryMatch(m.category, 'dessert_pizza'));
      editorialContent = {
        badge: 'Handheld Pizza Innovation',
        leadText:
          'Korean pocket pizza represents an innovative approach to oven-baked pizza. Instead of toppings sitting exposed on top of a flat disc, ingredients are encased within a crimped pocket crust that locks in juices, sauce, and melted cheese.',
        highlights: [
          {
            title: '[R] Rectangular Shape (Regular)',
            desc: 'Regular pocket crust size, convenient for individual dining and handheld bites.',
          },
          {
            title: '[C] Circular Shape (Classic)',
            desc: 'Classic round pocket crust, offering a balanced crust-to-filling ratio.',
          },
          {
            title: '[S] Square Shape (Signature)',
            desc: 'Signature large square pocket crust, packed with extra cheese and fillings.',
          },
        ],
        relatedLinks: [
          { title: 'Pizza in Gachibowli', path: '/pizza-gachibowli' },
          { title: 'Chinese Restaurant Overview', path: '/chinese-restaurant-gachibowli' },
          { title: 'Momos in Gachibowli', path: '/momos-gachibowli' },
          { title: 'Full Menu', path: '/menu' },
        ],
      };
      break;

    case '/momos-gachibowli':
    default:
      primaryItems = activeMenu.filter((m) => isCategoryMatch(m.category, 'momos'));
      editorialContent = {
        badge: 'Himalayan Dumplings',
        leadText:
          'Enjoy freshly prepared steamed, golden fried, and seasoned peri-peri momos in Gachibowli from MOZZ Chinese & Pizzateria. Each portion is served with dipping sauces.',
        highlights: [
          {
            title: 'Steamed Momos',
            desc: 'Thin dough wrappers filled with spiced cabbage and carrot, paneer, or seasoned minced chicken.',
          },
          {
            title: 'Crispy Fried Momos',
            desc: 'Golden-fried until crunchy on the outside while remaining tender and juicy inside.',
          },
          {
            title: 'Peri-Peri Fried Momos',
            desc: 'Dusted with African Peri Peri chili spice blend for an extra punch of heat.',
          },
        ],
        relatedLinks: [
          { title: 'Chinese Starters in Gachibowli', path: '/chinese-starters-gachibowli' },
          { title: 'Korean Pocket Pizzas', path: '/pizza-gachibowli' },
          { title: 'Chinese Restaurant Overview', path: '/chinese-restaurant-gachibowli' },
          { title: 'Full Menu', path: '/menu' },
        ],
      };
      break;
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Breadcrumbs items={routeConfig.breadcrumbs} />

      {/* Header Banner */}
      <header className="bg-white border-b border-stone-200 py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{editorialContent.badge}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 font-display">
            {routeConfig.h1}
          </h1>

          <p className="text-stone-600 text-base sm:text-lg mt-3 max-w-3xl leading-relaxed">
            {editorialContent.leadText}
          </p>

          {/* Key Feature Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-6 border-t border-stone-100">
            {editorialContent.highlights.map((item, idx) => (
              <div key={idx} className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                <div className="flex items-center gap-2 font-semibold text-stone-900 text-sm mb-1">
                  <CheckCircle2 className="w-4 h-4 text-primary-600 shrink-0" />
                  <span>{item.title}</span>
                </div>
                <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Main Dishes Grid */}
      <main className="py-4">
        <SeoFoodGrid
          items={primaryItems}
          title="Available Dishes to Order"
          description="Order directly online for delivery in Gachibowli or self-takeaway pickup."
        />

        {secondaryItems.length > 0 && (
          <SeoFoodGrid
            items={secondaryItems}
            title="Sweet Dessert Pockets"
            description="Complete your meal with hot Nutella, Kitkat, or Snickers dessert pocket pizzas."
          />
        )}
      </main>

      {/* Related Categories Navigation */}
      <section className="bg-white border-t border-stone-200 py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-lg font-bold text-stone-900 font-display mb-4">
            Explore Other Sections on Starters4U
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {editorialContent.relatedLinks.map((link) => (
              <a
                key={link.path}
                href={link.path}
                className="p-3.5 rounded-xl border border-stone-200 hover:border-primary-400 hover:bg-primary-50/40 text-stone-800 hover:text-primary-700 text-xs sm:text-sm font-semibold transition flex items-center justify-between"
              >
                <span>{link.title}</span>
                <ArrowRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <SeoFaqSection faqs={routeConfig.faqs} />
    </div>
  );
};
