import { SeoRouteConfig } from '../types/seoTypes';
import { getRouteJsonLd } from '../routes';
import { BUSINESS_INFO, CANONICAL_DOMAIN } from '../config/businessInfo';

export interface MetadataOptions {
  isTracking?: boolean;
  isAdmin?: boolean;
  restaurant?: {
    name: string;
    slug: string;
    tagline?: string;
    logoUrl?: string;
    locality?: string;
    city?: string;
    address?: string;
    cuisines?: string[];
  } | null;
  restaurantNotFound?: boolean;
}

function setMetaTag(selector: string, attrName: string, attrValue: string, content: string) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attrName, attrValue);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function removeMetaTag(selector: string) {
  const element = document.head.querySelector(selector);
  if (element) {
    element.remove();
  }
}

function setCanonicalTag(url: string) {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

function removeCanonicalTag() {
  const link = document.head.querySelector('link[rel="canonical"]');
  if (link) {
    link.remove();
  }
}

function removeAllJsonLd() {
  const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
  scripts.forEach((script) => script.remove());
}

export function updateDocumentMetadata(
  route: SeoRouteConfig | undefined,
  path: string,
  options: MetadataOptions = {}
) {
  if (typeof document === 'undefined') return;

  const normalizedPath = path.split('?')[0].replace(/\/$/, '') || '/';
  const isPrivateOrSystem =
    options.isAdmin ||
    options.isTracking ||
    normalizedPath.startsWith('/admin') ||
    normalizedPath.startsWith('/platform-admin') ||
    normalizedPath.startsWith('/restaurant-admin') ||
    normalizedPath.startsWith('/track') ||
    normalizedPath.includes('/track') ||
    normalizedPath.startsWith('/cart') ||
    normalizedPath.includes('/cart') ||
    normalizedPath.startsWith('/checkout') ||
    normalizedPath.includes('/checkout') ||
    normalizedPath.startsWith('/order-confirmation') ||
    normalizedPath.startsWith('/onboarding') ||
    normalizedPath.startsWith('/login') ||
    normalizedPath.startsWith('/table/') ||
    normalizedPath.startsWith('/counter');

  // Case 1: Administrative, Private, Order-Confirmation, and System Paths
  if (isPrivateOrSystem) {
    // Explicit noindex, nofollow for both robots and googlebot
    setMetaTag('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow');
    setMetaTag('meta[name="googlebot"]', 'name', 'googlebot', 'noindex, nofollow');

    // Clean up canonical to prevent search engines from indexing private routes
    removeCanonicalTag();

    // Clean up structured data schemas
    removeAllJsonLd();

    // Clean up social sharing metadata
    removeMetaTag('meta[property="og:url"]');
    removeMetaTag('meta[property="og:title"]');
    removeMetaTag('meta[property="og:description"]');
    removeMetaTag('meta[property="og:type"]');
    removeMetaTag('meta[property="og:site_name"]');
    removeMetaTag('meta[name="twitter:card"]');
    removeMetaTag('meta[name="twitter:title"]');
    removeMetaTag('meta[name="twitter:description"]');

    if (options.isAdmin || normalizedPath.includes('admin')) {
      document.title = 'Staff Portal | Starters4U Admin';
      setMetaTag('meta[name="description"]', 'name', 'description', 'Authorized restaurant administration portal.');
    } else if (options.isTracking || normalizedPath.includes('/track')) {
      document.title = 'Live Order Tracker | Starters4U';
      setMetaTag('meta[name="description"]', 'name', 'description', 'Real-time kitchen preparation and fulfillment tracking.');
    } else {
      document.title = 'Table Order Session | Starters4U';
      setMetaTag('meta[name="description"]', 'name', 'description', 'Interactive dining session.');
    }
    return;
  }

  // Case 2: Restaurant not found
  if (options.restaurantNotFound) {
    document.title = 'Restaurant Not Found (404) | Starters4U';
    setMetaTag('meta[name="description"]', 'name', 'description', 'The restaurant you are looking for could not be found or is not currently active.');
    setMetaTag('meta[name="robots"]', 'name', 'robots', 'noindex, follow');
    setMetaTag('meta[name="googlebot"]', 'name', 'googlebot', 'noindex, follow');
    removeCanonicalTag();
    removeAllJsonLd();
    return;
  }

  // Case 3: Dynamic Restaurant Storefront or Menu Route (/r/:slug, /r/:slug/menu)
  if (normalizedPath.startsWith('/r/')) {
    const isMenu = normalizedPath.endsWith('/menu');
    const slugMatch = normalizedPath.match(/^\/r\/([a-zA-Z0-9_-]+)/);
    const slug = slugMatch ? slugMatch[1] : '';

    const restaurantName = options.restaurant?.name || (slug === 'mozz' ? 'MOZZ Chinese & Pizzateria' : slug);
    const locality = options.restaurant?.locality || 'Hyderabad';
    const cuisines = options.restaurant?.cuisines || [];

    const pageTitle = isMenu
      ? `${restaurantName} Menu - Order Online | Starters4U`
      : `${restaurantName} | Order Online on Starters4U`;

    const pageDescription = isMenu
      ? `Explore dishes, prices, and combos from ${restaurantName} in ${locality}. Cuisines: ${cuisines.join(', ')}. Order online on Starters4U.`
      : (options.restaurant?.tagline
          ? `${restaurantName} in ${locality} - ${options.restaurant.tagline}. Cuisines: ${cuisines.join(', ')}. Order online on Starters4U.`
          : `Order delicious food online from ${restaurantName} in ${locality}. Cuisines: ${cuisines.join(', ')}. Fast delivery and takeaway on Starters4U.`);

    const canonicalUrl = `${CANONICAL_DOMAIN}${normalizedPath}`;

    document.title = pageTitle;
    setMetaTag('meta[name="robots"]', 'name', 'robots', 'index, follow');
    setMetaTag('meta[name="googlebot"]', 'name', 'googlebot', 'index, follow');
    setMetaTag('meta[name="description"]', 'name', 'description', pageDescription);
    setCanonicalTag(canonicalUrl);

    // Open Graph
    setMetaTag('meta[property="og:type"]', 'property', 'og:type', 'restaurant.restaurant');
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMetaTag('meta[property="og:title"]', 'property', 'og:title', pageTitle);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', pageDescription);
    setMetaTag('meta[property="og:site_name"]', 'property', 'og:site_name', BUSINESS_INFO.platformName);
    if (options.restaurant?.logoUrl) {
      setMetaTag('meta[property="og:image"]', 'property', 'og:image', options.restaurant.logoUrl);
    }

    // Twitter Card
    setMetaTag('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary');
    setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', pageTitle);
    setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', pageDescription);
    if (options.restaurant?.logoUrl) {
      setMetaTag('meta[name="twitter:image"]', 'name', 'twitter:image', options.restaurant.logoUrl);
    }

    // Dynamic JSON-LD structured data
    removeAllJsonLd();
    const restaurantUrl = `${CANONICAL_DOMAIN}/r/${slug}`;
    const schemas: Record<string, any>[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'Restaurant',
        '@id': `${restaurantUrl}#restaurant`,
        name: restaurantName,
        url: restaurantUrl,
        servesCuisine: cuisines,
        priceRange: '₹₹',
        address: {
          '@type': 'PostalAddress',
          addressLocality: locality,
          addressRegion: 'Telangana',
          addressCountry: 'IN',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
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
            name: restaurantName,
            item: restaurantUrl,
          },
          ...(isMenu
            ? [
                {
                  '@type': 'ListItem',
                  position: 4,
                  name: 'Menu',
                  item: canonicalUrl,
                },
              ]
            : []),
        ],
      },
    ];

    for (const schema of schemas) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', 'true');
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    }
    return;
  }

  // Case 4: 404 Not Found Page
  if (!route) {
    document.title = 'Page Not Found (404) | Starters4U';
    setMetaTag('meta[name="description"]', 'name', 'description', 'The page you requested could not be found on Starters4U.');

    // Directives: noindex, follow for both robots and googlebot
    setMetaTag('meta[name="robots"]', 'name', 'robots', 'noindex, follow');
    setMetaTag('meta[name="googlebot"]', 'name', 'googlebot', 'noindex, follow');

    // Remove canonical tag so it never points to indexable pages
    removeCanonicalTag();

    // Remove JSON-LD schemas
    removeAllJsonLd();

    // Clean up social sharing metadata
    removeMetaTag('meta[property="og:url"]');
    removeMetaTag('meta[property="og:title"]');
    removeMetaTag('meta[property="og:description"]');
    removeMetaTag('meta[property="og:type"]');
    removeMetaTag('meta[property="og:site_name"]');
    removeMetaTag('meta[name="twitter:card"]');
    removeMetaTag('meta[name="twitter:title"]');
    removeMetaTag('meta[name="twitter:description"]');
    return;
  }

  // Case 5: Static Public Indexable Route
  document.title = route.title;
  setMetaTag('meta[name="robots"]', 'name', 'robots', 'index, follow');
  setMetaTag('meta[name="googlebot"]', 'name', 'googlebot', 'index, follow');
  setMetaTag('meta[name="description"]', 'name', 'description', route.metaDescription);

  const canonicalUrl = `${CANONICAL_DOMAIN}${route.path === '/' ? '/' : route.path}`;
  setCanonicalTag(canonicalUrl);

  // Set Open Graph metadata
  setMetaTag('meta[property="og:type"]', 'property', 'og:type', 'website');
  setMetaTag('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
  setMetaTag('meta[property="og:title"]', 'property', 'og:title', route.title);
  setMetaTag('meta[property="og:description"]', 'property', 'og:description', route.metaDescription);
  setMetaTag('meta[property="og:site_name"]', 'property', 'og:site_name', BUSINESS_INFO.platformName);

  // Set Twitter Card metadata
  setMetaTag('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary');
  setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', route.title);
  setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', route.metaDescription);

  // Clean and re-inject structured JSON-LD schemas
  removeAllJsonLd();
  const schemas = getRouteJsonLd(route);
  for (const schema of schemas) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'true');
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  }
}
