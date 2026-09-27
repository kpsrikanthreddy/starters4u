import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import cookieParser from 'cookie-parser';
import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import { initializeDatabase, isPostgresRunning, inMemoryDb, query } from './db.js';
import * as menuService from './services/menuService.js';
import * as orderService from './services/orderService.js';
import * as customerService from './services/customerService.js';
import * as qrService from './services/qrService.js';
import * as authService from './services/authService.js';
import * as adminService from './services/adminService.js';
import * as printService from './services/printService.js';
import * as tenantService from './services/tenantService.js';
import * as onboardingService from './services/onboardingService.js';
import * as menuImportService from './services/menuImportService.js';
import * as channelService from './services/channelService.js';
import { generateDynamicSitemapXml } from './services/seoService.js';
import { paymentService } from './payments/paymentService.js';
import { paymentLedgerService } from './payments/paymentLedgerService.js';
import { paymentWebhookService } from './payments/paymentWebhookService.js';
import { directUpiService } from './payments/directUpiService.js';
import { paymentRoutingService } from './payments/paymentRoutingService.js';
import { realtimeNotificationService } from './services/realtimeNotificationService.js';
import { inventoryService } from './services/inventoryService.js';
import { requireAuth, requireRole, verifyAuthToken } from './middleware/authMiddleware.js';
import { requireRestaurantTenant, requireRestaurantRole, requirePlatformAdmin } from './middleware/tenantMiddleware.js';
import { requireDeviceAuth } from './middleware/deviceAuthMiddleware.js';
import { getIpHashSecret } from './config.js';

dotenv.config();

// Razorpay client configuration from environment variables
function getRazorpayKeyId(): string {
  return (process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '').trim();
}

function getRazorpayKeySecret(): string {
  return (process.env.RAZORPAY_KEY_SECRET || '').trim();
}

export function isRazorpayConfigured(): boolean {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  return Boolean(
    keyId &&
    keySecret &&
    !keyId.toLowerCase().includes('placeholder') &&
    !keySecret.toLowerCase().includes('placeholder')
  );
}

function getRazorpay(): Razorpay {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!isRazorpayConfigured()) {
    throw new Error('Online payment is temporarily unavailable. Please try again later.');
  }
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

// Singleton database & admin initialization promise
declare global {
  var __appInitPromise: Promise<void> | undefined;
}

export async function ensureInitialized(): Promise<void> {
  if (globalThis.__appInitPromise) {
    return globalThis.__appInitPromise;
  }

  globalThis.__appInitPromise = (async () => {
    try {
      await initializeDatabase();
      await authService.ensureAdminUserInitialized();
    } catch (err) {
      console.error('[App] Database / Admin user initialization error:', err);
      // Reset promise to allow retry on subsequent requests if temporary failure
      globalThis.__appInitPromise = undefined;
      throw err;
    }
  })();

  return globalThis.__appInitPromise;
}

