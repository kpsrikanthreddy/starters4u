import fs from 'fs';
import path from 'path';
import { getSeoEligibleRestaurants, getRestaurantForSeo, SeoEligibleRestaurant } from './tenantService.js';

export const CANONICAL_DOMAIN = 'https://www.starters4u.in';

export interface StaticSeoRoute {
  path: string;
  title: string;
  description: string;
  lastmod?: string;
}

export const BASE_STATIC_ROUTES: StaticSeoRoute[] = [
  {
    path: '/',
    title: 'Starters4U | Order Food Online from Top Local Restaurants',
    description: 'Discover top local restaurants and order food online for quick delivery and takeaway in Hyderabad on Starters4U.',
  },
  {
    path: '/restaurants',
    title: 'Restaurants in Hyderabad | Explore Menus & Order Online on Starters4U',
    description: 'Browse active local restaurants, explore varied cuisines, and order delicious food online for delivery and takeaway on Starters4U.',
  },
  {
    path: '/about',
    title: 'About Starters4U | Multi-Restaurant Food Platform in Hyderabad',
    description: 'Learn about Starters4U, Hyderabad’s premier multi-restaurant digital food marketplace empowering local kitchens.',
  },
  {
    path: '/contact',
    title: 'Contact Us & Partner Inquiries | Starters4U Hyderabad',
    description: 'Get in touch with Starters4U customer support, restaurant partnership teams, and kitchen operations.',
  },
  {
    path: '/delivery-information',
    title: 'Delivery Information & Coverage Areas | Starters4U',
    description: 'Check Starters4U delivery coverage across Hyderabad, preparation times, packaging policies, and fulfillment fees.',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy | Starters4U',
    description: 'Privacy Policy for Starters4U multi-restaurant ordering platform and data protection standards.',
  },
  {
    path: '/terms-and-conditions',
    title: 'Terms and Conditions | Starters4U',
    description: 'Terms and conditions governing food ordering, restaurant storefronts, and customer services on Starters4U.',
  },
  {
    path: '/refund-and-cancellation-policy',
    title: 'Refund and Cancellation Policy | Starters4U',
    description: 'Refund, replacement, and cancellation guidelines for orders placed on Starters4U.',
  },
];

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds dynamic, database-driven XML sitemap containing all eligible public routes.
 */
export async function generateDynamicSitemapXml(): Promise<string> {
  let restaurants: SeoEligibleRestaurant[] = [];
  try {
    restaurants = await getSeoEligibleRestaurants();
  } catch (err: any) {
    console.error('[SeoService] Error loading restaurants for sitemap:', err.message);
  }

  const urlEntries: string[] = [];

  // 1. Static base pages
  for (const route of BASE_STATIC_ROUTES) {
    const loc = `${CANONICAL_DOMAIN}${route.path === '/' ? '/' : route.path}`;
    urlEntries.push(`  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`);
  }

  // 2. Dynamic restaurant pages (Storefront + Menu)
  for (const r of restaurants) {
    const storefrontLoc = `${CANONICAL_DOMAIN}/r/${encodeURIComponent(r.slug)}`;
    const menuLoc = `${CANONICAL_DOMAIN}/r/${encodeURIComponent(r.slug)}/menu`;

    const lastmodTag = r.updatedAt
      ? `\n    <lastmod>${escapeXml(r.updatedAt.split('T')[0])}</lastmod>`
      : '';

    urlEntries.push(
      `  <url>\n    <loc>${escapeXml(storefrontLoc)}</loc>${lastmodTag}\n  </url>`
    );
    urlEntries.push(
      `  <url>\n    <loc>${escapeXml(menuLoc)}</loc>${lastmodTag}\n  </url>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>\n`;
}

/**
 * Generates Schema.org JSON-LD for a restaurant page
 */
export function buildRestaurantJsonLd(restaurant: SeoEligibleRestaurant, pageType: 'storefront' | 'menu'): Record<string, any>[] {
  const restaurantUrl = `${CANONICAL_DOMAIN}/r/${restaurant.slug}`;
  const pageUrl = pageType === 'storefront' ? restaurantUrl : `${restaurantUrl}/menu`;

  const restaurantSchema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${restaurantUrl}#restaurant`,
    name: restaurant.name,
    url: restaurantUrl,
    servesCuisine: restaurant.cuisines,
    priceRange: '₹₹',
    address: {
      '@type': 'PostalAddress',
      addressLocality: restaurant.locality || 'Hyderabad',
      addressRegion: 'Telangana',
      addressCountry: 'IN',
      streetAddress: restaurant.address || undefined,
    },
  };

  if (restaurant.phone) {
    restaurantSchema.telephone = restaurant.phone;
  }

  if (restaurant.logoUrl) {
    restaurantSchema.image = restaurant.logoUrl;
  }

  const breadcrumbList: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${CANONICAL_DOMAIN}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Restaurants',
        item: `${CANONICAL_DOMAIN}/restaurants`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: restaurant.name,
        item: restaurantUrl,
      },
    ],
  };

  if (pageType === 'menu') {
    breadcrumbList.itemListElement.push({
      '@type': 'ListItem',
      position: 4,
      name: 'Menu',
      item: pageUrl,
    });
  }

  return [restaurantSchema, breadcrumbList];
}

let cachedBaseTemplate: string | null = null;

function getBaseTemplate(distPath: string): string {
  if (cachedBaseTemplate) return cachedBaseTemplate;
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    cachedBaseTemplate = fs.readFileSync(indexPath, 'utf-8');
    return cachedBaseTemplate;
  }
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Starters4U</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
}

/**
 * Injects dynamic SSR metadata and crawlable body content for a restaurant page.
 */
