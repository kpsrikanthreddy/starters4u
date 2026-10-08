import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { MenuItem, CartItem, Order, OrderStatus, OrderType, CustomerDetails, PaymentMethod, QRSessionInfo, EntrySource } from '../types';
import { INITIAL_MENU, PROMO_COUPONS } from '../data/menuData';
import { soundService } from '../utils/audio';
import { resolveEntrySourceFromLocation } from '../utils/qrSecurity';
import {
  saveVerifiedQrSession,
  getStoredQrSession,
  clearStoredQrSession,
} from '../utils/customerNavigation';
import { useRestaurant, DEFAULT_FLAGSHIP_ID } from './RestaurantContext';

export interface CrossRestaurantConflict {
  pendingItem: CartItem;
  existingRestaurantName: string;
  newRestaurantName: string;
}

interface StoreContextType {
  menu: MenuItem[];
  cart: CartItem[];
  orders: Order[];
  activeOrderId: string | null;
  activeOrder: Order | null;
  isCartOpen: boolean;
  isCustomizerOpen: boolean;
  selectedCustomizerItem: MenuItem | null;
  appliedCoupon: string | null;
  discountAmount: number;
  orderType: OrderType;
  tableNumber: string;
  qrSession: QRSessionInfo;
  isModeLocked: boolean;
  tableSessionExpired: boolean;
  tableSessionMessage: string | null;
  isQrValidating: boolean;
  isAdminAuthenticated: boolean;
  soundEnabled: boolean;
  customerDetails: CustomerDetails;
  isCustomerVerified: boolean;
  isCustomerModalOpen: boolean;
  isLoadingMenu: boolean;
  isLoadingOrders: boolean;
  
  // Actions
  setOrderType: (type: OrderType) => void;
  setTableNumber: (num: string) => void;
  clearTableSessionExpired: () => void;
  setCustomerDetails: (details: Partial<CustomerDetails>) => void;
  setIsCustomerModalOpen: (open: boolean) => void;
  promptCustomerVerification: (onSuccessAction?: () => void) => boolean;
  setIsCartOpen: (open: boolean) => void;
  openCustomizer: (item: MenuItem) => void;
  closeCustomizer: () => void;
  addToCart: (item: CartItem) => void;
  updateCartQuantity: (cartItemId: string, delta: number) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  applyCoupon: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;
  
  // QR & Entry Session actions
  switchQRSession: (session: Partial<QRSessionInfo>) => void;
  clearQRSession: () => void;
  
  // Order actions
  createOrder: (
    paymentMethod: PaymentMethod,
    paymentId?: string,
    razorpayMeta?: {
      razorpay_order_id?: string;
      razorpay_signature?: string;
      direct_upi?: boolean;
      merchant_upi?: string;
      provider?: string;
      paymentAttemptId?: string;
    },
    forcedPaymentStatus?: 'paid' | 'pending' | 'cod_pending'
  ) => Promise<Order>;
  updateOrderStatus: (orderId: string, newStatus: OrderStatus, note?: string) => Promise<void>;
  updateOrderDeliveryLocation: (orderId: string, location: { latitude: number; longitude: number; address?: string }) => Promise<Order | null>;
  setActiveOrderId: (orderId: string | null) => void;
  fetchOrderById: (orderId: string) => Promise<Order | null>;
  cancelOrder: (orderId: string, reason?: string) => Promise<{ success: boolean; error?: string; order?: Order }>;
  deleteOrder: (orderId: string) => Promise<void>;
  deleteKot: (orderId: string) => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshMenu: () => Promise<void>;
  
  // Admin actions
  loginAdmin: (password: string) => Promise<boolean>;
  logoutAdmin: () => void;
  toggleItemStock: (itemId: string) => Promise<void>;
  updateItemPrice: (itemId: string, newPrice: number | { R: number; C: number; S: number }) => Promise<void>;
  addMenuItem: (item: Omit<MenuItem, 'id'>) => Promise<void>;
  updateMenuItem: (itemId: string, updated: Partial<MenuItem>) => Promise<void>;
  deleteMenuItem: (itemId: string) => Promise<void>;
  resetMenuToDefault: () => Promise<void>;
  toggleSound: () => void;
  
  // Cart calculations
  subtotal: number;
  tax: number;
  deliveryFee: number;
  grandTotal: number;
  itemCount: number;

