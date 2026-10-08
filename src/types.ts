export type PizzaShape = 'R' | 'C' | 'S'; // R = Rectangular, C = Circular, S = Square

export type FoodCategory =
  | 'pocket_pizza_veg'
  | 'pocket_pizza_nonveg'
  | 'dessert_pizza'
  | 'chinese_starters'
  | 'fried_rice'
  | 'noodles'
  | 'maggie'
  | 'momos'
  | 'drinks';

export type DietaryType = 'veg' | 'non-veg' | 'egg' | 'dessert';
export type Dietary = DietaryType;

export interface MenuItem {
  id: string;
  itemCode?: string;
  name: string;
  category: FoodCategory | string;
  dietary: DietaryType;
  description: string;
  isPocketPizza?: boolean;
  // Prices for pocket pizzas have 3 shape tiers; regular items have a single base price
  prices?: {
    R: number; // Regular Rectangular
    C: number; // Classic Circular
    S: number; // Signature Square
  };
  price?: number; // For non-pizza items
  isPopular?: boolean;
  isChefSpecial?: boolean;
  spicyLevel?: 0 | 1 | 2 | 3;
  inStock: boolean;
  image?: string;
  badge?: string;
  restaurantId?: string;
  branchId?: string;
}

export interface CartItemAddon {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  cartItemId: string;
  menuItem: MenuItem;
  selectedShape?: PizzaShape; // For pocket pizzas
  selectedCrust?: string; // e.g., 'Korean Pocket Crust', 'Cheese Burst Pocket'
  spiceLevel?: 'Mild' | 'Medium' | 'Authentic Spicy';
  addons: CartItemAddon[];
  specialInstructions?: string;
  unitPrice: number;
  quantity: number;
  // Phase 6 Price Snapshots
  baseUnitPrice?: number;
  platformMarkupUnit?: number;
  customerUnitPrice?: number;
  baseUnitPricePaise?: number;
  platformMarkupUnitPaise?: number;
  customerUnitPricePaise?: number;
  baseLineTotalPaise?: number;
  platformMarkupLineTotalPaise?: number;
  customerLineTotalPaise?: number;
}

export type OrderStatus =
  | 'placed'
  | 'pending'
  | 'confirmed'
  | 'accepted'
  | 'baking'
  | 'preparing'
  | 'packing'
  | 'out_for_delivery'
  | 'ready_for_pickup'
  | 'ready'
  | 'delivered'
  | 'completed'
  | 'settled'
  | 'cancelled'
  | 'rejected';

export type OrderType = 'delivery' | 'takeaway' | 'dine_in' | 'counter';

export type EntrySource = 'table_qr' | 'counter_qr' | 'online_web' | 'customer_web' | 'pos_counter' | 'restaurant_admin' | 'staff_app';

export interface QRSessionInfo {
  source: EntrySource;
  orderMode: OrderType;
  tableNumber?: string;
  tableId?: string;
  restaurantId?: string;
  restaurantSlug?: string;
  branchId?: string;
  token?: string;
  isVerified: boolean;
  isModeLocked: boolean;
  isTableLocked?: boolean;
  verificationMessage?: string;
  signature?: string;
}

export type PaymentMethod = 'razorpay' | 'upi' | 'upi_qr' | 'gpay' | 'phonepe' | 'paytm' | 'card' | 'netbanking' | 'cod';

export type CustomerLocationSource = 'device_gps' | 'map_pin' | 'saved_address';

export interface CustomerDetails {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  landmark?: string;
  tableNumber?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number; // Accuracy in metres
  locationCapturedAt?: string; // Capture timestamp ISO
  locationSource?: CustomerLocationSource;
}

export interface Order {
  id: string;
  restaurantId?: string;
  branchId?: string;
  orderNumber?: string;
  tableNumber?: string;
  tableId?: string;
  createdAt: string;
  items: CartItem[];
  orderType: OrderType;
  entrySource?: EntrySource;
  qrSession?: QRSessionInfo;
  customer: CustomerDetails;
  customerLatitude?: number;
  customerLongitude?: number;
  customerLocationAccuracy?: number;
  customerLocationCapturedAt?: string;
  customerLocationSource?: CustomerLocationSource;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: 'pending' | 'paid' | 'cod_pending' | 'failed';
  paymentId?: string;
  itemTotal: number;
  tax: number; // 5% GST
  deliveryFee: number;
  discount: number;
  couponCode?: string;
  grandTotal: number;
  // Phase 6: Multi-Restaurant Split Accounting & Ledger
  restaurantSubtotal?: number;
  platformMarkupTotal?: number;
  customerItemsTotal?: number;
  restaurantShare?: number;
  platformShare?: number;
  gatewayFee?: number;
  refundTotal?: number;
  settlementStatus?: 'PENDING' | 'INITIATED' | 'SETTLED' | 'FAILED' | 'ON_HOLD' | 'REVERSED' | 'NOT_APPLICABLE';
  settlementId?: string;
  settledAt?: string;
  estimatedDeliveryTimeMinutes: number;
  kotNumber?: string;
  kotStation?: 'Pizza Oven Station' | 'Chinese Wok Station' | 'All Stations';
  waiterName?: string;
  kotPrintCount?: number;
  receiptPrintCount?: number;
  confirmedAt?: string;
  completedAt?: string;
  feedbackRequest?: {
    id?: string;
    status: 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';
    scheduledAt?: string;
    sentAt?: string;
    whatsappMessageId?: string;
    errorMessage?: string;
  };
  driverDetails?: {
    name: string;
    phone: string;
    vehicleNumber: string;
    currentLocationLat?: number;
    currentLocationLng?: number;
  };
  statusHistory: {
    status: OrderStatus;
    timestamp: string;
    note: string;
  }[];
}

