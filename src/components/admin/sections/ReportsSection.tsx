import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import {
  FileText,
  Calendar,
  Download,
  Printer,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Utensils,
  ChevronRight,
} from 'lucide-react';

export const ReportsSection: React.FC = () => {
  const { adminFetch } = useAdminAuth();
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [report, setReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    adminFetch(`/api/admin/reports?period=${period}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setReport(data);
      })
      .catch((err) => console.error('Failed to load report:', err))
      .finally(() => setIsLoading(false));
  }, [adminFetch, period]);

  const periods = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All-Time' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-900">
            Sales & Operational Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit outlet performance, item popularity, and sales distributions.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period Tabs */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl text-xs font-bold">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as any)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  period === p.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* KPI Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
            Total Revenue ({period.toUpperCase()})
          </div>
          <div className="text-2xl font-black text-slate-900">
            ₹{Number(report?.totalRevenue || 0).toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>Verified completed receipts</span>
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
            Total Orders
          </div>
          <div className="text-2xl font-black text-rose-600">
            {report?.totalOrders || 0}
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Across dining, takeaway & delivery
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
            Average Ticket Size
          </div>
          <div className="text-2xl font-black text-indigo-600">
            ₹{report?.avgOrderValue ? Math.round(Number(report.avgOrderValue)) : 0}
          </div>
          <p className="text-[11px] text-indigo-600 font-bold mt-1">Per-order average</p>
        </div>
      </div>

      {/* Breakdown by Type & Top Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Order Type Distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="font-extrabold text-sm text-slate-900 mb-4">
            Orders by Channel
          </h3>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
              <span className="font-bold text-slate-700">Dine-In (Table QR & Service)</span>
              <span className="font-black text-slate-900">
                {report?.byType?.dine_in || 0} orders
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
              <span className="font-bold text-slate-700">Takeaway & Counter Pickup</span>
              <span className="font-black text-slate-900">
                {report?.byType?.takeaway || 0} orders
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
              <span className="font-bold text-slate-700">In-House Delivery</span>
              <span className="font-black text-slate-900">
                {report?.byType?.delivery || 0} orders
              </span>
            </div>
          </div>
        </div>

        {/* Top Selling Dishes */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="font-extrabold text-sm text-slate-900 mb-4">
            Top Performing Menu Items
          </h3>
          {(!report?.topItems || report.topItems.length === 0) ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No sales data for this period
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {report.topItems.map((item: any, i: number) => (
                <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-slate-100 font-black text-slate-600 flex items-center justify-center text-[10px]">
                      {i + 1}
                    </span>
                    <span className="font-bold text-slate-800">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-slate-900">{item.quantity} sold</div>
                    <div className="text-[10px] text-slate-400">₹{item.totalRevenue}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
