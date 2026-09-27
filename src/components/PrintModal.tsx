import React, { useRef, useState, useEffect } from 'react';
import { Order } from '../types';
import { Printer, ChefHat, X } from 'lucide-react';

export interface RestaurantTenantInfo {
  name?: string;
  tagline?: string;
  phone?: string;
  address?: string;
  gstin?: string;
  fssaiLicense?: string;
}

interface PrintModalProps {
  order: Order | any;
  type: 'kot' | 'receipt' | 'bill';
  onClose: () => void;
  onPrinted?: () => void;
  restaurantInfo?: RestaurantTenantInfo;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  order,
  type,
  onClose,
  onPrinted,
  restaurantInfo,
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [internalProfile, setInternalProfile] = useState<RestaurantTenantInfo | null>(null);

  useEffect(() => {
    if (restaurantInfo) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('starters4u_admin_jwt_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch('/api/admin/settings', { headers })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setInternalProfile({
              name: data.name,
              tagline: data.tagline,
              phone: data.phone,
              address: data.address,
              gstin: data.gstin,
              fssaiLicense: data.fssaiLicense,
            });
          }
        })
        .catch(() => {});
    } catch {}
  }, [restaurantInfo]);

  const activeProfile = restaurantInfo || internalProfile;
  const restaurantName =
    activeProfile?.name ||
    order.restaurantName ||
    (order as any).restaurant_name ||
    'Starters4U Kitchen';
  const tagline = activeProfile?.tagline || '';
  const gstin = activeProfile?.gstin || '';
  const phone = activeProfile?.phone || '';
  const address = activeProfile?.address || '';

  const isKOT = type === 'kot';
  const isDineIn = order.orderType === 'dine_in';
  const isTakeaway = order.orderType === 'takeaway';
  const isCounter = order.orderType === 'counter';

  const orderNumber =
    order.orderNumber ||
    (order as any).order_number ||
    (order.id ? (order.id.startsWith('ORD-') || order.id.includes('-') ? order.id : `#${order.id.slice(0, 8)}`) : 'N/A');

  const kotNumber =
    order.kotNumber ||
    (order as any).kot_number ||
    `KOT-${orderNumber.replace(/[^0-9A-Za-z]/g, '').slice(-4) || '001'}`;

  const tableNumber =
    order.tableNumber ||
    order.customer?.tableNumber ||
    order.qrSession?.tableNumber ||
    (isDineIn ? 'Table 1' : '');

  const customerName =
    order.customer?.name ||
    (isDineIn ? 'Dine-In Guest' : isCounter ? 'Counter Customer' : 'Customer');

  const customerPhone = order.customer?.phone || '';
  const deliveryAddress =
    order.customer?.address
      ? `${order.customer.address}${order.customer?.landmark ? ` (Near ${order.customer.landmark})` : ''}`
      : '';

  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
  const orderTime = order.createdAt
    ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const formatOrderType = (typeStr?: string): string => {
    if (!typeStr) return 'DELIVERY';
    const t = typeStr.toLowerCase();
    if (t === 'dine_in') return 'DINE-IN';
    if (t === 'takeaway') return 'TAKEAWAY';
    if (t === 'counter') return 'COUNTER';
    if (t === 'delivery') return 'DELIVERY';
    return typeStr.toUpperCase().replace('_', '-');
  };

  const formatPaymentMethod = (method?: string): string => {
    if (!method) return 'N/A';
    const m = method.toLowerCase();
    if (m === 'cod') return 'COD';
    if (m === 'razorpay') return 'RAZORPAY';
    if (m === 'upi' || m === 'upi_qr') return 'UPI';
    if (m === 'gpay') return 'GPAY';
    if (m === 'phonepe') return 'PHONEPE';
    if (m === 'paytm') return 'PAYTM';
    if (m === 'card') return 'CARD';
    if (m === 'cash') return 'CASH';
    return method.toUpperCase();
  };

  const formatPaymentStatus = (status?: string): string => {
    if (!status) return 'PENDING';
    return status.toUpperCase().replace(/\s+/g, '_');
  };

  // Helper to safely get item name and prevent regression
  const getItemName = (it: any): string => {
    return it.menuItem?.name || it.name || it.itemName || 'Item';
  };

  // Helper to safely get snapshot unit price
  const getItemUnitPrice = (it: any): number => {
    const val = it.unitPrice ?? it.customerUnitPrice ?? it.price ?? it.menuItem?.price ?? 0;
    return Number(val) || 0;
  };

  const items = Array.isArray(order.items) ? order.items : [];

  // Calculate Subtotal and Item Totals
  const calculatedItemsTotal = items.reduce((acc, it) => {
    const unitPrice = getItemUnitPrice(it);
    const qty = Number(it.quantity) || 1;
    return acc + unitPrice * qty;
  }, 0);

  const subtotal = Number(order.itemTotal ?? order.subtotal ?? calculatedItemsTotal);
  const tax = Number(order.tax ?? 0);
  const cgst = Math.round((tax / 2) * 100) / 100;
  const sgst = Math.round((tax - cgst) * 100) / 100;
  const deliveryFee = Number(order.deliveryFee ?? 0);
  const discount = Number(order.discount ?? 0);
  const couponCode = order.couponCode || (order as any).coupon_code || '';
  const grandTotal = Number(order.grandTotal ?? order.total ?? subtotal + tax + deliveryFee - discount);

  // Check if platform markup or packing charges are explicitly added to grandTotal
  const rawSumWithoutExtra = subtotal + tax + deliveryFee - discount;
  const platformMarkupTotal = Number(order.platformMarkupTotal ?? 0);
  const explicitMarkup =
    platformMarkupTotal > 0 && Math.abs((rawSumWithoutExtra + platformMarkupTotal) - grandTotal) <= 0.05
      ? platformMarkupTotal
      : 0;
  const explicitPacking =
    Number((order as any).packingCharges || (order as any).packing_charges || 0);

  // Reconciliation check and developer warning (Prompt Section 14)
  const expectedTotal = subtotal + tax + deliveryFee + explicitMarkup + explicitPacking - discount;
  if (Math.abs(expectedTotal - grandTotal) > 0.05) {
    console.warn('[Receipt] Order total reconciliation difference:', {
      orderNumber,
      subtotal,
      tax,
      deliveryFee,
      platformMarkup: explicitMarkup,
      packingCharges: explicitPacking,
      discount,
      calculatedTotal: Number(expectedTotal.toFixed(2)),
      storedGrandTotal: Number(grandTotal.toFixed(2)),
    });
  }

  const handleSendToThermalPrinter = async () => {
    // 1. Dispatch reprint job to background thermal print agent if available
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('starters4u_admin_jwt_token') : null;
      if (token && order.id) {
        fetch('/api/print-agent/jobs/reprint', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            jobType: isKOT ? 'KOT' : 'BILL',
          }),
        }).catch((err) => console.warn('[PrintModal] Background print agent dispatch notice:', err));
      }
    } catch {}

    // 2. Trigger browser thermal printer output
    window.print();
    if (onPrinted) onPrinted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      {/* Thermal Print Page Media Styles */}
      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            background: #fff !important;
            color: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden;
          }
          #printable-slip, #printable-slip * {
            visibility: visible;
          }
          #printable-slip {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 3mm 4mm !important;
            box-shadow: none !important;
            border: none !important;
            background: #fff !important;
            color: #000 !important;
            font-family: 'Courier New', Courier, monospace !important;
            font-size: 11px !important;
            line-height: 1.3 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden max-h-[92vh] flex flex-col">
        {/* Modal Top Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 no-print">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold ${
                isKOT ? 'bg-amber-600' : 'bg-rose-600'
              }`}
            >
              {isKOT ? <ChefHat className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {isKOT ? `Kitchen Order Ticket (${kotNumber})` : 'Customer Bill Receipt'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isKOT ? 'Thermal 80mm / 58mm KOT Format' : 'Retail Tax Invoice Thermal Slip'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Preview Area */}
        <div className="p-4 overflow-y-auto flex-1 bg-slate-100 flex justify-center">
          {/* Thermal Slip Simulation (80mm / 58mm POS standard) */}
          <div
            ref={printAreaRef}
            id="printable-slip"
            className="w-full max-w-[340px] bg-white border border-slate-300 p-4 font-mono text-xs text-slate-900 shadow-md rounded-lg space-y-2.5"
          >
            {/* Header */}
            <div className="text-center border-b border-dashed border-slate-400 pb-2.5 space-y-0.5">
              <div className="text-base font-black tracking-wider uppercase text-slate-900">
                {restaurantName}
              </div>
              {tagline && <div className="text-[10px] text-slate-600">{tagline}</div>}
              {address && <div className="text-[10px] text-slate-500 leading-tight">{address}</div>}
              {(gstin || phone) && (
                <div className="text-[10px] text-slate-600 font-semibold pt-0.5">
                  {gstin ? `GSTIN: ${gstin}` : ''}
                  {gstin && phone ? ' | ' : ''}
                  {phone ? `Ph: ${phone}` : ''}
                </div>
              )}

              {isKOT ? (
                <div className="mt-2 py-1 bg-amber-100 border border-amber-300 font-black text-amber-900 rounded text-xs tracking-wider">
                  *** KITCHEN ORDER TICKET (KOT) ***
                </div>
              ) : (
                <div className="mt-2 py-1 bg-slate-100 border border-slate-300 font-black text-slate-900 rounded text-xs tracking-wider">
                  *** RETAIL TAX INVOICE ***
                </div>
              )}
            </div>

            {/* Meta Info */}
            <div className="grid grid-cols-2 gap-y-1 text-[11px] border-b border-dashed border-slate-400 pb-2">
              <div>
                <strong>Order #:</strong> {orderNumber}
              </div>
              <div className="text-right">
                <strong>Type:</strong>{' '}
                <span className="uppercase text-rose-700 font-bold">
                  {formatOrderType(order.orderType)}
                </span>
              </div>

              {isDineIn && tableNumber && (
                <div className="col-span-2 text-xs font-black bg-rose-50 text-rose-800 p-1 rounded border border-rose-200 text-center my-0.5">
                  🪑 TABLE: {tableNumber}
                </div>
              )}

              <div>
                <strong>Date:</strong> {orderDate}
              </div>
              <div className="text-right">
                <strong>Time:</strong> {orderTime}
              </div>

              <div>
                <strong>Customer:</strong> {customerName}
              </div>
              <div className="text-right">
                {customerPhone ? (
                  <>
                    <strong>Phone:</strong> {customerPhone}
                  </>
                ) : (
                  <span>&nbsp;</span>
                )}
              </div>

              {deliveryAddress && (
                <div className="col-span-2 text-[10px] text-slate-700 pt-0.5 leading-snug">
                  <strong>Delivery:</strong> {deliveryAddress}
                </div>
              )}

              {isKOT && (
                <div className="col-span-2 font-bold text-amber-800 pt-0.5">
                  <strong>Station:</strong> {order.kotStation || 'Master Kitchen Dispatch'}
                </div>
              )}
            </div>

            {/* Items Table */}
            <div>
              <div className="flex justify-between font-black border-b border-slate-400 pb-1 text-[11px]">
                <span className="w-10">QTY</span>
                <span className="flex-1">ITEM & CUSTOMIZATION</span>
                {!isKOT && <span className="w-16 text-right">AMT (₹)</span>}
              </div>

              <div className="divide-y divide-dashed divide-slate-300 py-1 space-y-1.5">
                {items.map((it, idx) => {
                  const itemName = getItemName(it);
                  const unitPrice = getItemUnitPrice(it);
                  const qty = Number(it.quantity) || 1;
                  const lineTotal = unitPrice * qty;

                  const shapeCode = it.selectedShape || (it as any).shape;
                  const shapeLabel =
                    shapeCode === 'R'
                      ? 'Rectangular'
                      : shapeCode === 'C'
                      ? 'Circular'
                      : shapeCode === 'S'
                      ? 'Square'
                      : shapeCode;

                  const addonList = Array.isArray(it.addons)
                    ? it.addons.map((a: any) => {
                        if (typeof a === 'string') return a;
                        const aPrice = Number(a.price) ? ` (+₹${Number(a.price).toFixed(2)})` : '';
                        return `${a.name || a.addonName || 'Addon'}${aPrice}`;
                      })
                    : [];

                  return (
                    <div key={idx} className="flex justify-between items-start text-xs pt-1">
                      <span className="w-8 font-black text-sm text-slate-950">{qty} x</span>
                      <div className="flex-1 pr-1 leading-snug">
                        <div className="font-black text-slate-900">{itemName}</div>
                        {it.selectedCrust && (
                          <div className="text-[10px] text-slate-600">Crust: {it.selectedCrust}</div>
                        )}
                        {shapeLabel && (
                          <div className="text-[10px] text-slate-600">Shape: {shapeLabel}</div>
                        )}
                        {it.spiceLevel && (
                          <div className="text-[10px] text-rose-600 font-bold">Spice: {it.spiceLevel}</div>
                        )}
                        {addonList.length > 0 && (
                          <div className="text-[10px] text-slate-600">Add-ons: {addonList.join(', ')}</div>
                        )}
                        {(it.specialInstructions || (it as any).notes) && (
                          <div className="text-[10px] font-black text-amber-900 bg-amber-50 p-0.5 rounded mt-0.5">
                            NOTE: {it.specialInstructions || (it as any).notes}
                          </div>
                        )}
                      </div>
                      {!isKOT && (
                        <span className="w-16 text-right font-bold font-mono">
                          {lineTotal.toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Price Breakdown & Totals (Only on Customer Receipt) */}
            {!isKOT ? (
              <div className="border-t border-dashed border-slate-400 pt-2 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>

                {tax > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span>CGST:</span>
                      <span>₹{cgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST:</span>
                      <span>₹{sgst.toFixed(2)}</span>
                    </div>
                  </>
                )}

                {deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span>Delivery Fee:</span>
                    <span>₹{deliveryFee.toFixed(2)}</span>
                  </div>
                )}

                {explicitMarkup > 0 && (
                  <div className="flex justify-between">
                    <span>Platform/Delivery Markup:</span>
                    <span>₹{explicitMarkup.toFixed(2)}</span>
                  </div>
                )}

                {explicitPacking > 0 && (
                  <div className="flex justify-between">
                    <span>Packing Charges:</span>
                    <span>₹{explicitPacking.toFixed(2)}</span>
                  </div>
                )}

                {discount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Discount{couponCode ? ` (${couponCode})` : ''}:</span>
                    <span>-₹{discount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between font-black text-sm border-t-2 border-b-2 border-slate-900 py-1 my-1">
                  <span>NET TOTAL:</span>
                  <span>₹{grandTotal.toFixed(2)}</span>
                </div>

                <div className="text-[10px] space-y-0.5 pt-1 text-slate-800">
                  <div>
                    <strong>Payment Method:</strong> {formatPaymentMethod(order.paymentMethod)}
                  </div>
                  <div>
                    <strong>Payment Status:</strong> {formatPaymentStatus(order.paymentStatus)}
                  </div>
                </div>

                <div className="text-[10px] text-center text-slate-600 pt-2 border-t border-dashed border-slate-300">
                  Thank you for ordering with
                  <div className="font-bold text-slate-900 uppercase">{restaurantName}</div>
                </div>
              </div>
            ) : (
              <div className="border-t border-dashed border-slate-400 pt-2 text-[10px] text-center text-slate-600 font-bold">
                *** END OF KOT SLIP ***
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-white flex gap-3 no-print">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
          >
            Close
          </button>
          <button
            onClick={handleSendToThermalPrinter}
            className={`flex-1 py-2.5 px-4 rounded-xl text-white font-extrabold text-xs transition flex items-center justify-center gap-1.5 shadow-xs ${
              isKOT ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>Send to Thermal Printer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
