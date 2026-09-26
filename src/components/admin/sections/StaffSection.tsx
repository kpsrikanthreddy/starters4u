import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
import {
  Users,
  UserPlus,
  Shield,
  Key,
  Trash2,
  Edit2,
  Mail,
  Phone,
  CheckCircle2,
  X,
  Lock,
} from 'lucide-react';

export const StaffSection: React.FC = () => {
  const { user, adminFetch } = useAdminAuth();
  const [staffList, setStaffList] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'CASHIER',
    pin: '',
    branchId: '',
  });

  const isOwner = user?.role === 'SUPER_ADMIN' || user?.role === 'RESTAURANT_OWNER';

  const fetchData = async () => {
    try {
      const [usersRes, branchesRes] = await Promise.all([
        adminFetch('/api/admin/users'),
        adminFetch('/api/admin/branches'),
      ]);

      if (usersRes.ok) {
        const users = await usersRes.json();
        if (Array.isArray(users)) setStaffList(users);
      }

      if (branchesRes.ok) {
        const brs = await branchesRes.json();
        if (Array.isArray(brs)) {
          setBranches(brs);
          if (brs.length > 0 && !formData.branchId) {
            setFormData((prev) => ({ ...prev, branchId: brs[0].id }));
          }
        }
      }
    } catch (err) {
      console.error('Failed to load staff list:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAdd = () => {
    setEditingStaff(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'CASHIER',
      pin: '',
      branchId: branches[0]?.id || '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (st: any) => {
    setEditingStaff(st);
    setFormData({
      name: st.name || '',
      email: st.email || '',
      phone: st.phone || '',
      role: st.role || 'CASHIER',
      pin: '', // Keep blank if unchanged
      branchId: st.branchId || branches[0]?.id || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this staff member?')) return;
    try {
      const res = await adminFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setStaffList((prev) => prev.filter((u) => u.id !== id));
        soundService.playChime('pop');
      } else {
        alert('Failed to delete staff member.');
      }
    } catch (err: any) {
      alert(`Error deleting user: ${err.message}`);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStaff) {
        const payload: any = {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          branchId: formData.branchId,
        };
        if (formData.pin.trim()) {
          payload.pin = formData.pin.trim();
        }

        const res = await adminFetch(`/api/admin/users/${encodeURIComponent(editingStaff.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          await fetchData();
          setIsModalOpen(false);
          soundService.playChime('pop');
        } else {
          alert('Failed to update staff member.');
        }
      } else {
        if (!formData.pin.trim() || formData.pin.length < 4) {
          alert('4-digit PIN is required.');
          return;
        }

        const res = await adminFetch('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify(formData),
        });

        if (res.ok) {
          await fetchData();
          setIsModalOpen(false);
          soundService.playChime('pop');
        } else {
          const err = await res.json().catch(() => ({}));
          alert(`Failed to add user: ${err.error || 'Server error'}`);
        }
      }
    } catch (err: any) {
      alert(`Error saving user: ${err.message}`);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'RESTAURANT_OWNER':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'BRANCH_MANAGER':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'CASHIER':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'KITCHEN':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-900">
            Restaurant Staff & Access Control
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage cashier accounts, kitchen displays, branch managers, and POS quick-login PINs.
          </p>
        </div>

        {isOwner && (
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition shadow-md shadow-rose-900/20 flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>
        )}
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading staff...</p>
          </div>
        ) : staffList.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold">No staff members found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Assigned Branch</th>
                  <th className="py-3 px-4">Quick PIN</th>
                  {isOwner && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">
                      {st.name}
                      {st.phone && <div className="text-[10px] text-slate-400 font-normal">{st.phone}</div>}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 text-[11px]">{st.email}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border ${getRoleBadge(
                          st.role
                        )}`}
                      >
                        {st.role?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {branches.find((b) => b.id === st.branchId)?.name || 'All Branches'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-slate-400 text-xs">••••</span>
                    </td>
                    {isOwner && (
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(st)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(st.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-900">
              {editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}
            </h3>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="rahul@restaurant.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Mobile Phone
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800 focus:ring-2 focus:ring-rose-500"
                >
                  <option value="CASHIER">Cashier (POS Orders & Billing)</option>
                  <option value="KITCHEN">Kitchen Staff (KOT Display)</option>
                  <option value="BRANCH_MANAGER">Branch Manager</option>
                  <option value="RESTAURANT_OWNER">Restaurant Owner</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Assigned Branch
                </label>
                <select
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800 focus:ring-2 focus:ring-rose-500"
                >
                  {branches.length === 0 && <option value="">Main Flagship Branch</option>}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  {editingStaff ? 'Change 4-Digit Login PIN (optional)' : '4-Digit Login PIN *'}
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required={!editingStaff}
                  value={formData.pin}
                  onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                  placeholder="e.g. 1234"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono tracking-widest text-sm focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition"
                >
                  {editingStaff ? 'Update User' : 'Create User'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
