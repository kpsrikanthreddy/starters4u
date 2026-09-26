/**
 * Central Business Information Configuration
 * 
 * Single source of truth for platform and restaurant entity information.
 * Any unverified details are marked as undefined and excluded from visible content
 * and Schema.org structured data until confirmed by the owner.
 */

export interface BusinessInfo {
  // Confirmed Platform / Domain Details
  platformName: string;
  domain: string;

  // Confirmed Restaurant Entity Details
  restaurantName: string;
  tagline: string;
  locality: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
  priceRange: string;
  servesCuisine: string[];

  // Verified Restaurant Entity Details
  streetAddress?: string;
  fullAddress?: string;
  postalCode?: string;
  telephone?: string;
  email?: string;
  geo?: {
    latitude: number;
    longitude: number;
  };
  googleMapsUrl?: string;
  googlePlaceId?: string;
  openingHours?: Array<{
    days: string[];
    opens: string;
    closes: string;
  }>;
  socialProfiles: string[];
  gstin?: string;
}

export const BUSINESS_INFO: BusinessInfo = {
  // Confirmed platform identity
  platformName: 'Starters4U',
  domain: 'https://www.starters4u.in',

  // Confirmed restaurant identity
  restaurantName: 'MOZZ Chinese & Pizzateria',
  tagline: 'Where India Meets Every Slice • Different Flavors. Same Love.',
  locality: 'Gachibowli',
  city: 'Hyderabad',
  state: 'Telangana',
  country: 'India',
  countryCode: 'IN',
  priceRange: '₹₹',
  servesCuisine: [
    'Chinese',
    'Indo-Chinese',
    'Korean-style Pocket Pizza',
    'Momos',
    'Starters',
    'Fried Rice',
    'Noodles',
  ],

  // Verified details from business owner
  streetAddress: 'Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli',
  fullAddress: 'Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli, Hyderabad, Telangana',
  postalCode: undefined,
  telephone: undefined,
  email: undefined,
  geo: {
    latitude: 17.442509,
    longitude: 78.353966,
  },
  googleMapsUrl: 'https://maps.app.goo.gl/H9R6Fma2rBVmt3uN9',
  googlePlaceId: 'ChIJQ_8-QkKTyzsRcb3W1I0llIM',
  openingHours: undefined,
  socialProfiles: [],
  gstin: undefined,
};

/**
 * Returns a clean verified address string using confirmed values
 */
export function getFormattedLocation(): string {
  if (BUSINESS_INFO.streetAddress) {
    return `${BUSINESS_INFO.streetAddress}, ${BUSINESS_INFO.city}, ${BUSINESS_INFO.state}`;
  }
  return `${BUSINESS_INFO.locality}, ${BUSINESS_INFO.city}, ${BUSINESS_INFO.state}, ${BUSINESS_INFO.country}`;
}

/**
 * Builds Schema.org Restaurant structured data using verified fields
 */
export function getRestaurantSchema(restaurantUrl: string = `${BUSINESS_INFO.domain}/r/mozz`): Record<string, any> {
  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${restaurantUrl}#restaurant`,
    name: BUSINESS_INFO.restaurantName,
    url: restaurantUrl,
    servesCuisine: BUSINESS_INFO.servesCuisine,
    priceRange: BUSINESS_INFO.priceRange,
    address: {
      '@type': 'PostalAddress',
      streetAddress: BUSINESS_INFO.streetAddress,
      addressLocality: BUSINESS_INFO.locality,
      addressRegion: BUSINESS_INFO.state,
      addressCountry: BUSINESS_INFO.countryCode,
    },
  };

  if (BUSINESS_INFO.geo) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: BUSINESS_INFO.geo.latitude,
      longitude: BUSINESS_INFO.geo.longitude,
    };
  }
  if (BUSINESS_INFO.googleMapsUrl) {
    schema.hasMap = BUSINESS_INFO.googleMapsUrl;
  }
  if (BUSINESS_INFO.googlePlaceId) {
    schema.identifier = BUSINESS_INFO.googlePlaceId;
  }
  if (BUSINESS_INFO.postalCode) {
    schema.address.postalCode = BUSINESS_INFO.postalCode;
  }
  if (BUSINESS_INFO.telephone) {
    schema.telephone = BUSINESS_INFO.telephone;
  }
  if (BUSINESS_INFO.email) {
    schema.email = BUSINESS_INFO.email;
  }
  if (BUSINESS_INFO.socialProfiles && BUSINESS_INFO.socialProfiles.length > 0) {
    schema.sameAs = BUSINESS_INFO.socialProfiles;
  }
  if (BUSINESS_INFO.openingHours && BUSINESS_INFO.openingHours.length > 0) {
    schema.openingHoursSpecification = BUSINESS_INFO.openingHours.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.days,
      opens: h.opens,
      closes: h.closes,
    }));
  }

  return schema;
}

/**
 * Builds Schema.org Organization structured data for Starters4U
 */
export function getPlatformOrganizationSchema(): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${BUSINESS_INFO.domain}/#organization`,
    name: BUSINESS_INFO.platformName,
    url: `${BUSINESS_INFO.domain}/`,
    description: 'Starters4U is a multi-restaurant food ordering and delivery marketplace in Hyderabad.',
    logo: `${BUSINESS_INFO.domain}/logo.png`,
  };
}

/**
 * Builds Schema.org WebSite structured data for Starters4U
 */
export function getWebSiteSchema(): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BUSINESS_INFO.domain}/#website`,
    url: `${BUSINESS_INFO.domain}/`,
    name: BUSINESS_INFO.platformName,
    alternateName: 'Starters4U Multi-Restaurant Food Ordering Platform',
    description: 'Order food online from top local restaurants in Hyderabad on Starters4U.',
    publisher: {
      '@id': `${BUSINESS_INFO.domain}/#organization`,
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${BUSINESS_INFO.domain}/restaurants?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export const CANONICAL_DOMAIN = BUSINESS_INFO.domain;
export const generateRestaurantJsonLd = getRestaurantSchema;

/**
 * Builds Schema.org BreadcrumbList structured data
 */
export function generateBreadcrumbJsonLd(breadcrumbs: Array<{ name: string; path: string }>): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((b, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: b.name,
      item: `${BUSINESS_INFO.domain}${b.path === '/' ? '' : b.path}`,
    })),
  };
}

/**
 * Builds Schema.org FAQPage structured data
 */
export function generateFaqJsonLd(faqs?: Array<{ question: string; answer: string }>): Record<string, any> | null {
  if (!faqs || faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  };
}

