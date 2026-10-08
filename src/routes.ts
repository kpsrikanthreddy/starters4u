import { SeoRouteConfig } from './types/seoTypes';
import {
  BUSINESS_INFO,
  getRestaurantSchema,
  getWebSiteSchema,
  getPlatformOrganizationSchema,
} from './config/businessInfo';

export const SEO_ROUTES: SeoRouteConfig[] = [
  // 1. Starters4U Marketplace Homepage
  {
    path: '/',
    canonicalUrl: `${BUSINESS_INFO.domain}/`,
    title: 'Starters4U | Order Food Online from Top Local Restaurants',
    metaDescription:
      'Discover top local restaurants and order food online for quick delivery and takeaway in Hyderabad on Starters4U. Explore menus, starters, pizzas, and fresh delicacies.',
    h1: 'Order Food Online from Top Local Restaurants on Starters4U',
    breadcrumbs: [{ name: 'Home', path: '/' }],
    targetKeywords: ['Starters4U', 'Food delivery Hyderabad', 'Order food online', 'Multi restaurant food ordering'],
    isPublicIndexable: true,
    changefreq: 'daily',
    priority: 1.0,
    faqs: [
      {
        question: 'What is Starters4U?',
        answer:
          'Starters4U is a multi-restaurant online food ordering platform based in Hyderabad, connecting food lovers with top local restaurants for fast delivery, takeaway, and dine-in ordering.',
      },
      {
        question: 'How do I order food from restaurants on Starters4U?',
        answer:
          'Search for your favourite dishes or browse restaurants near your location, explore their dedicated digital menus, customise your items, and checkout securely with instant order tracking.',
      },
      {
        question: 'What payment modes are accepted on Starters4U?',
        answer:
          'Restaurants on Starters4U support secure payment options including UPI (Google Pay, PhonePe, Paytm), credit/debit cards, net banking, and Cash on Delivery / Pay at Counter where enabled.',
      },
      {
        question: 'Can I track my order live?',
        answer:
          'Yes. Every order on Starters4U includes a live tracking page with real-time status updates from kitchen confirmation to food preparation and dispatch.',
      },
    ],
  },

  // 2. Restaurant Discovery Directory
  {
    path: '/restaurants',
    canonicalUrl: `${BUSINESS_INFO.domain}/restaurants`,
    title: 'Restaurants in Hyderabad | Explore Menus & Order Online on Starters4U',
    metaDescription:
      'Browse active local restaurants, explore varied cuisines, and order delicious food online for delivery and takeaway on Starters4U.',
    h1: 'Explore Restaurants & Cuisines on Starters4U',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Restaurants', path: '/restaurants' },
    ],
    targetKeywords: ['Restaurants in Hyderabad', 'Food delivery directory', 'Order food online Hyderabad'],
    isPublicIndexable: true,
    changefreq: 'daily',
    priority: 0.9,
    faqs: [
      {
        question: 'Which restaurants are available on Starters4U in Hyderabad?',
        answer:
          'Starters4U features popular local restaurants across Hyderabad specializing in Chinese, Korean pocket pizzas, Biryani, South Indian tiffins, kebabs, and fast food.',
      },
      {
        question: 'Can I filter restaurants by cuisine?',
        answer:
          'Yes, you can easily filter restaurants by cuisine such as Chinese, Pizza, Momos, Biryani, South Indian, North Indian, and Fast Food.',
      },
    ],
  },

  // 3. MOZZ Chinese & Pizzateria Flagship Storefront
  {
    path: '/r/mozz',
    canonicalUrl: `${BUSINESS_INFO.domain}/r/mozz`,
    title: 'MOZZ Chinese & Pizzateria | Order Online on Starters4U',
    metaDescription:
      'Official online ordering storefront for MOZZ Chinese & Pizzateria in Gachibowli, Hyderabad. Order pocket pizzas, Chinese starters, fried rice, noodles and momos.',
    h1: 'Order Online from MOZZ Chinese & Pizzateria on Starters4U',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Restaurants', path: '/restaurants' },
      { name: 'MOZZ Chinese & Pizzateria', path: '/r/mozz' },
    ],
    targetKeywords: ['Starters4U', 'MOZZ Chinese & Pizzateria', 'Order Chinese food online in Gachibowli'],
    isPublicIndexable: true,
    changefreq: 'daily',
    priority: 1.0,
    faqs: [
      {
        question: 'What is the relationship between Starters4U and MOZZ Chinese & Pizzateria?',
        answer:
          'Starters4U is the official online ordering platform for MOZZ Chinese & Pizzateria. All orders placed on this storefront are freshly prepared by MOZZ in Gachibowli, Hyderabad.',
      },
      {
        question: 'What cuisines are available at MOZZ?',
        answer:
          'MOZZ Chinese & Pizzateria serves Korean-style pocket pizzas in three shapes (Rectangular, Circular, Square), Indo-Chinese starters, fried rice, noodles, Maggies, and momos.',
      },
      {
        question: 'How can I pay for my food order at MOZZ?',
        answer:
          'Online orders support secure UPI, credit cards, debit cards, and net banking via Razorpay, as well as Cash / UPI at pickup.',
      },
      {
        question: 'Does MOZZ offer vegetarian and non-vegetarian options?',
        answer:
          'Yes, MOZZ Chinese & Pizzateria offers distinct 100% vegetarian and non-vegetarian sections on its menu.',
      },
    ],
  },

  // 3b. MOZZ Dedicated Subroute Menu (/r/mozz/menu)
  {
    path: '/r/mozz/menu',
    canonicalUrl: `${BUSINESS_INFO.domain}/r/mozz/menu`,
    title: 'MOZZ Chinese & Pizzateria Menu - Order Online | Starters4U',
    metaDescription:
      'Explore the complete food menu of MOZZ Chinese & Pizzateria in Gachibowli, Hyderabad. Pocket pizzas, Chinese starters, momos, noodles, and combos.',
    h1: 'Complete Menu - MOZZ Chinese & Pizzateria Gachibowli',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Restaurants', path: '/restaurants' },
      { name: 'MOZZ Chinese & Pizzateria', path: '/r/mozz' },
      { name: 'Menu', path: '/r/mozz/menu' },
    ],
    targetKeywords: ['MOZZ menu', 'MOZZ Chinese & Pizzateria menu', 'Pocket pizza price', 'Chinese starters menu'],
    isPublicIndexable: true,
    changefreq: 'daily',
    priority: 0.9,
    faqs: [
      {
        question: 'What items are on the MOZZ menu?',
        answer:
          'The MOZZ menu features Korean-style pocket pizzas, veg and non-veg Chinese starters, momos, fried rice, and noodles.',
      },
    ],
  },

  // 3. Chinese Restaurant in Gachibowli
  {
    path: '/chinese-restaurant-gachibowli',
    canonicalUrl: `${BUSINESS_INFO.domain}/chinese-restaurant-gachibowli`,
    title: 'Chinese Restaurant in Gachibowli | MOZZ – Starters4U',
    metaDescription:
      'Discover Indo-Chinese dining and takeaway from MOZZ Chinese & Pizzateria in Gachibowli, Hyderabad. Order wok-tossed starters, fried rice, noodles and momos.',
    h1: 'Chinese Restaurant in Gachibowli – MOZZ Chinese & Pizzateria',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Chinese Restaurant Gachibowli', path: '/chinese-restaurant-gachibowli' },
    ],
    targetKeywords: ['Chinese restaurant in Gachibowli', 'Order Chinese food online in Gachibowli'],
    isPublicIndexable: true,
    changefreq: 'weekly',
    priority: 0.8,
    faqs: [
      {
        question: 'What Chinese dishes are served by MOZZ in Gachibowli?',
        answer:
          'MOZZ specializes in Indo-Chinese wok cooking, featuring Veg Manchurian, Chilli Paneer, Garlic Chicken, Chicken 65, Chicken Majestic, Schezwan fried rice, and wok-tossed noodles.',
      },
      {
        question: 'Can I order Chinese food online for delivery in Gachibowli?',
        answer:
          'Yes, Starters4U provides online ordering for delivery in Gachibowli as well as self-takeaway pickup.',
      },
    ],
  },

  // 3b. Dedicated MOZZ Chinese Specials Page
  {
    path: '/chinese-specials-gachibowli',
    canonicalUrl: `${BUSINESS_INFO.domain}/chinese-specials-gachibowli`,
    title: 'MOZZ Chinese Specials in Gachibowli | Starters4U',
    metaDescription:
      'Explore Chinese starters, fried rice, noodles, Maggies and momos in Gachibowli. Order authentic Indo-Chinese wok specials online from MOZZ Chinese & Pizzateria on Starters4U.',
    h1: 'MOZZ Chinese Specials',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Chinese Specials', path: '/chinese-specials-gachibowli' },
    ],
    targetKeywords: [
      'MOZZ Chinese Specials',
      'Chinese food in Gachibowli',
      'Indo Chinese starters Gachibowli',
      'fried rice noodles momos Gachibowli',
      'Order Chinese food online Gachibowli',
    ],
    isPublicIndexable: true,
    changefreq: 'daily',
    priority: 0.9,
    faqs: [
      {
        question: 'What is included in MOZZ Chinese Specials?',
        answer:
          'MOZZ Chinese Specials brings together our complete range of Indo-Chinese favorites: wok-tossed starters, fragrant fried rice varieties, stir-fried noodles, spiced Maggies, and freshly prepared steamed or fried momos.',
      },
      {
        question: 'Are veg and non-veg Chinese dishes prepared separately?',
        answer:
          'Yes, MOZZ Chinese & Pizzateria maintains strict kitchen segregation with dedicated cookware, oils, and preparation stations for 100% vegetarian and non-vegetarian dishes.',
      },
      {
        question: 'Can I order Chinese specials for delivery or takeaway in Gachibowli?',
        answer:
          'Yes, you can place your order online on Starters4U for quick doorstep delivery across Gachibowli, or pick up your food fresh from our counter.',
      },
      {
        question: 'Can I customize dishes with extra dips or spice toppings?',
        answer:
          'Yes, customize your order with extra in-house Hot Schezwan Dip, Creamy Garlic Dip, or fried noodles and extra portions directly at checkout.',
      },
    ],
  },

  // 4. Chinese Starters in Gachibowli
  {
    path: '/chinese-starters-gachibowli',
    canonicalUrl: `${BUSINESS_INFO.domain}/chinese-starters-gachibowli`,
    title: 'Chinese Starters in Gachibowli | MOZZ – Starters4U',
    metaDescription:
      'Explore veg and non-veg Chinese starters from MOZZ Chinese & Pizzateria in Gachibowli. Order Manchurian, Chilli Paneer, Chicken 65, Chicken Majestic and more.',
    h1: 'Chinese Starters in Gachibowli – Veg & Non-Veg Specials',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Chinese Starters Gachibowli', path: '/chinese-starters-gachibowli' },
    ],
    targetKeywords: ['Chinese starters in Gachibowli', 'Chinese starters Gachibowli'],
    isPublicIndexable: true,
    changefreq: 'weekly',
    priority: 0.8,
    faqs: [
      {
        question: 'What Chinese starters are available at MOZZ?',
        answer:
          'Menu highlights include Veg Manchurian (₹99), Chilli Paneer (₹129), Paneer 65 (₹129), Garlic Chicken (₹179), Chicken 65 (₹179), and Chicken Majestic (₹179).',
      },
      {
        question: 'Can I order extra dips or schezwan sauce with starters?',
        answer:
          'Yes, you can add extra Signature Hot Schezwan Dip, Creamy Garlic Butter Dip, or extra paneer/chicken portions directly in your cart.',
      },
    ],
  },

  // 5. Veg Starters in Gachibowli
  {
    path: '/veg-starters-gachibowli',
    canonicalUrl: `${BUSINESS_INFO.domain}/veg-starters-gachibowli`,
    title: 'Veg Starters in Gachibowli | Order Online – Starters4U',
    metaDescription:
      'Order vegetarian Chinese starters in Gachibowli from MOZZ. Veg Manchurian, Chilli Paneer, Kaju Paneer, Paneer 65 and Chilli Mushroom.',
    h1: 'Veg Starters in Gachibowli – Paneer, Mushroom & Manchurian',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Veg Starters Gachibowli', path: '/veg-starters-gachibowli' },
    ],
    targetKeywords: ['Veg starters in Gachibowli', 'Paneer starters Gachibowli'],
    isPublicIndexable: true,
    changefreq: 'weekly',
    priority: 0.8,
    faqs: [
      {
        question: 'Which vegetarian starters are available on the menu?',
        answer:
          'Vegetarian starters include Veg Manchurian (₹99), Chilli Mushroom (₹99), Paneer 65 (₹129), Kaju Paneer (₹129), and Chilli Paneer (₹129).',
      },
      {
        question: 'What vegetarian options are featured?',
        answer:
          'Vegetarian starters feature paneer, mushroom, and mixed vegetable preparations tossed in wok gravies and dry sauces.',
      },
    ],
  },

  // 6. Non-Veg Starters in Gachibowli
  {
    path: '/non-veg-starters-gachibowli',
    canonicalUrl: `${BUSINESS_INFO.domain}/non-veg-starters-gachibowli`,
    title: 'Non-Veg Starters in Gachibowli | MOZZ – Starters4U',
    metaDescription:
      'Order chicken starters in Gachibowli from MOZZ Chinese & Pizzateria. Garlic Chicken, Chicken 65, Devil Chicken, Chicken Majestic and Chilli Chicken.',
    h1: 'Non-Veg Starters in Gachibowli – Wok-Tossed Chicken Delicacies',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Non-Veg Starters Gachibowli', path: '/non-veg-starters-gachibowli' },
    ],
    targetKeywords: ['Non-veg starters in Gachibowli', 'Chicken starters Gachibowli'],
    isPublicIndexable: true,
    changefreq: 'weekly',
    priority: 0.8,
    faqs: [
      {
        question: 'Which chicken starters can I order in Gachibowli?',
        answer:
          'Non-veg starters include Garlic Chicken (₹179), Chicken 65 (₹179), Devil Chicken (₹179), Chicken Majestic (₹179), and Chilli Chicken (₹179).',
      },
      {
        question: 'What is Chicken Majestic prepared with?',
        answer:
          'Chicken Majestic features tender chicken strips marinated in curd, mint, green chillies, and Hyderabadi-style spices, dry-tossed in a hot wok.',
      },
    ],
  },

  // 7. Pizza in Gachibowli
  {
    path: '/pizza-gachibowli',
    canonicalUrl: `${BUSINESS_INFO.domain}/pizza-gachibowli`,
    title: 'Pizza in Gachibowli | Korean Pocket Pizza – Starters4U',
    metaDescription:
      'Order Korean-style pocket pizzas in Gachibowli from MOZZ Chinese & Pizzateria. Available in Rectangular, Circular and Square shapes with veg and non-veg toppings.',
    h1: 'Pizza in Gachibowli – Korean-Style Pocket Pizzas by MOZZ',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Pizza Gachibowli', path: '/pizza-gachibowli' },
    ],
    targetKeywords: ['Pizza restaurant in Gachibowli', 'Pizza in Gachibowli'],
    isPublicIndexable: true,
    changefreq: 'weekly',
    priority: 0.8,
    faqs: [
      {
        question: 'How is a Korean pocket pizza different from traditional round pizza?',
        answer:
          'A Korean pocket pizza features an enclosed crust edge that seals in the rich cheese blend and slow-cooked toppings, keeping the crust crisp and preventing messy spills while eating.',
      },
      {
        question: 'What sizes or shapes do MOZZ pocket pizzas come in?',
        answer:
          'They are available in three shapes: [R] Rectangular, [C] Circular, and [S] Square.',
      },
    ],
  },

  // 8. Korean Pocket Pizza Hyderabad
  {
    path: '/korean-pocket-pizza-hyderabad',
    canonicalUrl: `${BUSINESS_INFO.domain}/korean-pocket-pizza-hyderabad`,
    title: 'Korean Pocket Pizza in Hyderabad | MOZZ – Starters4U',
    metaDescription:
      'Experience Korean pocket pizzas in Hyderabad by MOZZ Chinese & Pizzateria. Handheld pocket crusts packed with molten cheese in R, C and S custom shapes.',
    h1: 'Korean Pocket Pizza in Hyderabad – Custom R, C, S Shapes',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Korean Pocket Pizza Hyderabad', path: '/korean-pocket-pizza-hyderabad' },
    ],
    targetKeywords: ['Korean pocket pizza Hyderabad', 'Pocket pizza Hyderabad'],
    isPublicIndexable: true,
    changefreq: 'weekly',
    priority: 0.8,
    faqs: [
      {
        question: 'What varieties of Korean pocket pizzas are available in Hyderabad?',
        answer:
          'Options range from Cheesy Margherita and Veg Salsa to Paneer Tikka, Spicy Chicken Mania, Absolute Butter Chicken (ABC), BBQ Chicken Supreme, and dessert pockets like Kitkat Nutella Magic.',
      },
      {
        question: 'Can I add extra cheese or spicy dips?',
        answer:
          'Yes, you can customize with Extra Korean In-House Cheese Blend (₹40), Hot Schezwan Dip (₹25), or Korean Sweet & Spicy Mayo (₹30).',
      },
    ],
  },

  // 9. Momos in Gachibowli
  {
    path: '/momos-gachibowli',
    canonicalUrl: `${BUSINESS_INFO.domain}/momos-gachibowli`,
    title: 'Momos in Gachibowli | Order from MOZZ – Starters4U',
    metaDescription:
      'Order steamed and fried momos in Gachibowli from MOZZ Chinese & Pizzateria. Veg, Paneer and Chicken momos served with fiery chutney and dipping sauce.',
    h1: 'Momos in Gachibowli – Steamed, Fried & Peri Peri Dumplings',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Momos Gachibowli', path: '/momos-gachibowli' },
    ],
    targetKeywords: ['Momos in Gachibowli', 'Steamed momos Gachibowli', 'Fried momos Gachibowli'],
    isPublicIndexable: true,
    changefreq: 'weekly',
    priority: 0.8,
    faqs: [
      {
        question: 'What types of momos are on the MOZZ menu?',
        answer:
          'MOZZ offers Veg Steam Momos (₹77), Paneer Steam Momos (₹87), Paneer Fried Momos (₹87), Chicken Steamed Momos (₹97), Chicken Fried Momos (₹97), and Peri Peri Fried Momos (₹97).',
      },
      {
        question: 'What sauces are served with the momos?',
        answer:
          'Every momo portion is served with signature spicy red garlic-chili momo chutney and creamy dip.',
      },
    ],
  },

  // 10. About Us
  {
    path: '/about',
    canonicalUrl: `${BUSINESS_INFO.domain}/about`,
    title: 'About Us | Starters4U & MOZZ Chinese & Pizzateria',
    metaDescription:
      'Learn about Starters4U, the official online ordering platform, and MOZZ Chinese & Pizzateria in Gachibowli, Hyderabad, bringing pocket pizzas and Chinese dining.',
    h1: 'About Starters4U & MOZZ Chinese & Pizzateria',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'About Us', path: '/about' },
    ],
    targetKeywords: ['About Starters4U', 'About MOZZ Chinese & Pizzateria'],
    isPublicIndexable: true,
    changefreq: 'monthly',
    priority: 0.6,
    faqs: [
      {
        question: 'What is Starters4U?',
        answer:
          'Starters4U is the dedicated digital ordering technology platform built for MOZZ Chinese & Pizzateria, supporting direct online orders, live tracking, and digital table ordering.',
      },
      {
        question: 'Where is the kitchen located?',
        answer:
          'The restaurant kitchen is based in Gachibowli, Hyderabad, Telangana, India.',
      },
    ],
  },

  // 11. Contact Us
  {
    path: '/contact',
    canonicalUrl: `${BUSINESS_INFO.domain}/contact`,
    title: 'Contact Us | Starters4U & MOZZ Gachibowli',
    metaDescription:
      'Contact Starters4U and MOZZ Chinese & Pizzateria in Gachibowli, Hyderabad for online order assistance, takeaway queries and customer support.',
    h1: 'Contact Starters4U & MOZZ Chinese & Pizzateria',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Contact Us', path: '/contact' },
    ],
    targetKeywords: ['Contact Starters4U', 'MOZZ Gachibowli contact'],
    isPublicIndexable: true,
    changefreq: 'monthly',
    priority: 0.6,
    faqs: [
      {
        question: 'How do I check the status of my online order?',
        answer:
          'You can monitor real-time order confirmation, baking, and dispatch status on our Live Order Tracker page after checkout.',
      },
      {
        question: 'How do in-restaurant dining orders work?',
        answer:
          'Guests dining at MOZZ scan the table QR code to open the digital menu and place kitchen-verified orders directly from their smartphone.',
      },
    ],
  },

  // 12. Delivery Information
  {
    path: '/delivery-information',
    canonicalUrl: `${BUSINESS_INFO.domain}/delivery-information`,
    title: 'Delivery Information | Starters4U & MOZZ Gachibowli',
    metaDescription:
      'Read delivery and takeaway information for MOZZ Chinese & Pizzateria orders on Starters4U in Gachibowli, Hyderabad. Fresh packaging and order tracking.',
    h1: 'Delivery & Takeaway Information for Gachibowli',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Delivery Information', path: '/delivery-information' },
    ],
    targetKeywords: ['MOZZ delivery Gachibowli', 'Starters4U food delivery'],
    isPublicIndexable: true,
    changefreq: 'monthly',
    priority: 0.6,
    faqs: [
      {
        question: 'How are pocket pizzas packaged for delivery?',
        answer:
          'Pocket pizzas are packed in food-grade pizza cartons designed for secure food transit.',
      },
      {
        question: 'Can I choose takeaway instead of delivery?',
        answer:
          'Yes, you can toggle between Home Delivery and Self Takeaway at any time from the top navigation bar or during checkout.',
      },
    ],
  },

  // 13. Privacy Policy
  {
    path: '/privacy-policy',
    canonicalUrl: `${BUSINESS_INFO.domain}/privacy-policy`,
    title: 'Privacy Policy | Starters4U Online Ordering',
    metaDescription:
      'Review the customer privacy policy for Starters4U and MOZZ Chinese & Pizzateria, covering customer order details, secure payment processing and data handling.',
    h1: 'Customer Privacy Policy – Starters4U',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Privacy Policy', path: '/privacy-policy' },
    ],
    targetKeywords: ['Starters4U privacy policy'],
    isPublicIndexable: true,
    changefreq: 'monthly',
    priority: 0.4,
  },

  // 14. Terms & Conditions
  {
    path: '/terms-and-conditions',
    canonicalUrl: `${BUSINESS_INFO.domain}/terms-and-conditions`,
    title: 'Terms & Conditions | Starters4U & MOZZ',
    metaDescription:
      'Review the online ordering terms and conditions for Starters4U and MOZZ Chinese & Pizzateria in Gachibowli, Hyderabad.',
    h1: 'Terms & Conditions – Starters4U Online Ordering',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Terms & Conditions', path: '/terms-and-conditions' },
    ],
    targetKeywords: ['Starters4U terms and conditions'],
    isPublicIndexable: true,
    changefreq: 'monthly',
    priority: 0.4,
  },

  // 15. Refund & Cancellation Policy
  {
    path: '/refund-and-cancellation-policy',
    canonicalUrl: `${BUSINESS_INFO.domain}/refund-and-cancellation-policy`,
    title: 'Refund & Cancellation Policy | Starters4U & MOZZ',
    metaDescription:
      'Understand order cancellation and refund policies for food orders placed on Starters4U for MOZZ Chinese & Pizzateria in Gachibowli, Hyderabad.',
    h1: 'Refund & Cancellation Policy – Starters4U',
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Refund & Cancellation Policy', path: '/refund-and-cancellation-policy' },
    ],
    targetKeywords: ['Starters4U refund policy', 'Starters4U cancellation policy'],
    isPublicIndexable: true,
    changefreq: 'monthly',
    priority: 0.4,
  },
];

