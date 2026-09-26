import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { useRestaurant } from '../context/RestaurantContext';
import { Order, OrderStatus } from '../types';
import {
  MapPin,
  Clock,
  RefreshCw,
  MessageSquare,
  AlertCircle,
  Calendar as CalendarIcon,
  Store,
} from 'lucide-react';
import { OrderCalendarView } from './OrderCalendarView';
import { GoogleMapsLiveTracker, MOZZ_RESTAURANT_LOCATION } from './GoogleMapsLiveTracker';
import { TrackingMapErrorBoundary } from './TrackingMapErrorBoundary';

interface LiveOrderTrackerProps {
  onBackToMenu: () => void;
}

const STAGES: {
  status: OrderStatus;
  title: string;
  subtitle: string;
  icon: string;
}[] = [
  {
    status: 'placed',
    title: 'Order Placed',
    subtitle: 'Payment verified & sent to MOZZ Kitchen',
    icon: '📝',
  },
  {
    status: 'confirmed',
    title: 'Order Confirmed',
    subtitle: 'Kitchen assigned your pocket pizzas & wok order',
    icon: '✅',
  },
  {
    status: 'baking',
    title: 'Baking & Cooking',
    subtitle: 'Stone-deck oven baking Korean pocket pizzas',
    icon: '🔥',
  },
  {
    status: 'packing',
    title: 'Quality Check & Thermal Packing',
    subtitle: 'Sealed hot in thermal steam-release box for home delivery',
    icon: '📦',
  },
  {
    status: 'out_for_delivery',
    title: 'Out for Delivery',
    subtitle: 'Dispatched from MOZZ Kitchen to confirmed delivery location',
    icon: '🛵',
  },
  {
    status: 'delivered',
    title: 'Delivered to Doorstep',
    subtitle: 'Fresh & piping hot at your door! Enjoy your meal',
    icon: '🎉',
  },
];