export function createApp(): express.Application {
  const app = express();

  // Enable trust proxy for secure, accurate client IP handling behind reverse proxies (Vercel, Cloud Run, Nginx)
  app.set('trust proxy', 1);

  // Basic Middlewares with rawBody support for webhook signature verification
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString();
      },
    })
  );
  app.use(cookieParser());

  // CORS and Headers configuration for serverless and cross-origin environments
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Ensure DB and default users are initialized before processing API requests
  app.use(async (req, _res, next) => {
    if (req.path.startsWith('/api')) {
      try {
        await ensureInitialized();
      } catch (err) {
        console.warn('[App] Warning during ensureInitialized in request middleware:', err);
      }
    }
    next();
  });

  // ==========================================================
  // DYNAMIC SITEMAP & PUBLIC SEO ASSETS
  // ==========================================================
  app.get('/sitemap.xml', async (_req, res) => {
    try {
      await ensureInitialized();
      const xml = await generateDynamicSitemapXml();
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
      return res.status(200).send(xml);
    } catch (err: any) {
      console.error('[Sitemap] Error generating dynamic sitemap:', err);
      const fallbackPath = path.join(process.cwd(), 'public', 'sitemap.xml');
      if (fs.existsSync(fallbackPath)) {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        return res.status(200).sendFile(fallbackPath);
      }
      return res.status(500).send('Error generating sitemap');
    }
  });

  // ==========================================================
  // HEALTH & SYSTEM STATUS
  // ==========================================================
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      database: isPostgresRunning() ? 'PostgreSQL' : 'In-Memory Simulation',
      time: new Date().toISOString(),
    });
  });

  app.get('/api/database/status', (_req, res) => {
    res.json({
      activeDatabase: isPostgresRunning() ? 'PostgreSQL (Cloud / Supabase)' : 'In-Memory Multi-Tenant Store',
      isPostgresRunning: isPostgresRunning(),
      multiTenantReady: true,
      tablesConfigured: [
        'restaurants',
        'restaurant_branches',
        'restaurant_users',
        'restaurant_tables',
        'customers',
        'menu_categories',
        'menu_items',
        'orders',
        'order_items',
        'order_status_history',
        'payments',
        'kots',
        'qr_codes',
        'subscriptions',
        'print_devices',
        'printer_configurations',
        'print_jobs',
        'print_job_attempts',
      ],
      printAgentReady: true,
      stats: {
        totalMenuItems: inMemoryDb.menu_items.length,
        totalOrders: inMemoryDb.orders.length,
        totalTables: inMemoryDb.restaurant_tables.length,
        totalPrintDevices: inMemoryDb.print_devices.length,
        totalPrintJobs: inMemoryDb.print_jobs.length,
      },
    });
  });

  // ==========================================================
  // 1. ADMIN AUTHENTICATION ENDPOINTS (Bcrypt + JWT)
  // ==========================================================
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { email, password, pin, restaurantSlug } = req.body;
      const pass = password || pin;
      const result = await authService.authenticateAdminUser(email, pass, restaurantSlug);

      if (!result.success || !result.token) {
        return res.status(401).json({ error: result.message || 'Invalid credentials' });
      }

      // Set secure HTTP-only cookie
      res.cookie('mozz_admin_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json(result);
    } catch (err: any) {
      console.error('[Admin Auth API] Error during admin login:', err);
      res.status(500).json({ error: 'Authentication failed', details: err.message });
    }
  });

  // Backward compatibility alias for legacy PIN login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { pin, email = 'admin@mozzpizzateria.com', restaurantSlug } = req.body;
      const result = await authService.authenticateAdminUser(email, pin, restaurantSlug);
      if (!result.success) {
        return res.status(401).json({ error: result.message || 'Invalid PIN' });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Authentication failed', details: err.message });
    }
  });

  app.post('/api/admin/logout', (_req, res) => {
    res.clearCookie('mozz_admin_token');
    res.json({ success: true, message: 'Logged out successfully' });
  });

  app.get('/api/admin/me', requireAuth, (req, res) => {
    res.json({
      authenticated: true,
      user: req.user,
      restaurant: {
        id: req.user!.restaurantId,
        name: req.user!.restaurantName || 'Restaurant Admin',
        slug: req.user!.restaurantSlug || 'mozz',
        currency: 'INR',
      },
    });
  });

  // ==========================================================
  // 2. PROTECTED ADMIN APIS (Strict Server-Side Tenant Isolation)
  // Restaurant A can NEVER access Restaurant B data.
  // ==========================================================
  app.get('/api/admin/orders', requireAuth, requireRestaurantTenant, async (req, res) => {
    console.log('[DEBUG /api/admin/orders] ENTERED HANDLER', {
      user: req.user,
      tenant: req.tenant,
      query: req.query,
    });
    try {
      const restaurantId = req.tenant?.restaurantId || req.user?.restaurantId;
      const requestedBranchId = (req.query.branchId as string) || (req.query.branch_id as string);
      const branchId = requestedBranchId || (req.tenant?.hasAllBranchAccess ? undefined : req.user?.branchId);
      const status = (req.query.status as string) || 'all';
      const limit = parseInt((req.query.limit as string) || '50', 10);

      const orders = await orderService.getOrders(restaurantId, branchId, status, limit);
      res.json(orders);
    } catch (err: any) {
      console.error('[Admin API] Error fetching tenant orders:', err);
      res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
    }
  });

  app.get('/api/admin/orders/:id', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const order = await orderService.getOrderById(req.params.id, restaurantId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found in your restaurant' });
      }
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch order', details: err.message });
    }
  });

  app.patch('/api/admin/orders/:id/status', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const { status, note } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }
      const updated = await orderService.updateOrderStatus(req.params.id, status, note, restaurantId);
      if (!updated) {
        return res.status(404).json({ error: 'Order not found in your restaurant' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update order status', details: err.message });
    }
  });

  app.delete('/api/admin/orders/:id', requireAuth, requireRestaurantTenant, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER']), async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const success = await orderService.deleteOrder(req.params.id, restaurantId);
      if (!success) {
        return res.status(404).json({ error: 'Order not found in your restaurant' });
      }
      res.json({ success: true, message: 'Order removed successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete order', details: err.message });
    }
  });

  app.get('/api/admin/kots', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const branchId = req.user!.branchId;
      const activeOrders = await orderService.getOrders(restaurantId, branchId, 'all', 50);
      const kots = activeOrders
        .filter((o) => o.status !== 'delivered' && o.status !== 'cancelled')
        .map((o) => ({
          id: o.id,
          orderId: o.id,
          orderNumber: o.orderNumber,
          kotNumber: o.kotNumber || `KOT-${o.orderNumber.replace(/[^0-9]/g, '')}`,
          kotStation: o.kotStation || 'All Stations',
          tableNumber: o.customer.tableNumber || (o.orderType === 'dine_in' ? 'Table 1' : 'Takeaway Counter'),
          orderType: o.orderType,
          items: o.items,
          status: o.status,
          createdAt: o.createdAt,
          waiterName: o.waiterName || 'Ramesh',
        }));
      res.json(kots);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch KOTs', details: err.message });
    }
  });

  app.delete('/api/admin/kots/:orderId', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const success = await orderService.deleteKot(req.params.orderId, restaurantId);
      res.json({ success, message: 'KOT ticket dismissed' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete KOT', details: err.message });
    }
  });

  // Diagnostics endpoint for menu item exclusion tracing (Requirement 7)
  app.get('/api/admin/menu/diagnostics', requireAuth, async (req, res) => {
    try {
      let restaurantId = req.user!.restaurantId || menuService.DEFAULT_RESTAURANT_ID;
      let branchId = req.user!.branchId || menuService.DEFAULT_BRANCH_ID;

      if (req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'superadmin') {
        if (req.query.restaurant_id) restaurantId = req.query.restaurant_id as string;
        if (req.query.branch_id) branchId = req.query.branch_id as string;
      }

      const diagnostics = await menuService.getMenuDiagnostics(restaurantId, branchId);
      res.json(diagnostics);
    } catch (err: any) {
      console.error('[Admin API] Error in menu diagnostics:', err);
      res.status(500).json({ error: 'Failed to generate menu diagnostics', details: err.message });
    }
  });

  // Menu Management (Tenant Scoped)
  app.get('/api/admin/menu', requireAuth, async (req, res) => {
    try {
      const restaurantId = req.user!.restaurantId;
      const branchId = req.user!.role === 'BRANCH_MANAGER' ? req.user!.branchId : undefined;
      const menu = await menuService.getMenu(restaurantId, branchId);
      res.json(menu);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch menu items', details: err.message });
    }
  });

  app.get('/api/admin/categories', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.user!.restaurantId;
      const categories = await menuService.getCategoriesForRestaurant(restaurantId);
      res.json(categories);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch categories', details: err.message });
    }
  });

  app.post('/api/admin/menu', requireAuth, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), async (req, res) => {
    try {
      // Derive restaurant_id and branch_id from authenticated session token (never trust client-supplied IDs)
      let restaurantId = req.user!.restaurantId;
      let branchId = req.user!.branchId;

      // Only SUPER_ADMIN can target a specific restaurant if explicitly supplied
      if ((req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'superadmin' || req.user!.role === 'PLATFORM_ADMIN') && req.body.restaurant_id) {
        restaurantId = req.body.restaurant_id;
        branchId = req.body.branch_id !== undefined ? req.body.branch_id : branchId;
      }

      const name = req.body.name ? String(req.body.name).trim() : '';
      const rawCategory = req.body.category ? String(req.body.category).trim() : '';

      if (!name) {
        return res.status(400).json({ error: 'Item name is required' });
      }
      if (!rawCategory) {
        return res.status(400).json({ error: 'Category is required' });
      }

      // Check category against tenant isolation (prevent cross-tenant category leakage)
      const catCheck = await menuService.validateAndResolveCategory(rawCategory, restaurantId);
      if (!catCheck.valid) {
        return res.status(catCheck.status || 403).json({ error: catCheck.error || 'Invalid category' });
      }

      // Validate price for non-pocket pizza items
      const isPocket = Boolean(req.body.isPocketPizza);
      if (!isPocket) {
        if (req.body.price === undefined || req.body.price === null || req.body.price === '') {
          return res.status(400).json({ error: 'Price is required' });
        }
        const numPrice = Number(req.body.price);
        if (isNaN(numPrice) || numPrice < 0) {
          return res.status(400).json({ error: 'Price must be a valid positive number' });
        }
      }

      // Determine dietary type (flexible for dietary, isVegetarian, isVeg)
      const dietaryType = menuService.normalizeDietaryType(
        req.body.dietary !== undefined ? req.body.dietary : req.body.isVegetarian
      );

      // Strip any client-supplied restaurant_id and branch_id to prevent injection
      const { restaurant_id: _r, branch_id: _b, ...cleanPayload } = req.body;

      const created = await menuService.createMenuItem(
        {
          ...cleanPayload,
          name,
          category: catCheck.category,
          dietary: dietaryType,
          price: !isPocket ? Number(req.body.price) : undefined,
        },
        restaurantId,
        branchId
      );
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to create menu item', details: err.message });
    }
  });

  app.patch('/api/admin/menu/:id', requireAuth, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), async (req, res) => {
    try {
      let restaurantId = req.user!.restaurantId;
      if ((req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'superadmin' || req.user!.role === 'PLATFORM_ADMIN') && req.body?.restaurant_id) {
        restaurantId = req.body.restaurant_id;
      }

      // If category is being updated, validate against tenant isolation
      if (req.body?.category) {
        const catCheck = await menuService.validateAndResolveCategory(String(req.body.category).trim(), restaurantId);
        if (!catCheck.valid) {
          return res.status(catCheck.status || 403).json({ error: catCheck.error || 'Invalid category' });
        }
        req.body.category = catCheck.category;
      }

      // Strip any client-supplied restaurant_id and branch_id to prevent tampering
      const { restaurant_id: _r, branch_id: _b, ...safeUpdates } = req.body;

      const updated = await menuService.updateMenuItem(req.params.id, safeUpdates, restaurantId);
      if (!updated) {
        return res.status(404).json({ error: 'Menu item not found or does not belong to this restaurant' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update menu item', details: err.message });
    }
  });

  app.patch('/api/admin/menu/:id/stock', requireAuth, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN', 'ADMIN']), async (req, res) => {
    try {
      let restaurantId = req.user!.restaurantId;
      if ((req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'superadmin' || req.user!.role === 'PLATFORM_ADMIN') && req.body?.restaurant_id) {
        restaurantId = req.body.restaurant_id;
      }

      const explicitInStock = typeof req.body?.inStock === 'boolean' ? req.body.inStock : undefined;
      const updated = await menuService.toggleStock(req.params.id, explicitInStock, restaurantId);
      if (!updated) {
        return res.status(404).json({ error: 'Menu item not found or does not belong to this restaurant' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update stock', details: err.message });
    }
  });

  app.delete('/api/admin/menu/:id', requireAuth, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER', 'ADMIN']), async (req, res) => {
    try {
      let restaurantId = req.user!.restaurantId;
      if ((req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'superadmin' || req.user!.role === 'PLATFORM_ADMIN') && req.query?.restaurant_id) {
        restaurantId = req.query.restaurant_id as string;
      }

      const success = await menuService.deleteMenuItem(req.params.id, restaurantId);
      if (!success) {
        return res.status(404).json({ error: 'Item not found or does not belong to this restaurant' });
      }
      res.json({ success: true, message: 'Item deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete item', details: err.message });
    }
  });

  app.post('/api/admin/menu/reset', requireAuth, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'ADMIN']), async (req, res) => {
    try {
      const restaurantId = req.user!.restaurantId;
      const branchId = req.user!.branchId;
      const resetMenu = await menuService.resetMenuToDefault(restaurantId, branchId);
      res.json({ success: true, message: 'Menu reset to default recipe set', menu: resetMenu });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to reset menu', details: err.message });
    }
  });

  // ==========================================================
  // BULK MENU IMPORT & BULK ACTIONS (Tenant Isolated)
  // ==========================================================

  // 1. Download Menu Import Template (CSV or Excel)
  app.get('/api/admin/menu/template', requireAuth, requireRestaurantTenant, (req, res) => {
    try {
      const format = (req.query.format as string || 'csv').toLowerCase();
      if (format === 'xlsx' || format === 'excel') {
        const buffer = menuImportService.generateXlsxTemplateBuffer();
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="starters4u_menu_template.xlsx"'
        );
        return res.send(buffer);
      }

      // Default CSV
      const csv = menuImportService.generateCsvTemplate();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="starters4u_menu_template.csv"');
      return res.send(csv);
    } catch (err: any) {
      console.error('[MenuImport API] Error generating template:', err);
      res.status(500).json({ error: 'Failed to generate menu template', details: err.message });
    }
  });

  // 2. Validate Menu Spreadsheet Rows (Server-side validation before import)
  app.post('/api/admin/menu/validate-import', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      let restaurantId = req.tenant.restaurantId;
      let branchId = req.body?.branchId || req.tenant.branchId;

      if ((req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'PLATFORM_ADMIN' || req.user!.role === 'superadmin') && req.body?.restaurant_id) {
        restaurantId = req.body.restaurant_id;
        branchId = req.body.branch_id || branchId;
      }

      const rows = req.body?.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'No menu rows provided for validation.' });
      }

      if (rows.length > menuImportService.MAX_IMPORT_ITEMS) {
        return res.status(400).json({
          error: `Spreadsheet exceeds maximum limit of ${menuImportService.MAX_IMPORT_ITEMS} rows. Please split your file.`,
        });
      }

      const summary = await menuImportService.validateMenuRows(rows, restaurantId, branchId);
      res.json(summary);
    } catch (err: any) {
      console.error('[MenuImport API] Error validating rows:', err);
      res.status(500).json({ error: 'Failed to validate menu rows', details: err.message });
    }
  });

  // 3. Confirm & Execute Atomic Bulk Menu Import
  app.post(
    '/api/admin/menu/import',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'ADMIN', 'BRANCH_MANAGER']),
    async (req, res) => {
      try {
        let restaurantId = req.tenant.restaurantId;
        let branchId = req.body?.branchId || req.tenant.branchId;

        // Platform Admin / Super Admin override if explicitly provided
        if ((req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'PLATFORM_ADMIN' || req.user!.role === 'superadmin') && req.body?.restaurant_id) {
          restaurantId = req.body.restaurant_id;
          branchId = req.body.branch_id || branchId;
        }

        const { duplicateAction = 'skip', items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: 'No items provided for import.' });
        }

        if (items.length > menuImportService.MAX_IMPORT_ITEMS) {
          return res.status(400).json({
            error: `Import batch exceeds maximum limit of ${menuImportService.MAX_IMPORT_ITEMS} items.`,
          });
        }

        const result = await menuImportService.executeMenuImport({
          restaurantId,
          branchId,
          duplicateAction,
          items,
        });

        res.status(201).json(result);
      } catch (err: any) {
        console.error('[MenuImport API] Error executing import:', err);
        res.status(400).json({ error: err.message || 'Failed to import menu' });
      }
    }
  );

  // 4. Bulk Actions on Menu Items (Mark Available, Mark Out of Stock, Change Category, Delete)
  app.post(
    '/api/admin/menu/bulk-action',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'ADMIN', 'BRANCH_MANAGER']),
    async (req, res) => {
      try {
        let restaurantId = req.tenant.restaurantId;
        if ((req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'PLATFORM_ADMIN' || req.user!.role === 'superadmin') && req.body?.restaurant_id) {
          restaurantId = req.body.restaurant_id;
        }

        const { action, itemIds, targetCategory } = req.body;

        if (!action || !Array.isArray(itemIds) || itemIds.length === 0) {
          return res.status(400).json({ error: 'action and a non-empty itemIds array are required.' });
        }

        if (!['mark_available', 'mark_out_of_stock', 'change_category', 'delete'].includes(action)) {
          return res.status(400).json({ error: `Invalid action: ${action}` });
        }

        const result = await menuImportService.executeBulkMenuAction({
          restaurantId,
          action,
          itemIds,
          targetCategory,
        });

        res.json(result);
      } catch (err: any) {
        console.error('[MenuImport API] Error in bulk action:', err);
        res.status(500).json({ error: 'Failed to execute bulk action', details: err.message });
      }
    }
  );

  // Admin Tables, QR Codes, Customers, Payments, Branches, Analytics
  app.get('/api/admin/tables', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const branchId = req.query.branchId as string | undefined || req.user!.branchId;
      const tables = await qrService.getRestaurantTables(restaurantId, branchId);
      res.json(tables);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch tables', details: err.message });
    }
  });

  app.post('/api/admin/tables', requireAuth, requireRestaurantTenant, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER']), async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const branchId = req.body.branchId || req.user!.branchId;
      const { tableNumber, tableName, capacity } = req.body;
      if (!tableNumber) {
        return res.status(400).json({ error: 'tableNumber is required' });
      }
      const table = await qrService.createRestaurantTable(restaurantId, branchId, { tableNumber, tableName, capacity });
      res.status(201).json(table);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to create table', details: err.message });
    }
  });

  app.patch('/api/admin/tables/:id', requireAuth, requireRestaurantTenant, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER']), async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const table = await qrService.updateRestaurantTable(restaurantId, req.params.id, req.body);
      if (!table) {
        return res.status(404).json({ error: 'Table not found' });
      }
      res.json(table);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update table', details: err.message });
    }
  });

  app.delete('/api/admin/tables/:id', requireAuth, requireRestaurantTenant, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER']), async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const success = await qrService.deleteRestaurantTable(restaurantId, req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Table not found' });
      }
      res.json({ success: true, message: 'Table deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete table', details: err.message });
    }
  });

  app.get('/api/admin/qr-codes', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const branchId = req.query.branchId as string | undefined || req.user!.branchId;
      const catalog = await qrService.getTableCatalog(restaurantId, branchId, req.tenant.restaurantSlug);
      res.json(catalog);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch QR catalog', details: err.message });
    }
  });

  app.post('/api/admin/qr-codes/generate', requireAuth, (req, res) => {
    const restaurantId = req.user!.restaurantId;
    const branchId = req.user!.branchId;
    const restaurantSlug = req.user!.restaurantSlug || 'mozz';
    const { mode = 'dine_in', table = '1' } = req.body;
    const generated = qrService.generateSignedToken(mode, table, restaurantSlug, restaurantId, branchId);
    res.json(generated);
  });

  // ==========================================================
  // MULTI-TENANT INVENTORY & STOCK MANAGEMENT LEDGER ROUTES
  // ==========================================================

  // List inventory items with today's stock metrics
  app.get(
    '/api/admin/inventory',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER', 'KITCHEN']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const role = (req.user?.role || '').toLowerCase();
        const isBranchScoped = role === 'branch_manager' || role === 'manager';
        const branchId = isBranchScoped ? req.user!.branchId : ((req.query.branchId as string) || req.user!.branchId);
        const category = req.query.category as string | undefined;

        // Seed realistic defaults if empty for this restaurant
        await inventoryService.seedDefaultInventoryIfEmpty(restaurantId);

        const items = await inventoryService.getInventoryItems(restaurantId, branchId, category);
        res.json(items);
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch inventory items', details: err.message });
      }
    }
  );

  // Get daily stock summary report
  app.get(
    '/api/admin/inventory/summary',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER', 'KITCHEN']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const role = (req.user?.role || '').toLowerCase();
        const isBranchScoped = role === 'branch_manager' || role === 'manager';
        const branchId = isBranchScoped ? req.user!.branchId : ((req.query.branchId as string) || req.user!.branchId);

        await inventoryService.seedDefaultInventoryIfEmpty(restaurantId);
        const items = await inventoryService.getInventoryItems(restaurantId, branchId);

        const totalItems = items.length;
        const lowStockCount = items.filter((i) => i.is_low_stock).length;
        const totalPurchasedToday = items.reduce((acc, curr) => acc + (curr.added_today || 0), 0);
        const totalUsedToday = items.reduce((acc, curr) => acc + (curr.used_today || 0), 0);
        const totalWastageToday = items.reduce((acc, curr) => acc + (curr.wastage_today || 0), 0);

        res.json({
          restaurantId,
          date: new Date().toISOString().split('T')[0],
          totalItems,
          lowStockCount,
          totalPurchasedToday: parseFloat(totalPurchasedToday.toFixed(3)),
          totalUsedToday: parseFloat(totalUsedToday.toFixed(3)),
          totalWastageToday: parseFloat(totalWastageToday.toFixed(3)),
          items,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to generate stock summary', details: err.message });
      }
    }
  );

  // Get immutable transaction ledger history (Manager/Owner only; Cashier & Kitchen restricted)
  app.get(
    '/api/admin/inventory/transactions',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const role = (req.user?.role || '').toLowerCase();
        const isBranchScoped = role === 'branch_manager' || role === 'manager';
        const branchId = isBranchScoped ? req.user!.branchId : ((req.query.branchId as string) || req.user!.branchId);
        const itemId = req.query.itemId as string | undefined;
        const limit = parseInt(req.query.limit as string || '100', 10);

        const txs = await inventoryService.getTransactions(restaurantId, branchId, itemId, limit);
        res.json(txs);
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch inventory transactions', details: err.message });
      }
    }
  );

  // Create new inventory item
  app.post(
    '/api/admin/inventory',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const role = (req.user?.role || '').toLowerCase();
        const isBranchScoped = role === 'branch_manager' || role === 'manager';
        const branchId = isBranchScoped ? req.user!.branchId : (req.body.branchId || req.user!.branchId);
        const { name, sku, category, unit, initialQuantity, minimumStockLevel, costPerUnit } = req.body;

        if (!name || !name.trim()) {
          return res.status(400).json({ error: 'Item name is required' });
        }
        if (!unit || !unit.trim()) {
          return res.status(400).json({ error: 'Item unit is required (e.g. kg, g, litre, ml, pieces)' });
        }

        const item = await inventoryService.createInventoryItem(
          restaurantId,
          branchId,
          { name: name.trim(), sku, category, unit: unit.trim(), initialQuantity, minimumStockLevel, costPerUnit },
          req.user?.userId || req.user?.id
        );
        res.status(201).json(item);
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to create inventory item', details: err.message });
      }
    }
  );

  // Update item details
  app.patch(
    '/api/admin/inventory/:id',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const updated = await inventoryService.updateInventoryItem(restaurantId, req.params.id, req.body);
        if (!updated) {
          return res.status(404).json({ error: 'Inventory item not found' });
        }
        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to update inventory item', details: err.message });
      }
    }
  );

  // Delete / Archive inventory item (Preserves transaction ledger; sets is_active = false)
  app.delete(
    '/api/admin/inventory/:id',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const success = await inventoryService.deleteInventoryItem(restaurantId, req.params.id);
        if (!success) {
          return res.status(404).json({ error: 'Inventory item not found' });
        }
        res.json({ success: true, message: 'Inventory item archived successfully' });
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to archive inventory item', details: err.message });
      }
    }
  );

  // [+ Add Stock] endpoint - Records purchase / stock addition with ledger entry
  app.post(
    '/api/admin/inventory/add-stock',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const role = (req.user?.role || '').toLowerCase();
        const isBranchScoped = role === 'branch_manager' || role === 'manager';
        const branchId = isBranchScoped ? req.user!.branchId : (req.body.branchId || req.user!.branchId);
        const { itemId, quantity, transactionType, notes, referenceType, referenceId } = req.body;

        if (!itemId) {
          return res.status(400).json({ error: 'itemId is required' });
        }
        if (!quantity || Number(quantity) <= 0) {
          return res.status(400).json({ error: 'Valid positive quantity is required' });
        }

        const result = await inventoryService.addStock(restaurantId, branchId, {
          itemId,
          quantity: Number(quantity),
          transactionType: transactionType || 'PURCHASE',
          notes,
          referenceType,
          referenceId,
          userId: req.user?.userId || req.user?.id,
        });

        res.json({
          success: true,
          message: `Added ${quantity} ${result.item.unit} to ${result.item.name}. New stock: ${result.item.current_quantity} ${result.item.unit}`,
          item: result.item,
          transaction: result.transaction,
        });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // [- Record Usage] endpoint - Records consumption with ledger entry
  app.post(
    '/api/admin/inventory/record-usage',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER', 'KITCHEN']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const role = (req.user?.role || '').toLowerCase();
        const isBranchScoped = role === 'branch_manager' || role === 'manager';
        const branchId = isBranchScoped ? req.user!.branchId : (req.body.branchId || req.user!.branchId);
        const { itemId, quantity, transactionType, notes, referenceType, referenceId } = req.body;

        if (!itemId) {
          return res.status(400).json({ error: 'itemId is required' });
        }
        if (!quantity || Number(quantity) <= 0) {
          return res.status(400).json({ error: 'Valid positive quantity is required' });
        }

        const result = await inventoryService.recordUsage(restaurantId, branchId, {
          itemId,
          quantity: Number(quantity),
          transactionType: transactionType || 'CONSUMPTION',
          notes,
          referenceType,
          referenceId,
          userId: req.user?.userId || req.user?.id,
        });

        res.json({
          success: true,
          message: `Recorded usage of ${quantity} ${result.item.unit} for ${result.item.name}. Remaining: ${result.item.current_quantity} ${result.item.unit}`,
          item: result.item,
          transaction: result.transaction,
        });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // [Record Wastage] endpoint - Records wastage with ledger entry
  app.post(
    '/api/admin/inventory/record-wastage',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER', 'KITCHEN']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const role = (req.user?.role || '').toLowerCase();
        const isBranchScoped = role === 'branch_manager' || role === 'manager';
        const branchId = isBranchScoped ? req.user!.branchId : (req.body.branchId || req.user!.branchId);
        const { itemId, quantity, reason, notes } = req.body;

        if (!itemId) {
          return res.status(400).json({ error: 'itemId is required' });
        }
        if (!quantity || Number(quantity) <= 0) {
          return res.status(400).json({ error: 'Valid positive quantity is required' });
        }

        const result = await inventoryService.recordWastage(restaurantId, branchId, {
          itemId,
          quantity: Number(quantity),
          reason,
          notes,
          userId: req.user?.userId || req.user?.id,
        });

        res.json({
          success: true,
          message: `Recorded wastage of ${quantity} ${result.item.unit} for ${result.item.name}. Remaining: ${result.item.current_quantity} ${result.item.unit}`,
          item: result.item,
          transaction: result.transaction,
        });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // [Compensating Transaction: Record Stock Adjustment] endpoint
  // Preserves accounting principle: never edits historical rows, records compensating ledger entries (ADJUSTMENT_IN / ADJUSTMENT_OUT)
  app.post(
    '/api/admin/inventory/record-adjustment',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const role = (req.user?.role || '').toLowerCase();
        const isBranchScoped = role === 'branch_manager' || role === 'manager';
        const branchId = isBranchScoped ? req.user!.branchId : (req.body.branchId || req.user!.branchId);
        const { itemId, quantity, adjustmentType, reason, notes, referenceId } = req.body;

        if (!itemId) {
          return res.status(400).json({ error: 'itemId is required' });
        }
        if (!quantity || Number(quantity) <= 0) {
          return res.status(400).json({ error: 'Valid positive adjustment quantity is required' });
        }
        if (!['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(adjustmentType)) {
          return res.status(400).json({ error: 'adjustmentType must be either ADJUSTMENT_IN or ADJUSTMENT_OUT' });
        }
        if (!reason || !reason.trim()) {
          return res.status(400).json({ error: 'Reason for compensating adjustment is required for audit reconciliation' });
        }

        const combinedNotes = `[COMPENSATING ADJUSTMENT: ${reason.trim()}] ${notes ? notes.trim() : ''}`.trim();

        const result = await inventoryService.recordStockTransaction(restaurantId, branchId, {
          itemId,
          quantity: Number(quantity),
          transactionType: adjustmentType,
          notes: combinedNotes,
          referenceType: 'AUDIT_CORRECTION',
          referenceId: referenceId || null,
          userId: req.user?.userId || req.user?.id,
        });

        res.json({
          success: true,
          message: `Recorded compensating ${adjustmentType} of ${quantity} ${result.item.unit} for ${result.item.name}. Current balance: ${result.item.current_quantity} ${result.item.unit}`,
          item: result.item,
          transaction: result.transaction,
        });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.get('/api/admin/customers', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const customers = await adminService.getTenantCustomers(restaurantId);
      res.json(customers);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch customers', details: err.message });
    }
  });

  app.get('/api/admin/payments', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const payments = await adminService.getTenantPayments(restaurantId);
      res.json(payments);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch payments', details: err.message });
    }
  });

  app.get('/api/admin/branches', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const branches = await adminService.getTenantBranches(restaurantId);
      res.json(branches);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch branches', details: err.message });
    }
  });

  app.get('/api/admin/settings', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const [baseSettings, advancedSettings, restaurantProfile] = await Promise.all([
        adminService.getTenantSettings(restaurantId),
        tenantService.getRestaurantSettings(restaurantId),
        tenantService.resolveRestaurantById(restaurantId),
      ]);

      const currentSlug = restaurantProfile?.slug || req.tenant.restaurantSlug;
      const isEligibleObj = tenantService.isRestaurantSeoEligible(
        restaurantProfile ? { id: restaurantProfile.id, name: restaurantProfile.name, slug: currentSlug, status: restaurantProfile.status } : null,
        advancedSettings
      );
      const publicUrl = `https://www.starters4u.in/r/${currentSlug}`;
      const menuUrl = `https://www.starters4u.in/r/${currentSlug}/menu`;

      res.json({
        ...baseSettings,
        ...(advancedSettings || {}),
        slug: currentSlug,
        seoStatus: {
          slug: currentSlug,
          publicStorefrontActive: isEligibleObj.isPublicStorefrontActive,
          isSeoEligible: isEligibleObj.isEligible,
          isIndexable: isEligibleObj.isEligible,
          isSitemapIncluded: isEligibleObj.isEligible,
          publicUrl,
          menuUrl,
          googleOrderingUrl: menuUrl,
          canonicalUrl: publicUrl,
          menuCanonicalUrl: menuUrl,
          reasons: isEligibleObj.reasons,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch settings', details: err.message });
    }
  });

  app.patch('/api/admin/settings', requireAuth, requireRestaurantTenant, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN']), async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const [updatedBase, updatedAdvanced] = await Promise.all([
        adminService.updateTenantSettings(restaurantId, req.body),
        tenantService.updateRestaurantSettings(restaurantId, req.body).catch(() => null),
      ]);
      res.json({
        ...updatedBase,
        ...(updatedAdvanced || {}),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update settings', details: err.message });
    }
  });

  // ==========================================================
  // RESTAURANT PAYMENT SETTINGS (Multi-Tenant Gateway Config)
  // Strict Isolation: Raw secrets are NEVER exposed in response
  // ==========================================================
  app.get('/api/admin/payment-settings', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const settings = await tenantService.getRestaurantPaymentSettings(restaurantId);
      res.json({
        restaurantId: settings.restaurantId,
        isCashEnabled: settings.isCashEnabled,
        isUpiEnabled: settings.isUpiEnabled,
        upiId: settings.upiId,
        directUpiEnabled: settings.directUpiEnabled,
        directUpiProvider: settings.directUpiProvider,
        merchantUpiId: settings.merchantUpiId,
        merchantDisplayName: settings.merchantDisplayName,
        isOnlineEnabled: settings.isOnlineEnabled,
        isRazorpayEnabled: settings.isRazorpayEnabled,
        razorpayKeyId: settings.razorpayKeyId || '',
        activePaymentMode: settings.activePaymentMode,
        acceptedCurrencies: settings.acceptedCurrencies,
        currentCheckoutProvider: 'Razorpay',
        directUpiStatus: (settings.merchantUpiId || settings.upiId) ? 'Configured' : 'Not Configured',
        directUpiActive: false,
        routing: paymentRoutingService.getConfig(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch payment settings', details: err.message });
    }
  });

  app.patch('/api/admin/payment-settings', requireAuth, requireRestaurantTenant, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN']), async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const actor = {
        userId: req.user?.userId,
        role: req.user?.role || 'RESTAURANT_ADMIN',
        reason: req.body?.reason || 'Payment settings updated via Restaurant Admin Portal',
      };
      const updated = await tenantService.updateRestaurantPaymentSettings(restaurantId, req.body, actor);
      res.json({
        restaurantId: updated.restaurantId,
        isCashEnabled: updated.isCashEnabled,
        isUpiEnabled: updated.isUpiEnabled,
        upiId: updated.upiId,
        directUpiEnabled: updated.directUpiEnabled,
        directUpiProvider: updated.directUpiProvider,
        merchantUpiId: updated.merchantUpiId,
        merchantDisplayName: updated.merchantDisplayName,
        isOnlineEnabled: updated.isOnlineEnabled,
        isRazorpayEnabled: updated.isRazorpayEnabled,
        razorpayKeyId: updated.razorpayKeyId || '',
        activePaymentMode: updated.activePaymentMode,
        acceptedCurrencies: updated.acceptedCurrencies,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update payment settings', details: err.message });
    }
  });

  app.get('/api/admin/payment-settings/audit', requireAuth, requireRestaurantTenant, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN']), async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const auditLogs = await tenantService.getPaymentSettingsAuditHistory(restaurantId);
      res.json({ success: true, auditLogs });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch payment settings audit logs', details: err.message });
    }
  });

  app.get('/api/admin/subscription', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const sub = await adminService.getTenantSubscription(restaurantId);
      res.json(sub);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch subscription', details: err.message });
    }
  });

  app.get('/api/admin/analytics', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const analytics = await adminService.getTenantAnalytics(restaurantId);
      res.json(analytics);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch analytics', details: err.message });
    }
  });

  app.get('/api/admin/users', requireAuth, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER']), async (req, res) => {
    try {
      const restaurantId = req.user!.restaurantId;
      const users = await adminService.getTenantUsers(restaurantId);
      res.json(users);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch users', details: err.message });
    }
  });

  app.post('/api/admin/users', requireAuth, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER']), async (req, res) => {
    try {
      const restaurantId = req.user!.restaurantId;
      const { name, email, phone, role, pin, branchId } = req.body;
      if (!name || !email || !pin || !role) {
        return res.status(400).json({ error: 'Name, email, role, and PIN are required' });
      }
      const user = await adminService.createTenantUser(restaurantId, { name, email, phone, role, pin, branchId });
      res.status(201).json(user);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to create user', details: err.message });
    }
  });

  app.patch('/api/admin/users/:id', requireAuth, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER']), async (req, res) => {
    try {
      const restaurantId = req.user!.restaurantId;
      const updated = await adminService.updateTenantUser(restaurantId, req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update user', details: err.message });
    }
  });

  app.delete('/api/admin/users/:id', requireAuth, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER']), async (req, res) => {
    try {
      const restaurantId = req.user!.restaurantId;
      const success = await adminService.deleteTenantUser(restaurantId, req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ success: true, message: 'User removed successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete user', details: err.message });
    }
  });

  // Delivery Operations Settings
  app.get('/api/admin/delivery-settings', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const settings = await adminService.getTenantDeliverySettings(restaurantId);
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch delivery settings', details: err.message });
    }
  });

  app.patch('/api/admin/delivery-settings', requireAuth, requireRestaurantTenant, requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER']), async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const settings = await adminService.updateTenantDeliverySettings(restaurantId, req.body);
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update delivery settings', details: err.message });
    }
  });

  // Sales Reports & Analytics
  app.get('/api/admin/reports', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const period = (req.query.period as any) || 'today';
      const branchId = req.query.branchId as string | undefined;
      const report = await adminService.getTenantReports(restaurantId, period, branchId);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate report', details: err.message });
    }
  });

  // POS Direct Counter Order Creation (Tenant-Scoped, Role-Restricted)
  app.post(
    '/api/admin/pos/orders',
    requireAuth,
    requireRestaurantTenant,
    requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_ADMIN', 'BRANCH_MANAGER', 'CASHIER']),
    async (req, res) => {
      try {
        const restaurantId = req.tenant.restaurantId;
        const branchId = req.user?.branchId || req.body.branchId;
        const {
          items,
          orderType = 'counter',
          tableNumber,
          customer,
          paymentMethod = 'cash',
          paymentStatus = 'paid',
          specialInstructions,
          discount = 0,
        } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: 'Order must contain at least one item.' });
        }

        const createdOrder = await orderService.createOrder({
          restaurantId,
          branchId,
          orderType,
          entrySource: 'pos_counter',
          tableNumber: tableNumber ? String(tableNumber) : undefined,
          customer: {
            name: customer?.name || 'Counter Customer',
            phone: customer?.phone || '+910000000000',
            address: customer?.address || 'In-Store Counter Pickup',
          },
          items,
          paymentMethod,
          paymentStatus: paymentStatus || 'paid',
          discount: Number(discount) || 0,
          specialInstructions,
        });

        res.status(201).json({
          success: true,
          order: createdOrder,
        });
      } catch (err: any) {
        console.error('[Admin POS API] Error creating POS order:', err);
        res.status(400).json({ error: err.message || 'Failed to create POS order', details: err.message });
      }
    }
  );

  // ==========================================================
  // 3. PLATFORM SUPER ADMIN APIS (Platform-Level Management)
  // Protected strictly for PLATFORM_ADMIN / SUPER_ADMIN roles
  // ==========================================================
  const handleGetPlatformStats = async (_req: express.Request, res: express.Response) => {
    try {
      const stats = await adminService.getPlatformSuperAdminStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch platform stats', details: err.message });
    }
  };

  const handleGetPlatformRestaurants = async (_req: express.Request, res: express.Response) => {
    try {
      const restaurants = await onboardingService.getPlatformRestaurants();
      res.json(restaurants);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch platform restaurants', details: err.message });
    }
  };

  // Platform Dashboard & Fleet Stats
  app.get('/api/platform/stats', requireAuth, requirePlatformAdmin, handleGetPlatformStats);
  app.get('/api/platform-admin/stats', requireAuth, requirePlatformAdmin, handleGetPlatformStats);

  // Platform Restaurant Fleet List
  app.get('/api/platform/restaurants', requireAuth, requirePlatformAdmin, handleGetPlatformRestaurants);
  app.get('/api/platform-admin/restaurants', requireAuth, requirePlatformAdmin, handleGetPlatformRestaurants);

  // Check Restaurant Slug Availability (Platform Admin live slug validator)
  app.get('/api/platform/restaurants/check-slug', requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const candidateSlug = (req.query.slug as string || '').trim();
      const excludeId = (req.query.excludeId as string || '').trim();
      if (!candidateSlug) {
        return res.status(400).json({ available: false, error: 'Slug query parameter is required.' });
      }
      const check = await onboardingService.checkSlugAvailability(candidateSlug, excludeId || undefined);
      res.json(check);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to check slug availability', details: err.message });
    }
  });

  // Provision New Restaurant Tenant (End-to-End Atomic Transaction)
  app.post('/api/platform/restaurants', requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const result = await onboardingService.provisionNewRestaurant(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to provision restaurant.' });
      }
      res.status(201).json({
        success: true,
        message: 'Restaurant tenant successfully provisioned.',
        restaurantId: result.restaurantId,
        slug: result.slug,
        profile: result.profile,
        seo: (result as any).seo,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error during provisioning', details: err.message });
    }
  });

  // Get Restaurant Detailed Profile (Overview, Branches, Owner Admin, Modes, Payment, Onboarding, Printer)
  app.get('/api/platform/restaurants/:id', requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const detail = await onboardingService.getPlatformRestaurantDetail(req.params.id);
      if (!detail) {
        return res.status(404).json({ error: 'Restaurant not found.' });
      }
      res.json(detail);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch restaurant details', details: err.message });
    }
  });

  // Activate / Suspend / Deactivate / Archive Restaurant Tenant
  app.patch('/api/platform/restaurants/:id/status', requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ['active', 'suspended', 'inactive', 'archived'];
      if (!status || !validStatuses.includes(status.toLowerCase())) {
        return res.status(400).json({ error: "Status must be one of: 'active', 'suspended', 'inactive', 'archived'." });
      }
      const normalizedStatus = status.toLowerCase() as 'active' | 'suspended' | 'inactive' | 'archived';
      const result = await onboardingService.setRestaurantStatus(req.params.id, normalizedStatus);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json({
        success: true,
        message: `Restaurant has been successfully updated to '${normalizedStatus}'.`,
        restaurantId: result.restaurantId,
        status: result.status,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update restaurant status', details: err.message });
    }
  });

  // Edit Restaurant Details from Platform Admin
  app.put('/api/platform/restaurants/:id', requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const result = await onboardingService.updatePlatformRestaurantDetails(req.params.id, req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to update restaurant details.' });
      }
      res.json({
        success: true,
        message: 'Restaurant tenant details updated successfully.',
        restaurant: result.restaurant,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update restaurant details', details: err.message });
    }
  });

  // Get Restaurant Onboarding Checklist
  app.get('/api/platform/restaurants/:id/onboarding', requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const detail = await onboardingService.getPlatformRestaurantDetail(req.params.id);
      if (!detail) {
        return res.status(404).json({ error: 'Restaurant not found.' });
      }
      res.json(detail.onboarding);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch onboarding checklist', details: err.message });
    }
  });

  // Update Restaurant Onboarding Step
  app.patch('/api/platform/restaurants/:id/onboarding', requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { step, status } = req.body;
      if (!step || !status) {
        return res.status(400).json({ error: "Both 'step' and 'status' (NOT_STARTED | IN_PROGRESS | READY) are required." });
      }
      const updatedOnboarding = await onboardingService.updateOnboardingStep(req.params.id, step, status);
      res.json({
        success: true,
        message: 'Onboarding step updated successfully.',
        onboarding: updatedOnboarding,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update onboarding step', details: err.message });
    }
  });

  // Platform Subscriptions Overview
  app.get('/api/platform/subscriptions', requireAuth, requirePlatformAdmin, async (_req, res) => {
    try {
      const restaurants = await onboardingService.getPlatformRestaurants();
      const subs = restaurants.map((r) => ({
        restaurantId: r.id,
        restaurantName: r.name,
        restaurantSlug: r.slug,
        planName: r.planName,
        status: r.status === 'active' ? 'active' : 'suspended',
        billingCycle: 'monthly',
        monthlyAmount: r.planName === 'starter' ? 999 : r.planName === 'enterprise' ? 4999 : 1999,
        createdDate: r.createdAt,
      }));
      res.json(subs);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch platform subscriptions', details: err.message });
    }
  });

  // Available Platform Plans
  app.get('/api/platform/plans', requireAuth, requirePlatformAdmin, async (_req, res) => {
    res.json([
      {
        id: 'starter',
        name: 'Starter Plan',
        priceMonthly: 999,
        currency: 'INR',
        features: [
          'Single Outlet Support',
          'Unlimited QR Table Ordering',
          'Online Menu & Cart Management',
          'Cash & UPI Payment Acceptance',
          'Standard Kitchen Display (KOT)',
        ],
        isPopular: false,
      },
      {
        id: 'growth',
        name: 'Growth Plan',
        priceMonthly: 1999,
        currency: 'INR',
        features: [
          'Up to 3 Outlet Branches',
          'Starters4U Thermal Print Agent Integration',
          'Automated Order Dispatch & Delivery Tracking',
          'Full Razorpay Online Payments Integration',
          'Analytics & Sales Reports',
          'Priority WhatsApp Support',
        ],
        isPopular: true,
      },
      {
        id: 'enterprise',
        name: 'Enterprise Plan',
        priceMonthly: 4999,
        currency: 'INR',
        features: [
          'Unlimited Outlets & Franchise Management',
          'Dedicated Cloud Database & Storage',
          'Custom Domain & Branded Web App',
          'Multi-Station KOT Routing & Load Balancing',
          '24/7 Dedicated Account Manager',
        ],
        isPopular: false,
      },
    ]);
  });

  // Platform System & Infrastructure Health
  app.get('/api/platform/system', requireAuth, requirePlatformAdmin, async (_req, res) => {
    try {
      const isPg = isPostgresRunning();
      let dbLatencyMs = 0;
      if (isPg) {
        const start = Date.now();
        await query('SELECT 1');
        dbLatencyMs = Date.now() - start;
      }
      res.json({
        status: 'healthy',
        database: {
          engine: isPg ? 'PostgreSQL (Cloud / Supabase)' : 'In-Memory Simulation Store',
          connected: true,
          latencyMs: dbLatencyMs,
          multiTenantIsolationVerified: true,
        },
        uptimeSeconds: process.uptime(),
        nodeVersion: process.version,
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'System health check failed', details: err.message });
    }
  });

  // ==========================================================
  // STARTERS4U PRINT AGENT APIS (Desktop Agent Integration)
  // ==========================================================

  // 1. Staff authentication for desktop agent initial setup
  app.post('/api/print-agent/auth/login', async (req, res) => {
    try {
      const { email, password, pin, restaurantSlug } = req.body;
      const pass = password || pin;
      const authResult = await authService.authenticateAdminUser(email, pass, restaurantSlug);
      if (!authResult.success || !authResult.token || !authResult.user) {
        return res.status(401).json({ error: authResult.message || 'Invalid credentials' });
      }

      // Fetch accessible branches for this user's restaurant
      const branches = await adminService.getTenantBranches(authResult.user.restaurantId);
      const restaurants =
        authResult.user.role === 'SUPER_ADMIN'
          ? await adminService.getAllPlatformRestaurants()
          : [
              {
                id: authResult.user.restaurantId,
                name: authResult.user.restaurantName || 'Current Restaurant',
                slug: authResult.user.restaurantSlug || 'mozz',
              },
            ];

      res.json({
        success: true,
        user: authResult.user,
        token: authResult.token,
        restaurants,
        branches,
      });
    } catch (err: any) {
      console.error('[PrintAgent API] Login error:', err);
      res.status(500).json({ error: 'Failed to authenticate user', details: err.message });
    }
  });

  // 2. Register Windows Desktop Device (Manual Admin Registration)
  app.post('/api/print-agent/devices/register', requireAuth, async (req, res) => {
    try {
      const { deviceId, deviceName, restaurantId, branchId, platform = 'win32', appVersion = '1.0.0' } = req.body;

      if (!deviceId || !deviceName) {
        return res.status(400).json({ error: 'deviceId and deviceName are required' });
      }

      const targetRestaurantId = restaurantId || req.user!.restaurantId;
      const targetBranchId = branchId || req.user!.branchId || 'b0000000-0000-0000-0000-000000000001';

      const registration = await printService.registerDevice({
        restaurantId: targetRestaurantId,
        branchId: targetBranchId,
        deviceId,
        deviceName,
        platform,
        appVersion,
      });

      res.status(201).json({
        success: true,
        device: registration.device,
        deviceToken: registration.deviceToken,
      });
    } catch (err: any) {
      console.error('[PrintAgent API] Register device error:', err);
      res.status(500).json({ error: 'Failed to register print device', details: err.message });
    }
  });

  // 2.1. Generate 6-digit registration/pairing code for quick physical desktop POS onboarding
  // Authenticated: requires store manager or owner
  app.post(
    '/api/admin/print-devices/pairing-code',
    requireAuth,
    requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER', 'MANAGER']),
    async (req, res) => {
      try {
        const restaurantId = req.user!.restaurantId;
        let branchId = req.body.branchId || req.user!.branchId;

        // Verify selected branch belongs to logged-in restaurant for strict tenant isolation
        const branches = await adminService.getTenantBranches(restaurantId);
        if (branchId) {
          const branchExists = branches.some((b: any) => b.id === branchId);
          if (!branchExists) {
            return res.status(403).json({ error: 'Selected branch does not belong to your restaurant' });
          }
        } else if (branches.length > 0) {
          branchId = branches[0].id;
        } else {
          branchId = 'b0000000-0000-0000-0000-000000000001';
        }

        const pairing = await printService.createPairingCode({
          restaurantId,
          branchId,
          userId: req.user!.userId,
        });

        res.status(201).json({
          success: true,
          pairingCode: pairing.pairingCode,
          expiresAt: pairing.expiresAt,
          expiresInSeconds: 600, // 10 minutes
          restaurantId: pairing.restaurantId,
          branchId: pairing.branchId,
        });
      } catch (err: any) {
        console.error('[PrintAgent API] Generate pairing code error:', err);
        res.status(500).json({ error: 'Failed to generate pairing code', details: err.message });
      }
    }
  );

  // 2.2. Exchange 6-digit code for device credentials (Called by Mozz Windows Print Agent)
  // Rate limited: max 5 failed attempts per IP per 5 minutes to prevent brute-forcing
  app.post('/api/print-agent/devices/pair', async (req, res) => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
      const rateLimit = printService.checkPairingRateLimit(clientIp);
      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Too many registration attempts. Please wait 5 minutes before trying again.',
        });
      }

      const { pairingCode, deviceId, deviceName, platform, appVersion } = req.body;
      if (!pairingCode || !deviceId) {
        return res.status(400).json({ error: 'pairingCode and deviceId are required' });
      }

      const pairResult = await printService.pairDeviceWithCode({
        pairingCode,
        deviceId,
        deviceName: deviceName || 'Windows POS Terminal',
        platform: platform || 'win32',
        appVersion: appVersion || '1.0.0',
      });

      if (!pairResult.success) {
        return res.status(400).json({ error: pairResult.error });
      }

      res.status(201).json(pairResult);
    } catch (err: any) {
      console.error('[PrintAgent API] Pair device error:', err);
      res.status(500).json({ error: 'Failed to pair device', details: err.message });
    }
  });

  // 2.3. Deactivate / Revoke device (Revokes hardware authorization and terminates active streams)
  const handleDeactivateDevice = async (req: express.Request, res: express.Response) => {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await printService.deactivateDevice(req.params.id, restaurantId);
      if (!result.success) {
        return res.status(404).json({ error: result.message });
      }
      res.json(result);
    } catch (err: any) {
      console.error('[PrintAgent API] Deactivate device error:', err);
      res.status(500).json({ error: 'Failed to deactivate device', details: err.message });
    }
  };

  app.post(
    '/api/admin/print-devices/:id/deactivate',
    requireAuth,
    requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER', 'MANAGER']),
    handleDeactivateDevice
  );
  app.post(
    '/api/admin/print-devices/:id/revoke',
    requireAuth,
    requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER', 'MANAGER']),
    handleDeactivateDevice
  );
  app.delete(
    '/api/admin/print-devices/:id',
    requireAuth,
    requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER', 'MANAGER']),
    handleDeactivateDevice
  );

  // 2.4. List all print devices for restaurant
  app.get(
    '/api/admin/print-devices',
    requireAuth,
    requireRole(['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER', 'MANAGER']),
    async (req, res) => {
      try {
        const restaurantId = req.user!.restaurantId;
        const branchId = req.query.branchId as string | undefined;

        // If filtering by branch, ensure branch belongs to this tenant
        if (branchId) {
          const branches = await adminService.getTenantBranches(restaurantId);
          const branchExists = branches.some((b: any) => b.id === branchId);
          if (!branchExists) {
            return res.status(403).json({ error: 'Branch does not belong to your restaurant' });
          }
        }

        const devices = await printService.getTenantDevices(restaurantId, branchId);
        res.json(devices);
      } catch (err: any) {
        console.error('[PrintAgent API] List devices error:', err);
        res.status(500).json({ error: 'Failed to list print devices', details: err.message });
      }
    }
  );

  // 3. Device Heartbeat
  app.post('/api/print-agent/devices/heartbeat', requireDeviceAuth, async (req, res) => {
    try {
      await printService.touchDeviceHeartbeat(req.device!.id);
      res.json({
        success: true,
        deviceId: req.device!.deviceId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update heartbeat', details: err.message });
    }
  });

  // Device-initiated logout/deactivation. Revokes the server token before local removal.
  app.post('/api/print-agent/devices/deactivate', requireDeviceAuth, async (req, res) => {
    try {
      const result = await printService.deactivateDevice(
        req.device!.id,
        req.device!.restaurantId
      );
      if (!result.success) {
        return res.status(404).json({ error: result.message });
      }
      res.json(result);
    } catch (err: any) {
      console.error('[PrintAgent API] Device self-deactivation error:', err);
      res.status(500).json({ error: 'Failed to deactivate device', details: err.message });
    }
  });

  // 3.5. Issue short-lived, single-use stream ticket for SSE connections
  app.post('/api/print-agent/stream-ticket', requireDeviceAuth, async (req, res) => {
    try {
      const ticket = await printService.createStreamTicket(req.device!);
      res.json({ ticket, expiresInSeconds: 60 });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate stream ticket', details: err.message });
    }
  });

  // 4. Real-time Server-Sent Events (SSE) Stream
  app.get('/api/print-agent/events', requireDeviceAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const unregister = printService.registerSseClient(
      req.device!.restaurantId,
      req.device!.branchId,
      res
    );

    req.on('close', () => {
      unregister();
    });
  });

  // 5. Fallback polling for print jobs
  app.get('/api/print-agent/jobs', requireDeviceAuth, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = parseInt((req.query.limit as string) || '25', 10);
      const jobs = await printService.getPrintJobs(
        req.device!.restaurantId,
        req.device!.branchId,
        status,
        limit
      );
      res.json(jobs);
    } catch (err: any) {
      console.error('[PrintAgent API] Error fetching jobs:', err);
      res.status(500).json({ error: 'Failed to fetch print jobs', details: err.message });
    }
  });

  // 6. Atomically Claim a print job
  app.post('/api/print-agent/jobs/:id/claim', requireDeviceAuth, async (req, res) => {
    try {
      const result = await printService.claimPrintJob(
        req.params.id,
        req.device!.id,
        req.device!.restaurantId,
        req.device!.branchId
      );
      if (!result.claimed) {
        return res.status(409).json({ error: result.error || 'Job could not be claimed' });
      }
      res.json(result);
    } catch (err: any) {
      console.error('[PrintAgent API] Error claiming job:', err);
      res.status(500).json({ error: 'Failed to claim print job', details: err.message });
    }
  });

  // 6.1 Explicit staff retry for a previously failed job on the same device
  app.post('/api/print-agent/jobs/:id/retry', requireDeviceAuth, async (req, res) => {
    try {
      const result = await printService.retryFailedPrintJob(
        req.params.id,
        req.device!.id,
        req.device!.restaurantId,
        req.device!.branchId
      );
      if (!result.claimed) {
        return res.status(409).json({ error: result.error || 'Job cannot be retried' });
      }
      res.json(result);
    } catch (err: any) {
      console.error('[PrintAgent API] Error retrying print job:', err);
      res.status(500).json({ error: 'Failed to retry print job', details: err.message });
    }
  });

  // 7. Update Job Status (PRINTING, PRINTED, FAILED)
  app.post('/api/print-agent/jobs/:id/status', requireDeviceAuth, async (req, res) => {
    try {
      const { status, errorMessage, durationMs, attemptNumber } = req.body;
      if (!['PRINTING', 'PRINTED', 'FAILED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be PRINTING, PRINTED, or FAILED' });
      }

      const updated = await printService.updatePrintJobStatus(req.params.id, req.device!.id, status, {
        errorMessage,
        durationMs,
        attemptNumber,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Print job not found' });
      }

      res.json({ success: true, job: updated });
    } catch (err: any) {
      console.error('[PrintAgent API] Error updating job status:', err);
      res.status(500).json({ error: 'Failed to update job status', details: err.message });
    }
  });

  // 8. Manual Staff Reprint
  app.post('/api/print-agent/jobs/reprint', async (req, res) => {
    try {
      let restaurantId = '';
      let branchId = '';

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        const device = await printService.authenticateDeviceToken(token);
        if (device) {
          restaurantId = device.restaurantId;
          branchId = device.branchId;
        } else {
          const user = verifyAuthToken(token);
          if (user) {
            restaurantId = user.restaurantId;
            branchId = user.branchId || 'b0000000-0000-0000-0000-000000000001';
          }
        }
      }

      if (!restaurantId) {
        return res.status(401).json({ error: 'Authentication required to initiate reprint' });
      }

      const { orderId, jobType, station } = req.body;
      if (!orderId || !jobType || !['KOT', 'BILL'].includes(jobType)) {
        return res.status(400).json({ error: 'orderId and valid jobType (KOT or BILL) are required' });
      }

      const order = await orderService.getOrderById(orderId, restaurantId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const orderBranchId = order.branchId || (order as any).branch_id;
      if (orderBranchId && orderBranchId !== branchId) {
        return res.status(403).json({ error: 'Order belongs to another branch' });
      }

      const reprintJob = await printService.createReprintJob(order, jobType, station);
      res.status(201).json({ success: true, job: reprintJob });
    } catch (err: any) {
      console.error('[PrintAgent API] Error creating reprint:', err);
      res.status(500).json({ error: 'Failed to create reprint job', details: err.message });
    }
  });

  // 9. Get Printer Configurations
  app.get('/api/print-agent/printers/config', requireDeviceAuth, async (req, res) => {
    try {
      const configs = await printService.getPrinterConfigurations(
        req.device!.restaurantId,
        req.device!.branchId,
        req.device!.id
      );
      res.json(configs);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch printer configurations', details: err.message });
    }
  });

  // 10. Save Printer Configurations
  app.post('/api/print-agent/printers/config', requireDeviceAuth, async (req, res) => {
    try {
      const { configs } = req.body;
      if (!Array.isArray(configs)) {
        return res.status(400).json({ error: 'configs must be an array of station mappings' });
      }
      const saved = await printService.savePrinterConfigurations(
        req.device!.restaurantId,
        req.device!.branchId,
        req.device!.id,
        configs
      );
      res.json({ success: true, configs: saved });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to save printer configurations', details: err.message });
    }
  });

  // ==========================================================
  // 4. PUBLIC CUSTOMER APIS (Customer Website & Online Ordering)
  // Read-only customer endpoints: Non-GET requests are strictly rejected
  // ==========================================================
  app.all('/api/menu', (req, res, next) => {
    if (req.method !== 'GET') {
      return res.status(405).json({
        error: 'Method Not Allowed',
        message: 'The /api/menu customer endpoint is read-only. Menu mutations require authenticated admin access at /api/admin/menu.',
      });
    }
    next();
  });

  app.all('/api/menu/*', (req, res, next) => {
    if (req.method !== 'GET') {
      return res.status(405).json({
        error: 'Method Not Allowed',
        message: 'The /api/menu endpoint is read-only. Menu mutations require authenticated admin access at /api/admin/menu.',
      });
    }
    next();
  });

  app.get('/api/menu', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      let restaurantId = (req.query.restaurant_id as string) || (req.query.restaurantId as string) || (req.headers['x-restaurant-id'] as string);
      let branchId = (req.query.branch_id as string) || (req.query.branchId as string) || (req.headers['x-branch-id'] as string);
      const restaurantSlug = (req.query.restaurant as string) || (req.query.slug as string);
      const branchSlug = (req.query.branch as string) || (req.query.branch_slug as string);
      const onlyInStock = req.query.in_stock === 'true' || req.query.available_only === 'true';

      if (!restaurantId && restaurantSlug) {
        if (isPostgresRunning()) {
          try {
            const found = await query('SELECT id FROM restaurants WHERE LOWER(slug) = $1 LIMIT 1', [restaurantSlug.toLowerCase()]);
            if (found.rows.length > 0) {
              restaurantId = found.rows[0].id;
            }
          } catch (e) {
            // fallback
          }
        }
        if (!restaurantId) {
          const inMem = inMemoryDb.restaurants.find((r) => r.slug.toLowerCase() === restaurantSlug.toLowerCase());
          if (inMem) restaurantId = inMem.id;
        }
        if (!restaurantId) {
          return res.status(404).json({ error: `Restaurant '${restaurantSlug}' not found` });
        }
      }

      if (!restaurantId) {
        restaurantId = menuService.DEFAULT_RESTAURANT_ID;
      }

      // If branchSlug is provided, resolve it
      if (!branchId && branchSlug) {
        if (isPostgresRunning()) {
          try {
            const bFound = await query('SELECT id FROM restaurant_branches WHERE restaurant_id = $1 AND slug = $2 LIMIT 1', [restaurantId, branchSlug.toLowerCase()]);
            if (bFound.rows.length > 0) {
              branchId = bFound.rows[0].id;
            }
          } catch (e) {
            // fallback
          }
        }
        if (!branchId) {
          const bInMem = inMemoryDb.restaurant_branches.find((b: any) => b.restaurant_id === restaurantId && b.slug === branchSlug.toLowerCase());
          if (bInMem) branchId = bInMem.id;
        }
      }

      // Default to active default branch if not specified and not explicitly requesting all branches
      if (!branchId && req.query.all_branches !== 'true' && req.query.branch_id !== 'all') {
        if (restaurantId === menuService.DEFAULT_RESTAURANT_ID) {
          branchId = menuService.DEFAULT_BRANCH_ID;
        } else {
          const tenantCtx = await tenantService.resolveTenantContext(restaurantId);
          branchId = tenantCtx?.defaultBranchId;
        }
      }

      const menu = await menuService.getMenu(restaurantId, branchId, onlyInStock);
      res.json(menu);
    } catch (err: any) {
      console.error('Error fetching menu:', err);
      res.status(500).json({ error: 'Failed to fetch menu items', details: err.message });
    }
  });

  // ==========================================================
  // MULTI-TENANT PUBLIC RESTAURANT DISCOVERY & PROFILES
  // ==========================================================
  app.get('/api/public/restaurants', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const category = (req.query.category as string) || (req.query.cuisine as string) || undefined;
      const search = (req.query.search as string) || (req.query.q as string) || undefined;
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : (req.query.latitude ? parseFloat(req.query.latitude as string) : undefined);
      const lng = req.query.lng ? parseFloat(req.query.lng as string) : (req.query.longitude ? parseFloat(req.query.longitude as string) : undefined);

      const result = await tenantService.listPublicRestaurants({
        limit,
        offset,
        page,
        category,
        search,
        latitude: isNaN(lat as number) ? undefined : lat,
        longitude: isNaN(lng as number) ? undefined : lng,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to list public restaurants', details: err.message });
    }
  });

  app.get('/api/public/search', async (req, res) => {
    try {
      const q = ((req.query.q as string) || (req.query.search as string) || '').trim();
      const result = await tenantService.searchPublicMarketplace(q);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to perform marketplace search', details: err.message });
    }
  });

  app.get('/api/public/restaurants/:slug', async (req, res) => {
    try {
      const restaurant = await tenantService.resolveRestaurantBySlug(req.params.slug);
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }
      res.json(restaurant);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to resolve restaurant', details: err.message });
    }
  });

  app.get('/api/public/restaurants/:slug/menu', async (req, res) => {
    try {
      const restaurant = await tenantService.resolveRestaurantBySlug(req.params.slug);
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }

      const branchSlug = req.query.branch as string;
      let branchId: string | undefined;
      if (branchSlug && restaurant.branches) {
        const branch = restaurant.branches.find((b: any) => b.slug === branchSlug || b.id === branchSlug);
        if (branch) branchId = branch.id;
      }
      if (!branchId && restaurant.branches && restaurant.branches.length > 0) {
        branchId = restaurant.branches[0].id;
      }

      const onlyInStock = req.query.in_stock === 'true';
      const menu = await menuService.getMenu(restaurant.id, branchId, onlyInStock);
      res.json({
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          logoUrl: restaurant.logoUrl,
          phone: restaurant.phone,
        },
        branchId,
        menu,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch restaurant menu', details: err.message });
    }
  });

  app.get('/api/menu/:id', async (req, res) => {
    try {
      const restaurantId = (req.query.restaurant_id as string) || (req.query.restaurantId as string) || 'a0000000-0000-0000-0000-000000000001';
      const item = await menuService.getMenuItem(req.params.id, restaurantId);
      if (!item) {
        return res.status(404).json({ error: 'Menu item not found' });
      }
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch item', details: err.message });
    }
  });

  app.get('/api/orders', async (req, res) => {
    try {
      const status = (req.query.status as string) || 'all';
      const limit = parseInt((req.query.limit as string) || '50', 10);
      const orders = await orderService.getOrders(undefined, undefined, status, limit);
      res.json(orders);
    } catch (err: any) {
      console.error('Error fetching orders:', err);
      res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
    }
  });

  app.get('/api/orders/:id', async (req, res) => {
    try {
      const restaurantSlug = (req.query.restaurant as string) || (req.query.slug as string);
      const headerRestaurantId = (req.headers['x-restaurant-id'] as string) || (req.query.restaurantId as string);

      let targetRestaurantId: string | undefined;
      if (headerRestaurantId) {
        targetRestaurantId = headerRestaurantId;
      } else if (restaurantSlug) {
        const r = await tenantService.resolveRestaurantBySlug(restaurantSlug);
        if (r) targetRestaurantId = r.id;
      }

      const order = await orderService.getOrderById(req.params.id, targetRestaurantId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (targetRestaurantId && order.restaurantId && order.restaurantId !== targetRestaurantId) {
        return res.status(404).json({ error: 'Order not found in this restaurant' });
      }

      res.json(order);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch order', details: err.message });
    }
  });

  // Public tenant-isolated order tracking endpoint
  app.get('/api/public/restaurants/:slug/orders/:id', async (req, res) => {
    try {
      const restaurant = await tenantService.resolveRestaurantBySlug(req.params.slug);
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }
      const order = await orderService.getOrderById(req.params.id, restaurant.id);
      if (!order || (order.restaurantId && order.restaurantId !== restaurant.id)) {
        return res.status(404).json({ error: 'Order not found in this restaurant' });
      }
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch order', details: err.message });
    }
  });

  app.patch('/api/orders/:id/location', async (req, res) => {
    try {
      const { latitude, longitude, address, accuracy, locationCapturedAt, locationSource } = req.body;
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Valid numerical latitude and longitude are required' });
      }
      if (lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
      }
      if (lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
      }
      const updated = await orderService.updateOrderCustomerLocation(req.params.id, {
        latitude: lat,
        longitude: lng,
        address: typeof address === 'string' ? address.trim() : undefined,
        accuracy: accuracy !== undefined && accuracy !== null && !isNaN(Number(accuracy)) ? Number(accuracy) : undefined,
        locationCapturedAt: locationCapturedAt ? String(locationCapturedAt) : undefined,
        locationSource: locationSource || 'device_gps',
      });
      if (!updated) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update delivery location', details: err.message });
    }
  });

  app.post('/api/orders/:id/cancel', async (req, res) => {
    try {
      const { reason } = req.body;
      const order = await orderService.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const statusLower = (order.status || '').toLowerCase();
      // Cancellation is ONLY permitted while the order is in the initial pending/placed state
      if (statusLower !== 'placed' && statusLower !== 'pending') {
        if (statusLower === 'cancelled') {
          return res.status(400).json({ error: 'This order has already been cancelled.' });
        }
        if (statusLower === 'delivered' || statusLower === 'completed') {
          return res.status(400).json({ error: 'This order has already been delivered and cannot be cancelled.' });
        }
        return res.status(400).json({
          error: 'This order can no longer be cancelled because preparation has started. Please contact the restaurant for help.',
        });
      }

      // Atomically update order status ensuring it is still in placed/pending state
      const updated = await orderService.cancelOrderIfPending(
        req.params.id,
        reason || 'Cancelled by customer (wrongly placed)',
        order.restaurantId
      );

      if (!updated) {
        return res.status(400).json({
          error: 'This order can no longer be cancelled because preparation has started. Please contact the restaurant for help.',
        });
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to cancel order', details: err.message });
    }
  });

  app.post('/api/orders', async (req, res) => {
    try {
      const { items, orderType, customer, paymentMethod } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Order must contain at least one item' });
      }
      if (!orderType || !['delivery', 'takeaway', 'dine_in', 'counter'].includes(orderType)) {
        return res.status(400).json({ error: 'Valid orderType (delivery, takeaway, dine_in, counter) is required' });
      }
      if (orderType === 'counter') {
        return res.status(403).json({ error: 'Counter orders can only be created by authorized restaurant staff via POS.' });
      }
      if (!customer || !customer.phone) {
        return res.status(400).json({ error: 'Customer phone number is required' });
      }
      if (!paymentMethod) {
        return res.status(400).json({ error: 'Payment method is required' });
      }

      // Production Payment Safety: For online payments (Razorpay), verify configuration and signature
      if (paymentMethod === 'razorpay') {
        const razorpayOrderId = req.body.razorpay_order_id || req.body.razorpayOrderId;
        const razorpaySignature = req.body.razorpay_signature || req.body.razorpaySignature;
        const paymentId = req.body.paymentId || req.body.razorpay_payment_id;

        // If client sends payment tokens, verify HMAC signature cryptographically
        if (paymentId || razorpayOrderId || razorpaySignature) {
          if (!isRazorpayConfigured()) {
            return res.status(503).json({
              error: 'Online payment is temporarily unavailable. Please try again later.',
              message: 'Online payment is temporarily unavailable. Please try again later.',
            });
          }

          if (!paymentId || !razorpayOrderId || !razorpaySignature) {
            return res.status(400).json({
              error: 'Online payment verification required. Missing payment ID, order ID, or signature.',
            });
          }

          const body = `${razorpayOrderId}|${paymentId}`;
          const expectedSignature = crypto
            .createHmac('sha256', getRazorpayKeySecret())
            .update(body.toString())
            .digest('hex');

          if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({
              error: 'Invalid payment signature. Online payment verification failed.',
            });
          }

          req.body.paymentStatus = 'paid';
          req.body.paymentId = paymentId;
        } else {
          // Authoritative order stored in database with pending payment status
          req.body.paymentStatus = 'pending';
          if (req.body.status === 'confirmed') {
            req.body.status = 'placed';
          }
        }
      } else if (paymentMethod === 'upi' || paymentMethod === 'direct_upi') {
        // Direct UPI Security Enforcement:
        // NEVER mark an order as paid or confirmed based only on customer self-assertion.
        // Payment must be verified server-side.
        const paymentAttemptId = req.body.paymentId || req.body.paymentAttemptId;
        const isVerifiedPaid = await directUpiService.isPaymentAttemptVerified(paymentAttemptId);

        if (isVerifiedPaid) {
          req.body.paymentStatus = 'paid';
          req.body.paymentId = paymentAttemptId;
        } else {
          // If unverified, payment status MUST remain pending
          req.body.paymentStatus = 'pending';
          if (req.body.status === 'confirmed') {
            req.body.status = 'placed';
          }
        }
      } else if (paymentMethod === 'cod') {
        req.body.paymentStatus = 'cod_pending';
        req.body.status = 'placed';
      } else {
        // Any other payment method: default to pending
        req.body.paymentStatus = 'pending';
        req.body.status = 'placed';
      }

      if (orderType === 'delivery') {
        if (!customer.address || !customer.address.trim()) {
          return res.status(400).json({
            error: 'Delivery orders require a complete delivery address.',
          });
        }

        const rawLat = req.body.customerLatitude !== undefined ? req.body.customerLatitude : customer?.latitude;
        const rawLng = req.body.customerLongitude !== undefined ? req.body.customerLongitude : customer?.longitude;

        if (rawLat !== undefined && rawLat !== null) {
          const latNum = Number(rawLat);
          if (isNaN(latNum) || latNum < -90 || latNum > 90) {
            return res.status(400).json({
              error: 'Customer GPS latitude must be between -90 and 90.',
            });
          }
        }

        if (rawLng !== undefined && rawLng !== null) {
          const lngNum = Number(rawLng);
          if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
            return res.status(400).json({
              error: 'Customer GPS longitude must be between -180 and 180.',
            });
          }
        }
      }

      // Execute full transactional order creation in PostgreSQL
      const createdOrder = await orderService.createOrder(req.body);

      // Link payment attempt to created order if payment attempt exists
      if (req.body.paymentId) {
        await directUpiService.linkOrderToAttempt(req.body.paymentId, createdOrder.id).catch((err) =>
          console.error('[Orders API] Failed to link order to payment attempt:', err)
        );
      }

      res.status(201).json(createdOrder);
    } catch (err: any) {
      console.error('Error creating order in PostgreSQL transaction:', err);
      res.status(400).json({
        error: err.message || 'Failed to create order',
        details: err.message,
      });
    }
  });

  app.get('/api/customers/:phone', async (req, res) => {
    try {
      const customer = await customerService.getCustomerByPhone(req.params.phone);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      res.json(customer);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch customer', details: err.message });
    }
  });

  app.post('/api/customers', async (req, res) => {
    try {
      const customer = await customerService.findOrCreateCustomer(req.body);
      res.json(customer);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to save customer', details: err.message });
    }
  });

  app.get('/api/tables', async (_req, res) => {
    try {
      const tables = await qrService.getRestaurantTables();
      res.json(tables);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch tables', details: err.message });
    }
  });

  app.get('/api/qr/catalog', async (_req, res) => {
    try {
      const catalog = await qrService.getTableCatalog();
      res.json(catalog);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch QR catalog', details: err.message });
    }
  });

  app.get('/api/qr/validate', async (req, res) => {
    const token = req.query.token as string;
    const restaurantSlug = req.query.slug as string | undefined;
    const result = qrService.validateSignedToken(token, restaurantSlug);
    if (!result.valid) {
      return res.status(401).json(result);
    }
    if (result.source === 'table_qr' || result.orderMode === 'dine_in') {
      const tableCheck = await qrService.verifyActiveTable(result.restaurantId, result.tableId, result.tableNumber);
      if (!tableCheck.valid) {
        return res.status(401).json({
          valid: false,
          error: tableCheck.error || 'Dine-In table is invalid, inactive, or not found.',
          source: 'online_web',
          orderMode: 'delivery',
          isModeLocked: false,
        });
      }
      result.tableId = tableCheck.tableId;
      result.tableNumber = tableCheck.tableNumber;
    }
    res.json(result);
  });

  app.post('/api/qr/validate', async (req, res) => {
    const token = req.body?.token;
    const restaurantSlug = req.body?.slug || req.body?.restaurantSlug;
    const result = qrService.validateSignedToken(token, restaurantSlug);
    if (!result.valid) {
      return res.status(401).json(result);
    }
    if (result.source === 'table_qr' || result.orderMode === 'dine_in') {
      const tableCheck = await qrService.verifyActiveTable(result.restaurantId, result.tableId, result.tableNumber);
      if (!tableCheck.valid) {
        return res.status(401).json({
          valid: false,
          error: tableCheck.error || 'Dine-In table is invalid, inactive, or not found.',
          source: 'online_web',
          orderMode: 'delivery',
          isModeLocked: false,
        });
      }
      result.tableId = tableCheck.tableId;
      result.tableNumber = tableCheck.tableNumber;
    }
    res.json(result);
  });

  // Delivery Serviceability Check (Public API)
  app.post('/api/delivery/serviceability', async (req, res) => {
    try {
      const { restaurantId, branchId, restaurantSlug, latitude, longitude, subtotal } = req.body;
      let targetRestId = restaurantId;
      if (!targetRestId && restaurantSlug) {
        const rest = await tenantService.resolveRestaurantBySlug(restaurantSlug);
        if (rest) targetRestId = rest.id;
      }
      if (!targetRestId) {
        targetRestId = 'a0000000-0000-0000-0000-000000000001';
      }
      const result = await channelService.checkDeliveryServiceability(
        targetRestId,
        branchId,
        {
          latitude: latitude != null ? Number(latitude) : null,
          longitude: longitude != null ? Number(longitude) : null,
        },
        Number(subtotal) || 0
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ==========================================================
  // SERVER-SIDE PAYMENT ROUTING
  // Evaluates restaurant settings + order_type to select payment provider
  // ==========================================================
  app.post('/api/payments/route-checkout', async (req, res) => {
    try {
      const {
        restaurantId = 'a0000000-0000-0000-0000-000000000001',
        orderType = 'delivery',
        paymentMethod,
        amount,
        orderNumber,
      } = req.body;

      let targetRestId = restaurantId;
      let resolvedRestaurantName: string | null = null;
      if (req.body.restaurantSlug) {
        const rest = await tenantService.resolveRestaurantBySlug(req.body.restaurantSlug);
        if (rest) {
          targetRestId = rest.id;
          resolvedRestaurantName = rest.name || rest.settings?.displayName || null;
        }
      }

      const paymentSettings = await tenantService.getRestaurantPaymentSettings(targetRestId);

      const routeResult = await paymentRoutingService.resolvePaymentRoute({
        orderType,
        paymentMethod,
        restaurantId: targetRestId,
        restaurantSlug: req.body.restaurantSlug,
        restaurantName: resolvedRestaurantName || undefined,
        amount: Number(amount) || 0,
        orderNumber: orderNumber ? String(orderNumber) : undefined,
        paymentSettings,
        isRazorpayConfigured,
        getRazorpayKeyId,
      });

      return res.json(routeResult);
    } catch (err: any) {
      console.error('[PaymentRoute] Error routing checkout:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to determine payment route',
        details: err?.message,
      });
    }
  });

  // ==========================================================
  // DIRECT UPI PAYMENT ATTEMPTS & AUTHORITATIVE STATUS VERIFICATION
  // ==========================================================

  // Initiate or re-initiate a Direct UPI payment session
  app.post('/api/payments/initiate-direct-upi', async (req, res) => {
    try {
      const {
        restaurantId = 'a0000000-0000-0000-0000-000000000001',
        restaurantSlug,
        amount,
        orderNumber,
      } = req.body;

      let targetRestId = restaurantId;
      let resolvedRestaurantName: string | null = null;
      if (restaurantSlug) {
        const rest = await tenantService.resolveRestaurantBySlug(restaurantSlug);
        if (rest) {
          targetRestId = rest.id;
          resolvedRestaurantName = rest.name || rest.settings?.displayName || null;
        }
      }

      const paymentSettings = await tenantService.getRestaurantPaymentSettings(targetRestId);
      const merchantUpi = (paymentSettings.merchantUpiId || paymentSettings.upiId || '').trim();
      const merchantName = (paymentSettings.merchantDisplayName || resolvedRestaurantName || 'Restaurant').trim();

      if (!merchantUpi) {
        return res.status(400).json({ error: 'Direct UPI is not configured for this restaurant.' });
      }

      const numAmount = Number(amount) || 0;
      const formattedAmount = numAmount > 0 ? numAmount.toFixed(2) : '0.00';
      const orderIdentifier = orderNumber ? String(orderNumber) : `S4U${Math.floor(10000 + Math.random() * 90000)}`;

      const attempt = await directUpiService.createAttempt({
        restaurantId: targetRestId,
        amount: numAmount,
        orderNumber: orderIdentifier,
        merchantUpiId: merchantUpi,
        merchantDisplayName: merchantName,
        provider: paymentSettings.directUpiProvider || 'DIRECT_UPI',
      });

      const encode = (val: string) => encodeURIComponent(val.trim());
      const queryParts: string[] = [
        `pa=${encode(merchantUpi)}`,
        `pn=${encode(merchantName)}`,
        `am=${formattedAmount}`,
        `cu=INR`,
        `tn=${encode(`Order ${orderIdentifier}`)}`,
      ];
      const queryString = queryParts.join('&');
      const upiIntentUri = `upi://pay?${queryString}`;

      return res.json({
        success: true,
        paymentId: attempt.id,
        orderNumber: attempt.orderNumber,
        amount: attempt.amount,
        merchantUpiId: merchantUpi,
        merchantDisplayName: merchantName,
        provider: attempt.provider,
        status: attempt.status,
        upiIntentUri,
        googlePayIntentUri: `upi://pay?${queryString}`,
        phonePeIntentUri: `phonepe://upi/pay?${queryString}`,
        paytmIntentUri: `paytmmp://upi/pay?${queryString}`,
        bhimIntentUri: `bhim://upi/pay?${queryString}`,
      });
    } catch (err: any) {
      console.error('[DirectUpiAPI] Error initiating payment attempt:', err);
      res.status(500).json({ error: 'Failed to initiate Direct UPI payment session', details: err.message });
    }
  });

  // Query payment status (Authoritative server-side status verification)
  // Possible statuses: pending, paid, failed, expired, cancelled
  app.get('/api/payments/:paymentId/status', async (req, res) => {
    try {
      const { paymentId } = req.params;
      const attempt = await directUpiService.getAttempt(paymentId);
      if (!attempt) {
        return res.status(404).json({
          success: false,
          error: 'Payment attempt not found',
        });
      }

      return res.json({
        success: true,
        paymentId: attempt.id,
        orderId: attempt.orderId,
        orderNumber: attempt.orderNumber,
        restaurantId: attempt.restaurantId,
        amount: attempt.amount,
        currency: attempt.currency,
        merchantUpiId: attempt.merchantUpiId,
        merchantDisplayName: attempt.merchantDisplayName,
        provider: attempt.provider,
        status: attempt.status,
        providerTransactionId: attempt.providerTransactionId,
        failureReason: attempt.failureReason,
        createdAt: attempt.createdAt,
        verifiedAt: attempt.verifiedAt,
      });
    } catch (err: any) {
      console.error('[Payments API] Error fetching payment status:', err);
      res.status(500).json({ error: 'Failed to check payment status', details: err.message });
    }
  });

  // Cancel payment attempt safely
  app.post('/api/payments/:paymentId/cancel', async (req, res) => {
    try {
      const { paymentId } = req.params;
      const reason = req.body?.reason || 'Customer cancelled payment attempt';
      const updated = await directUpiService.cancelAttempt(paymentId, reason);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Payment attempt not found' });
      }

      return res.json({
        success: true,
        paymentId: updated.id,
        status: updated.status,
        message: 'Payment attempt successfully cancelled',
      });
    } catch (err: any) {
      console.error('[Payments API] Error cancelling payment attempt:', err);
      res.status(500).json({ error: 'Failed to cancel payment attempt', details: err.message });
    }
  });

  // Webhook for Direct UPI payments (for banking aggregator or merchant notification callbacks)
  app.post('/api/webhooks/payments/direct-upi', async (req, res) => {
    try {
      const { paymentId, utr, providerTransactionId, amount, status = 'paid' } = req.body;
      if (!paymentId) {
        return res.status(400).json({ error: 'paymentId is required' });
      }

      if (status !== 'paid') {
        return res.status(400).json({ error: 'Only paid status can be confirmed' });
      }

      const txId = utr || providerTransactionId || `UPI_${Date.now()}`;
      const verified = await directUpiService.markPaymentVerified(paymentId, txId, amount ? Number(amount) : undefined);

      if (!verified) {
        return res.status(404).json({ error: 'Payment attempt not found or amount mismatch' });
      }

      if (verified.orderId) {
        await orderService.markPaymentSuccess(verified.orderId, txId, 'DIRECT_UPI');
      }

      return res.json({ success: true, verified: true, paymentId: verified.id, status: verified.status });
    } catch (err: any) {
      console.error('[DirectUpiWebhook] Error processing webhook:', err);
      res.status(500).json({ error: 'Webhook processing failed', details: err.message });
    }
  });

  // Razorpay Gateway
  app.get('/api/razorpay/config', (_req, res) => {
    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        available: false,
        error: 'Online payment is temporarily unavailable. Please try again later.',
        message: 'Online payment is temporarily unavailable. Please try again later.',
      });
    }
    res.json({
      available: true,
      keyId: getRazorpayKeyId(),
      merchantName: 'MOZZ Chinese & Pizzateria',
      currency: 'INR',
    });
  });

  const handleCreateRazorpayOrder = async (req: express.Request, res: express.Response) => {
    try {
      const {
        amount,
        currency = 'INR',
        receipt,
        notes,
        orderType = 'dine_in',
        restaurantId = 'a0000000-0000-0000-0000-000000000001',
        restaurantSlug,
      } = req.body;

      let effectiveOrderType = orderType;
      let effectiveAmount = amount;
      let authoritativeOrder: any = null;

      // Section 8 & 9 Security: Authoritative Order Amount Enforcement
      // If orderId is provided, retrieve authoritative stored order from database
      const targetOrderId = req.body.orderId || req.body.app_order_id;
      if (targetOrderId) {
        authoritativeOrder = await orderService.getOrderById(targetOrderId).catch(() => null);
        if (authoritativeOrder) {
          if (authoritativeOrder.paymentStatus === 'paid') {
            return res.status(400).json({
              success: false,
              error: 'Order is already marked as paid.',
            });
          }
          effectiveOrderType = authoritativeOrder.orderType;
          // Authoritative amount directly from PostgreSQL/DB (immune to client tampering)
          effectiveAmount = authoritativeOrder.grandTotal;
        }
      }

      // Consult Authoritative Payment Routing Service
      const channelProvider = paymentRoutingService.resolveProviderForChannel(effectiveOrderType);
      if (channelProvider === 'DIRECT_UPI') {
        return res.status(400).json({
          success: false,
          error: 'Direct Restaurant UPI is required for this order channel.',
          route: 'DIRECT_RESTAURANT_UPI',
        });
      }

      if (!isRazorpayConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Online payment is temporarily unavailable. Please try again later.',
          message: 'Online payment is temporarily unavailable. Please try again later.',
        });
      }

      const numAmount = Number(effectiveAmount);
      if (!numAmount || numAmount <= 0) {
        return res.status(400).json({ error: 'Valid amount is required' });
      }

      const amountInPaise = Math.round(
        numAmount >= 100 && Number.isInteger(numAmount) && req.body.isPaise && !authoritativeOrder
          ? numAmount
          : numAmount * 100
      );

      if (amountInPaise < 100) {
        return res.status(400).json({ error: 'Minimum amount must be at least 100 paise (₹1.00)' });
      }

      const rzp = getRazorpay();
      const orderOptions = {
        amount: amountInPaise,
        currency: currency || 'INR',
        receipt: receipt || `rcpt_${(authoritativeOrder?.orderNumber || Date.now().toString()).slice(-20)}`,
        notes: {
          restaurant: 'MOZZ Chinese & Pizzateria',
          order_id: authoritativeOrder?.id || '',
          order_number: authoritativeOrder?.orderNumber || '',
          order_type: effectiveOrderType,
          channel_provider: channelProvider,
          ...(notes || {}),
        },
      };

      const order = await rzp.orders.create(orderOptions);
      return res.json({
        success: true,
        order_id: order.id,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: getRazorpayKeyId(),
        keyId: getRazorpayKeyId(),
        orderType: effectiveOrderType,
        provider: 'RAZORPAY',
        appOrderId: authoritativeOrder?.id,
        orderNumber: authoritativeOrder?.orderNumber,
      });
    } catch (err: any) {
      console.error('Error creating Razorpay order:', err);
      return res.status(503).json({
        success: false,
        error: 'Online payment is temporarily unavailable. Please try again later.',
        message: 'Online payment is temporarily unavailable. Please try again later.',
        details: err?.message || 'Unknown error',
      });
    }
  };

  app.post('/api/create-order', handleCreateRazorpayOrder);
  app.post('/api/razorpay/create-order', handleCreateRazorpayOrder);

  const handleVerifyPayment = async (req: express.Request, res: express.Response) => {
    try {
      if (!isRazorpayConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Online payment is temporarily unavailable. Please try again later.',
          message: 'Online payment is temporarily unavailable. Please try again later.',
        });
      }

      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        order_id,
        payment_id,
        signature,
        app_order_id,
      } = req.body;

      const activeOrderId = razorpay_order_id || order_id;
      const activePaymentId = razorpay_payment_id || payment_id;
      const activeSignature = razorpay_signature || signature;

      if (!activeOrderId || !activePaymentId || !activeSignature) {
        return res.status(400).json({
          success: false,
          error: 'Missing required payment verification parameters (order_id, payment_id, signature)',
        });
      }

      const keySecret = getRazorpayKeySecret();
      const body = `${activeOrderId}|${activePaymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(body.toString())
        .digest('hex');

      const isAuthentic = expectedSignature === activeSignature;

      if (isAuthentic) {
        const orderIdentifier = app_order_id || req.body.orderId;
        if (orderIdentifier) {
          await orderService.markPaymentSuccess(orderIdentifier, activePaymentId).catch((err) =>
            console.error('[VerifyPayment] Error marking payment success in orderService:', err)
          );
        }

        return res.json({
          success: true,
          message: 'Payment verified successfully and updated in PostgreSQL',
          order_id: activeOrderId,
          payment_id: activePaymentId,
          paymentId: activePaymentId,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid payment signature. Verification failed.',
        });
      }
    } catch (err: any) {
      console.error('Error verifying payment signature:', err);
      return res.status(500).json({
        success: false,
        error: 'Internal error during payment verification',
        details: err?.message,
      });
    }
  };

  app.post('/api/verify-payment', handleVerifyPayment);
  app.post('/api/razorpay/verify-payment', handleVerifyPayment);
  app.post('/api/razorpay/verify', handleVerifyPayment);
  app.post('/api/payments/verify', handleVerifyPayment);

  // ==========================================================
  // PHASE 6: MARKETPLACE PAYMENT PROVIDER ORDER CREATION
  // ==========================================================
  app.post('/api/payments/create-order', async (req, res) => {
    try {
      const {
        amount,
        currency = 'INR',
        receipt,
        notes,
        provider,
        restaurantId = 'a0000000-0000-0000-0000-000000000001',
        splits,
      } = req.body;

      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Valid amount is required' });
      }

      const activeProvider = paymentService.getProvider(provider);
      if (!activeProvider.isConfigured()) {
        // Fallback or friendly error
        return res.status(503).json({
          success: false,
          error: `Payment provider '${activeProvider.providerName}' is not configured.`,
        });
      }

      const orderResult = await activeProvider.createOrder({
        orderId: req.body.orderId || `ord_${Date.now()}`,
        orderNumber: req.body.orderNumber || `ORD-${Date.now().toString().slice(-6)}`,
        amount: Number(amount),
        currency,
        customer: req.body.customer || {
          name: 'Customer',
          phone: '+919876543210',
        },
        restaurantId,
        branchId: req.body.branchId,
        restaurantShare: req.body.restaurantShare || Math.round(Number(amount) * 0.9),
        platformShare: req.body.platformShare || Math.round(Number(amount) * 0.1),
        notes: notes || {},
      });

      if (!orderResult.success) {
        return res.status(400).json({
          success: false,
          error: orderResult.error || 'Failed to create payment order with provider',
        });
      }

      return res.json({
        success: true,
        provider: activeProvider.providerName,
        orderId: orderResult.providerOrderId,
        amount: orderResult.amount,
        currency: orderResult.currency,
        clientSecret: orderResult.clientSecret,
        paymentUrl: orderResult.paymentUrl,
      });
    } catch (err: any) {
      console.error('[Payments API] Error creating payment order:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment order',
        details: err?.message,
      });
    }
  });

  // ==========================================================
  // PHASE 6: AUTHORITATIVE PAYMENT WEBHOOKS
  // ==========================================================
  const handlePaymentWebhook = async (req: express.Request, res: express.Response) => {
    const providerParam = (req.params.provider || req.query.provider || 'cashfree') as string;
    const rawPayload = (req as any).rawBody || JSON.stringify(req.body);

    const result = await paymentWebhookService.handleWebhook(providerParam, req.headers, rawPayload);

    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        success: false,
        error: result.error || result.message || 'Webhook processing failed',
      });
    }

    return res.status(200).json({
      success: true,
      processed: true,
      orderId: result.orderId,
    });
  };

  app.post('/api/webhooks/payments/:provider', handlePaymentWebhook);
  app.post('/api/webhooks/payments', handlePaymentWebhook);

  // ==========================================================
  // PHASE 6: REAL-TIME NOTIFICATIONS (SSE) FOR RESTAURANT ADMINS
  // ==========================================================
  app.get('/api/admin/notifications/events', (req, res) => {
    const token = (req.cookies?.mozz_admin_token ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null) ||
      (req.query.token as string)) as string | undefined;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required for live notification stream' });
    }

    const payload = verifyAuthToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }

    const restaurantId = (req.query.restaurantId as string) || payload.restaurantId || 'a0000000-0000-0000-0000-000000000001';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const unregister = realtimeNotificationService.registerClient(restaurantId, res);

    req.on('close', () => {
      unregister();
    });
  });

  // ==========================================================
  // PHASE 6: PAYMENT LEDGER & SETTLEMENT STATS
  // ==========================================================
  app.get('/api/admin/payments/ledger', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const transactions = await paymentLedgerService.getTransactions(restaurantId, limit);
      res.json({ success: true, transactions });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch payment ledger', details: err.message });
    }
  });

  app.get('/api/admin/payments/settlements', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const settlements = await paymentLedgerService.getSettlements(restaurantId, limit);
      res.json({ success: true, settlements });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch settlements', details: err.message });
    }
  });

  app.get('/api/admin/payments/stats', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const stats = await paymentLedgerService.getLedgerStats(restaurantId);
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch payment stats', details: err.message });
    }
  });

  app.post('/api/admin/payments/settlements/:id/sync', requireAuth, requireRestaurantTenant, async (req, res) => {
    try {
      const restaurantId = req.tenant.restaurantId;
      const settlementId = req.params.id;
      const syncResult = await paymentLedgerService.syncSettlementWithProvider(settlementId, restaurantId);
      res.json(syncResult);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to sync settlement', details: err.message });
    }
  });

  // ==========================================================
  // DISTRIBUTED RATE LIMITER & SAFE PROXY IP HANDLING
  // ==========================================================
  // Exported helpers for verification & unit testing
  // ==========================================================
  const memoryRateLimitStore = new Map<string, { count: number; resetAt: number }>();

  // ==========================================================
  // CUSTOMER INQUIRIES STAFF PORTAL ENDPOINTS (Tenant-Isolated)
  // ==========================================================
  app.get('/api/admin/inquiries', requireAuth, async (req, res) => {
    try {
      const restaurantId = req.user!.restaurantId;
      const statusFilter = req.query.status as string;

      if (isPostgresRunning()) {
        let sql = `
          SELECT id, restaurant_id, branch_id, name, phone, order_id, message, status, ip_hash, user_agent, created_at, updated_at
          FROM customer_inquiries
          WHERE restaurant_id = $1
        `;
        const params: any[] = [restaurantId];
        if (statusFilter && ['new', 'in_review', 'resolved', 'spam'].includes(statusFilter)) {
          params.push(statusFilter);
          sql += ` AND status = $${params.length}`;
        }
        sql += ` ORDER BY created_at DESC LIMIT 200`;
        const result = await query(sql, params);
        return res.json(result.rows);
      } else {
        const inquiries = (inMemoryDb as any).customer_inquiries || [];
        let filtered = inquiries.filter((i: any) => i.restaurant_id === restaurantId);
        if (statusFilter && ['new', 'in_review', 'resolved', 'spam'].includes(statusFilter)) {
          filtered = filtered.filter((i: any) => i.status === statusFilter);
        }
        filtered.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return res.json(filtered.slice(0, 200));
      }
    } catch (err: any) {
      console.error('[Admin API] Error fetching inquiries:', err.message);
      res.status(500).json({ error: 'Failed to fetch inquiries', details: err.message });
    }
  });

  app.patch('/api/admin/inquiries/:id/status', requireAuth, async (req, res) => {
    try {
      const restaurantId = req.user!.restaurantId;
      const inquiryId = req.params.id;
      const { status } = req.body;

      if (!status || !['new', 'in_review', 'resolved', 'spam'].includes(status)) {
        return res.status(400).json({
          error: "Invalid status value. Permitted values: 'new', 'in_review', 'resolved', 'spam'.",
        });
      }

      if (isPostgresRunning()) {
        const result = await query(
          `UPDATE customer_inquiries
           SET status = $1, updated_at = NOW()
           WHERE id = $2 AND restaurant_id = $3
           RETURNING *`,
          [status, inquiryId, restaurantId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Inquiry not found in your restaurant' });
        }
        return res.json(result.rows[0]);
      } else {
        const inquiries = (inMemoryDb as any).customer_inquiries || [];
        const index = inquiries.findIndex((i: any) => i.id === inquiryId && i.restaurant_id === restaurantId);
        if (index === -1) {
          return res.status(404).json({ error: 'Inquiry not found in your restaurant' });
        }
        inquiries[index].status = status;
        inquiries[index].updated_at = new Date().toISOString();
        return res.json(inquiries[index]);
      }
    } catch (err: any) {
      console.error('[Admin API] Error updating inquiry status:', err.message);
      res.status(500).json({ error: 'Failed to update inquiry status', details: err.message });
    }
  });

  // ==========================================================
  // CUSTOMER CONTACT & INQUIRIES ENDPOINT
  // ==========================================================
  app.post('/api/contact', async (req, res) => {
    try {
      // 1. Honeypot check for automated spam submissions
      if (req.body.website_url || req.body.honeypot) {
        return res.status(400).json({ error: 'Invalid submission parameters detected.' });
      }

      // 2. Input validation & normalization
      const { name, phone, orderId, message, restaurantId: rawRestId, branchId: rawBranchId } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
        return res.status(400).json({ error: 'Please enter a valid name (2 to 100 characters).' });
      }

      if (!message || typeof message !== 'string' || message.trim().length < 10 || message.trim().length > 2000) {
        return res.status(400).json({ error: 'Please enter a message between 10 and 2000 characters.' });
      }

      let normalizedPhone: string | null = null;
      if (phone !== undefined && phone !== null && String(phone).trim().length > 0) {
        const cleanedPhone = String(phone).trim().replace(/[\s\-()]/g, '');
        if (!/^\+?[0-9]{7,15}$/.test(cleanedPhone)) {
          return res.status(400).json({ error: 'Please enter a valid phone number format (7 to 15 digits).' });
        }
        normalizedPhone = cleanedPhone;
      }

      let normalizedOrderId: string | null = null;
      if (orderId !== undefined && orderId !== null && String(orderId).trim().length > 0) {
        const cleanedOrderId = String(orderId).trim().toUpperCase();
        if (!/^[A-Z0-9\-_]{4,50}$/.test(cleanedOrderId)) {
          return res.status(400).json({ error: 'Please enter a valid Order ID format (e.g. MOZZ-8901).' });
        }
        normalizedOrderId = cleanedOrderId;
      }

      // 3. Safe client IP and rate limiting
      let clientIp: string;
      let ipHash: string;
      try {
        clientIp = getSafeClientIp(req);
        ipHash = hashIpForAudit(clientIp);
      } catch (hashErr: any) {
        console.error('[Contact API] IP hashing error:', hashErr.message);
        if (process.env.NODE_ENV === 'production') {
          return res.status(500).json({
            error: 'Server security configuration error. IP hashing unavailable.',
          });
        }
        ipHash = 'dev-unconfigured-ip-hash';
      }

      const rateLimitKey = `contact:${ipHash}`;

      let rateLimit;
      try {
        rateLimit = await checkDistributedRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
      } catch (rlErr: any) {
        console.error('[Contact API] Distributed rate limiter error:', rlErr.message);
        if (rlErr.message === 'DISTRIBUTED_RATE_LIMITER_UNAVAILABLE' || process.env.NODE_ENV === 'production') {
          return res.status(503).json({
            error: 'Inquiry service temporarily unavailable. Distributed rate limiter service offline.',
          });
        }
        rateLimit = { allowed: true, remaining: 1, resetAt: Date.now() + 60000, isDurable: false };
      }

      if (!rateLimit.isDurable) {
        res.setHeader('X-RateLimit-Distributed', 'pending-durable-store');
      }

      if (!rateLimit.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000));
        res.setHeader('Retry-After', retryAfterSeconds.toString());
        return res.status(429).json({
          error: 'Too many contact inquiries from your network. Please wait a few minutes before submitting again.',
        });
      }

      // Normalized plain text stored in database (DO NOT permanently HTML-encode before storage to preserve fidelity)
      const cleanName = name.trim();
      const cleanMessage = message.trim();

      // Multi-tenant resolution: derive trusted tenant context, never trust arbitrary client IDs
      const tenantContext = await resolveTrustedTenantForInquiry(normalizedOrderId, rawRestId, rawBranchId);

      const inquiryId = `INQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
      const isProduction = process.env.NODE_ENV === 'production';

      // 4. Persistence handling
      if (isPostgresRunning()) {
        try {
          await query(
            `INSERT INTO customer_inquiries (
               id, restaurant_id, branch_id, name, phone, order_id, message, status, ip_hash, user_agent, created_at, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9, NOW(), NOW())`,
            [
              inquiryId,
              tenantContext.restaurantId,
              tenantContext.branchId,
              cleanName,
              normalizedPhone,
              normalizedOrderId,
              cleanMessage,
              ipHash,
              userAgent,
            ]
          );
        } catch (dbErr: any) {
          console.error('[Contact API] PostgreSQL persistence error:', dbErr.message);
          return res.status(503).json({
            error: 'Failed to record customer inquiry in database. Please contact us directly by phone.',
          });
        }
      } else {
        // In-memory storage is permitted only in explicit local development / testing mode
        if (isProduction) {
          console.error('[Contact API] Inquiries cannot be accepted in production without an active database.');
          return res.status(503).json({
            error: 'Inquiry service temporarily unavailable. Production database connection required.',
          });
        }

        if (!(inMemoryDb as any).customer_inquiries) {
          (inMemoryDb as any).customer_inquiries = [];
        }
        (inMemoryDb as any).customer_inquiries.push({
          id: inquiryId,
          restaurant_id: tenantContext.restaurantId,
          branch_id: tenantContext.branchId,
          name: cleanName,
          phone: normalizedPhone,
          order_id: normalizedOrderId,
          message: cleanMessage,
          status: 'new',
          ip_hash: ipHash,
          user_agent: userAgent,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // Safe logging: DO NOT log customer name, phone number, or message content
      console.info(`[Contact API] Inquiry registered successfully: ${inquiryId} [restaurant=${tenantContext.restaurantId}] [ipHash=${ipHash}]`);

      return res.status(201).json({
        success: true,
        inquiryId,
        message: 'Your inquiry has been recorded successfully for the restaurant team to review in the staff portal.',
      });
    } catch (err: any) {
      console.error('[Contact API] Unexpected error handling contact submission:', err.message);
      return res.status(500).json({ error: 'Failed to process inquiry', details: err.message });
    }
  });

  return app;
}

