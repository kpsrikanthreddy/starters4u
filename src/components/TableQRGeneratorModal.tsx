import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Printer,
  ShieldCheck,
  QrCode,
  Check,
  Copy,
  Sparkles,
  ExternalLink,
  Layers,
  FileImage,
} from 'lucide-react';
import { generateSignedQRToken } from '../utils/qrSecurity';
import {
  generateQRDataURL,
  downloadQRImage,
  downloadTableStandImage,
  generateTableStandDataURL,
} from '../utils/qrDownloadHelper';
import { useRestaurant } from '../context/RestaurantContext';

interface TableQRGeneratorModalProps {
  tableCount: number;
  initialSelectedTable?: number | 'counter';
  restaurantName?: string;
  restaurantSlug?: string;
  restaurantTagline?: string;
  onClose: () => void;
  onTestScan?: (source: 'table_qr' | 'counter_qr', tableNumber?: string, token?: string) => void;
}

export const TableQRGeneratorModal: React.FC<TableQRGeneratorModalProps> = ({
  tableCount,
  initialSelectedTable = 1,
  restaurantName: propRestaurantName,
  restaurantSlug: propRestaurantSlug,
  restaurantTagline: propRestaurantTagline,
  onClose,
  onTestScan,
}) => {
  const restaurantCtx = useRestaurant();
  const activeRestaurantName = propRestaurantName || restaurantCtx?.restaurantName || 'Restaurant';
  const activeTagline = propRestaurantTagline || restaurantCtx?.tagline || 'Dine-In • Express Takeaway • Online Ordering';
  const activeSlug = (propRestaurantSlug || restaurantCtx?.restaurantSlug || activeRestaurantName).replace(/[^a-zA-Z0-9_-]/g, '_');

  const [selectedTarget, setSelectedTarget] = useState<number | 'counter'>(initialSelectedTable);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [standDataUrl, setStandDataUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [batchDownloading, setBatchDownloading] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'stand_preview' | 'printable_all'>('stand_preview');

  // Compute active target details
  const isCounter = selectedTarget === 'counter';
  const tableLabel = isCounter ? 'Counter Express' : `Table ${selectedTarget}`;
  const orderMode = isCounter ? 'takeaway' : 'dine_in';
  const entrySource = isCounter ? 'counter_qr' : 'table_qr';

  const { token, fullCanonicalUrl } = generateSignedQRToken({
    mode: orderMode,
    source: entrySource,
    tableNumber: isCounter ? undefined : `Table ${selectedTarget}`,
    restaurantSlug: propRestaurantSlug || restaurantCtx?.restaurantSlug || 'mozz',
    restaurantId: restaurantCtx?.restaurant?.id,
  });

  // Load preview data URLs
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const loadGraphics = async () => {
      try {
        const qrUrl = await generateQRDataURL(fullCanonicalUrl, 400);
        const standUrl = await generateTableStandDataURL({
          title: activeRestaurantName,
          subtitle: activeTagline,
          identifier: tableLabel,
          qrUrl: fullCanonicalUrl,
        });

        if (isMounted) {
          setQrDataUrl(qrUrl);
          setStandDataUrl(standUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error generating preview QR/Stand:', err);
        if (isMounted) setLoading(false);
      }
    };

    loadGraphics();

    return () => {
      isMounted = false;
    };
  }, [selectedTarget, fullCanonicalUrl, tableLabel, activeRestaurantName, activeTagline]);

  // Handle single QR PNG download
  const handleDownloadQROnly = async () => {
    const filename = isCounter ? `${activeSlug}_Counter_Takeaway_QR.png` : `${activeSlug}_Table_${selectedTarget}_QR.png`;
    await downloadQRImage(fullCanonicalUrl, filename, 1024);
  };

  // Handle single Table Stand Card download
  const handleDownloadStandCard = async () => {
    const filename = isCounter
      ? `${activeSlug}_Counter_Takeaway_Stand_Card.png`
      : `${activeSlug}_Table_${selectedTarget}_Stand_Card.png`;
    await downloadTableStandImage(
      {
        title: activeRestaurantName,
        subtitle: activeTagline,
        identifier: tableLabel,
        qrUrl: fullCanonicalUrl,
      },
      filename
    );
  };

  // Batch download all table stands
  const handleDownloadAllTableStands = async () => {
    setBatchDownloading(true);
    try {
      // 1. Download Counter
      setBatchProgress('Generating Counter Takeaway Stand...');
      const counterToken = generateSignedQRToken({
        mode: 'takeaway',
        source: 'counter_qr',
        restaurantSlug: propRestaurantSlug || restaurantCtx?.restaurantSlug || 'mozz',
        restaurantId: restaurantCtx?.restaurant?.id,
      });
      await downloadTableStandImage(
        {
          title: activeRestaurantName,
          subtitle: activeTagline,
          identifier: 'Counter Express',
          qrUrl: counterToken.fullCanonicalUrl,
        },
        `${activeSlug}_Stand_Counter_Express.png`
      );

      // Delay slightly between downloads so browser doesn't block multi-download
      await new Promise((r) => setTimeout(r, 600));

      // 2. Download each Table
      for (let i = 1; i <= tableCount; i++) {
        setBatchProgress(`Generating Table ${i} Stand (${i} of ${tableCount})...`);
        const tGen = generateSignedQRToken({
          mode: 'dine_in',
          source: 'table_qr',
          tableNumber: `Table ${i}`,
          restaurantSlug: propRestaurantSlug || restaurantCtx?.restaurantSlug || 'mozz',
          restaurantId: restaurantCtx?.restaurant?.id,
        });
        await downloadTableStandImage(
          {
            title: activeRestaurantName,
            subtitle: activeTagline,
            identifier: `Table ${i}`,
            qrUrl: tGen.fullCanonicalUrl,
          },
          `${activeSlug}_Stand_Table_${i}.png`
        );
        await new Promise((r) => setTimeout(r, 600));
      }

      setBatchProgress('All table stand cards downloaded successfully!');
      setTimeout(() => {
        setBatchDownloading(false);
        setBatchProgress('');
      }, 2500);
    } catch (err) {
      console.error('Batch download error:', err);
      alert('Batch download interrupted. Please try downloading individual cards or allow multiple downloads in browser settings.');
      setBatchDownloading(false);
      setBatchProgress('');
    }
  };

  // Trigger browser print for table stand
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 md:p-6 overflow-y-auto">
      {/* Print-Only Stylesheet embedded */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-qr-zone, #printable-qr-zone * {
            visibility: visible;
          }
          #printable-qr-zone {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            padding: 0;
            margin: 0;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>

      <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-800">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shadow-sm">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight">Table QR Code & Stand Generator</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  READY TO PRINT
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Download high-res QR codes and acrylic tent stand graphics for table placement
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Switcher / Tabs */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('stand_preview')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'stand_preview'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileImage className="w-3.5 h-3.5" />
              <span>Stand Card Preview</span>
            </button>
            <button
              onClick={() => setViewMode('printable_all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'printable_all'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Tables Print Sheet ({tableCount} Tables)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={batchDownloading}
              onClick={handleDownloadAllTableStands}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{batchDownloading ? 'Downloading...' : 'Download All Stands (Batch)'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>

        {/* Batch Status Notification */}
        {batchProgress && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs font-bold text-amber-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 animate-spin" />
              <span>{batchProgress}</span>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {viewMode === 'stand_preview' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Table Selector & Actions */}
              <div className="lg:col-span-5 space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    Select Target Table / Counter
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTarget('counter')}
                      className={`p-2.5 rounded-2xl border text-center transition flex flex-col items-center justify-center ${
                        selectedTarget === 'counter'
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md font-extrabold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-base">🛍️</span>
                      <span className="text-xs mt-1">Counter</span>
                    </button>

                    {Array.from({ length: tableCount }, (_, i) => i + 1).map((tNum) => (
                      <button
                        key={tNum}
                        type="button"
                        onClick={() => setSelectedTarget(tNum)}
                        className={`p-2.5 rounded-2xl border text-center transition flex flex-col items-center justify-center ${
                          selectedTarget === tNum
                            ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-md font-extrabold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-base">🍽️</span>
                        <span className="text-xs mt-1">Table {tNum}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Information Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900">{tableLabel}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        isCounter
                          ? 'bg-blue-100 text-blue-900 border border-blue-300'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}
                    >
                      {isCounter ? 'TAKEAWAY EXPRESS' : 'DINE-IN SERVICE'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 leading-relaxed">
                    {isCounter
                      ? 'Place this stand at the main cashier/pickup counter. Customers scanning will be directed to Takeaway ordering.'
                      : `Place this acrylic stand on ${tableLabel}. Customers scanning are cryptographically locked to ${tableLabel} Dine-In.`}
                  </div>

                  <div className="pt-2 border-t border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Signed Entry URL:</span>
                    <div className="font-mono text-[10px] text-slate-700 bg-white p-2 rounded-xl border border-slate-200 break-all select-all">
                      {fullCanonicalUrl}
                    </div>
                  </div>

                  {/* Copy Link & Test Simulator */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(fullCanonicalUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="py-2 px-2.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center gap-1.5 transition"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied URL</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copy URL</span>
                        </>
                      )}
                    </button>

                    {onTestScan && (
                      <button
                        type="button"
                        onClick={() => {
                          onTestScan(
                            isCounter ? 'counter_qr' : 'table_qr',
                            isCounter ? undefined : `Table ${selectedTarget}`,
                            token
                          );
                          onClose();
                        }}
                        className="py-2 px-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-1.5 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Test Scan View</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Direct Download Options */}
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase text-slate-500 block">
                    Download Graphic Files
                  </span>

                  <button
                    type="button"
                    onClick={handleDownloadStandCard}
                    className="w-full py-3 px-4 rounded-2xl text-xs font-extrabold bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white shadow-md flex items-center justify-between transition group"
                  >
                    <div className="flex items-center gap-2">
                      <FileImage className="w-4 h-4" />
                      <span>Download Full Acrylic Stand Card (PNG)</span>
                    </div>
                    <Download className="w-4 h-4 transition group-hover:translate-y-0.5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadQROnly}
                    className="w-full py-2.5 px-4 rounded-2xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 flex items-center justify-between transition"
                  >
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-slate-500" />
                      <span>Download High-Res QR Code Only (PNG)</span>
                    </div>
                    <Download className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Right Column: Live Table Stand Visual Preview */}
              <div className="lg:col-span-7 flex flex-col items-center">
                <div className="w-full max-w-sm bg-slate-900 text-white rounded-3xl p-5 shadow-2xl border-4 border-slate-800 relative overflow-hidden">
                  {loading ? (
                    <div className="aspect-[1/1.4] flex items-center justify-center text-slate-400 text-xs">
                      Generating High-Res Stand Card Preview...
                    </div>
                  ) : (
                    <div className="space-y-4 text-center">
                      {/* Top Badge */}
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-400 text-slate-950 shadow-sm mx-auto">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{isCounter ? '🛍️ EXPRESS TAKEAWAY' : '🍽️ DINE-IN SERVICE'}</span>
                      </div>

                      {/* Header */}
                      <div>
                        <h4 className="text-xl font-black tracking-tight text-white uppercase">{activeRestaurantName}</h4>
                        <p className="text-[11px] text-amber-300 font-medium">
                          {activeTagline}
                        </p>
                      </div>

                      {/* Big Table Badge */}
                      <div className="bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-amber-500/20 border border-amber-400/60 rounded-2xl py-2 px-4">
                        <div className="text-2xl font-black text-white tracking-wider">
                          {tableLabel.toUpperCase()}
                        </div>
                        <div className="text-[10px] text-slate-300">
                          {isCounter ? 'Packed for takeaway pickup' : 'Direct Kitchen KOT & Table Service'}
                        </div>
                      </div>

                      {/* QR Display Card */}
                      <div className="bg-white rounded-2xl p-4 shadow-lg mx-auto max-w-[240px]">
                        {qrDataUrl ? (
                          <img
                            src={qrDataUrl}
                            alt={`QR for ${tableLabel}`}
                            className="w-full aspect-square object-contain mx-auto"
                          />
                        ) : (
                          <div className="aspect-square bg-slate-100 rounded-xl flex items-center justify-center">
                            <QrCode className="w-12 h-12 text-slate-400" />
                          </div>
                        )}
                        <div className="text-[10px] font-black text-slate-900 mt-2 uppercase tracking-wide">
                          SCAN WITH CAMERA OR SCANNER
                        </div>
                      </div>

                      {/* Ordering Steps */}
                      <div className="bg-slate-800/80 rounded-xl p-2.5 text-left text-[11px] space-y-1 text-slate-200 border border-slate-700">
                        <div className="font-bold text-amber-400 text-[10px] uppercase">3 Easy Steps:</div>
                        <div>1. Scan with phone camera or UPI app</div>
                        <div>2. Customize Pocket Pizzas & Starters</div>
                        <div>3. Instant dispatch to Kitchen KOT</div>
                      </div>

                      <div className="text-[9px] text-slate-400 pt-1">
                        🔒 Verified QR Session • starters4u.in
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 text-[11px] text-slate-500 text-center">
                  💡 Tip: Print on standard 5"x7" or A6 acrylic stands for display on dining tables.
                </div>
              </div>
            </div>
          ) : (
            /* Printable All Sheet */
            <div id="printable-qr-zone" className="space-y-6">
              <div className="no-print bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Multi-Table Print Grid</h4>
                  <p className="text-xs text-slate-500">
                    Showing all {tableCount} tables + Counter Express. Ready for batch printing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Sheet Now</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {/* Counter Card */}
                {(() => {
                  const { fullCanonicalUrl: cUrl } = generateSignedQRToken({
                    mode: 'takeaway',
                    source: 'counter_qr',
                    restaurantSlug: propRestaurantSlug || restaurantCtx?.restaurantSlug || 'mozz',
                    restaurantId: restaurantCtx?.restaurant?.id,
                  });
                  return (
                    <PrintableMiniCard
                      key="counter"
                      identifier="Counter Express"
                      isCounter={true}
                      qrUrl={cUrl}
                      restaurantName={activeRestaurantName}
                      restaurantTagline={activeTagline}
                    />
                  );
                })()}

                {/* Table Cards */}
                {Array.from({ length: tableCount }, (_, idx) => idx + 1).map((tNum) => {
                  const { fullCanonicalUrl: tUrl } = generateSignedQRToken({
                    mode: 'dine_in',
                    source: 'table_qr',
                    tableNumber: `Table ${tNum}`,
                    restaurantSlug: propRestaurantSlug || restaurantCtx?.restaurantSlug || 'mozz',
                    restaurantId: restaurantCtx?.restaurant?.id,
                  });
                  return (
                    <PrintableMiniCard
                      key={tNum}
                      identifier={`Table ${tNum}`}
                      isCounter={false}
                      qrUrl={tUrl}
                      restaurantName={activeRestaurantName}
                      restaurantTagline={activeTagline}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 font-medium">
            {activeRestaurantName} Table QR Manager • Powered by Starters4U
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 transition"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};

// Mini Card Component for multi-table print grid
const PrintableMiniCard: React.FC<{
  identifier: string;
  isCounter: boolean;
  qrUrl: string;
  restaurantName?: string;
  restaurantTagline?: string;
}> = ({ identifier, isCounter, qrUrl, restaurantName = 'Restaurant', restaurantTagline = 'Dine-In • Express Takeaway' }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    generateQRDataURL(qrUrl, 260)
      .then((url) => setDataUrl(url))
      .catch((e) => console.error(e));
  }, [qrUrl]);

  return (
    <div className="bg-white border-2 border-slate-900 rounded-2xl p-4 text-center space-y-3 flex flex-col justify-between shadow-xs page-break">
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-rose-600 truncate">
          🍽️ {restaurantName.toUpperCase()} 🥢
        </div>
        <div className="text-xs font-black text-slate-900 mt-0.5 truncate">
          {restaurantTagline}
        </div>

        <div className="my-2 py-1.5 px-3 bg-slate-900 text-white rounded-xl font-black text-base tracking-wider">
          {identifier.toUpperCase()}
        </div>
      </div>

      <div className="w-36 h-36 mx-auto bg-white p-1 rounded-xl border border-slate-200 flex items-center justify-center">
        {dataUrl ? (
          <img src={dataUrl} alt={identifier} className="w-full h-full object-contain" />
        ) : (
          <QrCode className="w-16 h-16 text-slate-400" />
        )}
      </div>

      <div>
        <div className="text-[10px] font-black text-slate-900 uppercase">
          SCAN TO ORDER
        </div>
        <div className="text-[9px] text-slate-500 mt-0.5">
          {isCounter ? 'Orders packed for takeaway' : 'Direct Kitchen KOT & Table Delivery'}
        </div>
        <div className="text-[8px] text-slate-400 mt-1">
          starters4u.in
        </div>
      </div>
    </div>
  );
};