export const LiveOrderTracker: React.FC<LiveOrderTrackerProps> = ({ onBackToMenu }) => {
  const {
    orders,
    activeOrderId,
    activeOrder,
    setActiveOrderId,
    fetchOrderById,
    cancelOrder,
  } = useStore();

  const [searchOrderId, setSearchOrderId] = useState('');
  const [trackerView, setTrackerView] = useState<'live' | 'calendar'>('live');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const { restaurantName, restaurantId, isFlagship } = useRestaurant();

  // URL extraction & refresh persistence of orderId (supports /r/:slug/track/:orderId, ?orderId=XYZ, ?order_id=XYZ, or activeOrderId)
  useEffect(() => {
    let targetId: string | null = null;
    const pathname = window.location.pathname;
    const match = pathname.match(/\/track\/([^/?#]+)/);
    if (match && match[1]) {
      targetId = decodeURIComponent(match[1]);
    } else {
      const searchParams = new URLSearchParams(window.location.search);
      const queryOrderId = searchParams.get('orderId') || searchParams.get('order_id');
      if (queryOrderId) targetId = queryOrderId;
    }

    if (!targetId && activeOrderId) {
      targetId = activeOrderId;
    }

    if (!targetId && typeof window !== 'undefined') {
      targetId = localStorage.getItem('starters4u_active_order_id');
    }

    if (targetId) {
      fetchOrderById(targetId).then((found) => {
        if (found) {
          // If the order has a restaurantId and it doesn't match the current tenant context, do not show it
          if (restaurantId && found.restaurantId && found.restaurantId !== restaurantId) {
            console.warn('[LiveOrderTracker] Order restaurant mismatch - denying cross-tenant order view');
            return;
          }
          setSessionOrder(found);
          setActiveOrderId(found.id);
        }
      });
    }
  }, [fetchOrderById, setActiveOrderId, restaurantId, activeOrderId]);

  // Local session order preservation:
  // When an order reaches terminal status (delivered/completed), the global session clears
  // (activeOrderId -> null, customerDetails -> INITIAL_CUSTOMER, header resets to 'Enter Customer Details').
  // sessionOrder preserves the delivered order record on this tracking screen so the customer
  // can view the final delivery confirmation, receipt, and breakdown until navigating away.
  const [sessionOrder, setSessionOrder] = useState<Order | null>(() => {
    if (activeOrder) return activeOrder;
    if (activeOrderId) return orders.find((o) => o.id === activeOrderId) || null;
    if (typeof window !== 'undefined') {
      const savedId = localStorage.getItem('starters4u_active_order_id');
      if (savedId) return orders.find((o) => o.id === savedId) || null;
    }
    return null;
  });

  // Keep sessionOrder updated when activeOrder is present
  useEffect(() => {
    if (activeOrder) {
      setSessionOrder(activeOrder);
    }
  }, [activeOrder]);

  // Keep sessionOrder in sync if the order is updated in the orders collection
  useEffect(() => {
    if (sessionOrder?.id) {
      const updated = orders.find((o) => o.id === sessionOrder.id);
      if (updated && updated.status !== sessionOrder.status) {
        setSessionOrder(updated);
      }
    }
  }, [orders, sessionOrder]);

  const order = sessionOrder || activeOrder || (activeOrderId ? orders.find((o) => o.id === activeOrderId) : null);

  // Synchronize URL with active order for seamless bookmarking/refreshing
  useEffect(() => {
    if (order?.id && typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      if (
        !searchParams.get('orderId') &&
        !searchParams.get('order_id') &&
        !window.location.pathname.includes(order.id)
      ) {
        const url = new URL(window.location.href);
        url.searchParams.set('orderId', order.id);
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [order?.id]);

  // Clear any previous cancellation error when viewing a different order
  useEffect(() => {
    setCancellationError(null);
  }, [order?.id]);

  // Automatic 10-second polling for active order (stops when delivered, completed, or cancelled)
  useEffect(() => {
    const targetId = order?.id || activeOrderId;
    if (!targetId) return;

    const statusStr = (order?.status || '').toLowerCase();
    if (
      statusStr === 'delivered' ||
      statusStr === 'completed' ||
      statusStr === 'cancelled' ||
      statusStr === 'rejected'
    ) {
      return;
    }

    const poll = async () => {
      try {
        const updated = await fetchOrderById(targetId);
        if (updated) {
          setSessionOrder(updated);
        }
      } catch (e) {
        console.warn('[OrderTracking] Status poll failed:', e);
      }
    };

    const interval = setInterval(poll, 10000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [order?.id, order?.status, activeOrderId, fetchOrderById]);

  const handleManualRefresh = async () => {
    if (!order?.id) return;
    setIsRefreshing(true);
    const updated = await fetchOrderById(order.id);
    if (updated) {
      setSessionOrder(updated);
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchOrderId.trim().toUpperCase();
    if (!query) return;

    const matched = orders.find(
      (o) =>
        o.id.toUpperCase() === query ||
        (o.orderNumber && o.orderNumber.toUpperCase() === query)
    );

    if (matched) {
      setSessionOrder(matched);
      setActiveOrderId(matched.id);
      fetchOrderById(matched.id).then((ord) => {
        if (ord) setSessionOrder(ord);
      });
      setSearchOrderId('');
    } else {
      fetchOrderById(query).then((ord) => {
        if (ord) {
          setSessionOrder(ord);
          setActiveOrderId(ord.id);
          setSearchOrderId('');
        } else {
          alert(`Order #${query} not found. Please check the order number.`);
        }
      });
    }
  };

  if (!order) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
          <Store className="w-10 h-10 text-rose-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">No Active Order Found</h2>
        <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
          You have not placed any orders yet, or the session was refreshed. Track an order by entering the order number below.
        </p>

        {/* Order search box */}
        <form onSubmit={handleSearch} className="flex gap-2 max-w-xs mx-auto mt-6">
          <input
            type="text"
            value={searchOrderId}
            onChange={(e) => setSearchOrderId(e.target.value)}
            placeholder="e.g. MOZZ-1234"
            className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 uppercase"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition"
          >
            Track
          </button>
        </form>

        <button
          onClick={onBackToMenu}
          className="mt-6 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition inline-flex items-center gap-2"
        >
          <span>Explore Menu & Place Order</span>
        </button>
      </div>
    );
  }

  const getStageIndex = (status: string) => {
    switch (status) {
      case 'placed':
      case 'pending':
        return 0;
      case 'confirmed':
      case 'accepted':
        return 1;
      case 'baking':
      case 'preparing':
        return 2;
      case 'packing':
        return 3;
      case 'out_for_delivery':
      case 'ready_for_pickup':
      case 'ready':
        return 4;
      case 'delivered':
      case 'completed':
        return 5;
      default:
        return -1;
    }
  };

  const currentStageIndex = getStageIndex(order.status);
  const isDelivered = order.status === 'delivered' || (order.status as string) === 'completed';
  const isCancelled = order.status === 'cancelled' || (order.status as string) === 'rejected';
  const isActive = !isDelivered && !isCancelled;
  // Cancellation is allowed ONLY while the order is in initial pending/placed state
  const isCustomerCancellable = (order.status === 'placed' || (order.status as string) === 'pending') && isActive;

  const getStatusHeadline = () => {
    switch (order.status as string) {
      case 'placed':
      case 'pending':
        return 'Order Placed • Sent to MOZZ Kitchen';
      case 'confirmed':
      case 'accepted':
        return 'Order Confirmed • Assigned to Station';
      case 'baking':
      case 'preparing':
        return 'Baking & Cooking in Stone-Deck Oven';
      case 'packing':
        return 'Quality Check & Thermal Packing';
      case 'out_for_delivery':
        return 'Out for Delivery • Dispatched from Kitchen';
      case 'ready_for_pickup':
      case 'ready':
        return 'Order Ready for Pickup';
      case 'delivered':
      case 'completed':
        return 'Order Delivered to Doorstep!';
      case 'cancelled':
      case 'rejected':
        return 'Order Cancelled';
      default:
        return 'Order In Progress';
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Controls: Search Bar & Switch Orders */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <h1 className="text-lg sm:text-xl font-black text-slate-900">
              {trackerView === 'live' ? 'Order Tracking' : 'Order History & Calendar'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {trackerView === 'live'
              ? 'Real-time kitchen order progress from MOZZ Chinese & Pizzateria'
              : 'Browse all orders and daily summary by date on the calendar'}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Tracker vs Calendar View Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setTrackerView('live')}
              className={`px-3 py-1.5 rounded-xl transition ${
                trackerView === 'live'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Order Tracking
            </button>
            <button
              onClick={() => setTrackerView('calendar')}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1 ${
                trackerView === 'calendar'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          {/* Search Order ID Form */}
          {trackerView === 'live' && (
            <form onSubmit={handleSearch} className="flex gap-2 flex-1 sm:flex-none">
              <input
                type="text"
                value={searchOrderId}
                onChange={(e) => setSearchOrderId(e.target.value)}
                placeholder="Search Order # (e.g. MOZZ-8901)"
                className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 uppercase focus:outline-none focus:border-rose-500 focus:bg-white w-full sm:w-48 transition"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition shadow-xs cursor-pointer"
              >
                Track
              </button>
            </form>
          )}
        </div>
      </div>

      {trackerView === 'calendar' ? (
        <OrderCalendarView
          orders={orders}
          onSelectOrder={(ord) => {
            setActiveOrderId(ord.id);
            setTrackerView('live');
          }}
        />
      ) : (
        /* Main Tracking Grid */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Interactive Map & Genuine Timeline */}
          <div className="lg:col-span-7 space-y-6">
            {/* Google Maps Order Tracking Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm relative overflow-hidden">
              {/* Header with Genuine Kitchen Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    <span>KITCHEN & ORDER STATUS</span>
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
                    {getStatusHeadline()}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Estimated Time</div>
                    <div className="text-sm sm:text-base font-mono font-bold text-slate-800 flex items-center justify-end gap-1">
                      <Clock className="w-3.5 h-3.5 text-rose-500" />
                      <span>{order.estimatedDeliveryTimeMinutes || 35} mins</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Required Telemetry Disclaimer Notice */}
              <div className="mb-4 p-3 bg-amber-50/90 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed font-medium">
                  Live rider location is not currently available. Order progress below reflects updates from the restaurant.
                </div>
              </div>

              {/* Google Maps Map displaying Restaurant location & Confirmed delivery location */}
              <div className="mb-4">
                <TrackingMapErrorBoundary
                  restaurantLocation={{
                    name: restaurantName || 'MOZZ Pizzateria',
                    lat: MOZZ_RESTAURANT_LOCATION.lat,
                    lng: MOZZ_RESTAURANT_LOCATION.lng,
                  }}
                  customerLocation={
                    order.customer?.latitude && order.customer?.longitude
                      ? {
                          lat: Number(order.customer.latitude),
                          lng: Number(order.customer.longitude),
                          address: detectedAddress || order.customer?.address,
                        }
                      : null
                  }
                >
                  <GoogleMapsLiveTracker
                    order={order}
                    onAddressDetected={(address) => setDetectedAddress(address)}
                  />
                </TrackingMapErrorBoundary>
              </div>

              {/* Status Sync Footer */}
              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isDelivered || isCancelled ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                  <span className="text-[11px] text-slate-500 font-medium">
                    {isDelivered
                      ? 'Order delivered & completed'
                      : isCancelled
                      ? 'Order cancelled'
                      : 'Updated directly from MOZZ Restaurant POS'}
                  </span>
                </div>
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-semibold flex items-center gap-1.5 border border-slate-200 transition disabled:opacity-50 cursor-pointer"
                  title="Refresh latest status from restaurant"
                >
                  <RefreshCw className={`w-3 h-3 text-rose-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isRefreshing ? 'Syncing...' : 'Sync'}</span>
                </button>
              </div>
            </div>

            {/* If Delivered/Completed: Hide entire Order-Status Timeline and replace with compact final confirmation */}
            {isDelivered && (
              <div className="bg-emerald-50/90 border border-emerald-200 rounded-3xl p-6 shadow-sm text-center space-y-2">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 font-bold text-xl shadow-xs">
                  ✓
                </div>
                <h3 className="text-base sm:text-lg font-bold text-emerald-900">
                  Order delivered successfully. Thank you for ordering from MOZZ!
                </h3>
                <p className="text-xs text-emerald-700 font-medium">
                  Your food was delivered fresh & hot. We hope you enjoyed your meal!
                </p>
              </div>
            )}

            {/* If Cancelled: Show clear cancellation notice instead of normal active timeline */}
            {isCancelled && (
              <div className="bg-rose-50/90 border border-rose-200 rounded-3xl p-6 shadow-sm text-center space-y-2">
                <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600 font-bold text-xl shadow-xs">
                  ✕
                </div>
                <h3 className="text-base sm:text-lg font-bold text-rose-900">
                  Order Cancelled
                </h3>
                <p className="text-xs text-rose-700 font-medium max-w-md mx-auto">
                  This order has been cancelled. If you need any assistance or have questions regarding refunds, please contact our support via WhatsApp.
                </p>
              </div>
            )}

            {/* Genuine Kitchen / Order-Status Timeline - ONLY visible for active orders */}
            {isActive && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600">
                    Kitchen & Order Progress Timeline
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Order #{order.id}
                  </span>
                </div>

                <div className="space-y-4">
                  {STAGES.map((stage, idx) => {
                    const isPassed = idx <= currentStageIndex;
                    const isCurrent = idx === currentStageIndex;

                    return (
                      <div key={stage.status} className="flex items-start gap-4 relative">
                        {/* Connecting line */}
                        {idx < STAGES.length - 1 && (
                          <div
                            className={`absolute left-4 top-8 bottom-0 w-0.5 -ml-px transition-colors ${
                              idx < currentStageIndex ? 'bg-rose-500' : 'bg-slate-200'
                            }`}
                          />
                        )}

                        {/* Step Icon */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all relative z-10 ${
                            isCurrent
                              ? 'bg-rose-600 text-white ring-4 ring-rose-100 font-black shadow-xs'
                              : isPassed
                              ? 'bg-rose-100 text-rose-700 border border-rose-300'
                              : 'bg-slate-100 text-slate-400 border border-slate-200'
                          }`}
                        >
                          <span>{stage.icon}</span>
                        </div>

                        {/* Step Details */}
                        <div className="flex-1 pb-3">
                          <div className="flex items-center justify-between">
                            <h4
                              className={`text-sm font-bold ${
                                isCurrent ? 'text-rose-600' : isPassed ? 'text-slate-900' : 'text-slate-400'
                              }`}
                            >
                              {stage.title}
                            </h4>
                            {isCurrent && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                                CURRENT STATUS
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{stage.subtitle}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right 5 Cols: Order Summary Receipt & Details */}
          <div className="lg:col-span-5 space-y-6">
            {/* Order Details Receipt Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Order Reference
                  </div>
                  <div className="text-lg font-black text-rose-600 font-mono">#{order.id}</div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {order.paymentStatus === 'paid' ? 'PAID' : 'COD PENDING'}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {order.createdAt
                      ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </div>
                </div>
              </div>

              {/* Customer Details: Confirmed delivery location */}
              <div className="text-xs space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">Confirmed delivery location:</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-600" />
                    Confirmed location
                  </span>
                </div>
                <div className="text-slate-900 font-semibold">
                  {order.customer?.name || 'Valued Customer'} {order.customer?.phone ? `(${order.customer.phone})` : ''}
                </div>
                <div className="text-slate-600 text-[11px] leading-relaxed">
                  {detectedAddress || order.customer?.address || 'Delivery Address'}
                </div>
                {order.customer?.latitude && order.customer?.longitude && (
                  <div className="text-[10px] font-mono text-emerald-600">
                    GPS Coordinates: {Number(order.customer.latitude).toFixed(6)}, {Number(order.customer.longitude).toFixed(6)}
                  </div>
                )}
                {order.customer?.landmark && (
                  <div className="text-rose-600/80 text-[10px]">Landmark: {order.customer.landmark}</div>
                )}
              </div>

              {/* Itemized Order List */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Items in this Order
                </div>

                {(order.items || []).map((item, i) => (
                  <div key={i} className="flex items-start justify-between text-xs gap-2 py-1.5 border-b border-slate-100">
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <span>{item.quantity || 1}x</span>
                        <span>{item.menuItem?.name || (item as unknown as { name?: string }).name || 'Delicious Item'}</span>
                      </div>

                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {item.selectedShape && (
                          <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-1.5 rounded">
                            [{item.selectedShape}]{' '}
                            {item.selectedShape === 'R'
                              ? 'Rectangular'
                              : item.selectedShape === 'C'
                              ? 'Circular'
                              : 'Square'}
                          </span>
                        )}
                        {item.selectedCrust && (
                          <span className="text-[10px] text-slate-500">{item.selectedCrust}</span>
                        )}
                        {item.spiceLevel && (
                          <span className="text-[10px] text-rose-500">({item.spiceLevel})</span>
                        )}
                      </div>

                      {item.addons && item.addons.length > 0 && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Addons: {item.addons.map((a) => a?.name || a).filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="font-black text-rose-600 text-sm">
                      ₹{((Number(item.unitPrice) || 0) * (Number(item.quantity) || 1)).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bill Summary */}
              <div className="pt-2 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Items Subtotal</span>
                  <span className="text-slate-800 font-medium">
                    ₹{(Number(order.itemTotal) || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>GST (5%)</span>
                  <span className="text-slate-800 font-medium">
                    ₹{(Number(order.tax) || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  {Number(order.deliveryFee) === 0 ? (
                    <span className="text-emerald-600 font-bold">FREE</span>
                  ) : (
                    <span className="text-slate-800 font-medium">₹{Number(order.deliveryFee || 0).toFixed(2)}</span>
                  )}
                </div>
                {Number(order.discount) > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Coupon Discount {order.couponCode ? `(${order.couponCode})` : ''}</span>
                    <span>-₹{(Number(order.discount) || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-black text-slate-900">
                  <span>Grand Total Paid</span>
                  <span className="text-base text-rose-600">
                    ₹{(Number(order.grandTotal) || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* WhatsApp Support */}
              <div className="pt-2">
                <a
                  href={`https://wa.me/?text=Hi%20MOZZ%20Team%2C%20I%20am%20tracking%20my%20Order%20%23${order.id}%20total%20INR%20${(Number(order.grandTotal) || 0).toFixed(2)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center gap-1.5 border border-emerald-200 transition"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp Help</span>
                </a>
              </div>

              {/* Cancellation error notification if backend rejected cancellation */}
              {cancellationError && (
                <div className="pt-2">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>{cancellationError}</div>
                  </div>
                </div>
              )}

              {/* Cancel Button for Wrongly Placed Orders: ONLY rendered while order is in initial pending/placed state */}
              {isCustomerCancellable && (
                <div className="pt-2">
                  <button
                    disabled={isCancelling}
                    onClick={async () => {
                      if (!order?.id || isCancelling) return;
                      if (window.confirm(`Are you sure you want to cancel Order #${order.id}?`)) {
                        setIsCancelling(true);
                        setCancellationError(null);
                        try {
                          const result = await cancelOrder(order.id, 'Cancelled by customer (wrongly placed)');
                          if (result && !result.success) {
                            setCancellationError(
                              result.error ||
                                'This order can no longer be cancelled because preparation has started. Please contact the restaurant for help.'
                            );
                          }
                        } catch (err: any) {
                          setCancellationError(err.message || 'Failed to cancel order');
                        } finally {
                          setIsCancelling(false);
                        }
                      }
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <span>{isCancelling ? 'Cancelling...' : 'Cancel Wrongly Placed Order ✕'}</span>
                  </button>
                </div>
              )}

              {isCancelled && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-center text-xs font-bold text-rose-700">
                  This order was cancelled.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
