import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AdminUser {
  userId: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'RESTAURANT_OWNER' | 'BRANCH_MANAGER' | 'CASHIER' | 'KITCHEN' | string;
  restaurantId: string;
  branchId?: string;
  restaurantName?: string;
  branchName?: string;
  restaurantSlug?: string;
}

export interface RestaurantInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  currency: string;
}

interface AdminAuthContextType {
  user: AdminUser | null;
  restaurant: RestaurantInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, passwordOrPin: string, restaurantSlug?: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  refreshProfile: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

const LOCAL_STORAGE_TOKEN_KEY = 'starters4u_admin_jwt_token';
const LOCAL_STORAGE_USER_KEY = 'starters4u_admin_user_profile';

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<AdminUser | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Authenticated fetch wrapper that automatically appends Authorization header
  const adminFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(init.headers || {});
      const activeToken =
        token || (typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY) : null);
      if (activeToken) {
        headers.set('Authorization', `Bearer ${activeToken}`);
      }
      if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }
      return fetch(input, {
        ...init,
        headers,
      });
    },
    [token]
  );

  // Verify and refresh active session with the backend server
  const refreshProfile = useCallback(async () => {
    const activeToken =
      token || (typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY) : null);

    if (!activeToken) {
      setUser(null);
      setRestaurant(null);
      setIsVerified(false);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/me', {
        headers: {
          Authorization: `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setToken(activeToken);
          setIsVerified(true);
          try {
            localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, activeToken);
            localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(data.user));
          } catch {}

          if (data.restaurant) {
            setRestaurant(data.restaurant);
          } else if (data.user?.restaurantId) {
            setRestaurant({
              id: data.user.restaurantId,
              name: data.user.restaurantName || 'Restaurant Admin',
              slug: data.user.restaurantSlug || 'restaurant',
              currency: 'INR',
            });
          }
        } else {
          throw new Error('User payload missing');
        }
      } else {
        // Token invalid, expired, or rejected by server: clear all credentials immediately
        setToken(null);
        setUser(null);
        setRestaurant(null);
        setIsVerified(false);
        try {
          localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
          localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
        } catch {}
      }
    } catch (err) {
      console.warn('[AdminAuth] Notice verifying session profile with server:', err);
      // Fail closed: do not grant access if server validation fails
      setToken(null);
      setUser(null);
      setRestaurant(null);
      setIsVerified(false);
      try {
        localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
        localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      } catch {}
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = async (
    email: string,
    passwordOrPin: string,
    restaurantSlug?: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: passwordOrPin.trim(),
          pin: passwordOrPin.trim(),
          restaurantSlug,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success && data.token) {
        setToken(data.token);
        setUser(data.user);
        setIsVerified(true);
        if (data.restaurant) {
          setRestaurant(data.restaurant);
        }
        try {
          localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, data.token);
          localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(data.user));
        } catch {}
        return { success: true };
      }

      return {
        success: false,
        message: data.error || data.message || 'Invalid credentials. Please verify your email and password.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Network error while attempting to log in.',
      };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setToken(null);
    setUser(null);
    setRestaurant(null);
    setIsVerified(false);
    try {
      localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    } catch {}
  };

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        restaurant,
        token,
        isAuthenticated: Boolean(token && user && isVerified),
        isLoading,
        login,
        logout,
        adminFetch,
        refreshProfile,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};
