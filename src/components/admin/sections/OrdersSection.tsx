import React, { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
import { PrintModal } from '../../PrintModal';
import { formatOrderDateTime, formatOrderDateTimeLong, formatOrderDateOnly } from '../../../utils/dateUtils';
import {
  Search,
  Filter,
  RefreshCw,
  Printer,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChefHat,
  ShoppingBag,
  Trash2,
  Receipt,
  Phone,
  MapPin,
  FileText,
  CreditCard,
  Ban,
  MessageSquare,
  Check,
} from 'lucide-react';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.031 2C6.516 2 2.031 6.484 2.031 12c0 1.944.557 3.76 1.523 5.305L2 22l4.82-1.508A9.972 9.972 0 0012.031 22c5.516 0 10-4.484 10-10s-4.484-10-10-10zm0 18.25c-1.637 0-3.176-.46-4.507-1.266l-.323-.195-2.875.9.9-2.805-.211-.336A8.22 8.22 0 013.781 12c0-4.55 3.7-8.25 8.25-8.25s8.25 3.7 8.25 8.25-3.7 8.25-8.25 8.25zm4.52-6.176c-.246-.125-1.465-.723-1.691-.809-.227-.082-.391-.125-.555.125-.164.246-.637.809-.781.973-.145.164-.29.184-.535.063-.246-.125-1.04-.383-1.98-1.223-.734-.656-1.23-1.465-1.375-1.71-.145-.246-.016-.379.105-.504.11-.11.246-.29.37-.434.121-.145.164-.246.246-.41.082-.164.041-.312-.02-.434-.063-.125-.555-1.336-.762-1.832-.2-.48-.406-.418-.555-.426l-.473-.008c-.164 0-.434.063-.656.312-.227.246-.867.848-.867 2.066 0 1.219.887 2.398 1.012 2.566.125.164 1.746 2.664 4.227 3.738.59.254 1.05.406 1.41.52.594.191 1.133.164 1.562.1.477-.07 1.465-.6 1.672-1.18.207-.578.207-1.074.145-1.18-.063-.105-.227-.168-.473-.293z" />
  </svg>
);

