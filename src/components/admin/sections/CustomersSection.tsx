import React, { useState, useEffect, useMemo } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import {
  Users,
  Search,
  Phone,
  Mail,
  Calendar,
  ShoppingBag,
  TrendingUp,
  Download,
} from 'lucide-react';

export const CustomersSection: React.FC = () => {
  const { adminFetch } = useAdminAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    adminFetch('/api/admin/customers')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setCustomers(data);
      })
      .catch((err) => console.error('Error fetching customers:', err))
      .finally(() => setIsLoading(false));
  }, [adminFetch]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name, mobile, email..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">
            Total Customers: <strong className="text-slate-900">{customers.length}</strong>
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading customer directory...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold">No customers found</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Customers will automatically appear here as they order via POS or QR.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Total Orders</th>
                  <th className="py-3 px-4">Total Spend</th>
                  <th className="py-3 px-4">Last Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id || c.phone} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">
                      {c.name || 'Valued Customer'}
                      {c.email && <div className="text-[10px] text-slate-400 font-normal">{c.email}</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <a
                        href={`tel:${c.phone}`}
                        className="font-medium text-rose-600 hover:underline flex items-center gap-1"
                      >
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{c.phone || 'N/A'}</span>
                      </a>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-800">{c.totalOrders || 1} orders</span>
                    </td>
                    <td className="py-3.5 px-4 font-black text-slate-900">
                      ₹{Number(c.totalSpent || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : 'Recent'}
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
