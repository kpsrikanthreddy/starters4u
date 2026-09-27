import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../context/StoreContext';
import { useAdminAuth } from '../context/AdminAuthContext';
import { soundService } from '../utils/audio';
import { Order, OrderStatus, MenuItem, FoodCategory, DietaryType } from '../types';
import {
  ShieldAlert,
  Lock,
  LogOut,
  Flame,
  CheckCircle2,
  Clock,
  Printer,
  TrendingUp,
  Package,
  Sliders,
  DollarSign,
  Search,
  Filter,
  Layers,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Edit2,
  X,
  ChefHat,
  Receipt,
  Wifi,
  Settings2,
  Check,
  Calendar,
  QrCode,
  Copy,
  ExternalLink,
  ShieldCheck,
  Globe,
  Download,
  FileImage,
  MessageSquare,
  PhoneCall,
  RefreshCw,
} from 'lucide-react';
import { SHAPE_DETAILS } from '../data/menuData';
import { PrintModal } from './PrintModal';
import { OrderCalendarView } from './OrderCalendarView';
import { TableQRGeneratorModal } from './TableQRGeneratorModal';
import { generateSignedQRToken } from '../utils/qrSecurity';
import {
  generateQRDataURL,
  downloadQRImage,
  downloadTableStandImage,
} from '../utils/qrDownloadHelper';

