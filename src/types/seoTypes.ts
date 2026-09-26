/**
 * SEO & Route Definition Types
 */

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface SeoFaqItem {
  question: string;
  answer: string;
}

export interface SeoRouteConfig {
  path: string;
  name?: string;
  canonicalUrl: string;
  title: string;
  metaDescription: string;
  description?: string;
  h1: string;
  breadcrumbs: BreadcrumbItem[];
  faqs?: SeoFaqItem[];
  targetKeywords: string[];
  isPublicIndexable: boolean;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}