// ==========================================================
// DISTRIBUTED RATE LIMITER & SAFE PROXY IP HANDLING
// ==========================================================
export function normalizeClientIp(rawIp: string): string {
  if (!rawIp) return '127.0.0.1';
  let ip = rawIp.trim();
  // Strip enclosing brackets if IPv6 is bracketed: [::1] or [::ffff:127.0.0.1]
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1).trim();
  }
  // Only remove ::ffff: prefix from IPv4-mapped IPv6 addresses
  if (ip.toLowerCase().startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

export function getSafeClientIp(req: express.Request): string {
  const rawIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  return normalizeClientIp(rawIp);
}

export function hashIpForAudit(ip: string): string {
  const secret = getIpHashSecret();
  return crypto.createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32);
}

export const memoryRateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function clearMemoryRateLimitStore(): void {
  memoryRateLimitStore.clear();
}

export async function checkDistributedRateLimit(
  key: string,
  maxHits = 5,
  windowMs = 15 * 60 * 1000
): Promise<{ allowed: boolean; remaining: number; resetAt: number; isDurable: boolean }> {
  const now = Date.now();
  const resetTime = new Date(now + windowMs);

  if (isPostgresRunning()) {
    try {
      const res = await query(
        `INSERT INTO distributed_rate_limits (key, hit_count, reset_at, created_at, updated_at)
         VALUES ($1, 1, $2, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE
         SET
           hit_count = CASE
             WHEN distributed_rate_limits.reset_at <= NOW() THEN 1
             ELSE distributed_rate_limits.hit_count + 1
           END,
           reset_at = CASE
             WHEN distributed_rate_limits.reset_at <= NOW() THEN EXCLUDED.reset_at
             ELSE distributed_rate_limits.reset_at
           END,
           updated_at = NOW()
         RETURNING hit_count, reset_at`,
        [key, resetTime]
      );

      const row = res.rows[0];
      const hitCount = Number(row.hit_count);
      const rowResetMs = new Date(row.reset_at).getTime();

      if (hitCount > maxHits) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: rowResetMs,
          isDurable: true,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, maxHits - hitCount),
        resetAt: rowResetMs,
        isDurable: true,
      };
    } catch (dbErr: any) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[RateLimiter] Distributed database rate limit check failed in production:', dbErr.message);
        throw new Error('DISTRIBUTED_RATE_LIMITER_UNAVAILABLE');
      }
      console.warn('[RateLimiter] Distributed database rate limit check failed, using fallback in dev:', dbErr.message);
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[RateLimiter] Production environment requires active PostgreSQL connection for distributed rate limits.');
    throw new Error('DISTRIBUTED_RATE_LIMITER_UNAVAILABLE');
  }

  // In-memory fallback (local development / testing mode only)
  const mem = memoryRateLimitStore.get(key);
  if (mem && now < mem.resetAt) {
    mem.count += 1;
    if (mem.count > maxHits) {
      return { allowed: false, remaining: 0, resetAt: mem.resetAt, isDurable: false };
    }
    return {
      allowed: true,
      remaining: maxHits - mem.count,
      resetAt: mem.resetAt,
      isDurable: false,
    };
  } else {
    const newReset = now + windowMs;
    memoryRateLimitStore.set(key, { count: 1, resetAt: newReset });
    return {
      allowed: true,
      remaining: maxHits - 1,
      resetAt: newReset,
      isDurable: false,
    };
  }
}

