import React, { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
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
} from 'lucide-react';

export const OrdersSection: React.FC = () => {
  const { user, restaurant, adminFetch } = useAdminAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printType, setPrintType] = useState<'kot' | 'bill'>('kot');

  const fetchOrders = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/orders');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setOrders(data);
        }
      }
    } catch (err) {
      console.error('[OrdersSection] Error fetching orders:', err);
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
    if (!window.confirm('Are you sure you want to permanently delete this order?')) return;
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
                          <td className="py-3.5 px-4">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border ${getStatusColor(
                                ord.status
                              )}`}
                            >
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {['placed', 'pending', 'confirmed', 'accepted'].includes(ord.status) && (
                                <button
                                  onClick={() => handleUpdateStatus(ord.id, 'preparing', 'Order accepted and sent to kitchen')}
                                  disabled={isUpdating}
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] transition shadow-xs"
                                >
                                  Accept
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedOrder(ord)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] transition"
                              >
                                Details
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
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
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
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Placed At</span>
                  <span className="text-xs font-semibold text-slate-700">
                    {new Date(selectedOrder.createdAt || Date.now()).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
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

              {/* Ordered Items List */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold text-slate-400">Order Items</div>
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {selectedOrder.items?.map((item: any, idx: number) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-800">
							{item.quantity}x {item.menuItem?.name || item.name || item.itemName || 'Item'}
						</div>			
                        {item.specialInstructions && (
                          <div className="text-[10px] text-amber-600 italic">
                            Note: {item.specialInstructions}
                          </div>
                        )}
                      </div>
                      <div className="font-black text-slate-900">
                        ₹{(
							Number(item.unitPrice ?? item.customerUnitPrice ?? item.menuItem?.price ?? item.price ?? 0) *
							Number(item.quantity || 1)
							).toLocaleString('en-IN')}
                      </div>
                    </div>
                  ))}
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
                  <span>₹{Number(selectedOrder.grandTotal || selectedOrder.total || 0).toLocaleString('en-IN')}</span>
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
                      onClick={() => handleCancelOrder(selectedOrder.id)}
                      className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteOrder(selectedOrder.id)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                    title="Delete order permanently"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Thermal Print Simulation Modal */}
      {showPrintModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-rose-600" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  {printType === 'kot' ? 'Kitchen Order Ticket (KOT)' : 'Customer Bill Receipt'}
                </h3>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Receipt Preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-[11px] leading-relaxed space-y-2">
              <div className="text-center font-bold text-slate-900">
                {restaurant?.name || user?.restaurantName || 'RESTAURANT'}
              </div>
              <div className="text-center text-[10px] text-slate-500">
                {printType === 'kot' ? '*** KITCHEN COPY (KOT) ***' : '*** TAX INVOICE ***'}
              </div>
              <div className="border-t border-dashed border-slate-300 pt-1 flex justify-between">
                <span>ORDER: {selectedOrder.orderNumber || selectedOrder.id.slice(0, 8)}</span>
                <span>{new Date().toLocaleTimeString()}</span>
              </div>
              {selectedOrder.tableNumber && (
                <div className="font-bold text-slate-800">
                  TABLE: {selectedOrder.tableNumber} ({selectedOrder.orderType})
                </div>
              )}
              <div className="border-t border-dashed border-slate-300 pt-1 space-y-1">
			{selectedOrder.items?.map((item: any, i: number) => (
  <div key={i} className="flex justify-between">
    <span>
      {item.quantity}x{' '}
      {item.menuItem?.name || item.name || item.itemName || 'Item'}
    </span>

    {printType === 'bill' && (
      <span>
        ₹{(
          Number(
            item.unitPrice ??
            item.customerUnitPrice ??
            item.menuItem?.price ??
            item.price ??
            0
          ) * Number(item.quantity || 1)
        ).toFixed(2)}
      </span>
    )}
  </div>
))}
              </div>
              {printType === 'bill' && (
                <div className="border-t border-dashed border-slate-300 pt-1 flex justify-between font-bold text-slate-900">
                  <span>TOTAL AMOUNT:</span>
                  <span>₹{Number(selectedOrder.grandTotal || selectedOrder.total || 0)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  window.print();
                  setShowPrintModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Send to Thermal Printer</span>
              </button>
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
