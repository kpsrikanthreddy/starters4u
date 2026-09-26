import React, { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  RefreshCw,
  Plus,
  Printer,
  QrCode,
  DollarSign,
  UtensilsCrossed,
  ChefHat,
  ChevronRight,
  ShieldCheck,
  Calendar,
} from 'lucide-react';

interface DashboardSectionProps {
  onNavigate: (section: string) => void;
}

export const DashboardSection: React.FC<DashboardSectionProps> = ({ onNavigate }) => {
  const { user, restaurant, adminFetch } = useAdminAuth();
  const [stats, setStats] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDashboardData = useCallback(async () => {
    try {
      const [analyticsRes, ordersRes] = await Promise.all([
        adminFetch('/api/admin/analytics'),
        adminFetch('/api/admin/orders?limit=10'),
      ]);

      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setStats(data);
      }

      if (ordersRes.ok) {
        const orders = await ordersRes.json();
        if (Array.isArray(orders)) {
          setRecentOrders(orders);
        }
      }
    } catch (err) {
      console.error('[Dashboard] Error fetching data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 15000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      const res = await adminFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        loadDashboardData();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const activeOrdersCount = recentOrders.filter(
    (o) => !['delivered', 'completed', 'settled', 'cancelled', 'rejected'].includes(o.status)
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-white">
              {restaurant?.name || user?.restaurantName || 'Restaurant Operations'}
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
              Live & Synced
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time outlet dashboard • Active branch: <span className="text-slate-200 font-medium">{user?.branchName || 'Main Outlet'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setIsRefreshing(true);
              loadDashboardData();
            }}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5"
            title="Refresh dashboard stats"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => onNavigate('pos')}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition shadow-md shadow-rose-900/30 flex items-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>New POS Order</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Total Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              ₹
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            ₹{Number(stats?.totalRevenue || 0).toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
            <TrendingUp className="w-3 h-3" />
            <span>All time verified sales</span>
          </p>
        </div>

        {/* Total Orders */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Total Orders</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {stats?.totalOrders || 0}
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Completed: <strong className="text-slate-700">{stats?.ordersByStatus?.delivered || 0}</strong>
          </p>
        </div>

        {/* Active Kitchen Orders */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Active Orders</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <ChefHat className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600">
            {activeOrdersCount}
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Currently in prep or awaiting pickup
          </p>
        </div>

        {/* Average Order Value */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Avg. Order Value</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            ₹
            {stats?.totalOrders > 0
              ? Math.round(Number(stats.totalRevenue) / Number(stats.totalOrders))
              : 0}
          </div>
          <p className="text-[11px] text-indigo-600 font-bold mt-1">
            Per-ticket average spend
          </p>
        </div>
      </div>

      {/* Quick Launch Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => onNavigate('pos')}
          className="p-4 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 text-white text-left transition hover:shadow-lg hover:shadow-rose-600/20 flex flex-col justify-between group"
        >
          <ShoppingBag className="w-5 h-5 mb-2 text-rose-100" />
          <div>
            <div className="font-extrabold text-sm">POS Counter</div>
            <div className="text-[11px] text-rose-100">Take orders & print KOT</div>
          </div>
        </button>

        <button
          onClick={() => onNavigate('orders')}
          className="p-4 rounded-2xl bg-white border border-slate-200 text-left transition hover:border-slate-300 hover:shadow-xs flex flex-col justify-between group"
        >
          <ChefHat className="w-5 h-5 mb-2 text-amber-500" />
          <div>
            <div className="font-extrabold text-sm text-slate-900">Kitchen & Orders</div>
            <div className="text-[11px] text-slate-500">Live order statuses</div>
          </div>
        </button>

        <button
          onClick={() => onNavigate('tables')}
          className="p-4 rounded-2xl bg-white border border-slate-200 text-left transition hover:border-slate-300 hover:shadow-xs flex flex-col justify-between group"
        >
          <QrCode className="w-5 h-5 mb-2 text-indigo-600" />
          <div>
            <div className="font-extrabold text-sm text-slate-900">Tables & QR</div>
            <div className="text-[11px] text-slate-500">Print QR tent cards</div>
          </div>
        </button>

        <button
          onClick={() => onNavigate('printers')}
          className="p-4 rounded-2xl bg-white border border-slate-200 text-left transition hover:border-slate-300 hover:shadow-xs flex flex-col justify-between group"
        >
          <Printer className="w-5 h-5 mb-2 text-emerald-600" />
          <div>
            <div className="font-extrabold text-sm text-slate-900">Print Devices</div>
            <div className="text-[11px] text-slate-500">Thermal POS setup</div>
          </div>
        </button>
      </div>

      {/* Live Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold text-sm sm:text-base text-slate-900">Recent Live Orders</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
              {recentOrders.length}
            </span>
          </div>
          <button
            onClick={() => onNavigate('orders')}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
          >
            <span>View All Orders</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold">No orders recorded yet</p>
            <p className="text-[11px] mt-0.5">Use the POS counter or table QR to place the first order.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Type / Source</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.map((ord) => {
                  const statusColors: Record<string, string> = {
                    placed: 'bg-amber-100 text-amber-800 border-amber-200',
                    preparing: 'bg-blue-100 text-blue-800 border-blue-200',
                    ready: 'bg-indigo-100 text-indigo-800 border-indigo-200',
                    delivered: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                    cancelled: 'bg-rose-100 text-rose-800 border-rose-200',
                  };

                  return (
                    <tr key={ord.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {ord.orderNumber || ord.id.slice(0, 8)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="capitalize font-semibold text-slate-700">
                          {ord.orderType?.replace('_', ' ')}
                        </span>
                        {ord.tableNumber && (
                          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                            T-{ord.tableNumber}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {ord.customer?.name || 'Walk-in Customer'}
                        <div className="text-[10px] text-slate-400">{ord.customer?.phone}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {ord.items?.length || 0} item{(ord.items?.length || 0) > 1 ? 's' : ''}
                      </td>
                      <td className="py-3 px-4 font-black text-slate-900">
                        ₹{Number(ord.grandTotal || ord.total || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border ${
                            statusColors[ord.status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {['placed', 'pending', 'confirmed', 'accepted'].includes(ord.status) && (
                          <button
                            onClick={() => handleStatusUpdate(ord.id, 'preparing')}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] transition"
                          >
                            Accept & Prep
                          </button>
                        )}
                        {['preparing', 'baking'].includes(ord.status) && (
                          <button
                            onClick={() => handleStatusUpdate(ord.id, 'packing')}
                            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] transition"
                          >
                            Mark Packed
                          </button>
                        )}
                        {ord.status === 'packing' && (
                          <button
                            onClick={() => handleStatusUpdate(ord.id, ord.orderType === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup')}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] transition"
                          >
                            {ord.orderType === 'delivery' ? 'Dispatched' : 'Ready'}
                          </button>
                        )}
                        {['out_for_delivery', 'ready', 'ready_for_pickup'].includes(ord.status) && (
                          <button
                            onClick={() => handleStatusUpdate(ord.id, 'delivered')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition"
                          >
                            Complete
                          </button>
                        )}
                        {(ord.status === 'delivered' || ord.status === 'cancelled') && (
                          <span className="text-[10px] text-slate-400 italic">Closed</span>
                        )}
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
  );
};
