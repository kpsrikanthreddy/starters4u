import React, { useState, useEffect, useMemo } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import {
  CreditCard,
  Banknote,
  QrCode,
  Search,
  ArrowUpRight,
  TrendingUp,
  CheckCircle2,
  Clock,
  Download,
} from 'lucide-react';

export const PaymentsSection: React.FC = () => {
  const { adminFetch } = useAdminAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    adminFetch('/api/admin/payments')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setPayments(data);
      })
      .catch((err) => console.error('Error fetching payments:', err))
      .finally(() => setIsLoading(false));
  }, [adminFetch]);

  const totalCollected = payments
    .filter((p) => p.status === 'success' || p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const byMethod = useMemo(() => {
    const counts: Record<string, number> = { cash: 0, upi: 0, card: 0 };
    payments.forEach((p) => {
      const m = (p.method || 'cash').toLowerCase();
      counts[m] = (counts[m] || 0) + Number(p.amount || 0);
    });
    return counts;
  }, [payments]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return payments;
    const q = searchQuery.toLowerCase();
    return payments.filter(
      (p) =>
        (p.orderId || '').toLowerCase().includes(q) ||
        (p.transactionId || '').toLowerCase().includes(q) ||
        (p.method || '').toLowerCase().includes(q)
    );
  }, [payments, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Payment Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
            Total Collected
          </div>
          <div className="text-2xl font-black text-slate-900">
            ₹{totalCollected.toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Settled & Verified</span>
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
            UPI / Online
          </div>
          <div className="text-2xl font-black text-indigo-600">
            ₹{(byMethod.upi || 0).toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Instant QR settlement</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
            Cash in Drawer
          </div>
          <div className="text-2xl font-black text-emerald-600">
            ₹{(byMethod.cash || 0).toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Counter cash collected</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
            Card Machine
          </div>
          <div className="text-2xl font-black text-blue-600">
            ₹{(byMethod.card || 0).toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">POS swipe / tap</p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search payments by Order ID, Txn ID, or Method..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading payments...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold">No payment records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Transaction ID</th>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {p.transactionId || p.id.slice(0, 10)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {p.orderId ? p.orderId.slice(0, 8) : 'Direct POS'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="capitalize font-bold text-slate-700">{p.method || 'cash'}</span>
                    </td>
                    <td className="py-3.5 px-4 font-black text-slate-900">
                      ₹{Number(p.amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {p.status || 'paid'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {new Date(p.createdAt || Date.now()).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
