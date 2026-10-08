import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { app, ensureInitialized } from './server/app.js';
import { getRestaurantForSeo } from './server/services/tenantService.js';
import { renderRestaurantHtml } from './server/services/seoService.js';

dotenv.config();

async function startServer() {
  const PORT = 3000;

  // Initialize and auto-migrate PostgreSQL connection & base store records
  try {
    await ensureInitialized();
  } catch (err) {
    console.warn('[Server Startup] Warning during initial database connection check:', err);
  }

  // ==========================================================
  // VITE DEV MIDDLEWARE VS PRODUCTION STATIC SERVING
  // ==========================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    // 1. Permanently redirect trailing slashes (except root '/') once to canonical no-trailing-slash URL: e.g. /about/ -> /about (HTTP 301)
    app.use((req, res, next) => {
      if (req.path.length > 1 && req.path.endsWith('/')) {
        const cleanPath = req.path.replace(/\/+$/, '');
        const queryIndex = req.url.indexOf('?');
        const queryString = queryIndex !== -1 ? req.url.slice(queryIndex) : '';
        return res.redirect(301, cleanPath + queryString);
      }
      next();
    });

    // 1b. Permanent 301 Redirect from legacy /menu to canonical /r/mozz/menu (preserving query parameters)
    app.get(['/menu', '/menu/'], (req, res) => {
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(301, `/r/mozz/menu${query}`);
    });

    // 2. Explicit SEO route handler for pre-rendered clean HTML files (e.g. /about -> dist/about.html)
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/assets') || req.path.startsWith('/r/')) {
        return next();
      }

      // Check for pre-rendered clean HTML file: e.g. /menu -> dist/menu.html, / -> dist/index.html
      const cleanSlug = req.path === '/' ? 'index' : req.path.replace(/^\//, '');
      const htmlFilePath = path.join(distPath, `${cleanSlug}.html`);
      if (fs.existsSync(htmlFilePath)) {
        return res.status(200).sendFile(htmlFilePath);
      }
      next();
    });

    // 3. Dynamic Multi-Restaurant Storefronts & Menus (/r/:slug and /r/:slug/menu)
    app.get(/^\/r\/([a-zA-Z0-9_-]+)(?:\/(menu|track(?:\/[a-zA-Z0-9_-]+)?|cart|checkout))?$/, async (req, res, next) => {
      const slugMatch = req.path.match(/^\/r\/([a-zA-Z0-9_-]+)/);
      if (!slugMatch) return next();

      const slug = slugMatch[1].toLowerCase();
      const isPrivateSubroute =
        req.path.includes('/track') ||
        req.path.includes('/cart') ||
        req.path.includes('/checkout');

      // Private transactional subroutes under /r/:slug
      if (isPrivateSubroute) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        return res.sendFile(path.join(distPath, 'index.html'));
      }

      const isMenu = req.path.endsWith('/menu');

      try {
        const restaurant = await getRestaurantForSeo(slug);
        if (!restaurant) {
          // Strict 404 for unknown, inactive, or suspended restaurants
          res.setHeader('X-Robots-Tag', 'noindex, follow');
          const notFoundPath = path.join(distPath, '404.html');
          if (fs.existsSync(notFoundPath)) {
            return res.status(404).sendFile(notFoundPath);
          }
          return res.status(404).send('404 Restaurant Not Found');
        }

        // Active restaurant: serve dynamic crawlable SSR HTML
        const html = renderRestaurantHtml(distPath, restaurant, isMenu ? 'menu' : 'storefront');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(html);
      } catch (err: any) {
        console.error(`[SEO] Error rendering restaurant page for slug "${slug}":`, err.message);
        return res.status(500).send('Internal Server Error');
      }
    });

    // 4. Dynamic operational routes (SPA shell required, search engine indexing strictly blocked)
    const dynamicPrefixes = [
      '/admin',
      '/restaurant-admin',
      '/platform-admin',
      '/print-agent',
      '/track',
      '/cart',
      '/checkout',
      '/onboarding',
      '/login',
      '/table',
      '/counter',
    ];

    dynamicPrefixes.forEach((prefix) => {
      app.get(new RegExp(`^${prefix}(/.*)?$`), (_req, res) => {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    });

    // 5. Serve static assets with directory redirects and directory index disabled
    app.use(express.static(distPath, { redirect: false, index: false }));

    // 6. True HTTP 404 response for unknown paths
    app.use((_req, res) => {
      res.setHeader('X-Robots-Tag', 'noindex, follow');
      const notFoundPath = path.join(distPath, '404.html');
      if (fs.existsSync(notFoundPath)) {
        return res.status(404).sendFile(notFoundPath);
      }
      res.status(404).send('404 Not Found');
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MOZZ Pizzateria SaaS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
