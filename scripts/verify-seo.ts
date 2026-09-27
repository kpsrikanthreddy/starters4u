import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { PUBLIC_ROUTES } from '../src/routes';
import { CANONICAL_DOMAIN } from '../src/config/businessInfo';
import { generateDynamicSitemapXml } from '../server/services/seoService';
import { getRestaurantForSeo, getSeoEligibleRestaurants } from '../server/services/tenantService';
import { renderRestaurantHtml } from '../server/services/seoService';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    testsFailed++;
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

async function verifySeoBuild() {
  console.log('🔍 [SEO Automated Verification Suite] Starting audit checks...\n');

  const distDir = path.resolve(process.cwd(), 'dist');

  // Check 1: Dist Directory Exists
  assert(fs.existsSync(distDir), 'Distribution directory (dist) exists');

  // Check 2: Verify Every Route in PUBLIC_ROUTES
  console.log('\n📄 Testing Pre-rendered Static Route Artifacts:');
  for (const route of PUBLIC_ROUTES) {
    const slug = route.path === '/' ? 'index' : route.path.replace(/^\//, '');
    const htmlFile = path.join(distDir, `${slug}.html`);

    // File exists
    assert(fs.existsSync(htmlFile), `File exists: ${slug}.html for route ${route.path}`);

    // No duplicate folder redirect hazard (e.g. dist/menu/index.html alongside dist/menu.html)
    if (route.path !== '/') {
      const duplicateIndex = path.join(distDir, slug, 'index.html');
      assert(
        !fs.existsSync(duplicateIndex),
        `No duplicate index.html hazard exists for ${route.path} (${slug})`
      );
    }

    if (fs.existsSync(htmlFile)) {
      const html = fs.readFileSync(htmlFile, 'utf-8');

      // 1. Title Tag
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const decodedTitle = titleMatch
        ? titleMatch[1]
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim()
        : '';
      assert(
        !!titleMatch && decodedTitle === route.title,
        `Title matches for ${route.path} -> "${decodedTitle}"`
      );

      // 2. Canonical Tag
      const expectedCanonical = `${CANONICAL_DOMAIN}${route.path === '/' ? '/' : route.path}`;
      const canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
      assert(
        !!canonicalMatch && canonicalMatch[1] === expectedCanonical,
        `Canonical URL strictly matches (${expectedCanonical}) for ${route.path}`
      );

      // 3. Meta Description
      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
      assert(
        !!descMatch && descMatch[1].length > 20,
        `Meta description present and meaningful (>20 chars) for ${route.path}`
      );

      // 4. Social Card
      const twitterCardMatch = html.match(/<meta\s+name="twitter:card"\s+content="([^"]+)"/i);
      assert(
        !!twitterCardMatch && twitterCardMatch[1] === 'summary',
        `Twitter card is "summary" without unverified large image for ${route.path}`
      );

      // 5. Explicit Robots & Googlebot Directives
      const robotsMatch = html.match(/<meta\s+name="robots"\s+content="([^"]+)"/i);
      assert(
        !!robotsMatch && robotsMatch[1] === 'index, follow',
        `Explicit robots "index, follow" present for ${route.path}`
      );
      const googlebotMatch = html.match(/<meta\s+name="googlebot"\s+content="([^"]+)"/i);
      assert(
        !!googlebotMatch && googlebotMatch[1] === 'index, follow',
        `Explicit googlebot "index, follow" present for ${route.path}`
      );

      // 6. Central JSON-LD
      const jsonLdMatches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
      assert(
        !!jsonLdMatches && jsonLdMatches.length > 0,
        `JSON-LD structured data script(s) injected for ${route.path} (${jsonLdMatches?.length || 0} schemas)`
      );
    }
  }

  // Check 3: 404 Page Metadata Verification (dist/404.html)
  console.log('\n🚫 Testing Pre-rendered 404 Artifact & Directives:');
  const notFoundPath = path.join(distDir, '404.html');
  assert(fs.existsSync(notFoundPath), '404.html artifact exists in dist/');
  if (fs.existsSync(notFoundPath)) {
    const notFoundHtml = fs.readFileSync(notFoundPath, 'utf-8');

    assert(
      notFoundHtml.includes('<title>Page Not Found (404) | Starters4U</title>'),
      '404.html has correct descriptive title'
    );

    const nfRobots = notFoundHtml.match(/<meta\s+name="robots"\s+content="([^"]+)"/i);
    assert(
      !!nfRobots && nfRobots[1] === 'noindex, follow',
      '404.html has meta name="robots" content="noindex, follow"'
    );
    const nfGooglebot = notFoundHtml.match(/<meta\s+name="googlebot"\s+content="([^"]+)"/i);
    assert(
      !!nfGooglebot && nfGooglebot[1] === 'noindex, follow',
      '404.html has meta name="googlebot" content="noindex, follow"'
    );

    const nfCanonical = notFoundHtml.match(/<link\s+rel="canonical"[^>]*>/i);
    assert(!nfCanonical, '404.html has NO canonical link pointing to indexable pages');

    const nfJsonLd = notFoundHtml.match(/<script\s+type="application\/ld\+json">/i);
    assert(!nfJsonLd, '404.html has NO structured data JSON-LD schemas');
  }

  // Check 4: Dynamic Database-Driven sitemap.xml Verification
  console.log('\n🗺️  Testing Dynamic Database-Driven sitemap.xml:');
  const sitemapXml = await generateDynamicSitemapXml();
  assert(sitemapXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Sitemap starts with valid XML header');
  assert(sitemapXml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'Sitemap has valid urlset schema');

  // Verify base static pages
  assert(sitemapXml.includes('<loc>https://www.starters4u.in/</loc>'), 'Sitemap contains home page');
  assert(sitemapXml.includes('<loc>https://www.starters4u.in/restaurants</loc>'), 'Sitemap contains restaurants index');
  assert(sitemapXml.includes('<loc>https://www.starters4u.in/about</loc>'), 'Sitemap contains about page');

  // Verify dynamic restaurants in sitemap
  const eligible = await getSeoEligibleRestaurants();
  console.log(`  ℹ️ Found ${eligible.length} SEO-eligible restaurant(s): ${eligible.map((e) => e.slug).join(', ')}`);
  for (const r of eligible) {
    const storefront = `https://www.starters4u.in/r/${r.slug}`;
    const menu = `https://www.starters4u.in/r/${r.slug}/menu`;
    assert(sitemapXml.includes(`<loc>${storefront}</loc>`), `Sitemap contains dynamic storefront for ${r.slug}`);
    assert(sitemapXml.includes(`<loc>${menu}</loc>`), `Sitemap contains dynamic menu for ${r.slug}`);
  }

  // Check 5: Robots.txt Verification
  console.log('\n🤖 Testing robots.txt Directives:');
  const robotsTxtPath = path.join(process.cwd(), 'public', 'robots.txt');
  assert(fs.existsSync(robotsTxtPath), 'public/robots.txt exists');
  if (fs.existsSync(robotsTxtPath)) {
    const robotsTxt = fs.readFileSync(robotsTxtPath, 'utf-8');
    assert(robotsTxt.includes('Allow: /'), 'robots.txt allows root');
    assert(!robotsTxt.includes('Disallow: /r/'), 'robots.txt does NOT disallow /r/ (storefronts are crawlable)');
    assert(robotsTxt.includes('Disallow: /admin'), 'robots.txt disallows /admin');
    assert(robotsTxt.includes('Disallow: /track'), 'robots.txt disallows /track');
    assert(robotsTxt.includes('Disallow: /cart'), 'robots.txt disallows /cart');
    assert(robotsTxt.includes('Disallow: /checkout'), 'robots.txt disallows /checkout');
    assert(robotsTxt.includes('Sitemap: https://www.starters4u.in/sitemap.xml'), 'robots.txt specifies canonical sitemap URL');
  }

  // Check 6: Express Production Server Testing
  console.log('\n🚦 Testing Express Production Server Trailing-Slash Redirects, Multi-Tenant Storefronts & Headers:');

  const testApp = express();

  // 1. Permanently redirect trailing slashes (except root '/') once to canonical no-trailing-slash URL (HTTP 301)
  testApp.use((req, res, next) => {
    if (req.path.length > 1 && req.path.endsWith('/')) {
      const cleanPath = req.path.replace(/\/+$/, '');
      const queryIndex = req.url.indexOf('?');
      const queryString = queryIndex !== -1 ? req.url.slice(queryIndex) : '';
      return res.redirect(301, cleanPath + queryString);
    }
    next();
  });

  // 2. Dynamic sitemap
  testApp.get('/sitemap.xml', async (_req, res) => {
    const xml = await generateDynamicSitemapXml();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(xml);
  });

  // 3. Pre-rendered static HTML handler
  testApp.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/assets') || req.path.startsWith('/r/')) {
      return next();
    }
    const cleanSlug = req.path === '/' ? 'index' : req.path.replace(/^\//, '');
    const htmlFilePath = path.join(distDir, `${cleanSlug}.html`);
    if (fs.existsSync(htmlFilePath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).sendFile(htmlFilePath);
    }
    next();
  });

  // 4. Dynamic Multi-Restaurant Storefronts & Menus (/r/:slug and /r/:slug/menu)
  testApp.get(/^\/r\/([a-zA-Z0-9_-]+)(?:\/(menu|track(?:\/[a-zA-Z0-9_-]+)?|cart|checkout))?$/, async (req, res, next) => {
    const slugMatch = req.path.match(/^\/r\/([a-zA-Z0-9_-]+)/);
    if (!slugMatch) return next();

    const slug = slugMatch[1].toLowerCase();
    const isPrivateSubroute =
      req.path.includes('/track') ||
      req.path.includes('/cart') ||
      req.path.includes('/checkout');

    if (isPrivateSubroute) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      return res.sendFile(path.join(distDir, 'index.html'));
    }

    const isMenu = req.path.endsWith('/menu');
    const restaurant = await getRestaurantForSeo(slug);
    if (!restaurant) {
      res.setHeader('X-Robots-Tag', 'noindex, follow');
      const nfPath = path.join(distDir, '404.html');
      if (fs.existsSync(nfPath)) {
        return res.status(404).sendFile(nfPath);
      }
      return res.status(404).send('404 Restaurant Not Found');
    }

    const html = renderRestaurantHtml(distDir, restaurant, isMenu ? 'menu' : 'storefront');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  });

  // 5. Dynamic operational routes
  const dynamicPrefixes = [
    '/admin',
    '/restaurant-admin',
    '/platform-admin',
    '/track',
    '/cart',
    '/checkout',
    '/onboarding',
    '/login',
    '/table',
    '/counter',
  ];

  dynamicPrefixes.forEach((prefix) => {
    testApp.get(new RegExp(`^${prefix}(/.*)?$`), (_req, res) => {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      const shellPath = path.join(distDir, 'index.html');
      if (fs.existsSync(shellPath)) {
        return res.status(200).sendFile(shellPath);
      }
      res.status(200).send('SPA Shell');
    });
  });

  // 6. Static files
  testApp.use(express.static(distDir, { redirect: false, index: false }));

  // 7. 404 handler
  testApp.use((_req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    const nfPath = path.join(distDir, '404.html');
    if (fs.existsSync(nfPath)) {
      return res.status(404).sendFile(nfPath);
    }
    res.status(404).send('404 Not Found');
  });

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const port = address.port;

  async function testHttp(
    reqPath: string
  ): Promise<{ statusCode: number; location?: string; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: '127.0.0.1',
          port,
          path: reqPath,
          method: 'GET',
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 0,
              location: res.headers.location,
              headers: res.headers,
              body,
            });
          });
        }
      );
      request.on('error', reject);
      request.end();
    });
  }

  try {
    // 1. GET / -> 200 OK (Must render Starters4U Marketplace Homepage, NOT old MOZZ homepage)
    const resRoot = await testHttp('/');
    assert(resRoot.statusCode === 200, 'GET / returns HTTP 200 directly');
    assert(resRoot.body.includes('Multi-Restaurant Food Platform') || resRoot.body.includes('Top Local Kitchens') || resRoot.body.includes('Explore by Cuisine'), 'GET / renders Starters4U Multi-Restaurant Marketplace');
    assert(!resRoot.body.includes('Introducing Korean-Style Pocket Pizzas') && !resRoot.body.includes('Freshly Baked. Loaded with Love'), 'GET / does NOT render old MOZZ-only homepage');

    // 1b. GET /restaurants -> 200 OK
    const resRestaurants = await testHttp('/restaurants');
    assert(resRestaurants.statusCode === 200, 'GET /restaurants returns HTTP 200 directly');

    // 2. GET /menu -> 200 OK
    const resMenu = await testHttp('/menu');
    assert(resMenu.statusCode === 200, 'GET /menu returns HTTP 200 directly');

    // 3. GET /menu/ -> 301 Redirect to /menu
    const resMenuSlash = await testHttp('/menu/');
    assert(
      resMenuSlash.statusCode === 301 && resMenuSlash.location === '/menu',
      `GET /menu/ returns HTTP 301 -> ${resMenuSlash.location}`
    );

    // 4. Dynamic Storefront: GET /r/mozz -> 200 OK with dynamic HTML
    const resMozz = await testHttp('/r/mozz');
    assert(resMozz.statusCode === 200, 'GET /r/mozz returns HTTP 200');
    assert(resMozz.body.includes('MOZZ Chinese &amp; Pizzateria') || resMozz.body.includes('MOZZ Chinese & Pizzateria'), 'GET /r/mozz contains restaurant name');
    assert(resMozz.body.includes('canonical" href="https://www.starters4u.in/r/mozz"'), 'GET /r/mozz contains canonical tag');
    assert(resMozz.body.includes('"@type": "Restaurant"') || resMozz.body.includes('"@type":"Restaurant"'), 'GET /r/mozz contains Restaurant Schema.org');

    // 5. Dynamic Storefront Menu: GET /r/mozz/menu -> 200 OK
    const resMozzMenu = await testHttp('/r/mozz/menu');
    assert(resMozzMenu.statusCode === 200, 'GET /r/mozz/menu returns HTTP 200');
    assert(resMozzMenu.body.includes('canonical" href="https://www.starters4u.in/r/mozz/menu"'), 'GET /r/mozz/menu contains canonical tag');

    // 6. Dynamic Storefront for second eligible restaurant: e.g. royal-biryani
    const secondarySlug = eligible[1]?.slug || 'royal-biryani';
    const resSecondary = await testHttp(`/r/${secondarySlug}`);
    assert(resSecondary.statusCode === 200, `GET /r/${secondarySlug} returns HTTP 200`);
    assert(resSecondary.body.includes(`canonical" href="https://www.starters4u.in/r/${secondarySlug}"`), `GET /r/${secondarySlug} contains canonical tag`);

    // 7. Unknown restaurant: GET /r/nonexistent-store-xyz -> 404 with X-Robots-Tag: noindex, follow
    const resUnknownRest = await testHttp('/r/nonexistent-store-xyz');
    assert(
      resUnknownRest.statusCode === 404 && resUnknownRest.headers['x-robots-tag'] === 'noindex, follow',
      'GET /r/nonexistent-store-xyz returns HTTP 404 with X-Robots-Tag: noindex, follow'
    );

    // 8. Operational / Private routes: GET /admin -> 200 OK with X-Robots-Tag: noindex, nofollow, noarchive
    const resAdmin = await testHttp('/admin');
    assert(
      resAdmin.statusCode === 200 && resAdmin.headers['x-robots-tag'] === 'noindex, nofollow, noarchive',
      `GET /admin sets X-Robots-Tag: ${resAdmin.headers['x-robots-tag']}`
    );

    // 9. GET /track -> 200 OK with X-Robots-Tag: noindex, nofollow, noarchive
    const resTrack = await testHttp('/track');
    assert(
      resTrack.statusCode === 200 && resTrack.headers['x-robots-tag'] === 'noindex, nofollow, noarchive',
      `GET /track sets X-Robots-Tag: ${resTrack.headers['x-robots-tag']}`
    );

    // 10. GET /r/mozz/track/test-token -> 200 OK with X-Robots-Tag: noindex, nofollow, noarchive
    const resRestTrack = await testHttp('/r/mozz/track/test-token');
    assert(
      resRestTrack.statusCode === 200 && resRestTrack.headers['x-robots-tag'] === 'noindex, nofollow, noarchive',
      `GET /r/mozz/track/test-token sets X-Robots-Tag: ${resRestTrack.headers['x-robots-tag']}`
    );

    // 11. GET /sitemap.xml -> 200 OK
    const resSitemap = await testHttp('/sitemap.xml');
    assert(resSitemap.statusCode === 200, 'GET /sitemap.xml served successfully (HTTP 200)');
    assert(resSitemap.headers['content-type']?.includes('application/xml'), 'GET /sitemap.xml has application/xml content-type');
  } finally {
    server.close();
  }

  console.log('\n----------------------------------------');
  if (testsFailed > 0) {
    console.error(`Results: ${testsPassed} passed, ${testsFailed} issues detected.`);
    console.error('❌ [SEO Automated Verification Suite] Verification halted due to issues.');
    process.exit(1);
  } else {
    console.log(`Results: All ${testsPassed} checks passed.`);
    console.log('🎉 [SEO Automated Verification Suite] All checks successfully passed!');
  }
}

verifySeoBuild().catch((err) => {
  console.error('Fatal error during SEO verification:', err);
  process.exit(1);
});
