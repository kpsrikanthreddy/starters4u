import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../src/App';
import { PUBLIC_ROUTES, getRouteJsonLd, NOT_FOUND_ROUTE } from '../src/routes';
import { BUSINESS_INFO, CANONICAL_DOMAIN } from '../src/config/businessInfo';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function runPrerender() {
  console.log('🚀 [SSG Pre-renderer] Starting build-time static HTML generation...');

  const distDir = path.resolve(process.cwd(), 'dist');
  const templatePath = path.join(distDir, 'index.html');

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Base template not found at ${templatePath}. Run "vite build" first.`);
  }

  const baseTemplate = fs.readFileSync(templatePath, 'utf-8');

  // 1. Generate Static HTML for all 15 Public SEO Routes (Clean HTML strategy: dist/slug.html, dist/index.html)
  for (const route of PUBLIC_ROUTES) {
    console.log(`  ⚡ Pre-rendering: ${route.path} (${route.name})`);

    // Render component tree to static markup
    const appHtml = renderToString(React.createElement(App, { initialPath: route.path }));

    // Use central getRouteJsonLd function from src/routes.ts
    const schemas = getRouteJsonLd(route);
    const structuredDataScripts = schemas.map(
      (schema) =>
        `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`
    );

    // Canonical URL: root gets '/', all others have no trailing slash
    const canonicalUrl = `${CANONICAL_DOMAIN}${route.path === '/' ? '/' : route.path}`;

    const headInjections = `
    <!-- Primary SEO Metadata -->
    <title>${escapeHtml(route.title)}</title>
    <meta name="description" content="${escapeHtml(route.metaDescription)}" />
    <meta name="robots" content="index, follow" />
    <meta name="googlebot" content="index, follow" />
    <link rel="canonical" href="${canonicalUrl}" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:title" content="${escapeHtml(route.title)}" />
    <meta property="og:description" content="${escapeHtml(route.metaDescription)}" />
    <meta property="og:site_name" content="${escapeHtml(BUSINESS_INFO.platformName)}" />

    <!-- Twitter Card (summary mode without unsupplied large image) -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(route.title)}" />
    <meta name="twitter:description" content="${escapeHtml(route.metaDescription)}" />

    <!-- Central JSON-LD Structured Data -->
    ${structuredDataScripts.join('\n    ')}
    `;

    // Replace <title> and clean existing meta tags to prevent duplicates
    let pageHtml = baseTemplate
      .replace(/<title>[\s\S]*?<\/title>/gi, '')
      .replace(/<meta\s+name="description"[\s\S]*?>/gi, '')
      .replace(/<link\s+rel="canonical"[\s\S]*?>/gi, '')
      .replace(/<meta\s+property="og:[^"]*"[\s\S]*?>/gi, '')
      .replace(/<meta\s+name="twitter:[^"]*"[\s\S]*?>/gi, '')
      .replace(/<meta\s+name="robots"[\s\S]*?>/gi, '')
      .replace(/<meta\s+name="googlebot"[\s\S]*?>/gi, '')
      .replace(/<script\s+type="application\/ld\+json"[\s\S]*?<\/script>/gi, '');

    // Inject head tags right before </head>
    pageHtml = pageHtml.replace('</head>', `${headInjections}\n  </head>`);

    // Inject prerendered markup into <div id="root">
    pageHtml = pageHtml.replace(
      '<div id="root"></div>',
      `<div id="root">${appHtml}</div>`
    );

    // Save strictly to clean target file without duplicate subdirectories
    if (route.path === '/') {
      fs.writeFileSync(path.join(distDir, 'index.html'), pageHtml, 'utf-8');
    } else {
      const cleanSlug = route.path.replace(/^\//, '');
      const singleHtmlPath = path.join(distDir, `${cleanSlug}.html`);
      fs.mkdirSync(path.dirname(singleHtmlPath), { recursive: true });
      fs.writeFileSync(singleHtmlPath, pageHtml, 'utf-8');

      // If duplicate directory dist/slug exists from previous runs, remove it to prevent express.static directory redirects
      const duplicateDir = path.join(distDir, cleanSlug);
      if (fs.existsSync(duplicateDir) && fs.lstatSync(duplicateDir).isDirectory()) {
        fs.rmSync(duplicateDir, { recursive: true, force: true });
      }
    }
  }

  // 2. Pre-render 404 Not Found Page (dist/404.html only)
  console.log('  ⚡ Pre-rendering 404 Not Found Page (/404)');
  const notFoundHtml = renderToString(React.createElement(App, { initialPath: '/404' }));
  const notFoundHead = `
    <title>Page Not Found (404) | Starters4U</title>
    <meta name="description" content="The page you requested could not be found on Starters4U." />
    <meta name="robots" content="noindex, follow" />
    <meta name="googlebot" content="noindex, follow" />
    <meta name="twitter:card" content="summary" />
  `;

  let notFoundPage = baseTemplate
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name="description"[\s\S]*?>/gi, '')
    .replace(/<link\s+rel="canonical"[\s\S]*?>/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[\s\S]*?>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[\s\S]*?>/gi, '')
    .replace(/<meta\s+name="robots"[\s\S]*?>/gi, '')
    .replace(/<meta\s+name="googlebot"[\s\S]*?>/gi, '')
    .replace(/<script\s+type="application\/ld\+json"[\s\S]*?<\/script>/gi, '');

  notFoundPage = notFoundPage.replace('</head>', `${notFoundHead}\n  </head>`);
  notFoundPage = notFoundPage.replace(
    '<div id="root"></div>',
    `<div id="root">${notFoundHtml}</div>`
  );

  fs.writeFileSync(path.join(distDir, '404.html'), notFoundPage, 'utf-8');
  const duplicate404Dir = path.join(distDir, '404');
  if (fs.existsSync(duplicate404Dir) && fs.lstatSync(duplicate404Dir).isDirectory()) {
    fs.rmSync(duplicate404Dir, { recursive: true, force: true });
  }

  // 3. Generate Clean, Valid sitemap.xml without fabricated lastmod, changefreq, or priority
  console.log('  📑 Generating XML Sitemap with 15 public routes...');
  const sitemapEntries = PUBLIC_ROUTES.map((route) => {
    const loc = `${CANONICAL_DOMAIN}${route.path === '/' ? '/' : route.path}`;
    return `  <url>
    <loc>${loc}</loc>
  </url>`;
  }).join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>
`;

  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf-8');
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXml, 'utf-8');
  }

  console.log('✅ [SSG Pre-renderer] All 15 routes pre-rendered, 404 generated, and clean sitemap.xml saved!');
}

runPrerender().catch((err) => {
  console.error('❌ [SSG Pre-renderer] Fatal error during pre-rendering:', err);
  process.exit(1);
});
