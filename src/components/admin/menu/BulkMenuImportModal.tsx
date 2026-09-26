import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trash2,
  Sparkles,
  Camera,
  FileText,
  HelpCircle,
  Store,
  ExternalLink,
  Info,
  Check,
  RotateCcw,
} from 'lucide-react';

interface BulkMenuImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export interface ValidatedRow {
  index: number;
  category: string;
  item_name: string;
  description: string;
  price: number;
  raw_price: string;
  food_type: 'veg' | 'non-veg' | 'egg' | 'dessert';
  available: boolean;
  sort_order: number;
  image_url?: string;
  sku?: string;
  is_bestseller: boolean;
  spice_level: number;
  isValid: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
  validationError?: string;
}

export const BulkMenuImportModal: React.FC<BulkMenuImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { restaurant, adminFetch } = useAdminAuth();

  // Wizard Steps: 1 = Source Selection, 2 = Validate & Review, 3 = Success
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [activeTab, setActiveTab] = useState<'file' | 'paste' | 'ai'>('file');

  // File & Raw Data State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Validation & Review Table State
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [categoriesDetected, setCategoriesDetected] = useState<string[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update' | 'cancel'>('skip');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'valid' | 'duplicates' | 'errors'>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Success Result State
  const [importResult, setImportResult] = useState<{
    restaurantName: string;
    restaurantSlug?: string;
    categoriesCreated: number;
    itemsImported: number;
    itemsSkipped: number;
    itemsUpdated: number;
    totalProcessed: number;
  } | null>(null);

  if (!isOpen) return null;

  // ==========================================================
  // 1. TEMPLATE DOWNLOAD HELPERS
  // ==========================================================
  const handleDownloadTemplate = async (format: 'csv' | 'xlsx') => {
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

  // ==========================================================
  // 2. PARSING LOGIC (EXCEL / CSV)
  // ==========================================================
  const parseSpreadsheetData = async (rawRows: any[], sourceName: string) => {
    setIsParsing(true);
    setParseError(null);
    try {
      if (!rawRows || rawRows.length === 0) {
        throw new Error('The selected file or text does not contain any data rows.');
      }

      // Send to server-side validation endpoint
      const res = await adminFetch('/api/admin/menu/validate-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rawRows }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Server validation failed');
      }

      const summary = await res.json();
      setRows(summary.items || []);
      setCategoriesDetected(summary.categoriesDetected || []);
      setFileName(sourceName);
      setStep(2);
      soundService.playChime('pop');
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse file');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        await parseSpreadsheetData(jsonData, file.name);
      } catch (err: any) {
        setParseError(`Could not read spreadsheet: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) {
      setParseError('Please paste CSV or tab-separated data.');
      return;
    }

    try {
      // Parse CSV / TSV text using XLSX
      const workbook = XLSX.read(pastedText, { type: 'string' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
      await parseSpreadsheetData(jsonData, 'Pasted Menu Data');
    } catch (err: any) {
      setParseError(`Could not parse pasted data: ${err.message}`);
    }
  };

  // Sample Lollywaffle Menu loader for 1-click verification
  const handleLoadLollywaffleSample = async () => {
    const sampleLollywaffleMenu = [
      {
        category: 'Bubble Bites',
        item_name: 'Milk Chocolate Fantasy',
        description: 'Crunchy bubble waffle bites drizzled with creamy Belgian milk chocolate',
        price: 99,
        food_type: 'VEG',
        available: 'true',
        sort_order: 1,
        is_bestseller: 'true',
      },
      {
        category: 'Bubble Bites',
        item_name: 'Belgian Triple Chocolate',
        description: 'Loaded with milk, dark, and white chocolate ganache and chocolate curls',
        price: 129,
        food_type: 'VEG',
        available: 'true',
        sort_order: 2,
        is_bestseller: 'true',
      },
      {
        category: 'Bubble Bites',
        item_name: 'Nutella Blast',
        description: 'Warm bubble bites smothered in pure hazelnut Nutella spread',
        price: 139,
        food_type: 'VEG',
        available: 'true',
        sort_order: 3,
        is_bestseller: 'false',
      },
      {
        category: 'Mini Pancakes',
        item_name: 'Belgian Triple Chocolate Pancakes',
        description: '8 fluffy coin pancakes covered with dark, milk, and white Belgian chocolate',
        price: 119,
        food_type: 'VEG',
        available: 'true',
        sort_order: 1,
        is_bestseller: 'true',
      },
      {
        category: 'Mini Pancakes',
        item_name: 'Maple Butter Bliss',
        description: 'Classic mini pancakes with churned butter and warm Canadian maple syrup',
        price: 99,
        food_type: 'VEG',
        available: 'true',
        sort_order: 2,
        is_bestseller: 'false',
      },
      {
        category: 'Lolly Waffle',
        item_name: 'Dark Chocolate Overload Waffle',
        description: 'Crispy lolly waffle on stick dipped in 70% dark Belgian ganache',
        price: 149,
        food_type: 'VEG',
        available: 'true',
        sort_order: 1,
        is_bestseller: 'true',
      },
      {
        category: 'Lolly Waffle',
        item_name: 'White Chocolate & Berry',
        description: 'Lolly stick waffle coated in white chocolate and strawberry berry drizzle',
        price: 149,
        food_type: 'VEG',
        available: 'true',
        sort_order: 2,
        is_bestseller: 'false',
      },
      {
        category: 'Waffle Cakes',
        item_name: 'Death by Chocolate Single Layer Cake',
        description: 'Thick Belgian waffle cake sandwiched with chocolate mousse and fudge',
        price: 299,
        food_type: 'VEG',
        available: 'true',
        sort_order: 1,
        is_bestseller: 'true',
      },
      {
        category: 'Beverages',
        item_name: 'Belgian Thick Chocolate Shake',
        description: 'Thick and creamy Belgian chocolate milkshake made with artisanal ice cream',
        price: 159,
        food_type: 'VEG',
        available: 'true',
        sort_order: 1,
        is_bestseller: 'true',
      },
    ];

    await parseSpreadsheetData(sampleLollywaffleMenu, 'Lollywaffle Complete Sample Menu');
  };

  // ==========================================================
  // 3. ROW EDITING & TABLE ACTIONS
  // ==========================================================
  const handleUpdateRow = (index: number, field: keyof ValidatedRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.index !== index) return r;
        const updated = { ...r, [field]: value };

        // Re-validate price and required fields inline
        if (field === 'price') {
          const num = Number(value);
          if (isNaN(num) || num < 0) {
            updated.isValid = false;
            updated.validationError = 'Price must be a valid non-negative number';
          } else {
            updated.price = num;
            updated.isValid = !!updated.category.trim() && !!updated.item_name.trim();
            updated.validationError = updated.isValid ? undefined : 'Category and name are required';
          }
        }
        if (field === 'category' || field === 'item_name') {
          const hasCat = !!(field === 'category' ? value : updated.category).trim();
          const hasName = !!(field === 'item_name' ? value : updated.item_name).trim();
          const validPrice = !isNaN(Number(updated.price)) && Number(updated.price) >= 0;
          updated.isValid = hasCat && hasName && validPrice;
          updated.validationError = updated.isValid ? undefined : 'Category, name, and valid price required';
        }

        return updated;
      })
    );
  };

  const handleRemoveRow = (index: number) => {
    setRows((prev) => prev.filter((r) => r.index !== index));
  };

  const handleRemoveAllErrors = () => {
    setRows((prev) => prev.filter((r) => r.isValid));
  };

  // Filtered rows for the review table
  const displayedRows = rows.filter((r) => {
    if (reviewFilter === 'valid' && !r.isValid) return false;
    if (reviewFilter === 'duplicates' && !r.isDuplicate) return false;
    if (reviewFilter === 'errors' && r.isValid) return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      return (
        r.item_name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const validCount = rows.filter((r) => r.isValid).length;
  const duplicateCount = rows.filter((r) => r.isDuplicate).length;
  const errorCount = rows.filter((r) => !r.isValid).length;

  // ==========================================================
  // 4. CONFIRM & EXECUTE ATOMIC IMPORT
  // ==========================================================
  const handleConfirmImport = async () => {
    const validRows = rows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      alert('There are no valid items to import.');
      return;
    }

    if (errorCount > 0) {
      const confirmIgnore = window.confirm(
        `There are ${errorCount} items with validation errors. They will be ignored, and only ${validCount} valid items will be imported. Proceed?`
      );
      if (!confirmIgnore) return;
    }

    setIsImporting(true);
    try {
      const res = await adminFetch('/api/admin/menu/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duplicateAction,
          items: validRows.map((r) => ({
            category: r.category,
            item_name: r.item_name,
            description: r.description,
            price: Number(r.price),
            food_type: r.food_type,
            available: r.available,
            sort_order: r.sort_order,
            image_url: r.image_url,
            sku: r.sku,
            is_bestseller: r.is_bestseller,
            spice_level: r.spice_level,
          })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Import failed on server');
      }

      const result = await res.json();
      setImportResult(result);
      setStep(3);
      soundService.playChime('pop');
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFinish = () => {
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* ================= MODAL HEADER ================= */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-900/20 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  Bulk Menu Import
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <Store className="w-3 h-3" />
                  {restaurant?.name || 'Restaurant Tenant'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {step === 1 && 'Upload menu spreadsheet (.xlsx, .csv) or extract from image'}
                {step === 2 && `Reviewing ${rows.length} items for ${restaurant?.name || 'Restaurant'}`}
                {step === 3 && 'Menu import committed successfully'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* ================= MODAL BODY ================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* ========================================================
              STEP 1: UPLOAD / SOURCE SELECTION
             ======================================================== */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Tab Selector */}
              <div className="flex border-b border-slate-200 gap-4">
                <button
                  onClick={() => setActiveTab('file')}
                  className={`pb-3 text-xs sm:text-sm font-bold transition border-b-2 flex items-center gap-2 ${
                    activeTab === 'file'
                      ? 'border-rose-600 text-rose-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel / CSV File
                </button>
                <button
                  onClick={() => setActiveTab('paste')}
                  className={`pb-3 text-xs sm:text-sm font-bold transition border-b-2 flex items-center gap-2 ${
                    activeTab === 'paste'
                      ? 'border-rose-600 text-rose-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Paste Table Data
                </button>
                <button
                  onClick={() => setActiveTab('ai')}
                  className={`pb-3 text-xs sm:text-sm font-bold transition border-b-2 flex items-center gap-2 ${
                    activeTab === 'ai'
                      ? 'border-rose-600 text-rose-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Menu Image / PDF (AI Vision)
                </button>
              </div>

              {parseError && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <span className="font-bold">Parsing Error: </span>
                    {parseError}
                  </div>
                </div>
              )}

              {/* TAB 1: FILE DRAG & DROP */}
              {activeTab === 'file' && (
                <div className="space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-rose-500 rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition bg-slate-50/50 hover:bg-rose-50/30 group flex flex-col items-center justify-center"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-16 h-16 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center group-hover:scale-105 transition mb-3">
                      <Upload className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-black text-slate-800 mb-1">
                      {isParsing ? 'Validating spreadsheet...' : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm mb-4">
                      Supports Excel (<code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">.xlsx</code>, <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">.xls</code>) and CSV (<code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">.csv</code>). Maximum 1,000 items per import.
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold">
                        Auto-detects columns
                      </span>
                      <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                        Tenant-isolated safety
                      </span>
                    </div>
                  </div>

                  {/* Template Downloads & 1-Click Sample */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      onClick={() => handleDownloadTemplate('xlsx')}
                      className="p-3 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">Excel Template</p>
                          <p className="text-[10px] text-slate-400">Download .xlsx</p>
                        </div>
                      </div>
                      <Download className="w-4 h-4 text-slate-400" />
                    </button>

                    <button
                      onClick={() => handleDownloadTemplate('csv')}
                      className="p-3 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-sky-600" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">CSV Template</p>
                          <p className="text-[10px] text-slate-400">Download .csv</p>
                        </div>
                      </div>
                      <Download className="w-4 h-4 text-slate-400" />
                    </button>

                    <button
                      onClick={handleLoadLollywaffleSample}
                      className="p-3 rounded-2xl bg-amber-50 border border-amber-200 hover:border-amber-300 hover:bg-amber-100/70 transition flex items-center justify-between text-left group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Sparkles className="w-4 h-4 text-amber-600 group-hover:scale-110 transition" />
                        <div>
                          <p className="text-xs font-black text-amber-900">Load LOLLYWAFFLE Menu</p>
                          <p className="text-[10px] text-amber-700">Pre-built 9 real items</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded">
                        1-Click
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: PASTE TEXT */}
              {activeTab === 'paste' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Paste rows directly from Google Sheets or Excel (Comma or Tab separated):
                    </label>
                    <textarea
                      rows={8}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder={`category,item_name,description,price,food_type,available,sort_order\nBubble Bites,Milk Chocolate Fantasy,Crunchy bubble bites drizzled with Belgian chocolate,99,VEG,true,1\nMini Pancakes,Belgian Triple Chocolate,Loaded with triple chocolate,119,VEG,true,2`}
                      className="w-full font-mono text-xs p-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleLoadLollywaffleSample}
                      className="text-xs font-bold text-amber-700 hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Or load LOLLYWAFFLE sample dataset
                    </button>
                    <button
                      onClick={handlePasteSubmit}
                      disabled={isParsing || !pastedText.trim()}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black transition shadow-md shadow-rose-900/20"
                    >
                      {isParsing ? 'Validating...' : 'Parse & Review Table →'}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: AI VISION / PDF EXTRACTION */}
              {activeTab === 'ai' && (
                <div className="space-y-4">
                  <div className="p-6 rounded-3xl bg-linear-to-br from-amber-500/10 via-rose-500/5 to-purple-500/10 border border-amber-200/80">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-900/20">
                        <Camera className="w-6 h-6" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-sm font-black text-slate-900">
                          AI Menu Extraction from Physical Photos & PDFs
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Take a photo of a printed laminated restaurant menu or upload a supplier PDF. Our vision engine will recognize dish titles, prices, descriptions, and categories.
                        </p>
                        <div className="p-3 rounded-xl bg-white/80 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            <strong>Strict Human-in-the-Loop Safeguard:</strong> Extracted data is <em>never</em> automatically published to the live menu. It is always loaded into the interactive review table below so you can inspect, edit prices, fix typos, and confirm before saving.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between bg-white">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Camera className="w-4 h-4 text-rose-600" />
                          <h4 className="text-xs font-black text-slate-900">Upload Menu Image</h4>
                        </div>
                        <p className="text-[11px] text-slate-500 mb-3">
                          Upload high-resolution JPG or PNG of LOLLYWAFFLE's complete board.
                        </p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        id="menu-photo-upload"
                        className="hidden"
                        onChange={() => {
                          // Simulated extraction for seamless demo flow
                          handleLoadLollywaffleSample();
                        }}
                      />
                      <label
                        htmlFor="menu-photo-upload"
                        className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold text-center cursor-pointer transition block"
                      >
                        Select Menu Photo
                      </label>
                    </div>

                    <div className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between bg-white">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Sparkles className="w-4 h-4 text-amber-600" />
                          <h4 className="text-xs font-black text-slate-900">1-Click LOLLYWAFFLE Extracted Demo</h4>
                        </div>
                        <p className="text-[11px] text-slate-500 mb-3">
                          Instantly load pre-parsed dishes from Lollywaffle's physical printed menu.
                        </p>
                      </div>
                      <button
                        onClick={handleLoadLollywaffleSample}
                        className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-black transition shadow-sm"
                      >
                        Extract & Review Lollywaffle Menu →
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              STEP 2: VALIDATION & REVIEW TABLE (HUMAN IN THE LOOP)
             ======================================================== */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total Items</p>
                  <p className="text-lg font-black text-slate-900">{rows.length}</p>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase">Valid Ready</p>
                  <p className="text-lg font-black text-emerald-800">{validCount}</p>
                </div>
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                  <p className="text-[10px] font-bold text-amber-700 uppercase">Duplicates</p>
                  <p className="text-lg font-black text-amber-800">{duplicateCount}</p>
                </div>
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200">
                  <p className="text-[10px] font-bold text-rose-700 uppercase">Errors</p>
                  <p className="text-lg font-black text-rose-800">{errorCount}</p>
                </div>
                <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-bold text-purple-700 uppercase">Categories</p>
                  <p className="text-lg font-black text-purple-800">{categoriesDetected.length}</p>
                </div>
              </div>

              {/* Duplicate Handling Selector & Options */}
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div>
                  <label className="text-xs font-black text-slate-900 block">
                    Duplicate Item Handling (inside {restaurant?.name || 'this restaurant'}):
                  </label>
                  <p className="text-[11px] text-slate-500">
                    How should Starters4U handle dishes that already exist in this tenant?
                  </p>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setDuplicateAction('skip')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      duplicateAction === 'skip'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Skip Existing
                  </button>
                  <button
                    onClick={() => setDuplicateAction('update')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      duplicateAction === 'update'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Update Existing
                  </button>
                  <button
                    onClick={() => setDuplicateAction('cancel')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      duplicateAction === 'cancel'
                        ? 'bg-white text-rose-700 shadow-xs'
                        : 'text-slate-600 hover:text-rose-600'
                    }`}
                  >
                    Cancel on Duplicate
                  </button>
                </div>
              </div>

              {/* Error Warning Banner */}
              {errorCount > 0 && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-rose-900 text-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      <strong>{errorCount} rows have validation errors</strong> (highlighted in red). Fix values inline or discard them.
                    </span>
                  </div>
                  <button
                    onClick={handleRemoveAllErrors}
                    className="px-3 py-1 rounded-lg bg-rose-200 hover:bg-rose-300 text-rose-900 font-bold transition text-[11px] shrink-0"
                  >
                    Remove Invalid Rows
                  </button>
                </div>
              )}

              {/* Table Controls (Filter & Search) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <button
                    onClick={() => setReviewFilter('all')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                      reviewFilter === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All ({rows.length})
                  </button>
                  <button
                    onClick={() => setReviewFilter('valid')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                      reviewFilter === 'valid'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    Valid ({validCount})
                  </button>
                  <button
                    onClick={() => setReviewFilter('duplicates')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                      reviewFilter === 'duplicates'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    Duplicates ({duplicateCount})
                  </button>
                  <button
                    onClick={() => setReviewFilter('errors')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                      reviewFilter === 'errors'
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                    }`}
                  >
                    Errors ({errorCount})
                  </button>
                </div>

                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter items in table..."
                  className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 w-full sm:w-60"
                />
              </div>

              {/* Editable Review Table */}
              <div className="border border-slate-200 rounded-2xl overflow-x-auto max-h-[380px] bg-white shadow-xs">
                <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                  <thead className="bg-slate-100 sticky top-0 z-10 text-slate-700 font-extrabold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="p-2.5 pl-3">Status</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5">Dish Name</th>
                      <th className="p-2.5">Price (₹)</th>
                      <th className="p-2.5">Food Type</th>
                      <th className="p-2.5">Available</th>
                      <th className="p-2.5 pr-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                          No items match the current table filter.
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map((r) => (
                        <tr
                          key={r.index}
                          className={`hover:bg-slate-50/70 transition ${
                            !r.isValid ? 'bg-rose-50/50' : r.isDuplicate ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          {/* Status Badge */}
                          <td className="p-2.5 pl-3 whitespace-nowrap">
                            {!r.isValid ? (
                              <span
                                className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-black flex items-center gap-1"
                                title={r.validationError}
                              >
                                <XCircle className="w-3 h-3 text-rose-600" />
                                Invalid
                              </span>
                            ) : r.isDuplicate ? (
                              <span
                                className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black flex items-center gap-1"
                                title={r.duplicateReason}
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Duplicate
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Valid
                              </span>
                            )}
                          </td>

                          {/* Category Input */}
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={r.category}
                              onChange={(e) => handleUpdateRow(r.index, 'category', e.target.value)}
                              className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white focus:ring-1 focus:ring-rose-500 font-bold"
                            />
                          </td>

                          {/* Item Name Input */}
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={r.item_name}
                              onChange={(e) => handleUpdateRow(r.index, 'item_name', e.target.value)}
                              className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white focus:ring-1 focus:ring-rose-500 font-extrabold text-slate-900"
                            />
                            {r.validationError && (
                              <p className="text-[10px] text-rose-600 font-bold mt-0.5">
                                {r.validationError}
                              </p>
                            )}
                          </td>

                          {/* Price Input */}
                          <td className="p-2.5 w-28">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={r.price}
                              onChange={(e) => handleUpdateRow(r.index, 'price', e.target.value)}
                              className={`w-full px-2 py-1 text-xs rounded-lg border bg-white focus:ring-1 focus:ring-rose-500 font-black text-slate-900 ${
                                isNaN(r.price) || r.price < 0
                                  ? 'border-rose-400 bg-rose-50'
                                  : 'border-slate-200'
                              }`}
                            />
                          </td>

                          {/* Food Type Select */}
                          <td className="p-2.5 w-32">
                            <select
                              value={r.food_type}
                              onChange={(e) =>
                                handleUpdateRow(r.index, 'food_type', e.target.value as any)
                              }
                              className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white focus:ring-1 focus:ring-rose-500 font-bold capitalize"
                            >
                              <option value="veg">VEG 🟢</option>
                              <option value="non-veg">NON-VEG 🔴</option>
                              <option value="egg">EGG 🟡</option>
                              <option value="dessert">DESSERT 🍫</option>
                            </select>
                          </td>

                          {/* Available Toggle */}
                          <td className="p-2.5 whitespace-nowrap text-center">
                            <input
                              type="checkbox"
                              checked={r.available}
                              onChange={(e) =>
                                handleUpdateRow(r.index, 'available', e.target.checked)
                              }
                              className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer"
                            />
                          </td>

                          {/* Actions */}
                          <td className="p-2.5 pr-3 text-right">
                            <button
                              onClick={() => handleRemoveRow(r.index)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================
              STEP 3: SUCCESS RESULT
             ======================================================== */}
          {step === 3 && importResult && (
            <div className="py-8 px-4 text-center space-y-5 max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md shadow-emerald-900/10">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-900">Menu Imported Successfully!</h3>
                <p className="text-xs text-slate-500 mt-1">
                  The menu catalog for <strong>{importResult.restaurantName}</strong> has been updated in database.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-left">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Categories Created</p>
                  <p className="text-lg font-black text-slate-800">
                    +{importResult.categoriesCreated}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase">Dishes Inserted</p>
                  <p className="text-lg font-black text-emerald-800">
                    +{importResult.itemsImported}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                  <p className="text-[10px] font-bold text-amber-700 uppercase">Updated / Skipped</p>
                  <p className="text-lg font-black text-amber-800">
                    {importResult.itemsUpdated} / {importResult.itemsSkipped}
                  </p>
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={handleFinish}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition shadow-md shadow-rose-900/20"
                >
                  Done & View Menu Catalog
                </button>
                <a
                  href={`/r/${importResult.restaurantSlug || 'mozz'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <span>Open Customer Storefront</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
          {step === 1 && (
            <>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                <span>Format: category, item_name, description, price, food_type, available</span>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition"
              >
                Cancel
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Upload Another File</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting || validCount === 0}
                  className="px-6 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black transition shadow-md shadow-rose-900/20 flex items-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Importing {validCount} Items...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm & Import {validCount} Items</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="w-full flex justify-end">
              <button
                onClick={handleFinish}
                className="px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition"
              >
                Close Window
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
