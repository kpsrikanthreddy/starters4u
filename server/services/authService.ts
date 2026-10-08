import bcrypt from 'bcryptjs';
import { query, inMemoryDb, isPostgresRunning } from '../db.js';
import { AuthenticatedUser, signAuthToken } from '../middleware/authMiddleware.js';

const DEFAULT_RESTAURANT_ID = 'a0000000-0000-0000-0000-000000000001';
const DEFAULT_BRANCH_ID = 'b0000000-0000-0000-0000-000000000001';

// Dynamic bcrypt hash generator using 12 salt rounds
export async function hashPassword(passwordOrPin: string, rounds: number = 12): Promise<string> {
  const salt = await bcrypt.genSalt(rounds);
  return bcrypt.hash(passwordOrPin.trim(), salt);
}

export async function verifyPassword(passwordOrPin: string, hash: string): Promise<boolean> {
  if (!passwordOrPin || !hash) return false;
  try {
    return await bcrypt.compare(passwordOrPin.trim(), hash.trim());
  } catch (err) {
    console.error('[AuthService] Error comparing password hash:', err);
    return false;
  }
}

export interface AdminLoginResult {
  success: boolean;
  message?: string;
  token?: string;
  user?: AuthenticatedUser;
  restaurant?: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string;
    currency: string;
  };
}

/**
 * Initializes default store users and super admin in PostgreSQL and in-memory store
 * with 12-round bcrypt hashes dynamically computed at runtime.
 */
