import { Request, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedUser } from './authMiddleware.js';
import {
  TenantContext,
  PlatformRole,
  PublicRestaurantProfile,
  buildTenantContext,
  verifyTenantAccess,
  isPlatformAdmin,
  resolveRestaurantBySlug,
  FLAGSHIP_MOZZ_SLUG,
} from '../services/tenantService.js';

// Extend Express Request interface with tenant contexts
declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      publicTenant?: PublicRestaurantProfile;
    }
  }
}

/**
 * Reusable Tenant Context Middleware
 * Enforces server-side tenant isolation for all authenticated operations.
 * CRITICAL: Client-supplied IDs in body/query/params can NEVER bypass authenticated session tenant.
 */
export function requireRestaurantTenant(req: Request, res: Response, next: NextFunction) {
  // 1. Ensure user is authenticated
  if (!req.user) {
    return requireAuth(req, res, () => {
      proceedWithTenant(req, res, next);
    });
  }

  proceedWithTenant(req, res, next);
}

function proceedWithTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required for tenant operation',
    });
  }

  const userRole = (req.user.role || '').toUpperCase();
  if (userRole === 'CUSTOMER' || userRole === 'VISITOR' || userRole === 'USER') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied: Customer accounts cannot access administrative tenant resources.',
    });
  }

  // 2. Build immutable server-side tenant context from user session
  const tenant = buildTenantContext(req.user);
  req.tenant = tenant;

  // 3. Prevent cross-tenant tampering:
  // If the request targets a specific restaurant via URL parameter, query, or body:
  const requestedRestaurantId =
    req.params.restaurantId ||
    (req.query.restaurant_id as string) ||
    (req.query.restaurantId as string) ||
    (req.body && (req.body.restaurant_id || req.body.restaurantId));

  if (requestedRestaurantId && !tenant.isPlatformAdmin) {
    const access = verifyTenantAccess(req.user, requestedRestaurantId);
    if (!access.allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied: You do not have permission to access resources belonging to another restaurant.',
      });
    }
  }

  // Also check if restaurant slug is specified in query/params and doesn't match
  const requestedSlug = req.params.slug || (req.query.slug as string) || (req.query.restaurantSlug as string);
  if (requestedSlug && !tenant.isPlatformAdmin && tenant.restaurantSlug) {
    if (requestedSlug.toLowerCase() !== tenant.restaurantSlug.toLowerCase()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied: You do not have permission to access resources belonging to another restaurant.',
      });
    }
  }

  // 4. Branch access enforcement:
  const requestedBranchId =
    req.params.branchId ||
    (req.query.branch_id as string) ||
    (req.body && req.body.branch_id);

  if (requestedBranchId && !tenant.hasAllBranchAccess && tenant.branchId) {
    if (requestedBranchId !== tenant.branchId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied: You are assigned to branch ${tenant.branchId} and cannot access branch ${requestedBranchId}.`,
      });
    }
  }

  next();
}

/**
 * Middleware requiring Platform Super Admin authorization
 */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return requireAuth(req, res, () => {
      checkPlatformAdmin(req, res, next);
    });
  }
  checkPlatformAdmin(req, res, next);
}

function checkPlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
  }

  if (!isPlatformAdmin(req.user.role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Platform Super Admin access required to perform this action.',
    });
  }

  next();
}

/**
 * Middleware requiring specific role(s) within the tenant
 */
export function requireRestaurantRole(allowedRoles: PlatformRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return requireAuth(req, res, () => {
        checkRole(req, res, next, allowedRoles);
      });
    }
    checkRole(req, res, next, allowedRoles);
  };
}

function checkRole(req: Request, res: Response, next: NextFunction, allowedRoles: PlatformRole[]) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
  }

  const tenant = req.tenant || buildTenantContext(req.user);
  req.tenant = tenant;

  // Platform admin can execute any restaurant operation
  if (tenant.isPlatformAdmin) {
    return next();
  }

  const userRole = tenant.role as PlatformRole;

  // Hierarchy check
  const isOwnerOrAdmin = userRole === 'RESTAURANT_ADMIN' || userRole === 'RESTAURANT_OWNER';
  const isManager = userRole === 'BRANCH_MANAGER';
  const isCashier = userRole === 'CASHIER';
  const isKitchen = userRole === 'KITCHEN';

  const matches =
    allowedRoles.includes(userRole) ||
    (isOwnerOrAdmin && allowedRoles.some((r) => ['RESTAURANT_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN', 'STAFF'].includes(r))) ||
    (isManager && allowedRoles.some((r) => ['BRANCH_MANAGER', 'CASHIER', 'KITCHEN', 'STAFF'].includes(r))) ||
    (isCashier && allowedRoles.some((r) => ['CASHIER', 'STAFF'].includes(r))) ||
    (isKitchen && allowedRoles.some((r) => ['KITCHEN', 'STAFF'].includes(r)));

  if (!matches) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `Your role (${req.user.role}) does not have sufficient permissions for this action.`,
    });
  }

  next();
}

/**
 * Public Tenant Resolver Middleware
 * Resolves restaurant by :slug parameter or defaults to MOZZ
 */
export async function resolvePublicTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = (req.params.slug || req.query.slug as string || FLAGSHIP_MOZZ_SLUG).trim().toLowerCase();
    const profile = await resolveRestaurantBySlug(slug);

    if (!profile) {
      return res.status(404).json({
        error: 'Restaurant not found',
        message: `No active restaurant was found with slug '${slug}'.`,
      });
    }

    req.publicTenant = profile;
    next();
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to resolve restaurant', details: err.message });
  }
}
