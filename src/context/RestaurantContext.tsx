import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { PublicRestaurantProfile, PublicRestaurantBranch } from '../types';
import { BUSINESS_INFO } from '../config/businessInfo';

export interface RestaurantContextType {
  restaurant: PublicRestaurantProfile | null;
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  tagline: string;
  logoUrl: string;
  bannerUrl: string;
  phone: string;
  email: string;
  address: string;
  defaultBranchId: string;
  selectedBranchId: string;
  selectedBranch: PublicRestaurantBranch | null;
  availableBranches: PublicRestaurantBranch[];
  setSelectedBranchId: (branchId: string) => void;
  // Delivery & Service settings
  isDeliveryEnabled: boolean;
  isTakeawayEnabled: boolean;
  isDineInEnabled: boolean;
  deliveryRadiusKm: number;
  deliveryFee: number;
  minOrderFreeDelivery: number;
  estimatedDeliveryMinutes: number;
  // Payment settings
  isCashEnabled: boolean;
  isUpiEnabled: boolean;
  upiId: string;
  directUpiEnabled: boolean;
  directUpiProvider?: string;
  merchantUpiId?: string;
  merchantDisplayName?: string;
  isOnlineEnabled: boolean;
  isRazorpayEnabled: boolean;
  razorpayKeyId?: string;
  // Status flags
  isFlagship: boolean;
  isSuspended: boolean;
  isActive: boolean;
  isLoadingRestaurant: boolean;
  restaurantNotFound: boolean;
  isTenantRoute: boolean;
  basePath: string; // e.g. '/r/test-restaurant' or ''
  getTenantUrl: (subpath: string) => string;
  refreshRestaurant: () => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export const DEFAULT_FLAGSHIP_SLUG = 'mozz';
export const DEFAULT_FLAGSHIP_ID = 'a0000000-0000-0000-0000-000000000001';
export const DEFAULT_FLAGSHIP_BRANCH_ID = 'b0000000-0000-0000-0000-000000000001';

export function extractRestaurantSlug(pathname: string): string | null {
  const match = pathname.match(/^\/r\/([a-zA-Z0-9_-]+)/);
  return match ? match[1].toLowerCase() : null;
}

interface RestaurantProviderProps {
  children: React.ReactNode;
  currentPath?: string;
}

export const RestaurantProvider: React.FC<RestaurantProviderProps> = ({ children, currentPath }) => {
  const [pathname, setPathname] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return currentPath || '/';
  });

  // Listen to popstate to keep pathname in sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePop = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Sync if currentPath prop updates
  useEffect(() => {
    if (currentPath && currentPath !== pathname) {
      setPathname(currentPath);
    }
  }, [currentPath]);

  const matchedSlug = useMemo(() => extractRestaurantSlug(pathname), [pathname]);
  const isTenantRoute = Boolean(matchedSlug);
  const targetSlug = matchedSlug || DEFAULT_FLAGSHIP_SLUG;

  const [restaurant, setRestaurant] = useState<PublicRestaurantProfile | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [isLoadingRestaurant, setIsLoadingRestaurant] = useState<boolean>(true);
  const [restaurantNotFound, setRestaurantNotFound] = useState<boolean>(false);

  const fetchRestaurant = useCallback(async () => {
    setIsLoadingRestaurant(true);
    setRestaurantNotFound(false);

    try {
      const res = await fetch(`/api/public/restaurants/${encodeURIComponent(targetSlug)}`);
      if (res.status === 404) {
        setRestaurant(null);
        setRestaurantNotFound(true);
        setIsLoadingRestaurant(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to fetch restaurant (${res.status})`);
      }

      const data: PublicRestaurantProfile = await res.json();
      setRestaurant(data);
      setRestaurantNotFound(false);

      // Set initial branch
      const activeBranches = (data.branches || []).filter((b) => b.isActive);
      const defaultBranch =
        data.defaultBranchId || (activeBranches.length > 0 ? activeBranches[0].id : DEFAULT_FLAGSHIP_BRANCH_ID);
      setSelectedBranchId(defaultBranch);
    } catch (err) {
      console.error('[RestaurantContext] Error fetching restaurant profile:', err);
      // If root/mozz fails, fallback to hardcoded business info gracefully
      if (targetSlug === DEFAULT_FLAGSHIP_SLUG && !isTenantRoute) {
        const fallbackAddress =
          BUSINESS_INFO.fullAddress ||
          BUSINESS_INFO.streetAddress ||
          `${BUSINESS_INFO.locality}, ${BUSINESS_INFO.city}, ${BUSINESS_INFO.state}`;
        const fallbackPhone = BUSINESS_INFO.telephone || '+91 99999 99999';
        const fallbackEmail = BUSINESS_INFO.email || 'support@starters4u.in';

        setRestaurant({
          id: DEFAULT_FLAGSHIP_ID,
          name: BUSINESS_INFO.restaurantName,
          slug: DEFAULT_FLAGSHIP_SLUG,
          tagline: BUSINESS_INFO.tagline,
          logoUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200',
          bannerUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200',
          phone: fallbackPhone,
          email: fallbackEmail,
          address: fallbackAddress,
          currency: 'INR',
          taxRate: 5.0,
          status: 'active',
          defaultBranchId: DEFAULT_FLAGSHIP_BRANCH_ID,
          settings: {
            isDeliveryEnabled: true,
            isTakeawayEnabled: true,
            isDineInEnabled: true,
            isCounterEnabled: true,
            deliveryRadiusKm: 12,
            deliveryFee: 30,
            minOrderFreeDelivery: 299,
            estimatedDeliveryMinutes: 35,
          },
          paymentSettings: {
            isCashEnabled: true,
            isUpiEnabled: true,
            upiId: '817962067@okbizaxis',
            directUpiEnabled: true,
            directUpiProvider: 'GOOGLE_PAY_BUSINESS',
            merchantUpiId: '817962067@okbizaxis',
            merchantDisplayName: 'MOZZ Chinese & Pizzateria',
            isOnlineEnabled: true,
            isRazorpayEnabled: true,
            activePaymentMode: 'ALL',
            acceptedCurrencies: ['INR'],
          },
          branches: [
            {
              id: DEFAULT_FLAGSHIP_BRANCH_ID,
              name: 'Gachibowli Flagship',
              slug: 'gachibowli',
              address: fallbackAddress,
              deliveryRadiusKm: 12,
              phone: fallbackPhone,
              isActive: true,
            },
          ],
        });
        setSelectedBranchId(DEFAULT_FLAGSHIP_BRANCH_ID);
        setRestaurantNotFound(false);
      } else {
        setRestaurantNotFound(true);
      }
    } finally {
      setIsLoadingRestaurant(false);
    }
  }, [targetSlug, isTenantRoute]);

  useEffect(() => {
    fetchRestaurant();
  }, [fetchRestaurant]);

  const basePath = useMemo(() => {
    return isTenantRoute && targetSlug ? `/r/${targetSlug}` : '';
  }, [isTenantRoute, targetSlug]);

  const getTenantUrl = useCallback(
    (subpath: string) => {
      const clean = subpath.startsWith('/') ? subpath : `/${subpath}`;
      const slug = (targetSlug || DEFAULT_FLAGSHIP_SLUG).toLowerCase();
      if (clean === '/menu') {
        return `/r/${slug}/menu`;
      }
      if (clean.startsWith('/menu?')) {
        return `/r/${slug}/menu${clean.slice(5)}`;
      }
      if (!isTenantRoute) return clean;
      if (clean === '/' || clean === '') return `/r/${targetSlug}`;
      return `/r/${targetSlug}${clean}`;
    },
    [isTenantRoute, targetSlug]
  );

  const availableBranches = useMemo(() => {
    return (restaurant?.branches || []).filter((b) => b.isActive);
  }, [restaurant]);

  // Derive active branch address / details if branch selected
  const activeBranch = useMemo(() => {
    return availableBranches.find((b) => b.id === selectedBranchId) || availableBranches[0];
  }, [availableBranches, selectedBranchId]);

  const value: RestaurantContextType = useMemo(() => {
    const isSuspended = restaurant?.status === 'suspended';
    const isActive = restaurant?.status === 'active';

    const deliverySettings = restaurant?.deliverySettings;
    const generalSettings = restaurant?.settings;
    const paymentSettings = restaurant?.paymentSettings;

    const fallbackAddress =
      BUSINESS_INFO.fullAddress ||
      BUSINESS_INFO.streetAddress ||
      `${BUSINESS_INFO.locality}, ${BUSINESS_INFO.city}, ${BUSINESS_INFO.state}`;
    const fallbackPhone = BUSINESS_INFO.telephone || '+91 99999 99999';
    const fallbackEmail = BUSINESS_INFO.email || 'support@starters4u.in';

    return {
      restaurant,
      restaurantId: restaurant?.id || DEFAULT_FLAGSHIP_ID,
      restaurantSlug: restaurant?.slug || targetSlug,
      restaurantName: restaurant?.name || BUSINESS_INFO.restaurantName,
      tagline: restaurant?.tagline || BUSINESS_INFO.tagline,
      logoUrl:
        restaurant?.logoUrl ||
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200',
      bannerUrl:
        restaurant?.bannerUrl ||
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200',
      phone: activeBranch?.phone || restaurant?.phone || fallbackPhone,
      email: restaurant?.email || fallbackEmail,
      address: activeBranch?.address || restaurant?.address || fallbackAddress,
      defaultBranchId: restaurant?.defaultBranchId || DEFAULT_FLAGSHIP_BRANCH_ID,
      selectedBranchId: selectedBranchId || activeBranch?.id || DEFAULT_FLAGSHIP_BRANCH_ID,
      selectedBranch: activeBranch || null,
      availableBranches,
      setSelectedBranchId,
      isDeliveryEnabled:
        deliverySettings?.isDeliveryEnabled ?? generalSettings?.isDeliveryEnabled ?? true,
      isTakeawayEnabled:
        deliverySettings?.isTakeawayEnabled ?? generalSettings?.isTakeawayEnabled ?? true,
      isDineInEnabled: generalSettings?.isDineInEnabled ?? true,
      deliveryRadiusKm:
        activeBranch?.deliveryRadiusKm ??
        deliverySettings?.deliveryRadiusKm ??
        generalSettings?.deliveryRadiusKm ??
        12,
      deliveryFee: deliverySettings?.deliveryFee ?? generalSettings?.deliveryFee ?? 30,
      minOrderFreeDelivery:
        deliverySettings?.minOrderFreeDelivery ??
        generalSettings?.minOrderFreeDelivery ??
        299,
      estimatedDeliveryMinutes:
        deliverySettings?.estimatedDeliveryMinutes ??
        generalSettings?.estimatedDeliveryMinutes ??
        35,
      isCashEnabled: paymentSettings?.isCashEnabled ?? true,
      isUpiEnabled: paymentSettings?.isUpiEnabled ?? true,
      upiId: paymentSettings?.merchantUpiId || paymentSettings?.upiId || '817962067@okbizaxis',
      directUpiEnabled: paymentSettings?.directUpiEnabled ?? true,
      directUpiProvider: paymentSettings?.directUpiProvider || 'GOOGLE_PAY_BUSINESS',
      merchantUpiId: paymentSettings?.merchantUpiId || paymentSettings?.upiId || '817962067@okbizaxis',
      merchantDisplayName: paymentSettings?.merchantDisplayName || 'MOZZ Chinese & Pizzateria',
      isOnlineEnabled: paymentSettings?.isOnlineEnabled ?? true,
      isRazorpayEnabled: paymentSettings?.isRazorpayEnabled ?? true,
      razorpayKeyId: paymentSettings?.razorpayKeyId,
      isFlagship: !isTenantRoute || targetSlug === DEFAULT_FLAGSHIP_SLUG,
      isSuspended,
      isActive,
      isLoadingRestaurant,
      restaurantNotFound,
      isTenantRoute,
      basePath,
      getTenantUrl,
      refreshRestaurant: fetchRestaurant,
    };
  }, [
    restaurant,
    targetSlug,
    activeBranch,
    availableBranches,
    selectedBranchId,
    isLoadingRestaurant,
    restaurantNotFound,
    isTenantRoute,
    basePath,
    getTenantUrl,
    fetchRestaurant,
  ]);

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
};

const DEFAULT_FALLBACK_RESTAURANT_CONTEXT: RestaurantContextType = {
  restaurant: null,
  restaurantId: DEFAULT_FLAGSHIP_ID,
  restaurantSlug: DEFAULT_FLAGSHIP_SLUG,
  restaurantName: BUSINESS_INFO.restaurantName,
  tagline: BUSINESS_INFO.tagline,
  logoUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200',
  bannerUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200',
  phone: BUSINESS_INFO.telephone || '+91 99999 99999',
  email: BUSINESS_INFO.email || 'support@starters4u.in',
  address:
    BUSINESS_INFO.fullAddress ||
    BUSINESS_INFO.streetAddress ||
    `${BUSINESS_INFO.locality}, ${BUSINESS_INFO.city}, ${BUSINESS_INFO.state}`,
  defaultBranchId: DEFAULT_FLAGSHIP_BRANCH_ID,
  selectedBranchId: DEFAULT_FLAGSHIP_BRANCH_ID,
  selectedBranch: null,
  availableBranches: [],
  setSelectedBranchId: () => {},
  isDeliveryEnabled: true,
  isTakeawayEnabled: true,
  isDineInEnabled: true,
  deliveryRadiusKm: 12,
  deliveryFee: 30,
  minOrderFreeDelivery: 299,
  estimatedDeliveryMinutes: 35,
  isCashEnabled: true,
  isUpiEnabled: true,
  upiId: '817962067@okbizaxis',
  directUpiEnabled: true,
  directUpiProvider: 'GOOGLE_PAY_BUSINESS',
  merchantUpiId: '817962067@okbizaxis',
  merchantDisplayName: 'MOZZ Chinese & Pizzateria',
  isOnlineEnabled: true,
  isRazorpayEnabled: true,
  razorpayKeyId: undefined,
  isFlagship: true,
  isSuspended: false,
  isActive: true,
  isLoadingRestaurant: false,
  restaurantNotFound: false,
  isTenantRoute: false,
  basePath: '',
  getTenantUrl: (subpath: string) => subpath,
  refreshRestaurant: async () => {},
};

export function useRestaurant(): RestaurantContextType {
  const ctx = useContext(RestaurantContext);
  if (!ctx) {
    return DEFAULT_FALLBACK_RESTAURANT_CONTEXT;
  }
  return ctx;
}