export async function resolveTrustedTenantForInquiry(
  orderId?: string | null,
  clientRestaurantId?: string | null,
  clientBranchId?: string | null
): Promise<{ restaurantId: string; branchId: string }> {
  const DEFAULT_RESTAURANT = 'a0000000-0000-0000-0000-000000000001';
  const DEFAULT_BRANCH = 'b0000000-0000-0000-0000-000000000001';

  // 1. If customer provided an order ID, verify and link to the exact order's tenant
  if (orderId) {
    if (isPostgresRunning()) {
      try {
        const orderRes = await query(
          `SELECT restaurant_id, branch_id FROM orders WHERE order_number = $1 OR id::text = $1 LIMIT 1`,
          [orderId]
        );
        if (orderRes.rows.length > 0) {
          return {
            restaurantId: orderRes.rows[0].restaurant_id,
            branchId: orderRes.rows[0].branch_id || DEFAULT_BRANCH,
          };
        }
      } catch (err: any) {
        console.warn('[Contact API] Order tenant lookup error:', err.message);
      }
    } else {
      const order = inMemoryDb.orders.find(
        (o) => (o as any).order_number === orderId || o.id === orderId || (o as any).orderNumber === orderId
      );
      if (order) {
        return {
          restaurantId: (order as any).restaurant_id || (order as any).restaurantId || DEFAULT_RESTAURANT,
          branchId: (order as any).branch_id || (order as any).branchId || DEFAULT_BRANCH,
        };
      }
    }
  }

  // 2. If client supplied a restaurantId, verify it exists as an active tenant in the database
  if (clientRestaurantId) {
    if (isPostgresRunning()) {
      try {
        const restRes = await query(
          `SELECT id FROM restaurants WHERE id = $1 AND status = 'active' LIMIT 1`,
          [clientRestaurantId]
        );
        if (restRes.rows.length > 0) {
          return {
            restaurantId: restRes.rows[0].id,
            branchId: clientBranchId || DEFAULT_BRANCH,
          };
        }
      } catch {
        // Fall through to default if invalid UUID or not found
      }
    } else {
      const rest = inMemoryDb.restaurants.find(
        (r) => r.id === clientRestaurantId && r.status === 'active'
      );
      if (rest) {
        return {
          restaurantId: rest.id,
          branchId: clientBranchId || DEFAULT_BRANCH,
        };
      }
    }
  }

  // 3. Trusted default tenant for Starters4U flagship
  return {
    restaurantId: DEFAULT_RESTAURANT,
    branchId: DEFAULT_BRANCH,
  };
}

export const app = createApp();