  // Multi-Restaurant Cart Isolation
  cartRestaurantId: string | null;
  cartRestaurantName: string | null;
  crossRestaurantConflict: CrossRestaurantConflict | null;
  resolveCrossRestaurantConflict: (proceed: boolean) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const LOCAL_STORAGE_KEY_CART = 'mozz_cart_v1';
export const LOCAL_STORAGE_KEY_ACTIVE_ORDER = 'mozz_active_order_id_v1';
export const LOCAL_STORAGE_KEY_CUSTOMER = 'mozz_customer_details_v1';

export const INITIAL_CUSTOMER: CustomerDetails = {
  name: '',
  phone: '',
  address: '',
  landmark: '',
  tableNumber: 'Table 1',
};

export const isTerminalSuccessfulStatus = (status: string | undefined | null): boolean => {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s === 'delivered' || s === 'completed' || s === 'settled';
};

export const clearCustomerOrderSession = () => {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY_ACTIVE_ORDER);
    localStorage.removeItem(LOCAL_STORAGE_KEY_CUSTOMER);
    sessionStorage.removeItem(LOCAL_STORAGE_KEY_ACTIVE_ORDER);
    sessionStorage.removeItem(LOCAL_STORAGE_KEY_CUSTOMER);
  } catch {}
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    restaurant,
    restaurantId,
    restaurantSlug,
    selectedBranchId,
    restaurantName,
    deliveryFee: restaurantDeliveryFee,
    minOrderFreeDelivery,
    isSuspended,
  } = useRestaurant();

  const [tableSessionExpired, setTableSessionExpired] = useState<boolean>(false);
  const [tableSessionMessage, setTableSessionMessage] = useState<string | null>(null);
  const [isQrValidating, setIsQrValidating] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const token = sp.get('token') || sp.get('t');
      if (token) return true;
      const path = window.location.pathname.toLowerCase();
      const match = path.match(/^\/r\/([a-zA-Z0-9_-]+)/);
      const slug = (match ? match[1] : 'mozz').toLowerCase();
      const stored = getStoredQrSession(slug);
      if (stored && stored.token) return true;
    }
    return false;
  });

  const clearTableSessionExpired = useCallback(() => {
    setTableSessionExpired(false);
    setTableSessionMessage(null);
  }, []);

  // Multi-tenant Cart Isolation
  const [cartRestaurantId, setCartRestaurantId] = useState<string | null>(restaurantId || DEFAULT_FLAGSHIP_ID);
  const [cartRestaurantName, setCartRestaurantName] = useState<string | null>(restaurantName || 'MOZZ');
  const [crossRestaurantConflict, setCrossRestaurantConflict] = useState<CrossRestaurantConflict | null>(null);

  const getCartKey = useCallback((rId: string) => {
    return rId === DEFAULT_FLAGSHIP_ID ? LOCAL_STORAGE_KEY_CART : `s4u_cart_${rId}`;
  }, []);

  // Menu state loaded from PostgreSQL API
  const [menu, setMenu] = useState<MenuItem[]>(INITIAL_MENU);
  const [isLoadingMenu, setIsLoadingMenu] = useState(false);

  // Cart state (hydration-safe: starts empty on initial render, hydrated via useEffect)
  const [cart, setCart] = useState<CartItem[]>([]);

  // Orders state loaded from PostgreSQL API
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Active tracked order ID (null by default; only set when an active order is being placed or tracked)
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  // Set to track cleaned terminal orders to ensure cleanup happens exactly once
  const cleanedOrdersRef = useRef<Set<string>>(new Set());

  // Clear completed customer session state from browser storage and memory
  const clearCompletedCustomerSession = useCallback((orderId: string) => {
    if (!orderId) return;
    if (cleanedOrdersRef.current.has(orderId)) return;
    cleanedOrdersRef.current.add(orderId);

    // 1. Clear local and session storage
    clearCustomerOrderSession();

    // 2. Clear in-memory active order reference and customer details
    setActiveOrderId(null);
    setCustomerDetailsState(INITIAL_CUSTOMER);
  }, []);

  // Entry Source & Signed QR Session State
  const [qrSession, setQrSession] = useState<QRSessionInfo>(() => {
    if (typeof window !== 'undefined') {
      return resolveEntrySourceFromLocation(window.location);
    }
    return {
      source: 'online_web',
      orderMode: 'delivery',
      isVerified: true,
      isModeLocked: false,
      verificationMessage: 'Direct Online Website Access',
    };
  });

  const isModeLocked = qrSession.isModeLocked;

  // UI Modals & Settings
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [selectedCustomizerItem, setSelectedCustomizerItem] = useState<MenuItem | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [pendingCustomerAction, setPendingCustomerAction] = useState<(() => void) | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [orderType, setOrderTypeState] = useState<OrderType>(() => qrSession.orderMode || 'delivery');
  const [tableNumber, setTableNumberState] = useState<string>(() => qrSession.tableNumber || 'Table 1');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Admin Authentication state
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);

  // Customer details
  const [customerDetails, setCustomerDetailsState] = useState<CustomerDetails>(INITIAL_CUSTOMER);

  // Client-side hydration of persisted localStorage values (guarantees zero hydration mismatch)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const qOrderId = params.get('orderId') || params.get('order_id');
        const targetOrder = qOrderId || localStorage.getItem(LOCAL_STORAGE_KEY_ACTIVE_ORDER);
        if (targetOrder) {
          fetchOrderById(targetOrder).then((ord) => {
            if (ord) {
              if (isTerminalSuccessfulStatus(ord.status)) {
                clearCompletedCustomerSession(ord.id);
              } else {
                setActiveOrderId(ord.id);
              }
            }
          });
        }
      }
    } catch {}

    try {
      const savedCustomer = localStorage.getItem(LOCAL_STORAGE_KEY_CUSTOMER);
      if (savedCustomer) {
        setCustomerDetailsState(JSON.parse(savedCustomer));
      }
    } catch {}

    // Security hardening: Purge legacy insecure client-side admin flags
    try {
      localStorage.removeItem('mozz_admin_auth_v1');
    } catch {}
  }, []);

  // Tenant-aware Cart Hydration & Switching
  useEffect(() => {
    if (!restaurantId) return;
    try {
      const key = getCartKey(restaurantId);
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed);
          setCartRestaurantId(restaurantId);
          setCartRestaurantName(restaurantName);
          return;
        }
      }
      setCart([]);
      setCartRestaurantId(restaurantId);
      setCartRestaurantName(restaurantName);
    } catch {
      setCart([]);
    }
  }, [restaurantId, restaurantName, getCartKey]);

  // Sync cart to local storage under restaurant's key
  useEffect(() => {
    if (!restaurantId) return;
    try {
      const key = getCartKey(restaurantId);
      if (cart.length > 0) {
        localStorage.setItem(key, JSON.stringify(cart));
        if (restaurantId === DEFAULT_FLAGSHIP_ID) {
          localStorage.setItem(LOCAL_STORAGE_KEY_CART, JSON.stringify(cart));
        }
      } else {
        localStorage.removeItem(key);
        if (restaurantId === DEFAULT_FLAGSHIP_ID) {
          localStorage.removeItem(LOCAL_STORAGE_KEY_CART);
        }
      }
    } catch {}
  }, [cart, restaurantId, getCartKey]);

  // ==========================================================
  // API DATA FETCHING (PostgreSQL as Source of Truth)
  // ==========================================================

  // 1. Fetch Menu from /api/menu (Tenant-scoped)
  const refreshMenu = useCallback(async () => {
    try {
      setIsLoadingMenu(true);
      const params = new URLSearchParams();
      params.set('_t', String(Date.now()));
      if (restaurantId) params.set('restaurantId', restaurantId);
      if (selectedBranchId) params.set('branchId', selectedBranchId);

      const res = await fetch(`/api/menu?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Live PostgreSQL data as source of truth.
          setMenu(data);
        } else {
          console.error('[StoreContext] Invalid payload from GET /api/menu, expected array, got:', typeof data);
        }
      } else {
        console.error(`[StoreContext] Failed to load menu from GET /api/menu. HTTP ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error('[StoreContext] Network exception fetching GET /api/menu:', err);
    } finally {
      setIsLoadingMenu(false);
    }
  }, [restaurantId, selectedBranchId]);

  // Initial & Dependency Load: Load storefront menu
  useEffect(() => {
    refreshMenu();
  }, [refreshMenu]);

  // Fix 2: Auto-validate with backend on load / refresh / popstate
  // Checks token from current URL, then scoped sessionStorage backup.
  // ALWAYS calls backend /api/qr/validate before restoring table or counter session!
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;

    const syncFromUrlAndStorage = async () => {
      const pathname = window.location.pathname.toLowerCase();
      const searchParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = searchParams.get('token') || searchParams.get('t');

      const pathSlugMatch = pathname.match(/^\/r\/([a-zA-Z0-9_-]+)/);
      const currentSlug = (pathSlugMatch ? pathSlugMatch[1] : restaurantSlug || 'mozz').toLowerCase();

      const isTableRoute = pathname.includes('/table/') || searchParams.has('table') || searchParams.has('tableNumber');

      // 1. Identify candidate token
      let candidateToken = tokenFromUrl;

      if (!candidateToken) {
        const stored = getStoredQrSession(currentSlug);
        if (stored && stored.token) {
          candidateToken = stored.token;
        }
      }

      // 2. If a candidate token exists, ALWAYS validate with backend before restoring!
      if (candidateToken) {
        setIsQrValidating(true);
        try {
          const res = await fetch(`/api/qr/validate?token=${encodeURIComponent(candidateToken)}&slug=${encodeURIComponent(currentSlug)}`);
          const data = await res.json();

          if (!isMounted) return;

          if (res.ok && data.valid) {
            // Cross-tenant check: ensure token belongs to current restaurant
            if (data.restaurantSlug && data.restaurantSlug.toLowerCase() !== currentSlug) {
              console.warn('[StoreContext] Cross-restaurant QR token mismatch:', data.restaurantSlug, 'current:', currentSlug);
              clearStoredQrSession(currentSlug);
              setTableSessionExpired(isTableRoute);
              setTableSessionMessage('Your table session is no longer active. Please scan the QR code on your table again.');
              setQrSession({
                source: 'online_web',
                orderMode: 'delivery',
                isVerified: false,
                isModeLocked: false,
                isTableLocked: false,
                verificationMessage: 'Cross-restaurant QR session rejected. Defaulted to standard Delivery.',
              });
              setOrderTypeState('delivery');
              return;
            }

            const isTable = data.source === 'table_qr' || data.orderMode === 'dine_in';

            const verifiedSession: QRSessionInfo = {
              source: data.source,
              orderMode: data.orderMode,
              tableNumber: data.tableNumber,
              tableId: data.tableId,
              restaurantId: data.restaurantId,
              restaurantSlug: currentSlug,
              branchId: data.branchId,
              token: candidateToken,
              isVerified: true,
              isModeLocked: true,
              isTableLocked: isTable,
              verificationMessage: data.message || (isTable ? `Verified Table QR (${data.tableNumber})` : 'Verified Counter QR'),
            };

            setQrSession(verifiedSession);
            setOrderTypeState(data.orderMode);
            if (data.tableNumber) {
              setTableNumberState(data.tableNumber);
            }
            setTableSessionExpired(false);
            setTableSessionMessage(null);

            // Save to sessionStorage backup scoped by restaurant
            saveVerifiedQrSession(currentSlug, verifiedSession);

            // Requirement 1: Keep the signed token in the URL after refresh
            if (!tokenFromUrl && typeof window !== 'undefined') {
              const currentUrl = new URL(window.location.href);
              currentUrl.searchParams.set('token', candidateToken);
              window.history.replaceState({}, '', currentUrl.pathname + currentUrl.search);
            }
            return;
          } else {
            // Token validation failed: invalid, expired, tampered, or table inactive
            clearStoredQrSession(currentSlug);
            const wasTableAttempt = isTableRoute || (candidateToken && candidateToken.includes('.'));
            if (wasTableAttempt) {
              setTableSessionExpired(true);
              setTableSessionMessage('Your table session is no longer active. Please scan the QR code on your table again.');
            }
            setQrSession({
              source: 'online_web',
              orderMode: 'delivery',
              isVerified: false,
              isModeLocked: false,
              isTableLocked: false,
              verificationMessage: 'Your table session is no longer active. Please scan the QR code on your table again.',
            });
            setOrderTypeState('delivery');
          }
        } catch (err) {
          console.warn('[StoreContext] Server QR validation check error:', err);
        } finally {
          if (isMounted) setIsQrValidating(false);
        }
        return;
      }

      // 3. No candidate token in URL and no candidate token in sessionStorage:
      if (isTableRoute) {
        // Unsigned manual table access is rejected
        setTableSessionExpired(true);
        setTableSessionMessage('Your table session is no longer active. Please scan the QR code on your table again.');
        setQrSession({
          source: 'online_web',
          orderMode: 'delivery',
          isVerified: false,
          isModeLocked: false,
          isTableLocked: false,
          verificationMessage: 'Unsigned table URL. Dine-In requires a verified Table QR scan.',
        });
        setOrderTypeState('delivery');
        return;
      }

      // Normal website browsing: default to standard delivery and prevent unverified Dine-In
      setTableSessionExpired(false);
      setTableSessionMessage(null);
      setQrSession({
        source: 'online_web',
        orderMode: 'delivery',
        isVerified: false,
        isModeLocked: false,
        isTableLocked: false,
        verificationMessage: 'Online Customer Web Session',
      });
      setOrderTypeState((prev) => (prev === 'dine_in' ? 'delivery' : prev));
    };

    syncFromUrlAndStorage();
    window.addEventListener('popstate', syncFromUrlAndStorage);
    return () => {
      isMounted = false;
      window.removeEventListener('popstate', syncFromUrlAndStorage);
    };
  }, [restaurantSlug]);

  const setOrderType = (type: OrderType) => {
    if (isModeLocked) {
      console.warn(`Order mode is locked to ${qrSession.orderMode} (${qrSession.source}) by verified QR scan.`);
      return;
    }
    // Dine-In is strictly forbidden unless customer entered via verified Table QR
    if (type === 'dine_in' && (qrSession.source !== 'table_qr' || !qrSession.isVerified)) {
      console.warn('Dine-In is only allowed when ordering from a verified restaurant Table QR code.');
      return;
    }
    setOrderTypeState(type);
  };

  const setTableNumber = (num: string) => {
    if (isModeLocked && qrSession.tableNumber) {
      console.warn(`Table number is locked to ${qrSession.tableNumber} by verified QR scan.`);
      return;
    }
    setTableNumberState(num);
  };

  const switchQRSession = (newSession: Partial<QRSessionInfo>) => {
    const src = newSession.source || 'table_qr';
    const mode = newSession.orderMode || (src === 'table_qr' ? 'dine_in' : src === 'counter_qr' ? 'takeaway' : 'delivery');
    const cleanTable = newSession.tableNumber ? `Table ${newSession.tableNumber.replace(/^Table\s*/i, '')}` : (src === 'table_qr' ? 'Table 1' : undefined);

    const updated: QRSessionInfo = {
      source: src,
      orderMode: mode,
      tableNumber: cleanTable,
      token: newSession.token,
      isVerified: newSession.isVerified ?? true,
      isModeLocked: newSession.isModeLocked ?? (src !== 'online_web'),
      verificationMessage: newSession.verificationMessage || (src === 'table_qr' ? `Authenticated ${cleanTable} (Dine-In Session)` : src === 'counter_qr' ? 'Authenticated Counter (Takeaway Session)' : 'Online Customer (Home Delivery)'),
      signature: newSession.signature,
    };

    setQrSession(updated);
    setOrderTypeState(updated.orderMode);
    if (updated.tableNumber) {
      setTableNumberState(updated.tableNumber);
    }
    soundService.playChime('pop');
  };

  const clearQRSession = () => {
    const slug = (restaurantSlug || 'mozz').toLowerCase();
    clearStoredQrSession(slug);
    setTableSessionExpired(false);
    setTableSessionMessage(null);
    const defaultWeb: QRSessionInfo = {
      source: 'online_web',
      orderMode: 'delivery',
      isVerified: false,
      isModeLocked: false,
      isTableLocked: false,
      verificationMessage: 'Direct Online Customer (Home Delivery)',
    };
    setQrSession(defaultWeb);
    setOrderTypeState('delivery');
    soundService.playChime('pop');
  };

  // Local storage sync for activeOrderId

  useEffect(() => {
    try {
      if (activeOrderId) {
        localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_ORDER, activeOrderId);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY_ACTIVE_ORDER);
      }
    } catch {}
  }, [activeOrderId]);

  useEffect(() => {
    try {
      if (customerDetails.name?.trim() || customerDetails.phone?.trim()) {
        localStorage.setItem(LOCAL_STORAGE_KEY_CUSTOMER, JSON.stringify(customerDetails));
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY_CUSTOMER);
      }
    } catch {}
  }, [customerDetails]);

  // Proactive listener: If the current active order reaches terminal successful status (delivered/completed/settled),
  // automatically clear the browser customer session immediately.
  useEffect(() => {
    if (!activeOrderId) return;
    const currentActive = orders.find((o) => o.id === activeOrderId);
    if (currentActive && isTerminalSuccessfulStatus(currentActive.status)) {
      clearCompletedCustomerSession(currentActive.id);
    }
  }, [orders, activeOrderId, clearCompletedCustomerSession]);

  // Sync sound service
  useEffect(() => {
    soundService.setSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      soundService.setSoundEnabled(next);
      return next;
    });
  };

  const isCustomerVerified = Boolean(
    customerDetails.name &&
    customerDetails.name.trim().length >= 2 &&
    customerDetails.phone &&
    /^[6-9]\d{9}$/.test(customerDetails.phone.trim().replace(/\D/g, ''))
  );

  const promptCustomerVerification = (onSuccessAction?: () => void): boolean => {
    if (isCustomerVerified) {
      if (onSuccessAction) onSuccessAction();
      return true;
    }
    if (onSuccessAction) {
      setPendingCustomerAction(() => onSuccessAction);
    }
    setIsCustomerModalOpen(true);
    return false;
  };

  const setCustomerDetails = (details: Partial<CustomerDetails>) => {
    setCustomerDetailsState((prev) => {
      const updated = { ...prev, ...details };
      const cleanPhone = (updated.phone || '').trim().replace(/\D/g, '');
      const validPhone = /^[6-9]\d{9}$/.test(cleanPhone);
      if (
        updated.name &&
        updated.name.trim().length >= 2 &&
        validPhone &&
        pendingCustomerAction
      ) {
        setTimeout(() => {
          if (pendingCustomerAction) {
            pendingCustomerAction();
            setPendingCustomerAction(null);
          }
        }, 50);
      }
      return updated;
    });
  };

  // Cart operations
  const addToCart = (newItem: CartItem) => {
    if (isSuspended) {
      soundService.playChime('pop');
      alert(`${restaurantName || 'This restaurant'} is currently suspended and not accepting new orders.`);
      return;
    }

    // Cross-restaurant conflict detection
    if (cart.length > 0 && cartRestaurantId && cartRestaurantId !== restaurantId) {
      setCrossRestaurantConflict({
        pendingItem: newItem,
        existingRestaurantName: cartRestaurantName || 'another restaurant',
        newRestaurantName: restaurantName || 'this restaurant',
      });
      return;
    }

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (i) =>
          i.menuItem.id === newItem.menuItem.id &&
          i.selectedShape === newItem.selectedShape &&
          i.selectedCrust === newItem.selectedCrust &&
          i.spiceLevel === newItem.spiceLevel &&
          JSON.stringify(i.addons) === JSON.stringify(newItem.addons) &&
          (i.specialInstructions || '') === (newItem.specialInstructions || '')
      );

      if (existingIdx > -1) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: next[existingIdx].quantity + newItem.quantity,
        };
        return next;
      }
      return [...prev, newItem];
    });
    setCartRestaurantId(restaurantId);
    setCartRestaurantName(restaurantName);
    soundService.playChime('pop');
  };

  const resolveCrossRestaurantConflict = (proceed: boolean) => {
    if (!crossRestaurantConflict) return;
    if (proceed) {
      if (cartRestaurantId) {
        try {
          localStorage.removeItem(getCartKey(cartRestaurantId));
          if (cartRestaurantId === DEFAULT_FLAGSHIP_ID) {
            localStorage.removeItem(LOCAL_STORAGE_KEY_CART);
          }
        } catch {}
      }
      const item = crossRestaurantConflict.pendingItem;
      setCart([item]);
      setCartRestaurantId(restaurantId);
      setCartRestaurantName(restaurantName);
      setAppliedCoupon(null);
      setCrossRestaurantConflict(null);
      soundService.playChime('pop');
    } else {
      setCrossRestaurantConflict(null);
    }
  };

  const updateCartQuantity = (cartItemId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.cartItemId === cartItemId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
    soundService.playChime('pop');
  };

  const removeFromCart = (cartItemId: string) => {
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  };

  const clearCart = () => {
    setCart([]);
    setAppliedCoupon(null);
  };

  // Customizer modal
  const openCustomizer = (item: MenuItem) => {
    setSelectedCustomizerItem(item);
    setIsCustomizerOpen(true);
  };

  const closeCustomizer = () => {
    setIsCustomizerOpen(false);
    setSelectedCustomizerItem(null);
  };

  // Pricing calculations
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const freeThreshold = minOrderFreeDelivery ?? 299;
  const standardFee = restaurantDeliveryFee ?? 30;
  const deliveryFee = orderType === 'delivery' ? (subtotal >= freeThreshold || subtotal === 0 ? 0 : standardFee) : 0;
  const taxRate = restaurant?.taxRate ?? 5.0;
  const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;

  let discountAmount = 0;
  if (appliedCoupon && subtotal > 0) {
    const coupon = PROMO_COUPONS.find((c) => c.code.toUpperCase() === appliedCoupon.toUpperCase());
    if (coupon && subtotal >= coupon.minOrder) {
      if (coupon.discountType === 'percentage') {
        discountAmount = Math.round((subtotal * coupon.discountValue) / 100);
      } else {
        discountAmount = coupon.discountValue;
      }
    }
  }

  const grandTotal = Math.max(0, Math.round((subtotal + tax + deliveryFee - discountAmount) * 100) / 100);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const applyCoupon = (code: string) => {
    const found = PROMO_COUPONS.find((c) => c.code.toUpperCase() === code.trim().toUpperCase());
    if (!found) {
      return { success: false, message: 'Invalid promo code. Try MOZZFIRST or KOREANLOVE!' };
    }
    if (subtotal < found.minOrder) {
      return { success: false, message: `Minimum order value of ₹${found.minOrder} required for ${found.code}.` };
    }
    setAppliedCoupon(found.code);
    soundService.playChime('success');
    return { success: true, message: `Coupon ${found.code} applied successfully!` };
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
  };

  // ==========================================================
  // ORDER CREATION (PostgreSQL Transaction via POST /api/orders)
  // ==========================================================
  const createOrder = async (
    paymentMethod: PaymentMethod,
    paymentId?: string,
    razorpayMeta?: {
      razorpay_order_id?: string;
      razorpay_signature?: string;
      direct_upi?: boolean;
      merchant_upi?: string;
      provider?: string;
      paymentAttemptId?: string;
    },
    forcedPaymentStatus?: 'paid' | 'pending' | 'cod_pending'
  ): Promise<Order> => {
    const calculatedPaymentStatus = forcedPaymentStatus
      ? forcedPaymentStatus
      : paymentMethod === 'cod'
      ? 'cod_pending'
      : paymentId
      ? 'paid'
      : 'pending';

    const payload = {
      restaurantId: restaurantId || DEFAULT_FLAGSHIP_ID,
      branchId: selectedBranchId || undefined,
      items: cart,
      orderType,
      entrySource: qrSession.source,
      tableId: qrSession.tableId,
      tableNumber: orderType === 'dine_in' ? (tableNumber || qrSession.tableNumber || 'Table 1') : undefined,
      qrToken: qrSession.token,
      qrSession,
      customer: {
        ...customerDetails,
        tableNumber: orderType === 'dine_in' ? (tableNumber || qrSession.tableNumber || 'Table 1') : undefined,
      },
      customerLatitude: orderType === 'delivery' ? customerDetails.latitude : undefined,
      customerLongitude: orderType === 'delivery' ? customerDetails.longitude : undefined,
      customerLocationAccuracy: orderType === 'delivery' ? customerDetails.accuracy : undefined,
      customerLocationCapturedAt: orderType === 'delivery' ? customerDetails.locationCapturedAt : undefined,
      customerLocationSource: orderType === 'delivery' ? (customerDetails.locationSource || 'device_gps') : undefined,
      paymentMethod,
      paymentId: paymentId || undefined,
      razorpay_order_id: razorpayMeta?.razorpay_order_id,
      razorpay_signature: razorpayMeta?.razorpay_signature,
      direct_upi: razorpayMeta?.direct_upi,
      merchant_upi: razorpayMeta?.merchant_upi,
      direct_upi_provider: razorpayMeta?.provider,
      paymentStatus: calculatedPaymentStatus,
      couponCode: appliedCoupon || undefined,
      discount: discountAmount,
      deliveryFee,
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to register order in database');
      }

      const createdOrder: Order = await res.json();

      setOrders((prev) => [createdOrder, ...prev.filter((o) => o.id !== createdOrder.id)]);
      setActiveOrderId(createdOrder.id);
      clearCart();
      setIsCartOpen(false);
      soundService.playChime('new_order');

      return createdOrder;
    } catch (err: any) {
      console.error('[StoreContext] Order creation failed:', err);
      throw err;
    }
  };

  // Update order status (strictly updates PostgreSQL; no false optimistic updates on failure)
  const updateOrderStatus = useCallback(async (orderId: string, newStatus: OrderStatus, note?: string) => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, note }),
      });

      if (res.ok) {
        const updatedOrder: Order = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? updatedOrder : o)));
        soundService.playChime('notification');
        if (isTerminalSuccessfulStatus(updatedOrder.status)) {
          clearCompletedCustomerSession(orderId);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[StoreContext] Status update failed on server:', errData.error || res.statusText);
      }
    } catch (err) {
      console.error('[StoreContext] Error updating order status:', err);
    }
  }, [clearCompletedCustomerSession]);

  const cancelOrder = async (
    orderId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string; order?: Order }> => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Cancelled by customer (wrongly placed)' }),
      });
      if (res.ok) {
        const updatedOrder: Order = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? updatedOrder : o)));
        soundService.playChime('notification');
        return { success: true, order: updatedOrder };
      } else {
        const errData = await res.json().catch(() => ({}));
        const errorMsg =
          errData.error || res.statusText || 'Failed to cancel order';
        console.error('[StoreContext] Cancel order failed on server:', errorMsg);
        // Refresh latest order from server so customer view updates to current status
        await fetchOrderById(orderId);
        return { success: false, error: errorMsg };
      }
    } catch (err: any) {
      console.error('[StoreContext] Error cancelling order:', err);
      await fetchOrderById(orderId);
      return { success: false, error: err.message || 'Network error cancelling order' };
    }
  };

  const fetchOrderById = useCallback(async (orderId: string): Promise<Order | null> => {
    if (!orderId) return null;
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
      if (res.ok) {
        const ord: Order = await res.json();
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === ord.id);
          if (exists) {
            return prev.map((o) => (o.id === ord.id ? ord : o));
          }
          return [ord, ...prev];
        });
        if (isTerminalSuccessfulStatus(ord.status)) {
          const savedActive = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY_ACTIVE_ORDER) : null;
          if (savedActive === ord.id || activeOrderId === ord.id) {
            clearCompletedCustomerSession(ord.id);
          }
        }
        return ord;
      }
    } catch (err) {
      console.error('[StoreContext] Error fetching order by ID:', err);
    }
    return null;
  }, [activeOrderId, clearCompletedCustomerSession]);

  const refreshOrders = useCallback(async () => {
    if (activeOrderId) {
      await fetchOrderById(activeOrderId);
    }
  }, [activeOrderId, fetchOrderById]);

  const updateOrderDeliveryLocation = useCallback(
    async (
      orderId: string,
      location: { latitude: number; longitude: number; address?: string }
    ): Promise<Order | null> => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/location`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(location),
        });
        if (res.ok) {
          const updated: Order = await res.json();
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
          return updated;
        }
      } catch (err) {
        console.error('[StoreContext] Error updating delivery location in DB:', err);
      }
      return null;
    },
    []
  );

  const deleteOrder = async (orderId: string) => {
    try {
      await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Failed to delete order from backend:', err);
    }
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
    if (activeOrderId === orderId) {
      setActiveOrderId(null);
    }
    soundService.playChime('pop');
  };

  const deleteKot = async (orderId: string) => {
    try {
      await fetch(`/api/kots/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Failed to delete KOT from backend:', err);
    }
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id === orderId) {
          const { kotNumber, kotStation, ...rest } = order;
          return {
            ...rest,
            kotNumber: undefined,
            kotStation: undefined,
          };
        }
        return order;
      })
    );
    soundService.playChime('pop');
  };

  // Admin authentication (PostgreSQL Bcrypt Authenticated via Backend API)
  const loginAdmin = async (password: string): Promise<boolean> => {
    const clean = password.trim();
    if (!clean) return false;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: clean }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.token) {
          localStorage.setItem('starters4u_admin_jwt_token', data.token);
          if (data.user) {
            localStorage.setItem('starters4u_admin_user_profile', JSON.stringify(data.user));
          }
          setIsAdminAuthenticated(true);
          soundService.playChime('success');
          return true;
        }
      }
    } catch (err) {
      console.warn('Backend login verification notice, attempting fallback check:', err);
    }

    return false;
  };

  const logoutAdmin = () => {
    setIsAdminAuthenticated(false);
  };

  // Admin menu editing connected to PostgreSQL Backend (Authenticated)
  const getAdminAuthHeaders = () => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('starters4u_admin_jwt_token')
        : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const toggleItemStock = async (itemId: string) => {
    // Optimistic UI toggle
    setMenu((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, inStock: !item.inStock } : item))
    );

    try {
      const res = await fetch(`/api/admin/menu/${encodeURIComponent(itemId)}/stock`, {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
      });
      if (res.ok) {
        const updatedItem = await res.json();
        setMenu((prev) => prev.map((item) => (item.id === itemId ? updatedItem : item)));
      } else {
        await refreshMenu();
      }
    } catch (err) {
      console.error('Error updating stock in backend:', err);
      await refreshMenu();
    }
  };

  const updateItemPrice = async (
    itemId: string,
    newPrice: number | { R: number; C: number; S: number }
  ) => {
    const updates: Partial<MenuItem> =
      typeof newPrice === 'number'
        ? { price: newPrice, isPocketPizza: false }
        : { prices: newPrice, isPocketPizza: true };

    setMenu((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item))
    );

    try {
      const res = await fetch(`/api/admin/menu/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updatedItem = await res.json();
        setMenu((prev) => prev.map((item) => (item.id === itemId ? updatedItem : item)));
      } else {
        await refreshMenu();
      }
    } catch (err) {
      console.error('Error updating price in backend:', err);
      await refreshMenu();
    }
  };

  const addMenuItem = async (newItemData: Omit<MenuItem, 'id'>) => {
    try {
      const res = await fetch('/api/admin/menu', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify(newItemData),
      });

      if (res.ok) {
        const created: MenuItem = await res.json();
        setMenu((prev) => [created, ...prev]);
        soundService.playChime('success');
        await refreshMenu();
      }
    } catch (err) {
      console.error('Error adding menu item:', err);
    }
  };

  const updateMenuItem = async (itemId: string, updatedFields: Partial<MenuItem>) => {
    setMenu((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updatedFields } : item))
    );

    try {
      const res = await fetch(`/api/admin/menu/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify(updatedFields),
      });
      if (res.ok) {
        const updated = await res.json();
        setMenu((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
        soundService.playChime('success');
        await refreshMenu();
      } else {
        await refreshMenu();
      }
    } catch (err) {
      console.error('Error updating menu item:', err);
      await refreshMenu();
    }
  };

  const deleteMenuItem = async (itemId: string) => {
    setMenu((prev) => prev.filter((item) => item.id !== itemId));
    try {
      const res = await fetch(`/api/admin/menu/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });
      if (res.ok) {
        soundService.playChime('notification');
        await refreshMenu();
      } else {
        await refreshMenu();
      }
    } catch (err) {
      console.error('Error deleting menu item:', err);
      await refreshMenu();
    }
  };

  const resetMenuToDefault = async () => {
    try {
      const res = await fetch('/api/admin/menu/reset', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.menu) setMenu(data.menu);
        await refreshMenu();
      } else {
        console.error('[StoreContext] Reset menu failed with status:', res.status);
        await refreshMenu();
      }
    } catch (err) {
      console.error('[StoreContext] Network error during resetMenuToDefault:', err);
      await refreshMenu();
    }
  };

  const activeOrder = activeOrderId ? orders.find((o) => o.id === activeOrderId) || null : null;

  return (
    <StoreContext.Provider
      value={{
        menu,
        cart,
        orders,
        activeOrderId,
        activeOrder,
        isCartOpen,
        isCustomizerOpen,
        selectedCustomizerItem,
        appliedCoupon,
        discountAmount,
        orderType,
        tableNumber,
        qrSession,
        isModeLocked,
        tableSessionExpired,
        tableSessionMessage,
        isQrValidating,
        clearTableSessionExpired,
        isAdminAuthenticated,
        soundEnabled,
        customerDetails,
        isCustomerVerified,
        isCustomerModalOpen,
        isLoadingMenu,
        isLoadingOrders,
        setIsCustomerModalOpen,
        promptCustomerVerification,
        switchQRSession,
        clearQRSession,
        setOrderType,
        setTableNumber,
        setCustomerDetails,
        setIsCartOpen,
        openCustomizer,
        closeCustomizer,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        applyCoupon,
        removeCoupon,
        createOrder,
        updateOrderStatus,
        updateOrderDeliveryLocation,
        setActiveOrderId,
        fetchOrderById,
        cancelOrder,
        deleteOrder,
        deleteKot,
        refreshOrders,
        refreshMenu,
        loginAdmin,
        logoutAdmin,
        toggleItemStock,
        updateItemPrice,
        addMenuItem,
        updateMenuItem,
        deleteMenuItem,
        resetMenuToDefault,
        toggleSound,
        subtotal,
        tax,
        deliveryFee,
        grandTotal,
        itemCount,
        cartRestaurantId,
        cartRestaurantName,
        crossRestaurantConflict,
        resolveCrossRestaurantConflict,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
