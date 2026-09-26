import path from 'path';
import express from 'express';
import http from 'http';
import { provisionNewRestaurant } from '../server/services/onboardingService';
import { isRestaurantSeoEligible, getRestaurantForSeo, getSeoEligibleRestaurants } from '../server/services/tenantService';
import { generateDynamicSitemapXml } from '../server/services/seoService';
import { inMemoryDb } from '../server/db';
import { renderRestaurantHtml } from '../server/services/seoService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] ${msg}`);
  }
}

async function run() {
  console.log('🚀 Running Onboarding SEO Provisioning End-to-End Suite...\n');

  // Test 1: Provisioning a new restaurant tenant
  console.log('1. Testing provisionNewRestaurant with custom slug:');
  const testSlug = 'paradise-biryani-hitec';
  const result = await provisionNewRestaurant({
    name: 'Paradise Biryani HiTech City',
    slug: testSlug,
    ownerName: 'Mirza Baig',
    phone: '9876543219',
    address: 'Plot 45, Phase 2, Hitec City, Hyderabad',
    email: 'hitec@paradise.test',
    subscriptionPlan: 'growth',
    paymentMode: 'CASH_UPI',
    serviceModes: {
      dineIn: true,
      takeaway: true,
      delivery: true,
      counter: true,
    },
  });

  assert(result.success === true, 'Provisioning succeeded');
  assert(result.slug === testSlug, `Provisioned slug matches "${testSlug}"`);
  assert(!!result.seo, 'SEO payload returned in provisioning response');
  assert(result.seo?.isSeoEligible === true, 'isSeoEligible is true');
  assert(result.seo?.isPublicStorefrontActive === true, 'isPublicStorefrontActive is true');
  assert(result.seo?.sitemapIncluded === true, 'sitemapIncluded is true');
  assert(result.seo?.publicUrl === `https://www.starters4u.in/r/${testSlug}`, 'publicUrl matches standard canonical URL');
  assert(result.seo?.menuUrl === `https://www.starters4u.in/r/${testSlug}/menu`, 'menuUrl matches standard menu canonical URL');
  assert(result.seo?.googleOrderingUrl === `https://www.starters4u.in/r/${testSlug}/menu`, 'googleOrderingUrl configured');

  // Test 2: Database state & SEO eligibility
  console.log('\n2. Testing Database State & Tenant SEO Eligibility:');
  const dbRestaurant = inMemoryDb.restaurants.find((r) => r.slug === testSlug);
  assert(!!dbRestaurant, 'Restaurant persisted in database');
  assert(dbRestaurant?.status === 'active', 'Restaurant status is active');

  const branches = inMemoryDb.restaurant_branches.filter((b) => b.restaurant_id === dbRestaurant?.id);
  assert(branches.length > 0, 'Main branch created for tenant');
  assert(branches[0].is_active === true, 'Main branch is active');

  const isEligible = isRestaurantSeoEligible(dbRestaurant!);
  assert(isEligible.isEligible === true, 'isRestaurantSeoEligible evaluates to true for newly onboarded restaurant');

  // Test 3: Dynamic Sitemap inclusion without manual edits or restarts
  console.log('\n3. Testing Dynamic Sitemap Inclusion:');
  const sitemapXml = await generateDynamicSitemapXml();
  const expectedStorefrontLoc = `<loc>https://www.starters4u.in/r/${testSlug}</loc>`;
  const expectedMenuLoc = `<loc>https://www.starters4u.in/r/${testSlug}/menu</loc>`;

  assert(sitemapXml.includes(expectedStorefrontLoc), 'Dynamic sitemap contains newly provisioned restaurant URL');
  assert(sitemapXml.includes(expectedMenuLoc), 'Dynamic sitemap contains newly provisioned restaurant menu URL');
  assert(sitemapXml.includes('<lastmod>'), 'Lastmod timestamp specified in sitemap');

  // Test 4: Dynamic HTML rendering with metadata & Schema.org JSON-LD
  console.log('\n4. Testing Server-Rendered HTML and JSON-LD Generation:');
  const tenantData = await getRestaurantForSeo(testSlug);
  assert(!!tenantData, 'getRestaurantForSeo finds newly onboarded tenant');

  const distPath = path.resolve(process.cwd(), 'dist');
  const storefrontHtml = renderRestaurantHtml(distPath, tenantData!, 'storefront');
  assert(storefrontHtml.includes(`Paradise Biryani HiTech City`), 'Storefront HTML has restaurant name');
  assert(storefrontHtml.includes(`rel="canonical" href="https://www.starters4u.in/r/${testSlug}"`), 'Storefront HTML has correct canonical tag');
  assert(storefrontHtml.includes(`name="robots" content="index, follow"`), 'Storefront HTML has index, follow robots meta');
  assert(storefrontHtml.includes(`name="googlebot" content="index, follow"`), 'Storefront HTML has index, follow googlebot meta');
  assert(storefrontHtml.includes(`https://schema.org`), 'Storefront HTML contains Schema.org context');
  assert(storefrontHtml.includes(`Restaurant`), 'Storefront HTML contains @type: Restaurant');

  const menuHtml = renderRestaurantHtml(distPath, tenantData!, 'menu');
  assert(menuHtml.includes(`rel="canonical" href="https://www.starters4u.in/r/${testSlug}/menu"`), 'Menu HTML has correct canonical tag');
  assert(menuHtml.includes(`name="robots" content="index, follow"`), 'Menu HTML has index, follow robots meta');
  assert(menuHtml.includes(`Menu`), 'Menu HTML contains Menu type/title');

  // Test 5: Inactive/Suspended Restaurant is Excluded from Sitemap
  console.log('\n5. Testing Automatic Exclusion on Inactivity / Deactivation:');
  dbRestaurant!.status = 'suspended';
  const updatedSitemap = await generateDynamicSitemapXml();
  assert(!updatedSitemap.includes(expectedStorefrontLoc), 'Suspended restaurant is automatically omitted from dynamic sitemap');

  // Restore
  dbRestaurant!.status = 'active';

  console.log(`\n========================================`);
  console.log(`Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
