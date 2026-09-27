import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
import {
  QrCode,
  Plus,
  Edit2,
  Trash2,
  Printer,
  ExternalLink,
  Users,
  Copy,
  Check,
  Download,
  X,
  Layers,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { TableQRGeneratorModal } from '../../TableQRGeneratorModal';

export const TablesSection: React.FC = () => {
  const { user, restaurant, adminFetch } = useAdminAuth();
  const [tables, setTables] = useState<any[]>([]);
  const [qrCatalog, setQrCatalog] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    tableNumber: '',
    tableName: '',
    capacity: '4',
  });

  // Table QR Stand Modal
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalTarget, setQrModalTarget] = useState<string | number>('1');
  const [qrModalViewMode, setQrModalViewMode] = useState<'stand_preview' | 'printable_all'>('stand_preview');

  const fetchTablesAndQr = async () => {
    try {
      const [tablesRes, qrRes] = await Promise.all([
        adminFetch('/api/admin/tables'),
        adminFetch('/api/admin/qr-codes'),
      ]);

      if (tablesRes.ok) {
        const data = await tablesRes.json();
        if (Array.isArray(data)) setTables(data);
      }

      if (qrRes.ok) {
        const catalog = await qrRes.json();
        if (Array.isArray(catalog)) setQrCatalog(catalog);
      }
    } catch (err) {
      console.error('[TablesSection] Error fetching tables:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTablesAndQr();
  }, []);

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tableNumber.trim()) {
      alert('Table number is required');
      return;
    }

    try {
      if (editingTable) {
        const res = await adminFetch(`/api/admin/tables/${encodeURIComponent(editingTable.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            tableNumber: formData.tableNumber,
            tableName: formData.tableName,
            capacity: Number(formData.capacity) || 4,
          }),
        });
        if (res.ok) {
          await fetchTablesAndQr();
          setIsAddModalOpen(false);
          soundService.playChime('pop');
        }
      } else {
        const res = await adminFetch('/api/admin/tables', {
          method: 'POST',
          body: JSON.stringify({
            tableNumber: formData.tableNumber,
            tableName: formData.tableName,
            capacity: Number(formData.capacity) || 4,
          }),
        });
        if (res.ok) {
          await fetchTablesAndQr();
          setIsAddModalOpen(false);
          soundService.playChime('pop');
        }
      }
    } catch (err: any) {
      alert(`Failed to save table: ${err.message}`);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!window.confirm('Are you sure you want to remove this table?')) return;
    try {
      const res = await adminFetch(`/api/admin/tables/${encodeURIComponent(tableId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setTables((prev) => prev.filter((t) => t.id !== tableId));
        soundService.playChime('pop');
      }
    } catch (err: any) {
      alert(`Error deleting table: ${err.message}`);
    }
  };

  const openAddModal = () => {
    setEditingTable(null);
    setFormData({ tableNumber: String(tables.length + 1), tableName: 'Main Hall', capacity: '4' });
    setIsAddModalOpen(true);
  };

  const openEditModal = (table: any) => {
    setEditingTable(table);
    const num = String(table.tableNumber ?? table.table_number ?? '');
    const name = table.tableName || table.table_name || '';
    setFormData({
      tableNumber: num,
      tableName: name,
      capacity: String(table.capacity || '4'),
    });
    setIsAddModalOpen(true);
  };

  const openQrModal = (table: any) => {
    const num = String(table.tableNumber ?? table.table_number ?? '1');
    setQrModalTarget(num);
    setQrModalViewMode('stand_preview');
    setQrModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-slate-900">
              Tables & Customer QR Codes
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
              {tables.length} Tables Registered
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure dining tables and print branded tabletop QR cards for seamless ordering.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setQrModalViewMode('printable_all');
              setQrModalOpen(true);
            }}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Tent Cards</span>
          </button>

          <button
            onClick={openAddModal}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition shadow-md shadow-rose-900/20 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Table</span>
          </button>
        </div>
      </div>

      {/* Tables Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Loading restaurant tables...</p>
        </div>
      ) : tables.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          <QrCode className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-xs font-bold">No tables configured yet</p>
          <p className="text-[11px] mt-0.5">Click "Add New Table" above to create Table 1.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tables.map((table) => {
            return (
              <div
                key={table.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-slate-300 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 font-black text-sm flex items-center justify-center border border-rose-100">
                      T{table.tableNumber || table.table_number}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 font-bold text-slate-600 flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-400" />
                      {table.capacity || 4} Seats
                    </span>
                  </div>

                  <h3 className="font-extrabold text-sm text-slate-900">
                    Table {table.tableNumber || table.table_number}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {table.tableName || table.table_name || 'Main Dining Area'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-4">
                  <button
                    onClick={() => openQrModal(table)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs transition flex items-center gap-1"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>View QR</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(table)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
                      title="Edit Table"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTable(table.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                      title="Delete Table"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Table Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-900">
              {editingTable ? 'Edit Table' : 'Add New Table'}
            </h3>

            <form onSubmit={handleSaveTable} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Table Number *
                </label>
                <input
                  type="text"
                  required
                  value={formData.tableNumber}
                  onChange={(e) => setFormData({ ...formData, tableNumber: e.target.value })}
                  placeholder="1, 2, 3..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Table Name / Area
                </label>
                <input
                  type="text"
                  value={formData.tableName}
                  onChange={(e) => setFormData({ ...formData, tableName: e.target.value })}
                  placeholder="e.g. Ground Floor, Balcony, VIP Booth"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Seating Capacity
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition"
                >
                  {editingTable ? 'Update Table' : 'Create Table'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table QR Code & Acrylic Tent Card Studio Modal */}
      {qrModalOpen && (
        <TableQRGeneratorModal
          tables={tables}
          tableCount={tables.length}
          initialSelectedTable={qrModalTarget}
          restaurantName={restaurant?.name || user?.restaurantName || 'Mozz Pizzateria'}
          restaurantSlug={restaurant?.slug || user?.restaurantSlug || 'mozz'}
          initialViewMode={qrModalViewMode}
          onClose={() => setQrModalOpen(false)}
        />
      )}
    </div>
  );
};
