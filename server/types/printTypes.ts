export type PrintJobType = 'KOT' | 'BILL';
export type PrintJobStatus = 'PENDING' | 'CLAIMED' | 'PRINTING' | 'PRINTED' | 'FAILED' | 'CANCELLED';

export interface KotItemPayload {
  name: string;
  quantity: number;
  selectedShape?: string;
  selectedCrust?: string;
  spiceLevel?: string;
  addons?: string[];
  specialInstructions?: string;
  category?: string;
}

export interface KotTicketPayload {
  restaurantName: string;
  branchName: string;
  kotNumber: string;
  orderNumber: string;
  orderType: 'dine_in' | 'takeaway' | 'delivery' | 'counter';
  tableNumber?: string;
  orderTime: string;
  isReprint: boolean;
  station: string;
  items: KotItemPayload[];
  orderInstructions?: string;
  customerName?: string;
  waiterName?: string;
}

export interface BillItemPayload {
  name: string;
  quantity: number;
  unitPrice: number;
  itemTotal: number;
  selectedShape?: string;
  selectedCrust?: string;
  addons?: string[];
}

export interface BillTicketPayload {
  restaurantName: string;
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
  gstin?: string;
  billNumber: string;
  orderNumber: string;
  orderTime: string;
  orderType: 'dine_in' | 'takeaway' | 'delivery' | 'counter';
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  isReprint: boolean;
  items: BillItemPayload[];
  itemTotal: number;
  discount: number;
  tax: number;
  taxRate?: number;
  deliveryFee: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  footerMessage: string;
  website: string;
}

export interface PrintDevice {
  id: string;
  restaurantId: string;
  branchId: string;
  branchName?: string;
  deviceId: string;
  deviceName: string;
  tokenHash?: string;
  platform: string;
  appVersion: string;
  isActive: boolean;
  lastHeartbeatAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrinterConfiguration {
  id: string;
  restaurantId: string;
  branchId: string;
  deviceId?: string;
  station: string;
  printerName: string;
  paperWidthMm: number;
  copies: number;
  isAutoPrint: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrintJob {
  id: string;
  restaurantId: string;
  branchId: string;
  orderId: string;
  jobType: PrintJobType;
  station: string;
  idempotencyKey: string;
  status: PrintJobStatus;
  isReprint: boolean;
  claimedByDeviceId?: string | null;
  claimedAt?: string | null;
  printedAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  maxRetries: number;
  payload: KotTicketPayload | BillTicketPayload;
  createdAt: string;
  updatedAt: string;
}

export interface PrintJobAttempt {
  id: string;
  jobId: string;
  deviceId?: string | null;
  attemptNumber: number;
  status: string;
  errorMessage?: string | null;
  durationMs?: number;
  attemptedAt: string;
}