interface AdminPortalProps {
  onBackToMenu: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onBackToMenu }) => {
  const {
    orders: contextOrders,
    menu,
    refreshMenu,
    isAdminAuthenticated,
    loginAdmin,
    logoutAdmin,
    toggleItemStock,
    updateItemPrice,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    resetMenuToDefault,
    soundEnabled,
    toggleSound,
    switchQRSession,
    clearQRSession,
    qrSession,
  } = useStore();

  const { user: authUser, isAuthenticated: isAuthFromContext, adminFetch, logout: authLogout } = useAdminAuth();

  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);

  // Authenticated Admin Menu State
  const [adminMenu, setAdminMenu] = useState<MenuItem[]>([]);
  const [isLoadingAdminMenu, setIsLoadingAdminMenu] = useState<boolean>(false);
  const [menuFeedback, setMenuFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmittingItem, setIsSubmittingItem] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const isAuthorized = isAdminAuthenticated || isAuthFromContext;

  const fetchAdminOrders = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      setIsLoadingOrders(true);
      const res = await adminFetch('/api/admin/orders');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAdminOrders(data);
        }
      } else {
        console.warn('[AdminPortal] Could not load orders from /api/admin/orders:', res.statusText);
      }
    } catch (err) {
      console.error('[AdminPortal] Error loading admin orders:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [isAuthorized, adminFetch]);

  const fetchAdminMenu = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      setIsLoadingAdminMenu(true);
      const res = await adminFetch(`/api/admin/menu?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAdminMenu(data);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn('[AdminPortal] Could not load admin menu:', errData.error || res.statusText);
      }
    } catch (err) {
      console.error('[AdminPortal] Error loading admin menu:', err);
    } finally {
      setIsLoadingAdminMenu(false);
    }
  }, [isAuthorized, adminFetch]);

  useEffect(() => {
    if (isAuthorized) {
      fetchAdminOrders();
      fetchAdminMenu();
      const interval = setInterval(fetchAdminOrders, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthorized, fetchAdminOrders, fetchAdminMenu]);

  const handleAdminUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus, note?: string) => {
    try {
      setStatusUpdateError(null);
      const res = await adminFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, note }),
      });

      if (res.ok) {
        const updatedOrder: Order = await res.json();
        setAdminOrders((prev) => prev.map((o) => (o.id === orderId ? updatedOrder : o)));
        soundService.playChime('notification');
      } else {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || `Server rejected status transition to ${newStatus}`;
        setStatusUpdateError(msg);
        alert(`Order Status Update Failed: ${msg}`);
        // Re-sync with backend to ensure UI matches PostgreSQL source of truth
        fetchAdminOrders();
      }
    } catch (err: any) {
      console.error('[AdminPortal] Status update error:', err);
      setStatusUpdateError(err.message || 'Network error updating status');
      alert(`Order Status Update Failed: ${err.message}`);
    }
  };

  const handleAdminCancelOrder = async (orderId: string, reason?: string) => {
    await handleAdminUpdateOrderStatus(orderId, 'cancelled', reason || 'Cancelled by Admin / Wrongly placed');
  };

  const handleAdminDeleteOrder = async (orderId: string) => {
    try {
      const res = await adminFetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAdminOrders((prev) => prev.filter((o) => o.id !== orderId));
        soundService.playChime('pop');
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to delete order');
      }
    } catch (err: any) {
      alert(`Failed to delete order: ${err.message}`);
    }
  };

  const handleAdminDeleteKot = async (orderId: string) => {
    try {
      await adminFetch(`/api/kots/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Failed to delete KOT ticket:', err);
    }
    setAdminOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          const { kotNumber, kotStation, ...rest } = ord;
          return {
            ...rest,
            kotNumber: undefined,
            kotStation: undefined,
          };
        }
        return ord;
      })
    );
    soundService.playChime('pop');
  };

  const handleLogout = () => {
    logoutAdmin();
    authLogout();
  };

  const [pinInput, setPinInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [adminTab, setAdminTab] = useState<'orders' | 'calendar' | 'menu_stock' | 'printers' | 'qr_codes' | 'analytics' | 'inquiries'>('orders');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [menuSearch, setMenuSearch] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Customer Inquiries States
  interface CustomerInquiry {
    id: string;
    restaurant_id: string;
    branch_id?: string;
    name: string;
    phone?: string;
    order_id?: string;
    message: string;
    status: 'new' | 'in_review' | 'resolved' | 'spam';
    ip_hash: string;
    created_at: string;
    updated_at: string;
  }

  const [inquiries, setInquiries] = useState<CustomerInquiry[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState<boolean>(false);
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState<string>('all');
  const [inquirySearch, setInquirySearch] = useState<string>('');

  const fetchInquiries = useCallback(async () => {
    const token = localStorage.getItem('starters4u_admin_jwt_token');
    try {
      setIsLoadingInquiries(true);
      const res = await fetch('/api/admin/inquiries', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setInquiries(data);
        }
      }
    } catch (err) {
      console.warn('[AdminPortal] Error loading customer inquiries:', err);
    } finally {
      setIsLoadingInquiries(false);
    }
  }, []);

  useEffect(() => {
    if (isAdminAuthenticated) {
      fetchInquiries();
    }
  }, [isAdminAuthenticated, fetchInquiries]);

  const handleUpdateInquiryStatus = async (
    inquiryId: string,
    newStatus: 'new' | 'in_review' | 'resolved' | 'spam'
  ) => {
    const token = localStorage.getItem('starters4u_admin_jwt_token');
    try {
      const res = await fetch(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setInquiries((prev) => prev.map((inq) => (inq.id === inquiryId ? updated : inq)));
        soundService.playChime('pop');
      } else {
        alert('Failed to update inquiry status. Please check your admin connection.');
      }
    } catch (err: any) {
      alert(`Error updating inquiry: ${err.message}`);
    }
  };

  // Table QR Management States
  const [tableCount, setTableCount] = useState<number>(8);
  const [showQRDownloadModal, setShowQRDownloadModal] = useState<boolean>(false);
  const [selectedQRTarget, setSelectedQRTarget] = useState<number | 'counter'>(1);
  const [batchQRDownloading, setBatchQRDownloading] = useState<boolean>(false);
  const [batchQRStatus, setBatchQRStatus] = useState<string>('');

  // Print Modal State
  const [printModalData, setPrintModalData] = useState<{ order: Order; type: 'kot' | 'receipt' } | null>(null);

  // Printer Management Configuration
  const [printerSettings, setPrinterSettings] = useState({
    autoPrintKOTOnDineIn: true,
    autoPrintReceiptOnPaid: true,
    paperWidth: '80mm' as '80mm' | '58mm',
    kitchenPrinterStatus: 'connected' as 'connected' | 'offline',
    billingPrinterStatus: 'connected' as 'connected' | 'offline',
    kitchenPrinterIP: '192.168.1.188 (Port 9100 - Pizza & Wok Station)',
    billingPrinterIP: '192.168.1.189 (Port 9100 - Cashier Billing)',
    kotHeaderNote: 'Prepare Fresh with Extra Mozzarella • Dine-In Priority',
  });

  // Add / Edit Item Modal State
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    category: FoodCategory | string;
    dietary: DietaryType;
    description: string;
    isPocketPizza: boolean;
    price: number;
    priceR: number;
    priceC: number;
    priceS: number;
    image: string;
    badge: string;
    inStock: boolean;
  }>({
    name: '',
    category: 'pocket_pizza_veg',
    dietary: 'veg',
    description: '',
    isPocketPizza: false,
    price: 149,
    priceR: 99,
    priceC: 139,
    priceS: 179,
    image: '',
    badge: '',
    inStock: true,
  });

  const openAddItemModal = () => {
    setEditingItem(null);
    setModalError(null);
    setFormData({
      name: '',
      category: 'pocket_pizza_veg',
      dietary: 'veg',
      description: '',
      isPocketPizza: false,
      price: 149,
      priceR: 99,
      priceC: 139,
      priceS: 179,
      image: '',
      badge: '',
      inStock: true,
    });
    setIsItemModalOpen(true);
  };

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item);
    setModalError(null);
    setFormData({
      name: item.name,
      category: item.category,
      dietary: item.dietary,
      description: item.description || '',
      isPocketPizza: !!item.isPocketPizza,
      price: item.price || 149,
      priceR: item.prices?.R || 99,
      priceC: item.prices?.C || 139,
      priceS: item.prices?.S || 179,
      image: item.image || '',
      badge: item.badge || '',
      inStock: item.inStock !== false,
    });
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmittingItem(true);
    setModalError(null);
    setMenuFeedback(null);

    const itemPayload: any = {
      name: formData.name.trim(),
      category: formData.category,
      dietary: formData.dietary,
      description: formData.description.trim(),
      isPocketPizza: formData.isPocketPizza,
      image: formData.image.trim(),
      badge: formData.badge.trim() || undefined,
      inStock: formData.inStock,
    };

    if (formData.isPocketPizza) {
      itemPayload.prices = {
        R: Number(formData.priceR) || 99,
        C: Number(formData.priceC) || 139,
        S: Number(formData.priceS) || 179,
      };
    } else {
      itemPayload.price = Number(formData.price) || 99;
    }

    try {
      if (editingItem) {
        const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(editingItem.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(itemPayload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || errData.details || `Failed to update menu item (${res.status})`);
        }
        setMenuFeedback({ type: 'success', message: `Updated "${itemPayload.name}" successfully!` });
        soundService.playChime('success');
      } else {
        const res = await adminFetch('/api/admin/menu', {
          method: 'POST',
          body: JSON.stringify(itemPayload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || errData.details || `Failed to create menu item (${res.status})`);
        }
        setMenuFeedback({ type: 'success', message: `Added "${itemPayload.name}" to menu successfully!` });
        soundService.playChime('success');
      }

      setIsItemModalOpen(false);
      await fetchAdminMenu();
      await refreshMenu();
    } catch (err: any) {
      console.error('[AdminPortal] Error saving menu item:', err);
      setModalError(err.message || 'Failed to save menu item');
      setMenuFeedback({ type: 'error', message: err.message || 'Failed to save menu item' });
    } finally {
      setIsSubmittingItem(false);
    }
  };

  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${itemName}" from the menu?`)) {
      return;
    }
    try {
      setMenuFeedback(null);
      const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || `Failed to delete item (${res.status})`);
      }
      setMenuFeedback({ type: 'success', message: `Deleted "${itemName}" from menu successfully.` });
      soundService.playChime('notification');
      await fetchAdminMenu();
      await refreshMenu();
    } catch (err: any) {
      console.error('[AdminPortal] Error deleting menu item:', err);
      setMenuFeedback({ type: 'error', message: err.message || 'Failed to delete menu item' });
    }
  };

  const handleToggleAdminStock = async (item: MenuItem) => {
    const nextStock = !item.inStock;
    // Optimistic UI toggle in adminMenu
    setAdminMenu((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, inStock: nextStock } : m))
    );

    try {
      setMenuFeedback(null);
      const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(item.id)}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ inStock: nextStock }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || 'Failed to update stock status');
      }
      setMenuFeedback({
        type: 'success',
        message: `Marked "${item.name}" as ${nextStock ? 'In Stock' : 'Sold Out'}.`,
      });
      await fetchAdminMenu();
      await refreshMenu();
    } catch (err: any) {
      console.error('[AdminPortal] Error updating stock:', err);
      setMenuFeedback({ type: 'error', message: err.message || 'Failed to toggle stock status' });
      await fetchAdminMenu();
      await refreshMenu();
    }
  };

  const handleResetAdminMenu = async () => {
    if (!window.confirm('Reset all menu items to the default MOZZ recipe set? Any custom dishes will be replaced.')) {
      return;
    }
    try {
      setMenuFeedback(null);
      const res = await adminFetch('/api/admin/menu/reset', {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || 'Failed to reset menu');
      }
      setMenuFeedback({ type: 'success', message: 'Menu successfully reset to default recipe set.' });
      soundService.playChime('notification');
      await fetchAdminMenu();
      await refreshMenu();
    } catch (err: any) {
      console.error('[AdminPortal] Error resetting menu:', err);
      setMenuFeedback({ type: 'error', message: err.message || 'Failed to reset menu' });
    }
  };

  // Handle PIN login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const ok = await loginAdmin(pinInput);
    if (!ok) {
      setLoginError('Incorrect PIN or Password. Enter authorized staff PIN (e.g. 8888).');
    } else {
      setPinInput('');
    }
  };

  // Quick PIN button helper
  const handleQuickPin = (digit: string) => {
    if (pinInput.length < 8) {
      setPinInput((prev) => prev + digit);
    }
  };

  // If not authenticated, render secure login card
  if (!isAdminAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-12 px-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 p-0.5 mx-auto shadow-md">
            <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center text-rose-600">
              <Lock className="w-8 h-8" />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900">Restaurant Admin Portal</h2>
            <p className="text-xs text-slate-500 mt-1">
              Authorized MOZZ Pizzateria staff access only. Manage live orders, KDS, inventory & sales.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter Admin PIN / Password"
                className="w-full text-center tracking-widest text-lg font-mono bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-rose-600 placeholder-slate-400 focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* Quick Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'C') setPinInput('');
                    else if (k === '⌫') setPinInput((p) => p.slice(0, -1));
                    else handleQuickPin(k);
                  }}
                  className="py-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-sm transition active:scale-95 shadow-2xs"
                >
                  {k}
                </button>
              ))}
            </div>

            {loginError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-sm transition"
            >
              Unlock Restaurant Portal
            </button>
          </form>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500">
            <span>Default Staff PIN: </span>
            <button
              type="button"
              onClick={() => {
                setPinInput('8888');
              }}
              className="text-rose-600 font-mono font-bold hover:underline"
            >
              8888
            </button>
            <span className="text-slate-400"> (Click to autofill)</span>
          </div>

          <button
            onClick={onBackToMenu}
            className="text-xs text-slate-500 hover:text-slate-800 transition"
          >
            ← Back to Customer Menu
          </button>
        </div>
      </div>
    );
  }

  const isStatusInTab = (status: string, tabId: string): boolean => {
    switch (tabId) {
      case 'all':
        return true;
      case 'placed':
        return ['placed', 'pending', 'confirmed', 'accepted'].includes(status);
      case 'baking':
      case 'kitchen':
      case 'preparing':
        return ['baking', 'preparing'].includes(status);
      case 'packing':
        return ['packing'].includes(status);
      case 'out_for_delivery':
      case 'ready':
        return ['out_for_delivery', 'ready_for_pickup', 'ready'].includes(status);
      case 'delivered':
      case 'completed':
        return ['delivered', 'completed', 'settled'].includes(status);
      case 'cancelled':
        return ['cancelled', 'rejected'].includes(status);
      default:
        return status === tabId;
    }
  };

  // Filtered orders
  const filteredOrders = adminOrders.filter((o) => {
    if (orderStatusFilter === 'all') return true;
    return isStatusInTab(o.status, orderStatusFilter);
  });

  // Calculate quick analytics
  const totalRevenue = adminOrders.reduce((sum, o) => sum + (o.paymentStatus === 'paid' ? o.grandTotal : 0), 0);
  const totalOrdersCount = adminOrders.length;
  const activeOrdersCount = adminOrders.filter((o) => !['delivered', 'completed', 'settled', 'cancelled', 'rejected'].includes(o.status)).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Admin Header Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-black text-xl shadow-xs">
            🥟
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">MOZZ Restaurant Manager</h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                KITCHEN ONLINE
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Live POS Dashboard • Korean Pocket Pizzas & Chinese Delicacies
            </p>
          </div>
        </div>

        {/* Tab Controls & Logout */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="bg-slate-100 p-1 rounded-2xl border border-slate-200 flex gap-1 text-xs font-bold">
            <button
              onClick={() => setAdminTab('orders')}
              className={`px-3.5 py-2 rounded-xl transition ${
                adminTab === 'orders'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Live Orders ({activeOrdersCount})
            </button>
            <button
              onClick={() => setAdminTab('calendar')}
              className={`px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 ${
                adminTab === 'calendar'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => setAdminTab('menu_stock')}
              className={`px-3.5 py-2 rounded-xl transition ${
                adminTab === 'menu_stock'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Menu & Stock
            </button>
            <button
              onClick={() => setAdminTab('printers')}
              className={`px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 ${
                adminTab === 'printers'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>KOT & Printers</span>
            </button>
            <button
              onClick={() => setAdminTab('qr_codes')}
              className={`px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 ${
                adminTab === 'qr_codes'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR Tokens & Entry</span>
            </button>
            <button
              onClick={() => setAdminTab('analytics')}
              className={`px-3.5 py-2 rounded-xl transition ${
                adminTab === 'analytics'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sales Analytics
            </button>
            <button
              onClick={() => setAdminTab('inquiries')}
              className={`px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 ${
                adminTab === 'inquiries'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Inquiries</span>
              {inquiries.filter((i) => i.status === 'new').length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-400 text-slate-950">
                  {inquiries.filter((i) => i.status === 'new').length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={toggleSound}
            className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition"
            title={soundEnabled ? 'Kitchen Bell Chime ON' : 'Muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-rose-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
            title="Lock & Logout Admin"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ================= TAB 1: LIVE ORDERS / KDS ================= */}
      {adminTab === 'orders' && (
        <div className="space-y-5">
          {/* Order Status Filters */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {[
                { id: 'all', label: 'All Orders' },
                { id: 'placed', label: 'New Placed 🔔' },
                { id: 'baking', label: 'In Kitchen / Oven 🔥' },
                { id: 'packing', label: 'Packing 📦' },
                { id: 'out_for_delivery', label: 'Out for Delivery 🛵' },
                { id: 'delivered', label: 'Completed ✅' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setOrderStatusFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap ${
                    orderStatusFilter === f.id
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing {filteredOrders.length} order{filteredOrders.length === 1 ? '' : 's'}
            </div>
          </div>

          {/* Orders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-white border border-slate-200 rounded-3xl shadow-sm">
                <div className="text-3xl mb-2">📋</div>
                <h3 className="text-base font-bold text-slate-800">No Orders in this Status</h3>
                <p className="text-xs text-slate-500 mt-1">
                  New orders will automatically ring the kitchen bell chime and populate here.
                </p>
              </div>
            ) : (
              filteredOrders.map((ord) => {
                return (
                  <div
                    key={ord.id}
                    className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-slate-300 transition"
                  >
                    {/* Header: Order ID & Status */}
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div>
                          <span className="text-base font-black text-rose-600 font-mono">
                            #{ord.id}
                          </span>
                          <div className="text-[10px] text-slate-400">
                            {new Date(ord.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              ord.status === 'delivered'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : ord.status === 'baking'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                                : ord.status === 'out_for_delivery'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {ord.status.replace(/_/g, ' ')}
                          </span>
                          <div className="text-[10px] font-bold text-slate-600 mt-1 capitalize">
                            {ord.orderType.replace('_', ' ')}
                          </div>
                        </div>
                      </div>

                      {/* Customer info & KOT Tag */}
                      <div className="mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1.5">
                        <div className="flex justify-between items-center">
                          <div className="font-bold text-slate-800">
                            {ord.customer.name} • <span className="text-rose-600">{ord.customer.phone}</span>
                          </div>
                          {ord.kotNumber ? (
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-mono font-black text-[10px]">
                                {ord.kotNumber}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Delete KOT ${ord.kotNumber} for Order #${ord.id}?`)) {
                                    handleAdminDeleteKot(ord.id);
                                  }
                                }}
                                title="Delete/Remove KOT ticket"
                                className="p-1 rounded-md bg-amber-200/70 hover:bg-rose-100 text-amber-800 hover:text-rose-600 transition"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-semibold italic">No Active KOT</span>
                          )}
                        </div>

                        {ord.customer.address && (
                          <div className="text-[11px] text-slate-500 truncate">
                            {ord.customer.address}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] flex-wrap gap-1">
                          {ord.customer.tableNumber || ord.orderType === 'dine_in' ? (
                            <div className="text-rose-700 font-black flex items-center gap-1">
                              <span>🪑 Dine-In:</span>
                              <span className="underline">{ord.customer.tableNumber || 'Table 1'}</span>
                            </div>
                          ) : (
                            <div className="text-slate-500 capitalize">{ord.orderType} Delivery</div>
                          )}

                          <div className="flex items-center gap-1 flex-wrap">
                            {ord.entrySource === 'table_qr' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                🍽️ Table QR Signed
                              </span>
                            )}
                            {ord.entrySource === 'counter_qr' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
                                🛍️ Counter QR Signed
                              </span>
                            )}
                            {ord.entrySource === 'online_web' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                🛵 Online Web
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              {ord.kotStation || 'All Stations'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Items List (Clear for Kitchen Chefs) */}
                      <div className="mt-3 space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Items to Prepare:
                        </div>
                        {ord.items.map((it, idx) => (
                          <div key={idx} className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 text-xs">
                            <div className="flex items-center justify-between font-bold text-slate-800">
                              <span>
                                {it.quantity}x {it.menuItem.name}
                              </span>
                              <span className="text-rose-600">₹{it.unitPrice * it.quantity}</span>
                            </div>

                            {/* Shape & customizer pill */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {it.selectedShape && (
                                <span className="text-[10px] font-black bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-200">
                                  SHAPE: [{it.selectedShape}]{' '}
                                  {it.selectedShape === 'R'
                                    ? 'Rectangular'
                                    : it.selectedShape === 'C'
                                    ? 'Circular'
                                    : 'Square'}
                                </span>
                              )}
                              {it.selectedCrust && (
                                <span className="text-[10px] text-slate-600 bg-slate-200/80 px-1.5 py-0.5 rounded">
                                  {it.selectedCrust}
                                </span>
                              )}
                              {it.spiceLevel && (
                                <span className="text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                  {it.spiceLevel}
                                </span>
                              )}
                            </div>

                            {it.specialInstructions && (
                              <div className="text-[10px] text-amber-700 font-semibold mt-1">
                                ⚠️ Note: "{it.specialInstructions}"
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer Actions: Status Transition Buttons */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Total Bill:</span>
                        <span className="font-black text-rose-600 text-sm">₹{ord.grandTotal.toFixed(2)}</span>
                      </div>

                      {/* Print Ticket & Receipt Controls */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setPrintModalData({ order: ord, type: 'kot' })}
                          className="py-1.5 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          <ChefHat className="w-3.5 h-3.5 text-amber-700" />
                          <span>Print KOT Slip</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrintModalData({ order: ord, type: 'receipt' })}
                          className="py-1.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-600" />
                          <span>Print Bill / Receipt</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {ord.status === 'placed' && (
                          <button
                            onClick={() => handleAdminUpdateOrderStatus(ord.id, 'baking', 'Kitchen started preparing')}
                            className="col-span-2 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition"
                          >
                            Accept & Start Baking 🔥
                          </button>
                        )}

                        {ord.status === 'baking' && (
                          <button
                            onClick={() => handleAdminUpdateOrderStatus(ord.id, 'packing', 'Items baked, packing in box')}
                            className="col-span-2 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition"
                          >
                            Mark Ready & Pack 📦
                          </button>
                        )}

                        {ord.status === 'packing' && (
                          <button
                            onClick={() => handleAdminUpdateOrderStatus(ord.id, 'out_for_delivery', 'Handed to delivery rider')}
                            className="col-span-2 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition"
                          >
                            Dispatch / Hand to Rider 🛵
                          </button>
                        )}

                        {ord.status === 'out_for_delivery' && (
                          <button
                            onClick={() => handleAdminUpdateOrderStatus(ord.id, 'delivered', 'Order successfully delivered')}
                            className="col-span-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition"
                          >
                            Mark Order Delivered ✅
                          </button>
                        )}

                        {ord.status === 'delivered' && (
                          <div className="col-span-2 py-1.5 text-center text-xs font-bold text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200">
                            Order Completed & Settled
                          </div>
                        )}

                        {ord.status !== 'delivered' && ord.status !== 'cancelled' && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to cancel Order #${ord.id}?`)) {
                                handleAdminCancelOrder(ord.id, 'Cancelled by Admin / Wrongly placed');
                              }
                            }}
                            className="col-span-2 py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 text-[11px] font-semibold transition"
                          >
                            Cancel Wrongly Placed Order ✕
                          </button>
                        )}

                        {ord.status === 'cancelled' && (
                          <div className="col-span-2 py-1.5 text-center text-xs font-bold text-rose-700 bg-rose-50 rounded-xl border border-rose-200">
                            Order Cancelled ✕
                          </div>
                        )}

                        {/* Delete Order Action */}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Permanently delete Order #${ord.id} and its associated records? This cannot be undone.`)) {
                              handleAdminDeleteOrder(ord.id);
                            }
                          }}
                          className="col-span-2 py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-700 border border-slate-200 hover:border-rose-300 text-[11px] font-bold transition flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Order Permanently</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= TAB: ORDER CALENDAR & DATE FILTER ================= */}
      {adminTab === 'calendar' && (
        <OrderCalendarView
          orders={adminOrders}
          onSelectOrder={(ord) => {
            setOrderStatusFilter('all');
            setAdminTab('orders');
          }}
          onPrintKOT={(ord) => setPrintModalData({ order: ord, type: 'kot' })}
          onPrintBill={(ord) => setPrintModalData({ order: ord, type: 'receipt' })}
          onDeleteOrder={handleAdminDeleteOrder}
          onDeleteKOT={handleAdminDeleteKot}
        />
      )}

      {/* ================= TAB 2: MENU & INVENTORY STOCK ================= */}
      {adminTab === 'menu_stock' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Menu Items & Inventory Catalog</h2>
              <p className="text-xs text-slate-500">
                Add new dishes, update prices, edit details, toggle stock availability, or delete items.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button
                onClick={openAddItemModal}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Item</span>
              </button>

              <button
                onClick={() => {
                  fetchAdminMenu();
                  refreshMenu();
                }}
                disabled={isLoadingAdminMenu}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition flex items-center gap-1"
                title="Refresh Menu from Database"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAdminMenu ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <input
                type="text"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Search menu items..."
                className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-500 w-full sm:w-52"
              />

              <button
                onClick={handleResetAdminMenu}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition flex items-center gap-1"
                title="Reset prices & items to original menu card"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
          </div>

          {/* Feedback banner */}
          {menuFeedback && (
            <div
              className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-semibold ${
                menuFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {menuFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{menuFeedback.message}</span>
              </div>
              <button
                onClick={() => setMenuFeedback(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                  <th className="py-3 px-3">Item Name</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Prices (R / C / S or Base)</th>
                  <th className="py-3 px-3">Stock Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(adminMenu.length > 0 ? adminMenu : menu)
                  .filter((m) => m.name.toLowerCase().includes(menuSearch.toLowerCase()))
                  .map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-3 font-bold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-600 shrink-0 uppercase">
                              {item.name.slice(0, 2)}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span>{item.name}</span>
                              {item.isPocketPizza && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                                  POCKET PIZZA
                                </span>
                              )}
                              {item.badge && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal line-clamp-1 max-w-xs">
                              {item.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 capitalize">
                        {item.category.replace(/_/g, ' ')}
                      </td>
                      <td className="py-3 px-3 capitalize">
                        <span
                          className={`font-semibold ${
                            item.dietary === 'veg'
                              ? 'text-emerald-600'
                              : item.dietary === 'non-veg'
                              ? 'text-rose-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {item.dietary}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-rose-600 font-mono font-bold">
                        {item.isPocketPizza && item.prices ? (
                          <div className="text-[11px]">
                            <span>R: ₹{item.prices.R}</span> · <span>C: ₹{item.prices.C}</span> · <span>S: ₹{item.prices.S}</span>
                          </div>
                        ) : (
                          <span className="text-sm">₹{item.price}</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => handleToggleAdminStock(item)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition ${
                            item.inStock
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          {item.inStock ? 'In Stock' : 'Sold Out'}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditItemModal(item)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 transition"
                            title="Edit Item"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id, item.name)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-500 transition"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= ADD / EDIT ITEM MODAL ================= */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                  {editingItem ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {editingItem ? `Edit Menu Item: ${editingItem.name}` : 'Add New Dish to Menu'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Changes reflect in real-time across customer app</p>
                </div>
              </div>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveItem} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Item / Dish Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Korean Chilli Garlic Fried Rice"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-rose-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      const cat = e.target.value as FoodCategory;
                      const isPizza = cat === 'pocket_pizza_veg' || cat === 'pocket_pizza_nonveg' || cat === 'dessert_pizza';
                      setFormData({
                        ...formData,
                        category: cat,
                        isPocketPizza: isPizza,
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-rose-500 font-medium"
                  >
                    <option value="pocket_pizza_veg">Pocket Pizza (Veg)</option>
                    <option value="pocket_pizza_nonveg">Pocket Pizza (Non-Veg)</option>
                    <option value="dessert_pizza">Dessert Pizza</option>
                    <option value="chinese_starters">Chinese Starters</option>
                    <option value="fried_rice">Fried Rice</option>
                    <option value="noodles">Wok Noodles</option>
                    <option value="momos">Momos & Dimsums</option>
                    <option value="maggie">Special Maggie</option>
                    <option value="drinks">Beverages & Drinks</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Dietary Tag *</label>
                  <select
                    value={formData.dietary}
                    onChange={(e) => setFormData({ ...formData, dietary: e.target.value as DietaryType })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-rose-500 font-medium"
                  >
                    <option value="veg">🟢 Pure Veg</option>
                    <option value="non-veg">🔴 Non-Veg</option>
                    <option value="egg">🟡 Egg</option>
                    <option value="dessert">🟣 Dessert / Sweet</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ingredients, taste profile, and preparation style..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-rose-500 font-medium"
                />
              </div>

              {/* Pricing Options */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Is this a Korean Pocket Pizza?</span>
                  <input
                    type="checkbox"
                    checked={formData.isPocketPizza}
                    onChange={(e) => setFormData({ ...formData, isPocketPizza: e.target.checked })}
                    className="w-4 h-4 accent-rose-600 rounded"
                  />
                </div>

                {formData.isPocketPizza ? (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Shape-Tier Pricing (₹)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500">[R] Rectangular</span>
                        <input
                          type="number"
                          value={formData.priceR}
                          onChange={(e) => setFormData({ ...formData, priceR: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-mono font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-rose-600 font-semibold">[C] Circular</span>
                        <input
                          type="number"
                          value={formData.priceC}
                          onChange={(e) => setFormData({ ...formData, priceC: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-mono font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500">[S] Square</span>
                        <input
                          type="number"
                          value={formData.priceS}
                          onChange={(e) => setFormData({ ...formData, priceS: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-mono font-bold text-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Price (₹) *</label>
                    <input
                      type="number"
                      required
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                      placeholder="149"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-800"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Image URL</label>
                  <input
                    type="url"
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-rose-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Badge (Optional)</label>
                  <input
                    type="text"
                    value={formData.badge}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                    placeholder="e.g. MUST TRY or NEW"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-rose-500 font-medium"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingItem}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold shadow-xs transition text-xs flex items-center justify-center gap-2"
                >
                  {isSubmittingItem ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    editingItem ? 'Save Item Changes' : 'Add Item to Menu'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= TAB 3: RESTAURANT ANALYTICS ================= */}
      {adminTab === 'analytics' && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Total Gross Revenue
              </div>
              <div className="text-2xl sm:text-3xl font-black text-rose-600 font-mono">
                ₹{totalRevenue.toFixed(2)}
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-1">
                ↑ 18.5% vs yesterday
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Total Orders Placed
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900">
                {totalOrdersCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {activeOrdersCount} in kitchen / delivery
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Average Order Value (AOV)
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-600 font-mono">
                ₹{totalOrdersCount > 0 ? (totalRevenue / totalOrdersCount).toFixed(0) : '0'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">High combo adoption</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Top Pocket Shape
              </div>
              <div className="text-2xl sm:text-3xl font-black text-rose-600">
                [C] Circular
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Classic shape favorite (54%)</div>
            </div>
          </div>

          {/* Detailed Performance Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category Performance */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-rose-600">
                Category Sales Breakdown
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between font-semibold text-slate-700 mb-1">
                    <span>Korean Pocket Pizzas (Veg & Non-Veg)</span>
                    <span className="text-rose-600 font-bold">58% of Sales</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-600 rounded-full w-[58%]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-semibold text-slate-700 mb-1">
                    <span>Chinese Starters (Manchurian, 65, Chilli)</span>
                    <span className="text-amber-600 font-bold">24% of Sales</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full w-[24%]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-semibold text-slate-700 mb-1">
                    <span>Fried Rice & Wok Noodles</span>
                    <span className="text-emerald-600 font-bold">12% of Sales</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full w-[12%]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-semibold text-slate-700 mb-1">
                    <span>Dessert Pizzas & Maggie/Momos</span>
                    <span className="text-purple-600 font-bold">6% of Sales</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full w-[6%]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Shape Popularity Comparison */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-rose-600">
                Korean Pocket Pizza Shapes Preference
              </h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold text-slate-700">[R] Rectangular</div>
                  <div className="text-lg font-black text-slate-900 mt-1">26%</div>
                  <div className="text-[10px] text-slate-400">Regular Tier</div>
                </div>

                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
                  <div className="text-xs font-bold text-rose-700">[C] Circular</div>
                  <div className="text-lg font-black text-rose-600 mt-1">54%</div>
                  <div className="text-[10px] text-rose-600/80">Classic (Top)</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold text-slate-700">[S] Square</div>
                  <div className="text-lg font-black text-slate-900 mt-1">20%</div>
                  <div className="text-[10px] text-slate-400">Signature Tier</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ================= TAB 3: KOT & PRINTER MANAGEMENT ================= */}
      {adminTab === 'printers' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Thermal Printer & KOT Station Hub</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                  <Wifi className="w-3 h-3 text-emerald-600 animate-pulse" />
                  <span>Printers Online</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Configure auto-dispatch for Kitchen Order Tickets (KOT) on dine-in orders and manage thermal billing printers (80mm / 58mm).
              </p>
            </div>

            <div className="flex items-center gap-2">
              {adminOrders.length > 0 && (
                <button
                  onClick={() => setPrintModalData({ order: adminOrders[0], type: 'kot' })}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  <ChefHat className="w-4 h-4" />
                  <span>Test KOT Print</span>
                </button>
              )}
              {adminOrders.length > 0 && (
                <button
                  onClick={() => setPrintModalData({ order: adminOrders[0], type: 'receipt' })}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>Test Bill Print</span>
                </button>
              )}
            </div>
          </div>

          {/* Printer Device Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Device 1: Kitchen KOT Printer */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold">
                    <ChefHat className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Station 1 & 2: Kitchen KOT Printer</h3>
                    <p className="text-[11px] text-slate-500">Pizza Deck Oven + Chinese Wok Stations</p>
                  </div>
                </div>
                <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                  READY
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Printer IP / Interface Port</label>
                  <input
                    type="text"
                    value={printerSettings.kitchenPrinterIP}
                    onChange={(e) => setPrinterSettings({ ...printerSettings, kitchenPrinterIP: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div>
                    <div className="font-bold text-slate-800">Auto-Print KOT on Dine-In Order</div>
                    <div className="text-[11px] text-slate-500">Sends ticket directly to kitchen when table order placed</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={printerSettings.autoPrintKOTOnDineIn}
                    onChange={(e) => setPrinterSettings({ ...printerSettings, autoPrintKOTOnDineIn: e.target.checked })}
                    className="w-4 h-4 accent-amber-600 rounded"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">KOT Header Chef Instruction Note</label>
                  <input
                    type="text"
                    value={printerSettings.kotHeaderNote}
                    onChange={(e) => setPrinterSettings({ ...printerSettings, kotHeaderNote: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Device 2: Front Desk Billing Printer */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center font-bold">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Station 3: Cashier Billing Printer</h3>
                    <p className="text-[11px] text-slate-500">Customer Tax Invoices & Payment Slips</p>
                  </div>
                </div>
                <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                  ONLINE
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Billing Printer IP / USB Port</label>
                  <input
                    type="text"
                    value={printerSettings.billingPrinterIP}
                    onChange={(e) => setPrinterSettings({ ...printerSettings, billingPrinterIP: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div>
                    <div className="font-bold text-slate-800">Auto-Print Tax Invoice on Payment</div>
                    <div className="text-[11px] text-slate-500">Prints customer receipt once UPI / Cash paid</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={printerSettings.autoPrintReceiptOnPaid}
                    onChange={(e) => setPrinterSettings({ ...printerSettings, autoPrintReceiptOnPaid: e.target.checked })}
                    className="w-4 h-4 accent-rose-600 rounded"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Thermal Paper Roll Size</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['80mm', '58mm'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setPrinterSettings({ ...printerSettings, paperWidth: sz })}
                        className={`py-2 rounded-xl font-bold text-xs border transition ${
                          printerSettings.paperWidth === sz
                            ? 'bg-rose-50 border-rose-500 text-rose-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {sz} (Standard POS Roll)
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dine-In KOT Dispatch Table */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Active Dine-In Kitchen Routing (KOTs)</h3>
                <p className="text-xs text-slate-500">Live KOT status assigned across Pizza Deck, Chinese Wok, and Beverage Stations.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold">
                    <th className="pb-2.5">KOT #</th>
                    <th className="pb-2.5">ORDER ID</th>
                    <th className="pb-2.5">TABLE / TYPE</th>
                    <th className="pb-2.5">KITCHEN STATION</th>
                    <th className="pb-2.5">ITEMS</th>
                    <th className="pb-2.5">STATUS</th>
                    <th className="pb-2.5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {adminOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No active orders currently waiting for KOT dispatch.
                      </td>
                    </tr>
                  ) : (
                    adminOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 font-mono font-black text-amber-700">
                          {ord.kotNumber ? (
                            <div className="flex items-center gap-1.5">
                              <span>{ord.kotNumber}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Delete KOT ${ord.kotNumber} for Order #${ord.id}?`)) {
                                    handleAdminDeleteKot(ord.id);
                                  }
                                }}
                                title="Delete / Clear KOT Ticket"
                                className="p-1 rounded hover:bg-rose-100 text-amber-700 hover:text-rose-600 transition"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-normal italic">Cleared</span>
                          )}
                        </td>
                        <td className="py-3 font-mono font-bold text-rose-600">#{ord.id}</td>
                        <td className="py-3 font-bold text-slate-800">
                          {ord.customer.tableNumber ? `🪑 ${ord.customer.tableNumber}` : ord.orderType.replace('_', ' ')}
                        </td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[11px]">
                            {ord.kotStation || 'All Stations'}
                          </span>
                        </td>
                        <td className="py-3 text-slate-600 font-bold">
                          {ord.items.length} dish{ord.items.length > 1 ? 'es' : ''} ({ord.items.map((i) => `${i.quantity}x ${i.menuItem.name}`).join(', ').slice(0, 30)}...)
                        </td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                            {ord.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {ord.kotNumber && (
                              <button
                                onClick={() => setPrintModalData({ order: ord, type: 'kot' })}
                                className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition flex items-center gap-1 shadow-2xs"
                                title="Print KOT Slip"
                              >
                                <ChefHat className="w-3 h-3" />
                                <span>KOT</span>
                              </button>
                            )}
                            <button
                              onClick={() => setPrintModalData({ order: ord, type: 'receipt' })}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-[11px] transition flex items-center gap-1 shadow-2xs"
                              title="Print Bill / Invoice"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Bill</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Permanently delete Order #${ord.id}?`)) {
                                  handleAdminDeleteOrder(ord.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition"
                              title="Delete Order Permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 5: QR TOKENS, STAND CARDS & DOWNLOADS ================= */}
      {adminTab === 'qr_codes' && (
        <div className="space-y-6">
          {/* Top Banner with Direct Action Buttons */}
          <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 rounded-3xl p-6 text-white shadow-md border border-slate-800">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-400 text-slate-950 shadow-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />
                  <span>TABLE QR CODES & STAND CARD DOWNLOADS</span>
                </div>
                <h3 className="text-xl font-extrabold tracking-tight">
                  Restaurant Table Stands & Counter QR Generator
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Download high-resolution QR codes and acrylic tent stand graphics for each dining table.
                  When customers scan the QR at their table, the session is cryptographically locked to that specific table for direct Kitchen KOT dispatch.
                </p>
              </div>

              {/* Action Hub in Header */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedQRTarget(1);
                    setShowQRDownloadModal(true);
                  }}
                  className="px-4 py-2.5 rounded-2xl text-xs font-extrabold bg-gradient-to-r from-amber-400 to-rose-400 hover:from-amber-500 hover:to-rose-500 text-slate-950 shadow-md flex items-center justify-center gap-2 transition"
                >
                  <FileImage className="w-4 h-4" />
                  <span>Print & Download Center</span>
                </button>

                <button
                  type="button"
                  disabled={batchQRDownloading}
                  onClick={async () => {
                    setBatchQRDownloading(true);
                    try {
                      setBatchQRStatus('Downloading Counter Takeaway Stand...');
                      const counterToken = generateSignedQRToken({ mode: 'takeaway', source: 'counter_qr' });
                      await downloadTableStandImage(
                        { identifier: 'Counter Express', qrUrl: counterToken.fullCanonicalUrl },
                        'Mozz_Stand_Counter_Express.png'
                      );
                      await new Promise((r) => setTimeout(r, 600));

                      for (let i = 1; i <= tableCount; i++) {
                        setBatchQRStatus(`Downloading Table ${i} Stand (${i}/${tableCount})...`);
                        const tGen = generateSignedQRToken({
                          mode: 'dine_in',
                          source: 'table_qr',
                          tableNumber: `Table ${i}`,
                        });
                        await downloadTableStandImage(
                          { identifier: `Table ${i}`, qrUrl: tGen.fullCanonicalUrl },
                          `Mozz_Stand_Table_${i}.png`
                        );
                        await new Promise((r) => setTimeout(r, 600));
                      }
                      setBatchQRStatus('All Table Stand Cards Downloaded Successfully!');
                      setTimeout(() => {
                        setBatchQRDownloading(false);
                        setBatchQRStatus('');
                      }, 2500);
                    } catch (err) {
                      console.error('Batch download failed:', err);
                      setBatchQRDownloading(false);
                      setBatchQRStatus('Download interrupted. Check browser permissions.');
                    }
                  }}
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-amber-400" />
                  <span>{batchQRDownloading ? 'Downloading...' : 'Batch Download All Stands'}</span>
                </button>
              </div>
            </div>

            {/* Batch Progress Banner */}
            {batchQRStatus && (
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2 text-xs font-bold text-amber-300">
                <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
                <span>{batchQRStatus}</span>
              </div>
            )}
          </div>

          {/* Table Count Selector Bar & Floor Plan Setup */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <span>🍽️ Active Dining Tables Floor Layout</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  {tableCount} Tables Configured
                </span>
              </h4>
              <p className="text-xs text-slate-500">
                Generate and download QR cards for all tables in your dining area.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600">Number of Tables:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                {[4, 8, 10, 12, 16, 20].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setTableCount(count)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      tableCount === count
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dine-In Table QRs Grid with Real Rendered Barcodes */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-slate-900 text-base">
                Dine-In Table QR Cards (Tables 1 - {tableCount})
              </h4>
              <span className="text-xs text-slate-500 font-medium">
                Click any table to preview acrylic tent card, download PNG, or copy entry link
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: tableCount }, (_, i) => i + 1).map((tableNum) => {
                const { token, fullCanonicalUrl } = generateSignedQRToken({
                  mode: 'dine_in',
                  source: 'table_qr',
                  tableNumber: `Table ${tableNum}`,
                });

                return (
                  <AdminTableQRCard
                    key={tableNum}
                    tableNumber={`Table ${tableNum}`}
                    tableIndex={tableNum}
                    fullCanonicalUrl={fullCanonicalUrl}
                    token={token}
                    isCounter={false}
                    copiedUrl={copiedUrl}
                    onCopy={(url) => {
                      navigator.clipboard.writeText(url);
                      setCopiedUrl(url);
                      setTimeout(() => setCopiedUrl(null), 2500);
                    }}
                    onOpenModal={(t) => {
                      setSelectedQRTarget(t);
                      setShowQRDownloadModal(true);
                    }}
                    onTestScan={() => {
                      switchQRSession({
                        source: 'table_qr',
                        orderMode: 'dine_in',
                        tableNumber: `Table ${tableNum}`,
                        token,
                      });
                      onBackToMenu();
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Counter Express QR & Online Direct Access */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Counter QR Card */}
            {(() => {
              const { token: counterToken, fullCanonicalUrl: counterUrl } = generateSignedQRToken({
                mode: 'takeaway',
                source: 'counter_qr',
              });

              return (
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                        <span>🛍️ Counter Takeaway QR Stand</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                          LOCKED TO TAKEAWAY
                        </span>
                      </h4>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">
                      Place this acrylic stand at the billing / express takeaway counter. Customers scan to order for self-pickup.
                    </p>

                    <AdminQRVisualPreview url={counterUrl} label="COUNTER EXPRESS" isCounter={true} />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await downloadTableStandImage(
                            { identifier: 'Counter Express', qrUrl: counterUrl },
                            'Mozz_Stand_Counter_Express.png'
                          );
                        }}
                        className="py-2 px-3 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center justify-center gap-1.5 transition"
                      >
                        <FileImage className="w-3.5 h-3.5" />
                        <span>Download Stand PNG</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          await downloadQRImage(counterUrl, 'Mozz_Counter_Takeaway_QR.png', 1024);
                        }}
                        className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 flex items-center justify-center gap-1.5 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download QR Only</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(counterUrl);
                          setCopiedUrl(counterUrl);
                          setTimeout(() => setCopiedUrl(null), 2500);
                        }}
                        className="py-2 px-3 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center gap-1.5 transition"
                      >
                        {copiedUrl === counterUrl ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                            <span>Copy Counter URL</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          switchQRSession({
                            source: 'counter_qr',
                            orderMode: 'takeaway',
                            token: counterToken,
                          });
                          onBackToMenu();
                        }}
                        className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-1.5 shadow-xs transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Test Scan View</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Direct Online Customer Card */}
            {(() => {
              const onlineUrl = `https://starters4u.in/`;

              return (
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                        <span>🛵 Online Direct Customers</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          HOME DELIVERY / PICKUP
                        </span>
                      </h4>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">
                      Direct organic web traffic visiting the domain without a table/counter QR token. Enables Home Delivery mode with address input.
                    </p>

                    <div className="flex items-center gap-4 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200">
                      <div className="w-20 h-20 bg-slate-950 rounded-xl flex items-center justify-center p-2 text-white shrink-0">
                        <Globe className="w-full h-full text-emerald-400" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="font-extrabold text-sm text-slate-900">Direct Web Website</div>
                        <div className="text-[11px] text-slate-500">Order Mode: Home Delivery (or optional Takeaway)</div>
                        <div className="font-mono text-[10px] text-slate-700 bg-white px-2 py-1 rounded border border-emerald-200 truncate select-all">
                          {onlineUrl}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(onlineUrl);
                        setCopiedUrl(onlineUrl);
                        setTimeout(() => setCopiedUrl(null), 2500);
                      }}
                      className="py-2 px-3 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center gap-1.5 transition"
                    >
                      {copiedUrl === onlineUrl ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copy Web URL</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        clearQRSession();
                        onBackToMenu();
                      }}
                      className="py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shadow-xs transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Test Direct Web</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ================= TAB 7: CUSTOMER INQUIRIES & SUPPORT ================= */}
      {adminTab === 'inquiries' && (
        <div className="space-y-6">
          {/* Header & Metrics */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-rose-600" />
                <span>Customer Inquiries & Support Tickets</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-tenant tickets submitted through the contact form. Plain-text verified with audit IP hash.
              </p>
            </div>

            <button
              onClick={fetchInquiries}
              disabled={isLoadingInquiries}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 self-start sm:self-auto shadow-xs transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInquiries ? 'animate-spin text-rose-600' : 'text-slate-500'}`} />
              <span>Refresh Inquiries</span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Received</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{inquiries.length}</div>
            </div>
            <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 shadow-xs">
              <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">New (Pending)</div>
              <div className="text-2xl font-black text-amber-900 mt-1">
                {inquiries.filter((i) => i.status === 'new').length}
              </div>
            </div>
            <div className="bg-blue-50/60 border border-blue-200 rounded-2xl p-4 shadow-xs">
              <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">In Review</div>
              <div className="text-2xl font-black text-blue-900 mt-1">
                {inquiries.filter((i) => i.status === 'in_review').length}
              </div>
            </div>
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 shadow-xs">
              <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Resolved</div>
              <div className="text-2xl font-black text-emerald-900 mt-1">
                {inquiries.filter((i) => i.status === 'resolved').length}
              </div>
            </div>
          </div>

          {/* Controls: Filter & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-bold">
              {[
                { id: 'all', label: `All (${inquiries.length})` },
                { id: 'new', label: `New (${inquiries.filter((i) => i.status === 'new').length})` },
                { id: 'in_review', label: `In Review (${inquiries.filter((i) => i.status === 'in_review').length})` },
                { id: 'resolved', label: `Resolved (${inquiries.filter((i) => i.status === 'resolved').length})` },
                { id: 'spam', label: `Spam (${inquiries.filter((i) => i.status === 'spam').length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setInquiryStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
                    inquiryStatusFilter === tab.id
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={inquirySearch}
                onChange={(e) => setInquirySearch(e.target.value)}
                placeholder="Search name, phone, order..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
          </div>

          {/* Inquiries List */}
          {isLoadingInquiries && inquiries.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-3xl shadow-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-rose-600 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Loading customer inquiries...</p>
            </div>
          ) : (
            (() => {
              const filtered = inquiries.filter((inq) => {
                if (inquiryStatusFilter !== 'all' && inq.status !== inquiryStatusFilter) return false;
                if (inquirySearch.trim()) {
                  const q = inquirySearch.toLowerCase();
                  return (
                    inq.name.toLowerCase().includes(q) ||
                    (inq.phone && inq.phone.includes(q)) ||
                    (inq.order_id && inq.order_id.toLowerCase().includes(q)) ||
                    inq.message.toLowerCase().includes(q)
                  );
                }
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <div className="p-12 text-center bg-white border border-slate-200 rounded-3xl shadow-xs">
                    <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-black text-slate-800">No inquiries found</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      {inquirySearch
                        ? 'No inquiries match your current search query.'
                        : 'No inquiries have been recorded for this status filter yet.'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {filtered.map((inq) => (
                    <div
                      key={inq.id}
                      className={`p-5 rounded-2xl border transition bg-white shadow-xs ${
                        inq.status === 'new'
                          ? 'border-amber-300 bg-amber-50/20'
                          : inq.status === 'in_review'
                          ? 'border-blue-200 bg-blue-50/10'
                          : inq.status === 'resolved'
                          ? 'border-emerald-200'
                          : 'border-slate-200 opacity-75'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-slate-900">{inq.name}</span>
                            <span className="font-mono text-[11px] text-slate-400">#{inq.id}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                inq.status === 'new'
                                  ? 'bg-amber-100 text-amber-800'
                                  : inq.status === 'in_review'
                                  ? 'bg-blue-100 text-blue-800'
                                  : inq.status === 'resolved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {inq.status.replace('_', ' ')}
                            </span>
                            {inq.order_id && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Order: {inq.order_id}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                            {inq.phone && (
                              <a
                                href={`tel:${inq.phone}`}
                                className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-bold"
                              >
                                <PhoneCall className="w-3 h-3" />
                                <span>{inq.phone}</span>
                              </a>
                            )}
                            <span>•</span>
                            <span>{new Date(inq.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                            <span>•</span>
                            <span className="font-mono text-[10px] text-slate-400" title="HMAC SHA-256 IP Hash">
                              IP Hash: {inq.ip_hash.slice(0, 10)}...
                            </span>
                          </div>
                        </div>

                        {/* Status Action Buttons */}
                        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 flex-wrap">
                          {inq.status !== 'in_review' && inq.status !== 'resolved' && (
                            <button
                              onClick={() => handleUpdateInquiryStatus(inq.id, 'in_review')}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
                            >
                              Mark In Review
                            </button>
                          )}
                          {inq.status !== 'resolved' && (
                            <button
                              onClick={() => handleUpdateInquiryStatus(inq.id, 'resolved')}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                            >
                              Mark Resolved
                            </button>
                          )}
                          {inq.status !== 'spam' && (
                            <button
                              onClick={() => handleUpdateInquiryStatus(inq.id, 'spam')}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                            >
                              Mark Spam
                            </button>
                          )}
                          {(inq.status === 'resolved' || inq.status === 'spam') && (
                            <button
                              onClick={() => handleUpdateInquiryStatus(inq.id, 'new')}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition"
                            >
                              Reopen
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Customer Message Body (safely rendered as plain text) */}
                      <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans select-text">
                        {inq.message}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Table QR Stand Generator & Print Modal */}
      {showQRDownloadModal && (
        <TableQRGeneratorModal
          tableCount={tableCount}
          initialSelectedTable={selectedQRTarget}
          onClose={() => setShowQRDownloadModal(false)}
          onTestScan={(source, tNum, token, tId) => {
            switchQRSession({
              source,
              orderMode: source === 'counter_qr' ? 'takeaway' : 'dine_in',
              tableNumber: tNum,
              token,
              tableId: tId,
            });
            onBackToMenu();
          }}
        />
      )}

      {/* Print Slip Modal */}
      {printModalData && (
        <PrintModal
          order={printModalData.order}
          type={printModalData.type}
          onClose={() => setPrintModalData(null)}
        />
      )}
    </div>
  );
};

// ================= SUB-COMPONENTS FOR TABLE QR DASHBOARD =================

interface AdminTableQRCardProps {
  tableNumber: string;
  tableIndex: number;
  fullCanonicalUrl: string;
  token: string;
  isCounter: boolean;
  copiedUrl: string | null;
  onCopy: (url: string) => void;
  onOpenModal: (target: number | 'counter') => void;
  onTestScan: () => void;
}

const AdminTableQRCard: React.FC<AdminTableQRCardProps> = ({
  tableNumber,
  tableIndex,
  fullCanonicalUrl,
  token,
  copiedUrl,
  onCopy,
  onOpenModal,
  onTestScan,
}) => {
  const [qrImgUrl, setQrImgUrl] = useState<string>('');
  const [downloading, setDownloading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    generateQRDataURL(fullCanonicalUrl, 320)
      .then((url) => {
        if (active) setQrImgUrl(url);
      })
      .catch((e) => console.error(e));

    return () => {
      active = false;
    };
  }, [fullCanonicalUrl]);

  return (
    <div className="border border-slate-200 rounded-3xl p-4 bg-slate-50/70 hover:bg-white hover:border-amber-400 hover:shadow-lg transition-all duration-200 flex flex-col justify-between space-y-3 group">
      <div>
        {/* Table Top Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span className="font-extrabold text-sm text-slate-900">{tableNumber}</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
            Dine-In Table
          </span>
        </div>

        {/* Live Scannable QR Graphic Frame */}
        <div
          onClick={() => onOpenModal(tableIndex)}
          className="w-full aspect-square bg-white border border-slate-200 rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-inner relative cursor-pointer group-hover:border-amber-300 transition overflow-hidden"
          title="Click to preview & print table stand"
        >
          {qrImgUrl ? (
            <img
              src={qrImgUrl}
              alt={tableNumber}
              className="w-full h-full object-contain transition group-hover:scale-105"
            />
          ) : (
            <div className="w-20 h-20 bg-slate-950 rounded-lg flex items-center justify-center p-2 text-white">
              <QrCode className="w-full h-full text-amber-400 animate-pulse" />
            </div>
          )}

          <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white p-2 rounded-2xl backdrop-blur-xs">
            <Printer className="w-6 h-6 text-amber-400 mb-1" />
            <span className="text-xs font-black">Open Stand Card</span>
            <span className="text-[10px] text-slate-300">Ready to Print & Download</span>
          </div>
        </div>

        <div className="mt-2.5">
          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Encrypted Entry URL:</span>
          <div className="font-mono text-[10px] text-slate-700 bg-white px-2 py-1 rounded-lg border border-slate-200 truncate select-all">
            /r/mozz/table/{tableIndex}?token={token.slice(0, 10)}...
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-2 border-t border-slate-200/80">
        {/* Primary Download Buttons */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try {
                await downloadTableStandImage(
                  {
                    identifier: tableNumber,
                    qrUrl: fullCanonicalUrl,
                  },
                  `Mozz_Stand_${tableNumber.replace(/\s+/g, '_')}.png`
                );
              } finally {
                setDownloading(false);
              }
            }}
            className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center justify-center gap-1 shadow-xs transition disabled:opacity-50"
            title="Download full acrylic table stand graphic (PNG)"
          >
            <FileImage className="w-3.5 h-3.5" />
            <span>Stand PNG</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await downloadQRImage(
                fullCanonicalUrl,
                `Mozz_QR_${tableNumber.replace(/\s+/g, '_')}.png`,
                1024
              );
            }}
            className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center gap-1 transition"
            title="Download clean QR code PNG only"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>QR Only</span>
          </button>
        </div>

        {/* Secondary Test & Copy Actions */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onCopy(fullCanonicalUrl)}
            className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center gap-1 transition"
          >
            {copiedUrl === fullCanonicalUrl ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span className="text-emerald-700">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-500" />
                <span>Copy URL</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onTestScan}
            className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-1 shadow-xs transition"
            title={`Simulate customer scanning ${tableNumber} QR`}
          >
            <ExternalLink className="w-3 h-3" />
            <span>Test Scan</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminQRVisualPreview: React.FC<{ url: string; label: string; isCounter?: boolean }> = ({
  url,
  label,
  isCounter = false,
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    generateQRDataURL(url, 280)
      .then((res) => setDataUrl(res))
      .catch((e) => console.error(e));
  }, [url]);

  return (
    <div className={`flex items-center gap-4 p-4 rounded-2xl border ${
      isCounter ? 'bg-blue-50/50 border-blue-200' : 'bg-emerald-50/50 border-emerald-200'
    }`}>
      <div className="w-24 h-24 bg-white rounded-xl flex items-center justify-center p-1.5 text-slate-950 border border-slate-200 shadow-sm shrink-0">
        {dataUrl ? (
          <img src={dataUrl} alt={label} className="w-full h-full object-contain" />
        ) : (
          <QrCode className="w-10 h-10 text-blue-500" />
        )}
      </div>
      <div className="space-y-1 min-w-0 flex-1">
        <div className="font-extrabold text-sm text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-500">
          {isCounter ? 'Order Mode: Takeaway (Self-Pickup Express)' : 'Order Mode: Direct Online'}
        </div>
        <div className="font-mono text-[10px] text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 truncate select-all">
          {url}
        </div>
      </div>
    </div>
  );
};

