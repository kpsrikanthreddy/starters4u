import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
import { BulkMenuImportModal } from '../menu/BulkMenuImportModal';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  RotateCcw,
  Sparkles,
  Utensils,
  Image as ImageIcon,
  Tag,
  DollarSign,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Upload,
  ChevronDown,
  Camera,
  CheckSquare,
  Square,
  FolderInput,
  Loader2,
} from 'lucide-react';

export const MenuSection: React.FC = () => {
  const { user, restaurant, adminFetch } = useAdminAuth();
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'pocket_pizza_veg',
    price: '',
    description: '',
    image: '',
    isVegetarian: true,
    spiceLevel: 'mild',
    inStock: true,
    isPocketPizza: false,
    priceR: '149',
    priceC: '179',
    priceS: '199',
  });

  // Bulk Menu Import & Multi-Select State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
  const importDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkCategoryDialogOpen, setIsBulkCategoryDialogOpen] = useState(false);
  const [targetBulkCategory, setTargetBulkCategory] = useState('');
  const [isExecutingBulk, setIsExecutingBulk] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (importDropdownRef.current && !importDropdownRef.current.contains(e.target as Node)) {
        setIsImportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownloadTemplateDirect = async (format: 'csv' | 'xlsx') => {
    setIsImportDropdownOpen(false);
    try {
      const res = await adminFetch(`/api/admin/menu/template?format=${format}`);
      if (!res.ok) throw new Error('Failed to download template');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `starters4u_menu_template.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Could not download template: ${err.message}`);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleBulkAction = async (
    action: 'mark_available' | 'mark_out_of_stock' | 'change_category' | 'delete',
    targetCat?: string
  ) => {
    if (selectedIds.size === 0) return;

    if (action === 'delete') {
      const confirmed = window.confirm(
        `Are you sure you want to permanently delete ${selectedIds.size} selected dishes? This action cannot be undone.`
      );
      if (!confirmed) return;
    }

    setIsExecutingBulk(true);
    try {
      const res = await adminFetch('/api/admin/menu/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          itemIds: Array.from(selectedIds),
          targetCategory: targetCat || targetBulkCategory,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Bulk action failed');
      }

      soundService.playChime('pop');
      setSelectedIds(new Set());
      setIsBulkCategoryDialogOpen(false);
      await fetchMenu();
    } catch (err: any) {
      alert(`Failed to execute bulk action: ${err.message}`);
    } finally {
      setIsExecutingBulk(false);
    }
  };

  const fetchMenu = async () => {
    try {
      const res = await adminFetch('/api/admin/menu');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setItems(data);
          const cats = Array.from(new Set(data.map((i: any) => i.category || 'General')));
          setCategories(cats);
        }
      }
    } catch (err) {
      console.error('[MenuSection] Error loading menu:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  const handleToggleStock = async (item: any) => {
    const nextStock = !item.inStock;
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, inStock: nextStock } : i))
    );

    try {
      const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(item.id)}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ inStock: nextStock }),
      });
      if (!res.ok) {
        // Rollback
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, inStock: !nextStock } : i))
        );
      } else {
        soundService.playChime('pop');
      }
    } catch (err) {
      // Rollback
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, inStock: !nextStock } : i))
      );
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm('Are you sure you want to delete this menu item?')) return;
    try {
      const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        soundService.playChime('pop');
      }
    } catch (err: any) {
      alert(`Error deleting item: ${err.message}`);
    }
  };

  const handleResetMenu = async () => {
    if (
      !window.confirm(
        'Reset menu to standard recipes? Any custom dishes created will be replaced with defaults.'
      )
    )
      return;
    try {
      const res = await adminFetch('/api/admin/menu/reset', { method: 'POST' });
      if (res.ok) {
        await fetchMenu();
        alert('Menu reset to defaults.');
      }
    } catch (err: any) {
      alert(`Error resetting menu: ${err.message}`);
    }
  };

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setModalError(null);
    setFormData({
      name: '',
      category: categories[0] || 'pocket_pizza_veg',
      price: '149',
      description: '',
      image: '',
      isVegetarian: true,
      spiceLevel: 'mild',
      inStock: true,
      isPocketPizza: false,
      priceR: '149',
      priceC: '179',
      priceS: '199',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: any) => {
    setEditingItem(item);
    setModalError(null);
    const isVeg = item.dietary ? item.dietary === 'veg' : (item.isVegetarian !== undefined ? !!item.isVegetarian : true);
    const isPocket = Boolean(item.isPocketPizza || item.prices?.R);
    setFormData({
      name: item.name || '',
      category: item.category || categories[0] || 'pocket_pizza_veg',
      price: item.price !== undefined && item.price !== null ? String(item.price) : '',
      description: item.description || '',
      image: item.image || '',
      isVegetarian: isVeg,
      spiceLevel: item.spiceLevel || 'mild',
      inStock: item.inStock !== false,
      isPocketPizza: isPocket,
      priceR: item.prices?.R ? String(item.prices.R) : '149',
      priceC: item.prices?.C ? String(item.prices.C) : '179',
      priceS: item.prices?.S ? String(item.prices.S) : '199',
    });
    setIsModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const name = formData.name.trim();
    const category = formData.category.trim();
    const isPocket = Boolean(formData.isPocketPizza);

    if (!name) {
      setModalError('Please enter a dish name.');
      return;
    }
    if (!category) {
      setModalError('Please enter or select a category.');
      return;
    }

    let payloadPrice: number | null = null;
    let payloadPrices: { R: number; C: number; S: number } | null = null;

    if (isPocket) {
      const pR = Number(formData.priceR);
      const pC = Number(formData.priceC);
      const pS = Number(formData.priceS);
      if (isNaN(pR) || pR < 0 || isNaN(pC) || pC < 0 || isNaN(pS) || pS < 0) {
        setModalError('Please provide valid non-negative prices for all 3 shape variants (Rectangular, Circular, Square).');
        return;
      }
      payloadPrices = { R: pR, C: pC, S: pS };
    } else {
      const priceNum = Number(formData.price);
      if (formData.price === '' || isNaN(priceNum) || priceNum < 0) {
        setModalError('Please provide a valid non-negative price.');
        return;
      }
      payloadPrice = priceNum;
    }

    setIsSaving(true);

    try {
      const dietary = formData.isVegetarian ? 'veg' : 'non-veg';
      const payload: any = {
        name,
        category,
        price: payloadPrice,
        prices: payloadPrices,
        isPocketPizza: isPocket,
        description: formData.description.trim(),
        image: formData.image.trim(),
        isVegetarian: formData.isVegetarian,
        dietary,
        spiceLevel: formData.spiceLevel,
        inStock: formData.inStock,
      };

      if (editingItem) {
        const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(editingItem.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || data.details || 'Failed to update menu item');
        }
        setItems((prev) => prev.map((i) => (i.id === editingItem.id ? data : i)));
        setIsModalOpen(false);
      } else {
        const res = await adminFetch('/api/admin/menu', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || data.details || 'Failed to create menu item');
        }
        setItems((prev) => [data, ...prev]);
        if (!categories.includes(data.category)) {
          setCategories((prev) => [...prev, data.category]);
        }
        setIsModalOpen(false);
      }
    } catch (err: any) {
      console.error('[MenuSection] Save item failed:', err);
      setModalError(err.message || 'Failed to save menu item. Please check the details and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [items, selectedCategory, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Top Header & Actions */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu recipes, categories..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetMenu}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
            title="Reset to default recipes"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Defaults</span>
          </button>

          {/* Import Menu Dropdown */}
          <div className="relative" ref={importDropdownRef}>
            <button
              onClick={() => setIsImportDropdownOpen((prev) => !prev)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4 text-rose-400" />
              <span>Import Menu</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isImportDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isImportDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 animate-in fade-in slide-in-from-top-1 duration-100">
                <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Bulk Catalog Onboarding
                </div>

                <button
                  onClick={() => {
                    setIsImportDropdownOpen(false);
                    setIsImportModalOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-bold text-slate-800 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2 transition"
                >
                  <Upload className="w-4 h-4 text-rose-600" />
                  <div>
                    <p>Upload Excel / CSV</p>
                    <p className="text-[10px] font-normal text-slate-400">Import .xlsx, .xls, .csv with preview</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsImportDropdownOpen(false);
                    setIsImportModalOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-bold text-slate-800 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2 transition"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <div>
                    <p>Menu Photo / PDF (AI Vision)</p>
                    <p className="text-[10px] font-normal text-slate-400">Extract dishes from physical menu</p>
                  </div>
                </button>

                <div className="my-1 border-t border-slate-100" />

                <div className="px-3 py-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Download Standard Templates
                </div>

                <button
                  onClick={() => handleDownloadTemplateDirect('xlsx')}
                  className="w-full px-3.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download Excel (.xlsx)</span>
                </button>

                <button
                  onClick={() => handleDownloadTemplateDirect('csv')}
                  className="w-full px-3.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition"
                >
                  <Download className="w-3.5 h-3.5 text-sky-600" />
                  <span>Download CSV (.csv)</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition shadow-md shadow-rose-900/20 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Menu Item</span>
          </button>
        </div>
      </div>

      {/* Bulk Selection Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-slate-900 text-white rounded-2xl p-3 px-4 shadow-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-150 sticky top-3 z-20">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-rose-600 text-white text-xs font-black flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span className="text-xs font-bold text-slate-200">
              {selectedIds.size} {selectedIds.size === 1 ? 'dish' : 'dishes'} selected
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => handleBulkAction('mark_available')}
              disabled={isExecutingBulk}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Mark In Stock</span>
            </button>

            <button
              onClick={() => handleBulkAction('mark_out_of_stock')}
              disabled={isExecutingBulk}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center gap-1"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Mark 86 Out</span>
            </button>

            <button
              onClick={() => {
                setTargetBulkCategory(categories[0] || 'Main Course');
                setIsBulkCategoryDialogOpen(true);
              }}
              disabled={isExecutingBulk}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1 border border-slate-700"
            >
              <FolderInput className="w-3.5 h-3.5 text-sky-400" />
              <span>Change Category</span>
            </button>

            <button
              onClick={() => handleBulkAction('delete')}
              disabled={isExecutingBulk}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-medium transition"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Category Filter Chips & Select All Control */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Items ({items.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredItems.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-100 shrink-0 whitespace-nowrap"
          >
            {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? (
              <>
                <CheckSquare className="w-3.5 h-3.5 text-rose-600" />
                <span>Deselect All</span>
              </>
            ) : (
              <>
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span>Select All ({filteredItems.length})</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Menu Item Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Loading tenant menu items...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          <Utensils className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-xs font-bold">No menu items match your search</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const inStock = item.inStock !== false;
            const isSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border p-4 shadow-xs transition flex flex-col justify-between relative ${
                  isSelected
                    ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20'
                    : !inStock
                    ? 'border-slate-200 bg-slate-50/70'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      {/* Selection Checkbox */}
                      <button
                        type="button"
                        onClick={() => handleToggleSelect(item.id)}
                        className="mt-1 text-slate-400 hover:text-rose-600 transition shrink-0"
                        title={isSelected ? 'Deselect item' : 'Select item for bulk actions'}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-rose-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                        )}
                      </button>

                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 object-cover rounded-xl shrink-0 border border-slate-100"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              item.isVegetarian ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <h3 className="font-extrabold text-sm text-slate-900 truncate">
                            {item.name}
                          </h3>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {item.category}
                        </span>
                        {item.description && (
                          <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                            {item.description}
                          </p>
                        )}

                        {/* Variants Box */}
                        {(item.isPocketPizza || item.prices?.R) && (
                          <div className="mt-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
                              <span>Shape Variants</span>
                              <span className="text-rose-600 font-bold">3 Options</span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-slate-700">
                                <span className="flex items-center gap-1.5 font-medium">
                                  <span className="w-4 h-4 rounded bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">R</span>
                                  <span>Rectangular</span>
                                </span>
                                <span className="font-black text-slate-900">₹{item.prices?.R ?? 149}</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-700">
                                <span className="flex items-center gap-1.5 font-medium">
                                  <span className="w-4 h-4 rounded bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">C</span>
                                  <span>Circular</span>
                                </span>
                                <span className="font-black text-slate-900">₹{item.prices?.C ?? 179}</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-700">
                                <span className="flex items-center gap-1.5 font-medium">
                                  <span className="w-4 h-4 rounded bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">S</span>
                                  <span>Square</span>
                                </span>
                                <span className="font-black text-slate-900">₹{item.prices?.S ?? 199}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-2">
                  <div className="text-sm font-black text-slate-900">
                    {item.isPocketPizza || item.prices?.R
                      ? `From ₹${item.prices?.R || 149}`
                      : `₹${item.price !== undefined && item.price !== null ? item.price : 0}`}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Stock Switcher */}
                    <button
                      onClick={() => handleToggleStock(item)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                        inStock
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                          : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                      }`}
                      title={inStock ? 'Click to mark 86 / Out of Stock' : 'Click to mark In Stock'}
                    >
                      {inStock ? (
                        <>
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>In Stock</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>86 Out</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleOpenEditModal(item)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                      title="Edit Item"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                      title="Delete Item"
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

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-slate-900">
                {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isSaving ? 'bg-amber-100 text-amber-700 animate-pulse' : 'bg-slate-100 text-slate-500'
              }`}>
                {isSaving ? 'Saving...' : 'Ready'}
              </span>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{modalError}</div>
              </div>
            )}

            <form onSubmit={handleSaveItem} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Paneer Butter Masala"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500"
                  disabled={isSaving}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Category *
                  </label>
                  <input
                    type="text"
                    required
                    list="category-datalist"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g. momos"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500"
                    disabled={isSaving}
                  />
                  <datalist id="category-datalist">
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Base Price (₹) {!formData.isPocketPizza && '*'}
                  </label>
                  <input
                    type="number"
                    required={!formData.isPocketPizza}
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="250"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500 disabled:opacity-50 disabled:bg-slate-100"
                    disabled={isSaving || formData.isPocketPizza}
                  />
                </div>
              </div>

              {/* Multi-Shape Variants (Pocket Pizzas) */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPocketPizza}
                    onChange={(e) => setFormData({ ...formData, isPocketPizza: e.target.checked })}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 mt-0.5"
                    disabled={isSaving}
                  />
                  <div>
                    <span className="font-extrabold text-slate-900 text-xs block">
                      Dish has 3 Shape Variants (Pocket Pizza: [R], [C], [S])
                    </span>
                    <p className="text-[10px] text-slate-500 font-normal mt-0.5 leading-snug">
                      Enable this to configure Rectangular, Circular, and Square sizes with independent prices.
                    </p>
                  </div>
                </label>

                {formData.isPocketPizza && (
                  <div className="pt-2 border-t border-amber-200/80 grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] uppercase font-black text-slate-700 block mb-1">
                        [R] Rectangular ₹ *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={formData.priceR}
                        onChange={(e) => setFormData({ ...formData, priceR: e.target.value })}
                        placeholder="149"
                        className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 font-bold focus:ring-2 focus:ring-rose-500 text-xs"
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-black text-slate-700 block mb-1">
                        [C] Circular ₹ *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={formData.priceC}
                        onChange={(e) => setFormData({ ...formData, priceC: e.target.value })}
                        placeholder="179"
                        className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 font-bold focus:ring-2 focus:ring-rose-500 text-xs"
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-black text-slate-700 block mb-1">
                        [S] Square ₹ *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={formData.priceS}
                        onChange={(e) => setFormData({ ...formData, priceS: e.target.value })}
                        placeholder="199"
                        className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 font-bold focus:ring-2 focus:ring-rose-500 text-xs"
                        disabled={isSaving}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Tender paneer cubes simmered in creamy tomato gravy..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500"
                  disabled={isSaving}
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Image URL
                </label>
                <input
                  type="url"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500"
                  disabled={isSaving}
                />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isVegetarian}
                    onChange={(e) => setFormData({ ...formData, isVegetarian: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    disabled={isSaving}
                  />
                  <span className="font-bold text-slate-700">Vegetarian</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.inStock}
                    onChange={(e) => setFormData({ ...formData, inStock: e.target.checked })}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                    disabled={isSaving}
                  />
                  <span className="font-bold text-slate-700">Currently In Stock</span>
                </label>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSaving ? 'Saving...' : (editingItem ? 'Update Dish' : 'Save Dish')}</span>
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Category Change Dialog */}
      {isBulkCategoryDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-900">
              Change Category
            </h3>
            <p className="text-xs text-slate-500">
              Moving <strong>{selectedIds.size}</strong> selected {selectedIds.size === 1 ? 'dish' : 'dishes'} into a new category.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Choose Existing Category
                </label>
                <select
                  value={targetBulkCategory}
                  onChange={(e) => setTargetBulkCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500 capitalize"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Or Type New Category
                </label>
                <input
                  type="text"
                  placeholder="e.g. Belgian Waffles, Bubble Bites"
                  value={targetBulkCategory}
                  onChange={(e) => setTargetBulkCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-medium focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleBulkAction('change_category')}
                  disabled={!targetBulkCategory.trim() || isExecutingBulk}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-extrabold text-xs transition"
                >
                  {isExecutingBulk ? 'Updating...' : 'Move Dishes'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkCategoryDialogOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Menu Import Modal */}
      <BulkMenuImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={fetchMenu}
      />
    </div>
  );
};