export async function ensureAdminUserInitialized(
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  branchId: string = DEFAULT_BRANCH_ID
) {
  const defaultRestaurantPin = '8888';
  const defaultSuperAdminPin = '9999';

  if (isPostgresRunning()) {
    try {
      // 1. Ensure Restaurant Admin / Owner
      const checkRes = await query(
        `SELECT id FROM restaurant_users WHERE restaurant_id = $1 AND email = 'admin@mozzpizzateria.com' LIMIT 1`,
        [restaurantId]
      );

      if (checkRes.rows.length === 0) {
        const hashedPin = await hashPassword(defaultRestaurantPin, 12);
        await query(
          `INSERT INTO restaurant_users (
            restaurant_id, branch_id, name, email, phone, role, pin_hash, is_active, created_at, updated_at
          ) VALUES (
            $1, $2, 'Store Manager (Admin)', 'admin@mozzpizzateria.com', '+918179620607', 'RESTAURANT_OWNER', $3, TRUE, NOW(), NOW()
          ) ON CONFLICT (restaurant_id, email) DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            role = EXCLUDED.role,
            is_active = TRUE,
            updated_at = NOW();`,
          [restaurantId, branchId, hashedPin]
        );
        console.info('[AuthService] Initialized default restaurant owner (admin@mozzpizzateria.com).');
      }

      // 2. Ensure Super Admin user
      const checkSuper = await query(
        `SELECT id FROM restaurant_users WHERE email = 'superadmin@starters4u.in' LIMIT 1`
      );

      if (checkSuper.rows.length === 0) {
        const hashedSuper = await hashPassword(defaultSuperAdminPin, 12);
        await query(
          `INSERT INTO restaurant_users (
            restaurant_id, branch_id, name, email, phone, role, pin_hash, is_active, created_at, updated_at
          ) VALUES (
            $1, $2, 'Platform Super Admin', 'superadmin@starters4u.in', '+918179620607', 'SUPER_ADMIN', $3, TRUE, NOW(), NOW()
          ) ON CONFLICT (restaurant_id, email) DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            role = EXCLUDED.role,
            is_active = TRUE,
            updated_at = NOW();`,
          [restaurantId, branchId, hashedSuper]
        );
        console.info('[AuthService] Initialized platform super admin (superadmin@starters4u.in).');
      }

      // Initialize Test Restaurant Admin (for multi-tenant testing & isolation verification)
      const testRestaurantId = 'a0000000-0000-0000-0000-000000000002';
      const testBranchId = 'b0000000-0000-0000-0000-000000000002';
      const testAdminEmail = 'admin@testrestaurant.com';
      const testAdminPin = '8888';

      const checkTestAdmin = await query(
        `SELECT id FROM restaurant_users WHERE restaurant_id = $1 AND LOWER(email) = $2 LIMIT 1`,
        [testRestaurantId, testAdminEmail]
      );
      if (checkTestAdmin.rows.length === 0) {
        const hashedTest = await hashPassword(testAdminPin, 12);
        await query(
          `INSERT INTO restaurant_users (
            restaurant_id, branch_id, name, email, phone, role, pin_hash, is_active, created_at, updated_at
          ) VALUES (
            $1, $2, 'Test Restaurant Admin', $3, '+919876543210', 'RESTAURANT_ADMIN', $4, TRUE, NOW(), NOW()
          ) ON CONFLICT (restaurant_id, email) DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            is_active = TRUE,
            updated_at = NOW();`,
          [testRestaurantId, testBranchId, testAdminEmail, hashedTest]
        );
        console.info('[AuthService] Initialized test restaurant admin (admin@testrestaurant.com).');
      }
    } catch (err: any) {
      console.error('[AuthService] Error initializing admin users in PG:', err.message);
    }
  }

  // Also ensure in-memory users have bcrypt hash
  const existingMozzAdmin = inMemoryDb.restaurant_users.find(u => u.email === 'admin@mozzpizzateria.com');
  if (!existingMozzAdmin) {
    const hashed = await hashPassword('8888', 10);
    inMemoryDb.restaurant_users.push({
      id: 'c0000000-0000-0000-0000-000000000001',
      restaurant_id: DEFAULT_RESTAURANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      name: 'Store Manager (Admin)',
      email: 'admin@mozzpizzateria.com',
      phone: '+918179620607',
      role: 'RESTAURANT_OWNER',
      pin_hash: hashed,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const existingSuper = inMemoryDb.restaurant_users.find(u => u.email === 'superadmin@starters4u.in');
  if (!existingSuper) {
    const hashedSuper = await hashPassword('9999', 10);
    inMemoryDb.restaurant_users.push({
      id: 's0000000-0000-0000-0000-000000000001',
      restaurant_id: DEFAULT_RESTAURANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      name: 'Platform Super Admin',
      email: 'superadmin@starters4u.in',
      phone: '+918179620607',
      role: 'SUPER_ADMIN',
      pin_hash: hashedSuper,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const existingTestAdmin = inMemoryDb.restaurant_users.find(u => u.email === 'admin@testrestaurant.com');
  if (!existingTestAdmin) {
    const hashedTest = await hashPassword('8888', 10);
    inMemoryDb.restaurant_users.push({
      id: 'u0000000-0000-0000-0000-000000000002',
      restaurant_id: 'a0000000-0000-0000-0000-000000000002',
      branch_id: 'b0000000-0000-0000-0000-000000000002',
      name: 'Test Restaurant Admin',
      email: 'admin@testrestaurant.com',
      phone: '+919876543210',
      role: 'RESTAURANT_ADMIN',
      pin_hash: hashedTest,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

/**
 * Authenticates an admin user using email + PIN/password.
 * Validates against PostgreSQL or in-memory fallback, and returns signed JWT.
 */
export async function authenticateAdminUser(
  email: string,
  passwordOrPin: string,
  restaurantSlug?: string
): Promise<AdminLoginResult> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPass = (passwordOrPin || '').trim();

  if (!cleanEmail) {
    return { success: false, message: 'Email address is required.' };
  }
  if (!cleanPass) {
    return { success: false, message: 'Password or PIN is required.' };
  }

  // 1. Check in PostgreSQL if active
  if (isPostgresRunning()) {
    try {
      const sql = `
        SELECT u.id, u.restaurant_id, u.branch_id, u.name, u.email, u.role, u.pin_hash, u.is_active,
               r.name as restaurant_name, r.slug as restaurant_slug, r.logo_url, r.currency,
               b.name as branch_name
        FROM restaurant_users u
        LEFT JOIN restaurants r ON u.restaurant_id = r.id
        LEFT JOIN restaurant_branches b ON u.branch_id = b.id
        WHERE LOWER(u.email) = $1 AND u.is_active = TRUE
        LIMIT 1;
      `;
      const res = await query(sql, [cleanEmail]);

      if (res.rows.length > 0) {
        const row = res.rows[0];
        const isMatch = await verifyPassword(cleanPass, row.pin_hash);

        if (isMatch) {
          // Normalize role
          let role = row.role;
          if (role === 'admin' || role === 'owner') role = 'RESTAURANT_OWNER';
          if (role === 'manager') role = 'BRANCH_MANAGER';
          if (role === 'cashier') role = 'CASHIER';
          if (role === 'chef' || role === 'kitchen') role = 'KITCHEN';
          if (role === 'superadmin' || role === 'super_admin') role = 'SUPER_ADMIN';

          const authUser: AuthenticatedUser = {
            userId: row.id,
            name: row.name,
            email: row.email,
            role,
            restaurantId: row.restaurant_id,
            branchId: row.branch_id || undefined,
            restaurantName: row.restaurant_name || 'MOZZ Pizzateria',
            branchName: row.branch_name || 'Main Outlet',
            restaurantSlug: row.restaurant_slug || 'mozz',
          };

          const token = signAuthToken(authUser);

          return {
            success: true,
            token,
            user: authUser,
            restaurant: {
              id: row.restaurant_id,
              name: row.restaurant_name || 'MOZZ Pizzateria',
              slug: row.restaurant_slug || 'mozz',
              logoUrl: row.logo_url,
              currency: row.currency || 'INR',
            },
          };
        }
      }
    } catch (err: any) {
      console.error('[AuthService] PostgreSQL auth error:', err.message);
    }
  }

  // 2. In-Memory Store Authentication (Fallback)
  const user = inMemoryDb.restaurant_users.find(
    (u) => u.email.toLowerCase() === cleanEmail && u.is_active
  );

  if (user) {
    let isValid = false;
    if (user.pin_hash && (user.pin_hash.startsWith('$2a$') || user.pin_hash.startsWith('$2b$'))) {
      isValid = await verifyPassword(cleanPass, user.pin_hash);
    } else {
      // In production, unhashed plain text PINs are strictly disallowed
      if (process.env.NODE_ENV === 'production') {
        isValid = false;
      } else {
        isValid = await verifyPassword(cleanPass, user.pin_hash);
      }
    }

    if (isValid) {
      const rest = inMemoryDb.restaurants.find((r) => r.id === user.restaurant_id) || {
        id: DEFAULT_RESTAURANT_ID,
        name: 'MOZZ Chinese & Pizzateria',
        slug: 'mozz',
        currency: 'INR',
      };
      const branch = inMemoryDb.restaurant_branches.find((b) => b.id === user.branch_id);

      let role = user.role;
      if (role === 'admin' || role === 'owner') role = 'RESTAURANT_OWNER';
      if (role === 'manager') role = 'BRANCH_MANAGER';
      if (role === 'cashier') role = 'CASHIER';
      if (role === 'chef' || role === 'kitchen') role = 'KITCHEN';
      if (role === 'superadmin' || role === 'super_admin') role = 'SUPER_ADMIN';

      const authUser: AuthenticatedUser = {
        userId: user.id,
        name: user.name,
        email: user.email,
        role,
        restaurantId: user.restaurant_id,
        branchId: user.branch_id || undefined,
        restaurantName: rest.name,
        branchName: branch?.name || 'Main Outlet',
        restaurantSlug: rest.slug,
      };

      const token = signAuthToken(authUser);

      return {
        success: true,
        token,
        user: authUser,
        restaurant: {
          id: rest.id,
          name: rest.name,
          slug: rest.slug,
          currency: rest.currency || 'INR',
        },
      };
    }
  }

  // Generic secure failure response (prevents account enumeration and eliminates backdoors)
  return {
    success: false,
    message: 'Invalid credentials. Please verify your email and password or PIN.',
  };
}

/**
 * Backward-compatible wrapper for authenticateAdmin
 */
export async function authenticateAdmin(
  pin: string,
  email: string = 'admin@mozzpizzateria.com',
  _restaurantId?: string
): Promise<AdminLoginResult> {
  return authenticateAdminUser(email, pin);
}
