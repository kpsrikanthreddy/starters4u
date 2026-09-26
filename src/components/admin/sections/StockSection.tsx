import React, { useState, useEffect, useMemo } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
import {
  InventoryItemRecord,
  InventoryTransactionRecord,
  DailyStockSummaryReport,
} from '../../../types';
import {
  Boxes,
  Plus,
  Minus,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  History,
  Search,
  Filter,
  RefreshCw,
  Trash2,
  Edit2,
  Package,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Clock,
  Sparkles,
} from 'lucide-react';

export const StockSection: React.FC = () => {
  const { user, restaurant, adminFetch } = useAdminAuth();

  const [items, setItems] = useState<InventoryItemRecord[]>([]);
  const [summaryReport, setSummaryReport] = useState<DailyStockSummaryReport | null>(null);
  const [transactions, setTransactions] = useState<InventoryTransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'ledger'>('summary');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // Modals state
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [isRecordUsageOpen, setIsRecordUsageOpen] = useState(false);
  const [isRecordWastageOpen, setIsRecordWastageOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemRecord | null>(null);
  const [targetItemForAction, setTargetItemForAction] = useState<InventoryItemRecord | null>(null);

  // Forms
  const [stockFormData, setStockFormData] = useState({
    itemId: '',
    quantity: '',
    transactionType: 'PURCHASE' as const,
    notes: '',
    referenceType: 'SUPPLIER_DELIVERY',
  });

  const [usageFormData, setUsageFormData] = useState({
    itemId: '',
    quantity: '',
    transactionType: 'CONSUMPTION' as const,
    notes: '',
    referenceType: 'KITCHEN_USAGE',
  });

  const [wastageFormData, setWastageFormData] = useState({
    itemId: '',
    quantity: '',
    reason: 'SPOILED',
    notes: '',
  });

  const [itemFormData, setItemFormData] = useState({
    name: '',
    sku: '',
    category: 'Raw Ingredients',
    unit: 'kg',
    initialQuantity: '0',
    minimumStockLevel: '5',
    costPerUnit: '0',
  });

  const [submitting, setSubmitting] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const fetchStockData = async () => {
    setIsLoading(true);
    try {
      const [itemsRes, summaryRes, txRes] = await Promise.all([
        adminFetch('/api/admin/inventory'),
        adminFetch('/api/admin/inventory/summary'),
        adminFetch('/api/admin/inventory/transactions?limit=100'),
      ]);

      if (itemsRes.ok) {
        const data = await itemsRes.json();
        if (Array.isArray(data)) setItems(data);
      }

      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        setSummaryReport(sumData);
      }

      if (txRes.ok) {
        const txData = await txRes.json();
        if (Array.isArray(txData)) setTransactions(txData);
      }
    } catch (err) {
      console.error('[StockSection] Error loading stock inventory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStockData();
  }, []);

  const showNotification = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory =
        selectedCategory === 'all' ||
        item.category.toLowerCase() === selectedCategory.toLowerCase();
      const matchesLowStock = !showLowStockOnly || item.is_low_stock;

      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [items, searchTerm, selectedCategory, showLowStockOnly]);

  // Low stock items list
  const lowStockItems = useMemo(() => {
    return items.filter((i) => i.is_low_stock);
  }, [items]);

  // Handlers
  const handleOpenAddStock = (preselectedItem?: InventoryItemRecord) => {
    const item = preselectedItem || items[0];
    setTargetItemForAction(item || null);
    setStockFormData({
      itemId: item ? item.id : '',
      quantity: '',
      transactionType: 'PURCHASE',
      notes: '',
      referenceType: 'SUPPLIER_DELIVERY',
    });
    setIsAddStockOpen(true);
  };

  const handleOpenRecordUsage = (preselectedItem?: InventoryItemRecord) => {
    const item = preselectedItem || items[0];
    setTargetItemForAction(item || null);
    setUsageFormData({
      itemId: item ? item.id : '',
      quantity: '',
      transactionType: 'CONSUMPTION',
      notes: '',
      referenceType: 'KITCHEN_USAGE',
    });
    setIsRecordUsageOpen(true);
  };

  const handleOpenRecordWastage = (preselectedItem?: InventoryItemRecord) => {
    const item = preselectedItem || items[0];
    setTargetItemForAction(item || null);
    setWastageFormData({
      itemId: item ? item.id : '',
      quantity: '',
      reason: 'SPOILED',
      notes: '',
    });
    setIsRecordWastageOpen(true);
  };

  const handleOpenItemModal = (itemToEdit?: InventoryItemRecord) => {
    if (itemToEdit) {
      setEditingItem(itemToEdit);
      setItemFormData({
        name: itemToEdit.name,
        sku: itemToEdit.sku || '',
        category: itemToEdit.category,
        unit: itemToEdit.unit,
        initialQuantity: String(itemToEdit.current_quantity),
        minimumStockLevel: String(itemToEdit.minimum_stock_level),
        costPerUnit: String(itemToEdit.cost_per_unit || 0),
      });
    } else {
      setEditingItem(null);
      setItemFormData({
        name: '',
        sku: '',
        category: 'Raw Ingredients',
        unit: 'kg',
        initialQuantity: '0',
        minimumStockLevel: '5',
        costPerUnit: '0',
      });
    }
    setIsItemModalOpen(true);
  };

  // Submit Add Stock
  const handleSubmitAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockFormData.itemId) {
      alert('Please select an item');
      return;
    }
    const qty = parseFloat(stockFormData.quantity);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid positive quantity to add');
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminFetch('/api/admin/inventory/add-stock', {
        method: 'POST',
        body: JSON.stringify({
          itemId: stockFormData.itemId,
          quantity: qty,
          transactionType: stockFormData.transactionType,
          notes: stockFormData.notes,
          referenceType: stockFormData.referenceType,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add stock');
      }

      const data = await res.json();
      soundService.playChime('pop');
      showNotification(data.message || `Stock added successfully`);
      setIsAddStockOpen(false);
      await fetchStockData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Usage
  const handleSubmitUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usageFormData.itemId) {
      alert('Please select an item');
      return;
    }
    const qty = parseFloat(usageFormData.quantity);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid positive quantity used');
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminFetch('/api/admin/inventory/record-usage', {
        method: 'POST',
        body: JSON.stringify({
          itemId: usageFormData.itemId,
          quantity: qty,
          transactionType: usageFormData.transactionType,
          notes: usageFormData.notes,
          referenceType: usageFormData.referenceType,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to record usage');
      }

      const data = await res.json();
      soundService.playChime('pop');
      showNotification(data.message || `Usage recorded successfully`);
      setIsRecordUsageOpen(false);
      await fetchStockData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Wastage
  const handleSubmitWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wastageFormData.itemId) {
      alert('Please select an item');
      return;
    }
    const qty = parseFloat(wastageFormData.quantity);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid positive wastage quantity');
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminFetch('/api/admin/inventory/record-wastage', {
        method: 'POST',
        body: JSON.stringify({
          itemId: wastageFormData.itemId,
          quantity: qty,
          reason: wastageFormData.reason,
          notes: wastageFormData.notes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to record wastage');
      }

      const data = await res.json();
      soundService.playChime('pop');
      showNotification(data.message || `Wastage logged successfully`);
      setIsRecordWastageOpen(false);
      await fetchStockData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Item Create/Edit
  const handleSubmitItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemFormData.name.trim()) {
      alert('Item name is required');
      return;
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        const res = await adminFetch(`/api/admin/inventory/${encodeURIComponent(editingItem.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: itemFormData.name.trim(),
            sku: itemFormData.sku.trim() || undefined,
            category: itemFormData.category.trim(),
            unit: itemFormData.unit.trim(),
            minimumStockLevel: parseFloat(itemFormData.minimumStockLevel) || 0,
            costPerUnit: parseFloat(itemFormData.costPerUnit) || 0,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update item');
        }
        showNotification(`Updated item ${itemFormData.name}`);
      } else {
        const res = await adminFetch('/api/admin/inventory', {
          method: 'POST',
          body: JSON.stringify({
            name: itemFormData.name.trim(),
            sku: itemFormData.sku.trim() || undefined,
            category: itemFormData.category.trim(),
            unit: itemFormData.unit.trim(),
            initialQuantity: parseFloat(itemFormData.initialQuantity) || 0,
            minimumStockLevel: parseFloat(itemFormData.minimumStockLevel) || 5,
            costPerUnit: parseFloat(itemFormData.costPerUnit) || 0,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create item');
        }
        showNotification(`Created inventory item ${itemFormData.name}`);
      }

      soundService.playChime('pop');
      setIsItemModalOpen(false);
      await fetchStockData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete item
  const handleDeleteItem = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove item "${name}" from inventory?`)) return;
    try {
      const res = await adminFetch(`/api/admin/inventory/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        soundService.playChime('pop');
        showNotification(`Removed "${name}" from inventory`);
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const selectedItemForAdd = items.find((i) => i.id === stockFormData.itemId);
  const selectedItemForUsage = items.find((i) => i.id === usageFormData.itemId);
  const selectedItemForWastage = items.find((i) => i.id === wastageFormData.itemId);

  return (
    <div className="space-y-6">
      {/* Action Notification Toast */}
      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-500 text-white rounded-xl shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-bold text-sm">{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg(null)} className="p-1 hover:bg-emerald-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header & Tenant Info */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Stock & Inventory Management</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-300">
                  {restaurant?.name || 'Restaurant'} Multi-Tenant
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Track opening stock, purchases, kitchen usage, wastage, and immutable ledger movements in real time.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleOpenAddStock()}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-700/20 active:scale-95 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Stock</span>
          </button>
          <button
            onClick={() => handleOpenRecordUsage()}
            className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-sky-700/20 active:scale-95 transition cursor-pointer"
          >
            <Minus className="w-4 h-4" />
            <span>- Record Usage</span>
          </button>
          <button
            onClick={() => handleOpenRecordWastage()}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-amber-700/20 active:scale-95 transition cursor-pointer"
          >
            <TrendingDown className="w-4 h-4" />
            <span>Record Wastage</span>
          </button>
          <button
            onClick={() => handleOpenItemModal()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition cursor-pointer"
          >
            <Package className="w-4 h-4" />
            <span>+ New Item</span>
          </button>
          <button
            onClick={fetchStockData}
            title="Refresh Stock Data"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Items</span>
            <Boxes className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{items.length}</div>
          <p className="text-[10px] text-slate-500 mt-1">Configured in catalog</p>
        </div>

        <div className={`border rounded-2xl p-4 shadow-2xs ${
          lowStockItems.length > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Low Stock</span>
            <AlertTriangle className={`w-4 h-4 ${lowStockItems.length > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <div className="text-2xl font-black text-rose-600">{lowStockItems.length}</div>
          <p className="text-[10px] text-rose-600/80 mt-1">Below minimum threshold</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Added Today</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">
            {summaryReport?.totalPurchasedToday || 0}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Purchases & additions</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Used Today</span>
            <ArrowDownRight className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-black text-sky-600">
            {summaryReport?.totalUsedToday || 0}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Kitchen consumption</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Wastage Today</span>
            <TrendingDown className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600">
            {summaryReport?.totalWastageToday || 0}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Spoilage & wastage</p>
        </div>
      </div>

      {/* Low Stock Alert Warning Banner */}
      {lowStockItems.length > 0 && (
        <div className="bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-rose-500/10 border border-rose-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-rose-950 flex items-center gap-2">
                <span>Low Stock Warning ({lowStockItems.length} items need restock)</span>
              </h3>
              <p className="text-xs text-rose-800 mt-0.5">
                The following ingredients are at or below minimum threshold:{' '}
                <span className="font-bold">
                  {lowStockItems.map((i) => `${i.name} (${i.current_quantity} ${i.unit})`).join(', ')}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setShowLowStockOnly(true);
              setActiveTab('summary');
            }}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs whitespace-nowrap self-start sm:self-auto cursor-pointer"
          >
            Review Low Stock
          </button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-3 text-sm font-black transition relative flex items-center gap-2 ${
              activeTab === 'summary'
                ? 'text-rose-600 border-b-2 border-rose-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Today's Stock Summary</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
              {filteredItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 text-sm font-black transition relative flex items-center gap-2 ${
              activeTab === 'ledger'
                ? 'text-rose-600 border-b-2 border-rose-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Transaction Ledger</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
              {transactions.length}
            </span>
          </button>
        </div>

        <div className="text-xs text-slate-400 font-medium hidden sm:block">
          Date: <span className="font-bold text-slate-700">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>

      {/* TAB 1: TODAY'S STOCK SUMMARY */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded-2xl shadow-2xs">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search item name or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 outline-hidden font-medium"
                />
              </div>

              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="py-2 px-3 rounded-xl text-xs bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-hidden"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLowStockOnly(!showLowStockOnly)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  showLowStockOnly
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Only Low Stock ({lowStockItems.length})</span>
              </button>
            </div>
          </div>

          {/* Today's Stock Summary Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-sm">TODAY'S STOCK SUMMARY</h3>
                <span className="text-xs text-slate-400 font-medium">
                  (Current Stock = Opening + Added - Used - Wastage)
                </span>
              </div>
              <span className="text-xs font-bold text-slate-500">
                Showing {filteredItems.length} of {items.length} items
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Item & Code</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Unit</th>
                    <th className="py-3 px-3 text-right">Opening Stock</th>
                    <th className="py-3 px-3 text-right text-emerald-700">Added Today</th>
                    <th className="py-3 px-3 text-right text-sky-700">Used Today</th>
                    <th className="py-3 px-3 text-right text-amber-700">Wastage</th>
                    <th className="py-3 px-3 text-right font-black">Current Stock</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        No inventory items found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isLow = item.is_low_stock;
                      const isZero = item.current_quantity <= 0;

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50/80 transition ${
                            isZero
                              ? 'bg-rose-50/30'
                              : isLow
                              ? 'bg-amber-50/30'
                              : ''
                          }`}
                        >
                          {/* Item & SKU */}
                          <td className="py-3 px-4">
                            <div className="font-extrabold text-slate-900 text-xs">{item.name}</div>
                            {item.sku && (
                              <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>
                            )}
                          </td>

                          {/* Category */}
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {item.category}
                            </span>
                          </td>

                          {/* Unit */}
                          <td className="py-3 px-3 font-semibold text-slate-600">
                            {item.unit}
                          </td>

                          {/* Opening Stock */}
                          <td className="py-3 px-3 text-right font-bold text-slate-700">
                            {item.opening_stock} <span className="text-[10px] font-normal text-slate-400">{item.unit}</span>
                          </td>

                          {/* Added Today */}
                          <td className="py-3 px-3 text-right font-bold text-emerald-600">
                            {item.added_today && item.added_today > 0 ? (
                              <span className="inline-flex items-center gap-0.5">
                                +{item.added_today}
                              </span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>

                          {/* Used Today */}
                          <td className="py-3 px-3 text-right font-bold text-sky-600">
                            {item.used_today && item.used_today > 0 ? (
                              <span className="inline-flex items-center gap-0.5">
                                -{item.used_today}
                              </span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>

                          {/* Wastage */}
                          <td className="py-3 px-3 text-right font-bold text-amber-600">
                            {item.wastage_today && item.wastage_today > 0 ? (
                              <span className="inline-flex items-center gap-0.5">
                                -{item.wastage_today}
                              </span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>

                          {/* Current Stock */}
                          <td className="py-3 px-3 text-right">
                            <div className="font-black text-slate-900 text-sm">
                              {item.current_quantity}{' '}
                              <span className="text-[10px] font-medium text-slate-500">{item.unit}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Min: {item.minimum_stock_level} {item.unit}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3 text-center">
                            {isZero ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                OUT OF STOCK
                              </span>
                            ) : isLow ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                LOW STOCK
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                IN STOCK
                              </span>
                            )}
                          </td>

                          {/* Quick Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenAddStock(item)}
                                title="Add Stock (+)"
                                className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] border border-emerald-200 transition cursor-pointer"
                              >
                                + Add
                              </button>
                              <button
                                onClick={() => handleOpenRecordUsage(item)}
                                title="Record Usage (-)"
                                className="px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-[11px] border border-sky-200 transition cursor-pointer"
                              >
                                - Use
                              </button>
                              <button
                                onClick={() => handleOpenRecordWastage(item)}
                                title="Record Wastage"
                                className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[11px] border border-amber-200 transition cursor-pointer"
                              >
                                Waste
                              </button>
                              <button
                                onClick={() => handleOpenItemModal(item)}
                                title="Edit Item Settings"
                                className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id, item.name)}
                                title="Delete Item"
                                className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: IMMUTABLE TRANSACTION LEDGER */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-rose-600" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  IMMUTABLE INVENTORY TRANSACTION LEDGER
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {transactions.length} recorded movements
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-3">Item Name</th>
                    <th className="py-3 px-3">Movement Type</th>
                    <th className="py-3 px-3 text-right">Quantity</th>
                    <th className="py-3 px-3 text-right">Audit Before → After</th>
                    <th className="py-3 px-3">Reference / Reason</th>
                    <th className="py-3 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No transactions recorded yet in this restaurant's ledger.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => {
                      const isPositive = ['PURCHASE', 'ADD', 'ADJUSTMENT_IN', 'OPENING', 'RETURN'].includes(
                        tx.transaction_type
                      );
                      const isWastage = tx.transaction_type === 'WASTAGE';

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                          {/* Timestamp */}
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(tx.created_at).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>

                          {/* Item Name & SKU */}
                          <td className="py-3 px-3">
                            <span className="font-extrabold text-slate-900">{tx.item_name || 'Inventory Item'}</span>
                            {tx.item_sku && (
                              <span className="ml-1.5 text-[10px] font-mono text-slate-400">
                                ({tx.item_sku})
                              </span>
                            )}
                          </td>

                          {/* Movement Type Badge */}
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                tx.transaction_type === 'PURCHASE'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : tx.transaction_type === 'CONSUMPTION'
                                  ? 'bg-sky-50 text-sky-800 border-sky-200'
                                  : isWastage
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : tx.transaction_type === 'OPENING'
                                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                                  : 'bg-slate-100 text-slate-800 border-slate-200'
                              }`}
                            >
                              {tx.transaction_type}
                            </span>
                          </td>

                          {/* Quantity */}
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`font-black text-xs ${
                                isPositive
                                  ? 'text-emerald-600'
                                  : isWastage
                                  ? 'text-rose-600'
                                  : 'text-sky-600'
                              }`}
                            >
                              {isPositive ? '+' : '-'}
                              {tx.quantity} {tx.unit}
                            </span>
                          </td>

                          {/* Audit Before -> After */}
                          <td className="py-3 px-3 text-right font-mono text-xs text-slate-600">
                            <span>{tx.quantity_before}</span>
                            <span className="text-slate-300 mx-1.5">→</span>
                            <span className="font-bold text-slate-900">{tx.quantity_after}</span>{' '}
                            <span className="text-[10px] text-slate-400">{tx.unit}</span>
                          </td>

                          {/* Reference */}
                          <td className="py-3 px-3 text-slate-600 text-xs">
                            {tx.reference_type || '-'}
                          </td>

                          {/* Notes */}
                          <td className="py-3 px-4 text-slate-500 text-xs max-w-xs truncate">
                            {tx.notes || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 1: ADD STOCK [+ Add Stock]                          */}
      {/* ========================================================== */}
      {isAddStockOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="font-black text-slate-900 text-base">Add Stock (Purchase / Inbound)</h3>
              </div>
              <button
                onClick={() => setIsAddStockOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitAddStock} className="space-y-4 text-xs">
              {/* Select Item */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Ingredient / Item *</label>
                <select
                  value={stockFormData.itemId}
                  onChange={(e) => setStockFormData({ ...stockFormData, itemId: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800"
                  required
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} — Current: {i.current_quantity} {i.unit} ({i.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity to Add */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Quantity to Add ({selectedItemForAdd?.unit || 'unit'}) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    placeholder="e.g. 5"
                    value={stockFormData.quantity}
                    onChange={(e) => setStockFormData({ ...stockFormData, quantity: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-black text-slate-900"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                    {selectedItemForAdd?.unit}
                  </span>
                </div>
              </div>

              {/* Movement Type */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason / Movement Type</label>
                <select
                  value={stockFormData.transactionType}
                  onChange={(e) =>
                    setStockFormData({
                      ...stockFormData,
                      transactionType: e.target.value as any,
                    })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
                >
                  <option value="PURCHASE">Purchase / Supplier Inbound</option>
                  <option value="ADD">Manual Stock Addition</option>
                  <option value="ADJUSTMENT_IN">Inventory Count Adjustment (+)</option>
                  <option value="OPENING">Opening Balance Adjustment</option>
                  <option value="RETURN">Customer / Kitchen Return (+)</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Supplier Invoice Details</label>
                <input
                  type="text"
                  placeholder="e.g. Morning supplier delivery from Metro Wholesale"
                  value={stockFormData.notes}
                  onChange={(e) => setStockFormData({ ...stockFormData, notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                />
              </div>

              {/* Live Preview Box */}
              {selectedItemForAdd && stockFormData.quantity && !isNaN(parseFloat(stockFormData.quantity)) && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-900 text-xs">
                  <div className="font-extrabold flex items-center justify-between">
                    <span>Current: {selectedItemForAdd.current_quantity} {selectedItemForAdd.unit}</span>
                    <span>+ {parseFloat(stockFormData.quantity)} {selectedItemForAdd.unit}</span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-emerald-200/60 font-black text-emerald-800 flex items-center justify-between text-sm">
                    <span>New Current Stock:</span>
                    <span>
                      {(
                        parseFloat(String(selectedItemForAdd.current_quantity)) +
                        parseFloat(stockFormData.quantity)
                      ).toFixed(3)}{' '}
                      {selectedItemForAdd.unit}
                    </span>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddStockOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Adding...' : 'Confirm Add Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 2: RECORD USAGE [- Record Usage]                     */}
      {/* ========================================================== */}
      {isRecordUsageOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                  <Minus className="w-4 h-4" />
                </div>
                <h3 className="font-black text-slate-900 text-base">Record Usage (Consumption)</h3>
              </div>
              <button
                onClick={() => setIsRecordUsageOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitUsage} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Ingredient / Item *</label>
                <select
                  value={usageFormData.itemId}
                  onChange={(e) => setUsageFormData({ ...usageFormData, itemId: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800"
                  required
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} — Current: {i.current_quantity} {i.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Quantity Used ({selectedItemForUsage?.unit || 'unit'}) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    placeholder="e.g. 8"
                    value={usageFormData.quantity}
                    onChange={(e) => setUsageFormData({ ...usageFormData, quantity: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-black text-slate-900"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                    {selectedItemForUsage?.unit}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason</label>
                <select
                  value={usageFormData.transactionType}
                  onChange={(e) =>
                    setUsageFormData({
                      ...usageFormData,
                      transactionType: e.target.value as any,
                    })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
                >
                  <option value="CONSUMPTION">Kitchen Consumption (Order Preparation)</option>
                  <option value="ADJUSTMENT_OUT">Preparation Adjustment (-)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Shift Details</label>
                <input
                  type="text"
                  placeholder="e.g. Lunch rush prep batch"
                  value={usageFormData.notes}
                  onChange={(e) => setUsageFormData({ ...usageFormData, notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                />
              </div>

              {/* Live Preview Box */}
              {selectedItemForUsage && usageFormData.quantity && !isNaN(parseFloat(usageFormData.quantity)) && (
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-sky-900 text-xs">
                  <div className="font-extrabold flex items-center justify-between">
                    <span>Current: {selectedItemForUsage.current_quantity} {selectedItemForUsage.unit}</span>
                    <span>- {parseFloat(usageFormData.quantity)} {selectedItemForUsage.unit}</span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-sky-200/60 font-black text-sky-800 flex items-center justify-between text-sm">
                    <span>Remaining Stock:</span>
                    <span>
                      {Math.max(
                        0,
                        parseFloat(String(selectedItemForUsage.current_quantity)) -
                          parseFloat(usageFormData.quantity)
                      ).toFixed(3)}{' '}
                      {selectedItemForUsage.unit}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRecordUsageOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Recording...' : 'Record Usage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 3: RECORD WASTAGE [Record Wastage]                   */}
      {/* ========================================================== */}
      {isRecordWastageOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <h3 className="font-black text-slate-900 text-base">Record Wastage / Spoilage</h3>
              </div>
              <button
                onClick={() => setIsRecordWastageOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitWastage} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Ingredient / Item *</label>
                <select
                  value={wastageFormData.itemId}
                  onChange={(e) => setWastageFormData({ ...wastageFormData, itemId: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800"
                  required
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} — Current: {i.current_quantity} {i.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Wastage Quantity ({selectedItemForWastage?.unit || 'unit'}) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    placeholder="e.g. 1"
                    value={wastageFormData.quantity}
                    onChange={(e) => setWastageFormData({ ...wastageFormData, quantity: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-black text-slate-900"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                    {selectedItemForWastage?.unit}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason for Wastage</label>
                <select
                  value={wastageFormData.reason}
                  onChange={(e) => setWastageFormData({ ...wastageFormData, reason: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
                >
                  <option value="SPOILED">Spoiled / Rotten</option>
                  <option value="PREPARATION_WASTAGE">Preparation Trimming / Peeling Wastage</option>
                  <option value="BURNT_OVERCOOKED">Burnt / Overcooked in Kitchen</option>
                  <option value="EXPIRED">Expiry Date Reached</option>
                  <option value="DAMAGED_SPILLAGE">Container Spillage / Packaging Damaged</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Power fluctuation in walk-in chiller overnight"
                  value={wastageFormData.notes}
                  onChange={(e) => setWastageFormData({ ...wastageFormData, notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                />
              </div>

              {/* Live Preview Box */}
              {selectedItemForWastage && wastageFormData.quantity && !isNaN(parseFloat(wastageFormData.quantity)) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 text-xs">
                  <div className="font-extrabold flex items-center justify-between">
                    <span>Current: {selectedItemForWastage.current_quantity} {selectedItemForWastage.unit}</span>
                    <span>- {parseFloat(wastageFormData.quantity)} {selectedItemForWastage.unit}</span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-amber-200/60 font-black text-amber-800 flex items-center justify-between text-sm">
                    <span>Remaining Stock:</span>
                    <span>
                      {Math.max(
                        0,
                        parseFloat(String(selectedItemForWastage.current_quantity)) -
                          parseFloat(wastageFormData.quantity)
                      ).toFixed(3)}{' '}
                      {selectedItemForWastage.unit}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRecordWastageOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Recording...' : 'Log Wastage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 4: NEW / EDIT INVENTORY ITEM                         */}
      {/* ========================================================== */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <h3 className="font-black text-slate-900 text-base">
                  {editingItem ? 'Edit Inventory Item' : 'New Inventory Item'}
                </h3>
              </div>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitItem} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block font-bold text-slate-700 mb-1">Item Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Chicken"
                    value={itemFormData.name}
                    onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold"
                    required
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block font-bold text-slate-700 mb-1">SKU / Item Code</label>
                  <input
                    type="text"
                    placeholder="e.g. RAW-CHK-01"
                    value={itemFormData.sku}
                    onChange={(e) => setItemFormData({ ...itemFormData, sku: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={itemFormData.category}
                    onChange={(e) => setItemFormData({ ...itemFormData, category: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium"
                  >
                    <option value="Poultry">Poultry & Meat</option>
                    <option value="Dairy">Dairy & Cheese</option>
                    <option value="Dry Goods">Dry Goods & Flour</option>
                    <option value="Oils & Sauces">Oils & Sauces</option>
                    <option value="Packaging">Packaging & Boxes</option>
                    <option value="Beverages">Beverages & Bottles</option>
                    <option value="Prep Items">Kitchen Prep Items</option>
                    <option value="Raw Ingredients">Raw Ingredients</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit of Measure *</label>
                  <select
                    value={itemFormData.unit}
                    onChange={(e) => setItemFormData({ ...itemFormData, unit: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-rose-700"
                    required
                  >
                    <option value="kg">kg (Kilogram)</option>
                    <option value="g">g (Gram)</option>
                    <option value="litre">litre (Litre)</option>
                    <option value="ml">ml (Millilitre)</option>
                    <option value="pieces">pieces (Pcs)</option>
                    <option value="packets">packets (Pkt)</option>
                    <option value="boxes">boxes (Box)</option>
                    <option value="bottles">bottles (Btl)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {!editingItem && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Initial Opening Qty</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={itemFormData.initialQuantity}
                      onChange={(e) => setItemFormData({ ...itemFormData, initialQuantity: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold"
                    />
                  </div>
                )}

                <div className={editingItem ? 'col-span-1' : ''}>
                  <label className="block font-bold text-slate-700 mb-1">Min Threshold Alert</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={itemFormData.minimumStockLevel}
                    onChange={(e) => setItemFormData({ ...itemFormData, minimumStockLevel: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cost per Unit (₹)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={itemFormData.costPerUnit}
                    onChange={(e) => setItemFormData({ ...itemFormData, costPerUnit: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
