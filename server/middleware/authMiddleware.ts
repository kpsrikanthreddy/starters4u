import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

export interface AuthenticatedUser {
  userId: string;
  id?: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'RESTAURANT_OWNER' | 'BRANCH_MANAGER' | 'CASHIER' | 'KITCHEN' | string;
  restaurantId: string;
  branchId?: string;
  restaurantName?: string;
  branchName?: string;
  restaurantSlug?: string;
}

// Extend Express Request interface with authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function signAuthToken(payload: AuthenticatedUser): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyAuthToken(token: string): AuthenticatedUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
  } catch (err) {
    return null;
  }
}

/**
 * Authentication Middleware
 * Validates JWT token from Authorization header (Bearer <token>) or cookie
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && req.cookies.mozz_admin_token) {
    token = req.cookies.mozz_admin_token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin authentication required. Please log in to access the restaurant portal.',
    });
  }

  const decoded = verifyAuthToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired session token. Please log in again.',
    });
  }

  req.user = decoded;
  next();
}

/**
 * Role-Based Access Control Middleware
 * Supports standard hierarchical roles (SUPER_ADMIN bypasses all)
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const userRole = (req.user.role || '').toUpperCase();
    const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());

    // Platform Super Admin has universal access
    if (userRole === 'SUPER_ADMIN' || userRole === 'SUPERADMIN' || userRole === 'PLATFORM_ADMIN') {
      return next();
    }

    // Customers are never permitted to access admin functions
    if (userRole === 'CUSTOMER' || userRole === 'VISITOR' || userRole === 'USER') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied: Customer accounts cannot access administrative resources.',
      });
    }

    const isOwnerOrAdmin =
      userRole === 'RESTAURANT_ADMIN' ||
      userRole === 'RESTAURANT_OWNER' ||
      userRole === 'OWNER' ||
      userRole === 'ADMIN';

    const isManager = userRole === 'BRANCH_MANAGER' || userRole === 'MANAGER';
    const isCashier = userRole === 'CASHIER';
    const isKitchen = userRole === 'KITCHEN' || userRole === 'CHEF';

    // Check if role is in allowed list or satisfies hierarchy
    const roleMatches =
      normalizedAllowed.includes(userRole) ||
      (normalizedAllowed.includes('PLATFORM_ADMIN') && (userRole === 'SUPER_ADMIN' || userRole === 'SUPERADMIN')) ||
      (normalizedAllowed.includes('RESTAURANT_ADMIN') && isOwnerOrAdmin) ||
      (normalizedAllowed.includes('RESTAURANT_OWNER') && isOwnerOrAdmin) ||
      (normalizedAllowed.includes('BRANCH_MANAGER') && (isManager || isOwnerOrAdmin)) ||
      (normalizedAllowed.includes('CASHIER') && (isCashier || isManager || isOwnerOrAdmin)) ||
      (normalizedAllowed.includes('KITCHEN') && (isKitchen || isManager || isOwnerOrAdmin)) ||
      (normalizedAllowed.includes('STAFF') && (isCashier || isKitchen || isManager || isOwnerOrAdmin || userRole === 'STAFF'));

    if (!roleMatches) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Your role (${req.user.role}) does not have permission to perform this action.`,
      });
    }

    next();
  };
}