export interface Coupon {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrder: number;
  description: string;
}

export interface PublicRestaurantBranch {
  id: string;
  name: string;
  slug?: string;
  address?: string;
  locality?: string;
  latitude?: number;
  longitude?: number;
  deliveryRadiusKm?: number;
  phone?: string;
  isActive: boolean;
}

export interface PublicRestaurantSettings {
  isDeliveryEnabled: boolean;
  isTakeawayEnabled: boolean;
  isDineInEnabled: boolean;
  isCounterEnabled: boolean;
  deliveryRadiusKm?: number;
  deliveryFee?: number;
  minOrderFreeDelivery?: number;
  estimatedDeliveryMinutes?: number;
}

export interface PublicRestaurantPaymentSettings {
  isCashEnabled: boolean;
  isUpiEnabled: boolean;
  upiId?: string;
  directUpiEnabled?: boolean;
  directUpiProvider?: string;
  merchantUpiId?: string;
  merchantDisplayName?: string;
  isOnlineEnabled: boolean;
  isRazorpayEnabled: boolean;
  razorpayKeyId?: string;
  activePaymentMode: string;
  acceptedCurrencies: string[];
}

export interface PublicRestaurantProfile {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  logoUrl?: string;
  bannerUrl?: string;
  phone?: string;
  email?: string;
  address?: string;
  currency: string;
  taxRate: number;
  status: string; // 'active' | 'suspended' | 'pending'
  defaultBranchId?: string;
  settings?: PublicRestaurantSettings;
  paymentSettings?: PublicRestaurantPaymentSettings;
  deliverySettings?: {
    isDeliveryEnabled: boolean;
    isTakeawayEnabled: boolean;
    deliveryRadiusKm: number;
    deliveryFee: number;
    minOrderFreeDelivery: number;
    estimatedDeliveryMinutes: number;
  };
  branches: PublicRestaurantBranch[];
}

export interface PaymentTransaction {
  id: string;
  order_id: string;
  order_number?: string;
  restaurant_id: string;
  restaurant_name?: string;
  customer_paid_amount: number;
  restaurant_share: number;
  platform_share: number;
  provider: string;
  payment_status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  settlement_status: string;
  created_at: string;
  settled_at?: string;
}

export interface SettlementRecord {
  id: string;
  restaurant_id: string;
  payment_transaction_id: string;
  amount: number;
  status: 'PENDING' | 'INITIATED' | 'SETTLED' | 'FAILED' | 'ON_HOLD' | 'REVERSED';
  utr_number?: string;
  settled_at?: string;
  created_at: string;
}

export type InventoryTransactionType =
  | 'OPENING'
  | 'PURCHASE'
  | 'ADD'
  | 'CONSUMPTION'
  | 'WASTAGE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'RETURN';

export interface InventoryItemRecord {
  id: string;
  restaurant_id: string;
  branch_id?: string | null;
  name: string;
  sku?: string | null;
  category: string;
  unit: string;
  current_quantity: number;
  minimum_stock_level: number;
  cost_per_unit?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  opening_stock?: number;
  added_today?: number;
  used_today?: number;
  wastage_today?: number;
  is_low_stock?: boolean;
}

export interface InventoryTransactionRecord {
  id: string;
  restaurant_id: string;
  branch_id?: string | null;
  inventory_item_id: string;
  item_name?: string;
  item_sku?: string | null;
  transaction_type: InventoryTransactionType;
  quantity: number;
  unit: string;
  quantity_before: number;
  quantity_after: number;
  reference_type?: string | null;
  reference_id?: string | null;
  notes?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
}

export interface DailyStockSummaryReport {
  restaurantId: string;
  date: string;
  totalItems: number;
  lowStockCount: number;
  totalPurchasedToday: number;
  totalUsedToday: number;
  totalWastageToday: number;
  items: InventoryItemRecord[];
}