export const OrdersSection: React.FC = () => {
  const { user, restaurant, adminFetch } = useAdminAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printType, setPrintType] = useState<'kot' | 'bill'>('kot');
  const [restaurantProfile, setRestaurantProfile] = useState<any>(null);
  const [orderToCancel, setOrderToCancel] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [orderToDelete, setOrderToDelete] = useState<any | null>(null);
  const [sendingFeedbackOrderId, setSendingFeedbackOrderId] = useState<string | null>(null);

  const currentTimezone = restaurantProfile?.timezone || (restaurant as any)?.timezone || 'Asia/Kolkata';

  const getItemName = (it: any): string => {
    return it.menuItem?.name || it.name || it.itemName || 'Item';
  };

  const getItemUnitPrice = (it: any): number => {
    const val = it.unitPrice ?? it.customerUnitPrice ?? it.price ?? it.menuItem?.price ?? 0;
    return Number(val) || 0;
  };

  const isValidCustomerPhone = (phone?: string | null): boolean => {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  };

  const isDeliveredOrCompleted = (status?: string): boolean => {
    const s = (status || '').toLowerCase();
    return s === 'delivered' || s === 'completed' || s === 'settled';
  };

  const getOrderDate = (ord: any): string | undefined => {
    return (
      ord?.createdAt ||
      ord?.created_at ||
      ord?.confirmedAt ||
      ord?.confirmed_at ||
      (Array.isArray(ord?.statusHistory) && ord.statusHistory[0]?.timestamp) ||
      undefined
    );
  };

  const getOrderConfirmedAt = (ord: any): string | undefined => {
    if (ord?.confirmedAt) return ord.confirmedAt;
    if (Array.isArray(ord?.statusHistory)) {
      const conf = ord.statusHistory.find((h: any) => h.status === 'confirmed' || h.status === 'accepted');
      if (conf && conf.timestamp) return conf.timestamp;
    }
    return undefined;
  };

  const getOrderCompletedAt = (ord: any): string | undefined => {
    if (ord?.completedAt) return ord.completedAt;
    if (Array.isArray(ord?.statusHistory)) {
      const comp = ord.statusHistory.find((h: any) => h.status === 'delivered' || h.status === 'completed');
      if (comp && comp.timestamp) return comp.timestamp;
    }
    return undefined;
  };

  const handleSendWhatsAppFeedback = async (ord: any) => {
    if (!ord || !ord.id) return;
    if (ord.feedbackRequest?.status === 'SENT') {
      return; // Duplicate protection
    }

    setSendingFeedbackOrderId(ord.id);
    try {
      const res = await adminFetch('/api/whatsapp/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: ord.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id === ord.id) {
              return {
                ...o,
                feedbackRequest: {
                  ...(o.feedbackRequest || {}),
                  status: 'SENT',
                  sentAt: data.sentAt || new Date().toISOString(),
                  whatsappMessageId: data.whatsappMessageId,
                },
              };
            }
            return o;
          })
        );
        if (selectedOrder?.id === ord.id) {
          setSelectedOrder((prev: any) =>
            prev
              ? {
                  ...prev,
                  feedbackRequest: {
                    ...(prev.feedbackRequest || {}),
                    status: 'SENT',
                    sentAt: data.sentAt || new Date().toISOString(),
                    whatsappMessageId: data.whatsappMessageId,
                  },
                }
              : null
          );
        }
        soundService.playChime('notification');
      } else {
        alert(`WhatsApp feedback dispatch failed: ${data.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Error sending WhatsApp feedback: ${err.message}`);
    } finally {
      setSendingFeedbackOrderId(null);
    }
  };

  useEffect(() => {
    adminFetch('/api/admin/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setRestaurantProfile(data);
      })
      .catch((err) => console.warn('[OrdersSection] Could not load restaurant profile:', err));
  }, [adminFetch]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/orders');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setOrders(data);
          setFetchError(null);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setFetchError(errData.error || 'Unable to load orders. Please try again.');
      }
    } catch (err: any) {
      console.error('[OrdersSection] Error fetching orders:', err);
      setFetchError('Unable to load orders. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 6000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleUpdateStatus = async (orderId: string, newStatus: string, note?: string) => {
    setIsUpdating(true);
    try {
      const res = await adminFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, note }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(updated);
        }
        soundService.playChime('notification');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Status update failed: ${err.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Error updating status: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    const reason = window.prompt('Enter reason for cancellation (e.g. Out of stock, Customer request):');
    if (reason === null) return;
    await handleUpdateStatus(orderId, 'cancelled', reason || 'Cancelled by Admin');
  };

  const handleDeleteOrder = async (orderId: string) => {
    const ord = orders.find((o) => o.id === orderId) || (selectedOrder?.id === orderId ? selectedOrder : null);
    if (ord) {
      setOrderToDelete(ord);
    } else {
      if (!window.confirm('Are you sure you want to permanently delete this order?')) return;
      await executeDeleteOrder(orderId);
    }
  };

  const executeDeleteOrder = async (orderId: string) => {
    try {
      const res = await adminFetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(null);
        }
        soundService.playChime('pop');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to delete order: ${err.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Failed to delete order: ${err.message}`);
    }
  };

  const isStatusInTab = (status: string, tabId: string): boolean => {
    switch (tabId) {
      case 'all':
        return true;
      case 'placed':
        return ['placed', 'pending', 'confirmed', 'accepted'].includes(status);
      case 'kitchen':
      case 'preparing':
      case 'baking':
        return ['preparing', 'baking'].includes(status);
      case 'packing':
        return ['packing'].includes(status);
      case 'out_for_delivery':
      case 'ready':
        return ['out_for_delivery', 'ready_for_pickup', 'ready'].includes(status);
      case 'completed':
      case 'delivered':
        return ['delivered', 'completed', 'settled'].includes(status);
      case 'cancelled':
        return ['cancelled', 'rejected'].includes(status);
      default:
        return status === tabId;
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== 'all' && !isStatusInTab(o.status, statusFilter)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = (o.orderNumber || o.id).toLowerCase().includes(q);
      const matchName = (o.customer?.name || '').toLowerCase().includes(q);
      const matchPhone = (o.customer?.phone || '').includes(q);
      if (!matchNum && !matchName && !matchPhone) return false;
    }
    return true;
  });

  const statusPills = [
    { id: 'all', label: 'All Orders', count: orders.length },
    { id: 'placed', label: 'New Placed', count: orders.filter((o) => isStatusInTab(o.status, 'placed')).length },
    { id: 'kitchen', label: 'In Kitchen / Oven', count: orders.filter((o) => isStatusInTab(o.status, 'kitchen')).length },
    { id: 'packing', label: 'Packing', count: orders.filter((o) => isStatusInTab(o.status, 'packing')).length },
    { id: 'out_for_delivery', label: 'Out for Delivery', count: orders.filter((o) => isStatusInTab(o.status, 'out_for_delivery')).length },
    { id: 'completed', label: 'Completed', count: orders.filter((o) => isStatusInTab(o.status, 'completed')).length },
    { id: 'cancelled', label: 'Cancelled', count: orders.filter((o) => isStatusInTab(o.status, 'cancelled')).length },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'placed':
      case 'pending':
      case 'confirmed':
      case 'accepted':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'preparing':
      case 'baking':
        return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'packing':
        return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'ready':
      case 'ready_for_pickup':
      case 'out_for_delivery':
        return 'bg-indigo-100 text-indigo-900 border-indigo-300';
      case 'delivered':
      case 'completed':
      case 'settled':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'cancelled':
      case 'rejected':
        return 'bg-rose-100 text-rose-900 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Order #, Customer Name, or Phone..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {statusPills.map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === pill.id
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{pill.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  statusFilter === pill.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {pill.count}
              </span>
            </button>
          ))}

          <button
            onClick={fetchOrders}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition shrink-0"
            title="Refresh Orders"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Orders List & Detail Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Orders Table List */}
        <div className={`${selectedOrder ? 'lg:col-span-7' : 'lg:col-span-12'} transition-all`}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400">
                <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs">Loading tenant orders...</p>
              </div>
            ) : fetchError ? (
              <div className="p-12 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
                <p className="text-xs font-bold text-rose-600">{fetchError}</p>
                <button
                  onClick={() => {
                    setIsLoading(true);
                    fetchOrders();
                  }}
                  className="mt-3 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold rounded-lg transition"
                >
                  Retry
                </button>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-bold">No orders found</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Try selecting a different filter or search term.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Items</th>
                      <th className="py-3 px-4">Total</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((ord) => {
                      const isSelected = selectedOrder?.id === ord.id;
                      return (
                        <tr
                          key={ord.id}
                          onClick={() => setSelectedOrder(ord)}
                          className={`cursor-pointer transition ${
                            isSelected ? 'bg-rose-50/60 font-medium' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            {ord.orderNumber || ord.id.slice(0, 8)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="capitalize font-semibold text-slate-700">
                              {ord.orderType?.replace('_', ' ')}
                            </span>
                            {ord.tableNumber && (
                              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 font-extrabold text-rose-800 border border-rose-200">
                                {ord.tableNumber.startsWith('Table') ? ord.tableNumber : `Table ${ord.tableNumber}`}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{ord.customer?.name || 'Walk-in'}</div>
                            <div className="text-[10px] text-slate-400">{ord.customer?.phone}</div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {ord.items?.length || 0} item{(ord.items?.length || 0) > 1 ? 's' : ''}
                          </td>
                          <td className="py-3.5 px-4 font-black text-slate-900">
                            ₹{Number(ord.grandTotal || ord.total || 0).toLocaleString('en-IN')}
                          </td>
                          <td
                            className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap"
                            title={formatOrderDateTimeLong(getOrderDate(ord), currentTimezone)}
                          >
                            {formatOrderDateTime(getOrderDate(ord), currentTimezone)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border ${getStatusColor(
                                ord.status
                              )}`}
                            >
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5 flex-wrap sm:flex-nowrap">
                              {['placed', 'pending', 'confirmed', 'accepted'].includes(ord.status) && (
                                <button
                                  onClick={() => handleUpdateStatus(ord.id, 'preparing', 'Order accepted and sent to kitchen')}
                                  disabled={isUpdating}
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] transition shadow-xs whitespace-nowrap"
                                >
                                  Accept
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedOrder(ord)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] transition whitespace-nowrap"
                              >
                                Details
                              </button>
                              {/* WhatsApp Feedback button beside Details button */}
                              {isDeliveredOrCompleted(ord.status) && isValidCustomerPhone(ord.customer?.phone || ord.customerPhone) && (
                                ord.feedbackRequest?.feedbackRating ? (
                                  <span
                                    className={`px-2 py-1 rounded-lg font-bold text-[10px] border flex items-center gap-1 whitespace-nowrap ${
                                      ord.feedbackRequest.feedbackRating === 'GOOD'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                        : ord.feedbackRequest.feedbackRating === 'AVERAGE'
                                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                                        : 'bg-rose-50 text-rose-800 border-rose-300'
                                    }`}
                                    title={`Feedback received: ${ord.feedbackRequest.feedbackRating}${ord.feedbackRequest.feedbackReceivedAt ? ` at ${formatOrderDateTime(ord.feedbackRequest.feedbackReceivedAt, currentTimezone)}` : ''}`}
                                  >
                                    {ord.feedbackRequest.feedbackRating === 'GOOD' && '⭐ Good'}
                                    {ord.feedbackRequest.feedbackRating === 'AVERAGE' && '😐 Average'}
                                    {ord.feedbackRequest.feedbackRating === 'BAD' && '😞 Bad'}
                                  </span>
                                ) : ord.feedbackRequest?.status === 'DELIVERED' || ord.feedbackRequest?.status === 'READ' ? (
                                  <span
                                    className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-[10px] flex items-center gap-1 cursor-default opacity-95 whitespace-nowrap"
                                    title="Feedback delivered to customer on WhatsApp"
                                  >
                                    <span>✓✓ Delivered</span>
                                  </span>
                                ) : ord.feedbackRequest?.status === 'SENT' ? (
                                  <span
                                    className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold text-[10px] flex items-center gap-1 cursor-default opacity-95 whitespace-nowrap"
                                    title={`Feedback sent on WhatsApp${ord.feedbackRequest.sentAt ? ` at ${formatOrderDateTime(ord.feedbackRequest.sentAt, currentTimezone)}` : ''}`}
                                  >
                                    <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                                    <span>✓ Sent</span>
                                  </span>
                                ) : ord.feedbackRequest?.status === 'FAILED' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSendWhatsAppFeedback(ord)}
                                    disabled={sendingFeedbackOrderId === ord.id}
                                    className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-[10px] flex items-center gap-1 whitespace-nowrap"
                                    title={`Failed: ${ord.feedbackRequest.errorMessage || 'Error'}. Click to retry.`}
                                  >
                                    <span>Failed</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSendWhatsAppFeedback(ord)}
                                    disabled={sendingFeedbackOrderId === ord.id}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-70 text-white font-bold text-[10px] transition shadow-xs flex items-center gap-1 whitespace-nowrap"
                                    title="Send WhatsApp Feedback Request"
                                  >
                                    {sendingFeedbackOrderId === ord.id ? (
                                      <>
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                        <span>Sending...</span>
                                      </>
                                    ) : (
                                      <>
                                        <WhatsAppIcon className="w-3 h-3 text-white" />
                                        <span>WhatsApp</span>
                                      </>
                                    )}
                                  </button>
                                )
                              )}
                              {ord.status !== 'cancelled' && ord.status !== 'delivered' && (
                                <button
                                  onClick={() => {
                                    setOrderToCancel(ord);
                                    setCancelReason('');
                                  }}
                                  className="px-2 py-1 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 font-bold text-[10px] transition flex items-center gap-1 whitespace-nowrap"
                                  title="Cancel Order"
                                >
                                  <Ban className="w-3 h-3 text-rose-600" />
                                  <span>Cancel</span>
                                </button>
                              )}
                              <button
                                onClick={() => setOrderToDelete(ord)}
                                className="p-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition"
                                title="Delete order permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Selected Order Detailed Drawer / Panel */}
        {selectedOrder && (
          <div className="lg:col-span-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-5 sticky top-20 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Order Details</div>
                  <div className="font-mono font-black text-lg text-slate-900">
                    {selectedOrder.orderNumber || selectedOrder.id}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status & Timing */}
              <div className="bg-slate-50 p-3 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Status</span>
                    <span
                      className={`inline-block mt-0.5 text-xs px-2.5 py-0.5 rounded-md font-bold uppercase border ${getStatusColor(
                        selectedOrder.status
                      )}`}
                    >
                      {selectedOrder.status}
                    </span>
                  </div>
                  {selectedOrder.feedbackRequest && (
                    <div className="text-right">
                      {selectedOrder.feedbackRequest.feedbackRating ? (
                        <>
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">
                            Feedback: {selectedOrder.feedbackRequest.feedbackRating === 'GOOD' ? 'Good' : selectedOrder.feedbackRequest.feedbackRating === 'AVERAGE' ? 'Average' : 'Bad'}
                          </span>
                          <span className="font-semibold text-slate-700 block text-[11px] leading-tight mt-0.5">
                            Received: {formatOrderDateTime(selectedOrder.feedbackRequest.feedbackReceivedAt, currentTimezone)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Feedback</span>
                          <span
                            className={`inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded font-bold ${
                              selectedOrder.feedbackRequest.status === 'DELIVERED' || selectedOrder.feedbackRequest.status === 'READ'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : selectedOrder.feedbackRequest.status === 'SENT'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : selectedOrder.feedbackRequest.status === 'SCHEDULED'
                                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                : selectedOrder.feedbackRequest.status === 'FAILED'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {selectedOrder.feedbackRequest.status === 'DELIVERED' || selectedOrder.feedbackRequest.status === 'READ'
                              ? '✓✓ Delivered'
                              : selectedOrder.feedbackRequest.status === 'SENT'
                              ? '✓ Sent'
                              : selectedOrder.feedbackRequest.status === 'FAILED'
                              ? 'Failed'
                              : `Scheduled (${formatOrderDateTime(selectedOrder.feedbackRequest.scheduledAt, currentTimezone)})`}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Placed At</span>
                    <span className="font-semibold text-slate-700 block text-[11px] leading-tight mt-0.5">
                      {formatOrderDateTime(selectedOrder.createdAt, currentTimezone)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Confirmed At</span>
                    <span className="font-semibold text-slate-700 block text-[11px] leading-tight mt-0.5">
                      {formatOrderDateTime(getOrderConfirmedAt(selectedOrder), currentTimezone)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Completed At</span>
                    <span className="font-semibold text-slate-700 block text-[11px] leading-tight mt-0.5">
                      {formatOrderDateTime(getOrderCompletedAt(selectedOrder), currentTimezone)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Mode & Table Information */}
              <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-medium">Service Channel</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-800 capitalize">
                    {selectedOrder.orderType?.replace('_', ' ')}
                  </span>
                  {selectedOrder.tableNumber && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-extrabold text-[11px] shadow-xs">
                      {selectedOrder.tableNumber.startsWith('Table') ? selectedOrder.tableNumber : `Table ${selectedOrder.tableNumber}`}
                    </span>
                  )}
                  {selectedOrder.entrySource === 'table_qr' && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded border border-emerald-300">
                      QR VERIFIED
                    </span>
                  )}
                </div>
              </div>

              {/* Customer Info */}
              <div className="space-y-1 text-xs">
                <div className="text-[10px] uppercase font-bold text-slate-400">Customer</div>
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>{selectedOrder.customer?.name || 'Walk-in Customer'}</span>
                  {selectedOrder.customer?.phone && (
                    <a
                      href={`tel:${selectedOrder.customer.phone}`}
                      className="text-rose-600 hover:underline flex items-center gap-0.5 font-normal"
                    >
                      <Phone className="w-3 h-3" />
                      {selectedOrder.customer.phone}
                    </a>
                  )}
                </div>
                {selectedOrder.customer?.address && (
                  <div className="text-slate-500 flex items-start gap-1 text-[11px] mt-1">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                    <span>{selectedOrder.customer.address}</span>
                  </div>
                )}
              </div>

              {/* Ordered Items List - Full Item Details */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold text-slate-400">Order Items</div>
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto space-y-2">
                  {selectedOrder.items?.map((item: any, idx: number) => {
                    const itemName = getItemName(item);
                    const unitPrice = getItemUnitPrice(item);
                    const qty = Number(item.quantity) || 1;
                    const lineTotal = unitPrice * qty;

                    const shapeCode = item.selectedShape || item.shape;
                    const shapeLabel =
                      shapeCode === 'R'
                        ? 'Rectangular'
                        : shapeCode === 'C'
                        ? 'Circular'
                        : shapeCode === 'S'
                        ? 'Square'
                        : shapeCode;

                    const sizeLabel = item.selectedSize || item.size;
                    const crustLabel = item.selectedCrust || item.crust;
                    const spiceLabel = item.spiceLevel || item.spice;

                    const rawAddons = item.addons || item.addOns || item.customizations || [];
                    const addonNames = Array.isArray(rawAddons)
                      ? rawAddons
                          .map((a: any) => {
                            if (typeof a === 'string') return a;
                            const price = Number(a.price) ? ` (+₹${Number(a.price).toFixed(2)})` : '';
                            return `${a.name || a.title || a.addonName || 'Add-on'}${price}`;
                          })
                          .filter(Boolean)
                      : [];

                    const note = item.specialInstructions || item.notes || item.instructions;

                    return (
                      <div key={idx} className="pt-2 first:pt-0 flex items-start justify-between text-xs">
                        <div className="flex-1 pr-3">
                          <div className="font-bold text-slate-800 leading-snug">
                            <span className="text-slate-950 font-black mr-1">{qty}x</span>
                            <span>{itemName}</span>
                          </div>

                          {/* Customizations Display */}
                          <div className="space-y-0.5 mt-0.5 text-[11px] text-slate-500">
                            {sizeLabel && <div>Size: {sizeLabel}</div>}
                            {shapeLabel && <div>Shape: {shapeLabel}</div>}
                            {crustLabel && <div>Crust: {crustLabel}</div>}
                            {spiceLabel && (
                              <div className="text-rose-600 font-medium">Spice: {spiceLabel}</div>
                            )}
                            {addonNames.length > 0 && <div>Add-ons: {addonNames.join(', ')}</div>}
                            {note && (
                              <div className="text-amber-800 bg-amber-50 p-1 rounded font-medium text-[10px] mt-0.5">
                                Note: {note}
                              </div>
                            )}
                          </div>

                          <div className="text-[10px] text-slate-400 mt-1">
                            ₹{unitPrice.toFixed(2)} each
                          </div>
                        </div>

                        <div className="font-black text-slate-900 text-xs shrink-0 text-right pt-0.5">
                          ₹{lineTotal.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals & Payment */}
              <div className="bg-slate-50 p-3 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Payment Method</span>
                  <span className="font-bold uppercase text-slate-700">
                    {selectedOrder.paymentMethod || 'Cash'} ({selectedOrder.paymentStatus || 'Paid'})
                  </span>
                </div>
                <div className="flex justify-between text-slate-900 font-black text-sm pt-1 border-t border-slate-200">
                  <span>Grand Total</span>
                  <span>
                    ₹{Number(selectedOrder.grandTotal || selectedOrder.total || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setPrintType('kot');
                      setShowPrintModal(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-400" />
                    <span>Print KOT</span>
                  </button>

                  <button
                    onClick={() => {
                      setPrintType('bill');
                      setShowPrintModal(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Print Receipt</span>
                  </button>
                </div>

                {/* Status Transitions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {['placed', 'pending', 'confirmed', 'accepted'].includes(selectedOrder.status) && (
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'preparing', 'Kitchen accepted order')}
                      disabled={isUpdating}
                      className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs transition"
                    >
                      Accept & Send to Kitchen
                    </button>
                  )}
                  {['preparing', 'baking'].includes(selectedOrder.status) && (
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'packing', 'Food ready, packing order')}
                      disabled={isUpdating}
                      className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs transition"
                    >
                      Mark Food as Packed
                    </button>
                  )}
                  {selectedOrder.status === 'packing' && (
                    <button
                      onClick={() =>
                        handleUpdateStatus(
                          selectedOrder.id,
                          selectedOrder.orderType === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup',
                          selectedOrder.orderType === 'delivery' ? 'Rider dispatched with food' : 'Order ready at pickup counter'
                        )
                      }
                      disabled={isUpdating}
                      className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs transition"
                    >
                      {selectedOrder.orderType === 'delivery' ? 'Send Out for Delivery 🛵' : 'Ready for Pickup 📦'}
                    </button>
                  )}
                  {['out_for_delivery', 'ready', 'ready_for_pickup'].includes(selectedOrder.status) && (
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'delivered', 'Order completed and handed over')}
                      disabled={isUpdating}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition"
                    >
                      Complete Order ✅
                    </button>
                  )}

                  {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                    <button
                      onClick={() => {
                        setOrderToCancel(selectedOrder);
                        setCancelReason('');
                      }}
                      className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}

                  <button
                    onClick={() => setOrderToDelete(selectedOrder)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                    title="Delete order permanently"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* WhatsApp Customer Feedback action in drawer */}
                {isDeliveredOrCompleted(selectedOrder.status) && isValidCustomerPhone(selectedOrder.customer?.phone || selectedOrder.customerPhone) && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                      <div>
                        <div className="text-[11px] font-bold text-emerald-950 flex items-center gap-1.5">
                          <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Customer WhatsApp Feedback</span>
                        </div>
                        <div className="text-[10px] text-emerald-700">
                          {selectedOrder.feedbackRequest?.feedbackRating
                            ? `Received: ${formatOrderDateTime(selectedOrder.feedbackRequest.feedbackReceivedAt, currentTimezone)}`
                            : selectedOrder.feedbackRequest?.status === 'DELIVERED' || selectedOrder.feedbackRequest?.status === 'READ'
                            ? 'Delivered to customer WhatsApp'
                            : selectedOrder.feedbackRequest?.status === 'SENT'
                            ? `Sent${selectedOrder.feedbackRequest.sentAt ? ` at ${formatOrderDateTime(selectedOrder.feedbackRequest.sentAt, currentTimezone)}` : ''}`
                            : selectedOrder.feedbackRequest?.status === 'SCHEDULED'
                            ? `Scheduled at ${formatOrderDateTime(selectedOrder.feedbackRequest.scheduledAt, currentTimezone)} (2 hrs post-completion)`
                            : selectedOrder.feedbackRequest?.status === 'FAILED'
                            ? `Failed: ${selectedOrder.feedbackRequest.errorMessage || 'Unknown error'}`
                            : 'Send feedback request template immediately'}
                        </div>
                      </div>
                      {selectedOrder.feedbackRequest?.feedbackRating ? (
                        <span
                          className={`px-2.5 py-1 rounded-lg font-bold text-[10px] border flex items-center gap-1 ${
                            selectedOrder.feedbackRequest.feedbackRating === 'GOOD'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : selectedOrder.feedbackRequest.feedbackRating === 'AVERAGE'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}
                        >
                          {selectedOrder.feedbackRequest.feedbackRating === 'GOOD' && '⭐ Good'}
                          {selectedOrder.feedbackRequest.feedbackRating === 'AVERAGE' && '😐 Average'}
                          {selectedOrder.feedbackRequest.feedbackRating === 'BAD' && '😞 Bad'}
                        </span>
                      ) : selectedOrder.feedbackRequest?.status === 'DELIVERED' || selectedOrder.feedbackRequest?.status === 'READ' ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300 flex items-center gap-1">
                          <span>✓✓ Delivered</span>
                        </span>
                      ) : selectedOrder.feedbackRequest?.status === 'SENT' ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-700 stroke-[2.5]" />
                          <span>✓ Sent</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendWhatsAppFeedback(selectedOrder)}
                          disabled={sendingFeedbackOrderId === selectedOrder.id}
                          className={`px-3 py-1.5 rounded-lg font-bold text-[10px] shadow-xs flex items-center gap-1.5 transition ${
                            selectedOrder.feedbackRequest?.status === 'FAILED'
                              ? 'bg-rose-600 hover:bg-rose-500 text-white'
                              : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white'
                          }`}
                        >
                          {sendingFeedbackOrderId === selectedOrder.id ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <WhatsAppIcon className="w-3 h-3 text-white" />
                              <span>{selectedOrder.feedbackRequest?.status === 'FAILED' ? 'Retry Send' : 'Send Now'}</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Order Confirmation Modal */}
      {orderToCancel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Cancel order {orderToCancel.orderNumber || orderToCancel.id.slice(0, 8)}?
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Are you sure you want to cancel this order?
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Reason for Cancellation (optional):
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Out of stock, Customer request"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOrderToCancel(null);
                  setCancelReason('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = orderToCancel.id;
                  const reason = cancelReason || 'Cancelled by Admin';
                  setOrderToCancel(null);
                  setCancelReason('');
                  await handleUpdateStatus(id, 'cancelled', reason);
                }}
                disabled={isUpdating}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition shadow-xs"
              >
                Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Order Destructive Confirmation Modal */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Delete order {orderToDelete.orderNumber || orderToDelete.id.slice(0, 8)} permanently?
                </h3>
                <p className="text-[11px] text-rose-600 font-bold mt-0.5">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
              Permanently deleting this order will remove it from the active orders queue. Historical settlement logs and audit records remain preserved.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = orderToDelete.id;
                  setOrderToDelete(null);
                  await executeDeleteOrder(id);
                }}
                disabled={isUpdating}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition shadow-xs"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Itemized Tax Invoice & KOT Modal */}
      {showPrintModal && selectedOrder && (
        <PrintModal
          order={selectedOrder}
          type={printType === 'kot' ? 'kot' : 'receipt'}
          restaurantInfo={restaurantProfile || restaurant}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
};