/**
 * 404 Route metadata (not in sitemap, but pre-rendered to 404.html)
 */
export const NOT_FOUND_ROUTE: SeoRouteConfig = {
  path: '/404',
  canonicalUrl: `${BUSINESS_INFO.domain}/404`,
  title: 'Page Not Found (404) | Starters4U',
  metaDescription:
    'The page you requested could not be found on Starters4U. Return to the homepage or explore the MOZZ Chinese & Pizzateria menu.',
  h1: 'Page Not Found (404)',
  breadcrumbs: [
    { name: 'Home', path: '/' },
    { name: '404', path: '/404' },
  ],
  targetKeywords: [],
  isPublicIndexable: false,
};

/**
 * Helper to look up route configuration by path
 */
export function getRouteConfig(pathname: string): SeoRouteConfig | undefined {
  // Normalize trailing slash (except for root '/')
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return SEO_ROUTES.find((r) => r.path === normalized);
}

/**
 * Generates JSON-LD schema array for a given route
 */
export function getRouteJsonLd(route: SeoRouteConfig): Record<string, any>[] {
  const schemas: Record<string, any>[] = [];

  // 1. Root / Marketplace schemas vs Restaurant schemas
  if (route.path === '/') {
    schemas.push(getWebSiteSchema());
    schemas.push(getPlatformOrganizationSchema());
  } else if (route.path === '/r/mozz') {
    schemas.push(getRestaurantSchema(`${BUSINESS_INFO.domain}/r/mozz`));
  } else if (route.path.startsWith('/r/')) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      '@id': `${route.canonicalUrl}#restaurant`,
      name: route.title.split('|')[0].trim(),
      url: route.canonicalUrl,
    });
  } else if (route.path.startsWith('/chinese') || route.path.startsWith('/pizza') || route.path === '/r/mozz/menu') {
    // Legacy MOZZ subpages point back to canonical MOZZ restaurant
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      '@id': `${BUSINESS_INFO.domain}/r/mozz#restaurant`,
      name: BUSINESS_INFO.restaurantName,
      url: `${BUSINESS_INFO.domain}/r/mozz`,
    });
  }

  // 2. WebPage schema
  schemas.push({
    '@context': 'https://schema.org',
    '@type': route.path === '/restaurants' ? 'CollectionPage' : 'WebPage',
    '@id': `${route.canonicalUrl}#webpage`,
    url: route.canonicalUrl,
    name: route.title,
    description: route.metaDescription,
    isPartOf: {
      '@id': `${BUSINESS_INFO.domain}/#website`,
    },
    about: route.path === '/r/mozz' || route.path.startsWith('/chinese') || route.path.startsWith('/pizza') || route.path === '/r/mozz/menu'
      ? { '@id': `${BUSINESS_INFO.domain}/r/mozz#restaurant` }
      : route.path.startsWith('/r/')
      ? { '@id': `${route.canonicalUrl}#restaurant` }
      : { '@id': `${BUSINESS_INFO.domain}/#organization` },
  });

  // 3. BreadcrumbList schema
  if (route.breadcrumbs && route.breadcrumbs.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      '@id': `${route.canonicalUrl}#breadcrumb`,
      itemListElement: route.breadcrumbs.map((b, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: b.name,
        item: `${BUSINESS_INFO.domain}${b.path === '/' ? '' : b.path}`,
      })),
    });
  }

  // 4. FAQPage schema (only when genuine visible FAQs exist)
  if (route.faqs && route.faqs.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${route.canonicalUrl}#faq`,
      mainEntity: route.faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.answer,
        },
      })),
    });
  }

  return schemas;
}

export const PUBLIC_ROUTES: SeoRouteConfig[] = SEO_ROUTES.map((r) => ({
  ...r,
  name: r.h1,
  description: r.metaDescription,
}));