export function renderRestaurantHtml(
  distPath: string,
  restaurant: SeoEligibleRestaurant,
  pageType: 'storefront' | 'menu'
): string {
  const base = getBaseTemplate(distPath);
  const isMenu = pageType === 'menu';

  const pageTitle = isMenu
    ? `${restaurant.name} Menu - Order Online | Starters4U`
    : `${restaurant.name} | Order Online on Starters4U`;

  const pageDesc = isMenu
    ? `Explore dishes, prices, and combos from ${restaurant.name} in ${restaurant.locality || 'Hyderabad'}. Cuisines: ${restaurant.cuisines.join(', ')}. Order online on Starters4U.`
    : (restaurant.tagline
        ? `${restaurant.name} in ${restaurant.locality || 'Hyderabad'} - ${restaurant.tagline}. Cuisines: ${restaurant.cuisines.join(', ')}. Order online on Starters4U.`
        : `Order delicious food online from ${restaurant.name} in ${restaurant.locality || 'Hyderabad'}. Cuisines: ${restaurant.cuisines.join(', ')}. Fast delivery and takeaway on Starters4U.`);

  const canonicalUrl = isMenu
    ? `${CANONICAL_DOMAIN}/r/${restaurant.slug}/menu`
    : `${CANONICAL_DOMAIN}/r/${restaurant.slug}`;

  const schemas = buildRestaurantJsonLd(restaurant, pageType);
  const jsonLdBlocks = schemas
    .map((s) => `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`)
    .join('\n    ');

  const metaHtml = `
    <!-- Dynamic Restaurant SEO -->
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(pageDesc)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta name="robots" content="index, follow" />
    <meta name="googlebot" content="index, follow" />

    <!-- Open Graph -->
    <meta property="og:type" content="restaurant.restaurant" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(pageDesc)}" />
    <meta property="og:site_name" content="Starters4U" />
    ${restaurant.logoUrl ? `<meta property="og:image" content="${escapeHtml(restaurant.logoUrl)}" />` : ''}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(pageDesc)}" />
    ${restaurant.logoUrl ? `<meta name="twitter:image" content="${escapeHtml(restaurant.logoUrl)}" />` : ''}

    <!-- Schema.org JSON-LD -->
    ${jsonLdBlocks}
  `;

  // Pre-rendered crawlable HTML content for search engine indexers
  const crawlableBody = `
    <div class="min-h-screen bg-stone-50 font-sans text-stone-800" data-ssr-tenant="${escapeHtml(restaurant.slug)}">
      <header class="bg-white border-b border-stone-200 py-4 px-6 shadow-xs">
        <div class="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/" class="text-xl font-black text-rose-600 tracking-tight">Starters4U</a>
          <nav class="flex items-center gap-4 text-sm font-medium">
            <a href="/restaurants" class="hover:text-rose-600 transition-colors">Restaurants</a>
            <a href="/r/${escapeHtml(restaurant.slug)}/menu" class="hover:text-rose-600 transition-colors">Menu</a>
          </nav>
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div class="bg-white rounded-2xl p-6 sm:p-8 border border-stone-200 shadow-xs">
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            ${
              restaurant.logoUrl
                ? `<img src="${escapeHtml(restaurant.logoUrl)}" alt="${escapeHtml(restaurant.name)} logo" class="w-20 h-20 rounded-xl object-cover border border-stone-200" />`
                : ''
            }
            <div>
              <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">${escapeHtml(restaurant.name)}</h1>
              ${restaurant.tagline ? `<p class="text-stone-600 mt-1 text-sm sm:text-base">${escapeHtml(restaurant.tagline)}</p>` : ''}
              <div class="flex flex-wrap gap-2 mt-3 text-xs text-stone-500">
                <span class="font-medium text-stone-700">${escapeHtml(restaurant.locality || 'Hyderabad')}, Hyderabad</span>
                <span>•</span>
                <span>${escapeHtml(restaurant.cuisines.join(' • '))}</span>
              </div>
            </div>
          </div>

          <div class="mt-6 pt-6 border-t border-stone-100 flex flex-wrap gap-4">
            <a href="/r/${escapeHtml(restaurant.slug)}/menu" class="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-sm shadow-sm hover:bg-rose-700 transition-colors">
              Explore Full Digital Menu
            </a>
            <a href="/restaurants" class="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-stone-100 text-stone-700 font-semibold text-sm hover:bg-stone-200 transition-colors">
              Browse All Hyderabad Restaurants
            </a>
          </div>
        </div>

        <section class="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs">
          <h2 class="text-lg font-bold text-stone-900 mb-2">About ${escapeHtml(restaurant.name)} on Starters4U</h2>
          <p class="text-sm text-stone-600 leading-relaxed">
            Order online directly from ${escapeHtml(restaurant.name)} in ${escapeHtml(restaurant.locality || 'Hyderabad')}.
            Enjoy fresh delicacies, customized dishes, fast local delivery, and secure online ordering on the Starters4U platform.
          </p>
        </section>
      </main>
    </div>
  `;

  // Clean existing title & meta tags from template
  let cleaned = base
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name="description"[\s\S]*?>/gi, '')
    .replace(/<link\s+rel="canonical"[\s\S]*?>/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[\s\S]*?>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[\s\S]*?>/gi, '')
    .replace(/<meta\s+name="robots"[\s\S]*?>/gi, '')
    .replace(/<meta\s+name="googlebot"[\s\S]*?>/gi, '')
    .replace(/<script\s+type="application\/ld\+json"[\s\S]*?<\/script>/gi, '');

  cleaned = cleaned.replace('</head>', `${metaHtml}\n  </head>`);
  cleaned = cleaned.replace(
    '<div id="root"></div>',
    `<div id="root">${crawlableBody}</div>`
  );

  return cleaned;
}
