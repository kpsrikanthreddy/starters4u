import React, { useRef } from 'react';
import { Order } from '../types';
import { Printer, ChefHat, CheckCircle2, Clock, MapPin, Sparkles, X } from 'lucide-react';

interface PrintModalProps {
  order: Order;
  type: 'kot' | 'receipt';
  onClose: () => void;
  onPrinted?: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({ order, type, onClose, onPrinted }) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  const handleBrowserPrint = () => {
    window.print();
    if (onPrinted) onPrinted();
  };

  const isDineIn = order.orderType === 'dine_in';
  const tableDisplay = order.customer.tableNumber || (isDineIn ? 'Table 1' : 'N/A');
  const kotNumber = order.kotNumber || `KOT-${order.id.replace('MOZZ-', '')}`;

  // Categorize items for KOT Stations
  const pizzaItems = order.items.filter((it) => it.menuItem.isPocketPizza || it.menuItem.category.includes('pizza'));
  const wokItems = order.items.filter(
    (it) =>
      it.menuItem.category === 'chinese_starters' ||
      it.menuItem.category === 'fried_rice' ||
      it.menuItem.category === 'noodles' ||
      it.menuItem.category === 'momos' ||
      it.menuItem.category === 'maggie'
  );
  const drinkItems = order.items.filter((it) => it.menuItem.category === 'drinks');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Top Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold ${type === 'kot' ? 'bg-amber-600' : 'bg-rose-600'}`}>
              {type === 'kot' ? <ChefHat className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {type === 'kot' ? `Kitchen Order Ticket (${kotNumber})` : `Tax Invoice / Bill (#${order.id})`}
              </h3>
              <p className="text-[11px] text-slate-500">
                {type === 'kot' ? 'Thermal 80mm / 58mm KOT Format' : 'Customer Billing Thermal Slip'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Preview Area */}
        <div className="p-4 overflow-y-auto flex-1 bg-slate-100 flex justify-center">
          {/* Thermal Slip Simulation (80mm width standard) */}
          <div
            ref={printAreaRef}
            id="printable-slip"
            className="w-full max-w-[340px] bg-white border border-slate-300 p-4 font-mono text-xs text-slate-900 shadow-md rounded-lg space-y-3"
          >
            {/* Header */}
            <div className="text-center border-b border-dashed border-slate-400 pb-3">
              <div className="text-base font-black tracking-wider">MOZZ PIZZATERIA</div>
              <div className="text-[10px] text-slate-600">Authentic Korean Pocket Pizzas & Chinese</div>
              <div className="text-[10px] text-slate-500">GSTIN: 36AAECR1234F1Z9 | Ph: +91 81796 20607</div>

              {type === 'kot' ? (
                <div className="mt-2 py-1 bg-amber-100 border border-amber-300 font-black text-amber-900 rounded text-xs">
                  *** KITCHEN ORDER TICKET (KOT) ***
                </div>
              ) : (
                <div className="mt-2 py-1 bg-slate-100 border border-slate-300 font-black text-slate-900 rounded text-xs">
                  *** RETAIL TAX INVOICE ***
                </div>
              )}
            </div>

            {/* Meta Info */}
            <div className="grid grid-cols-2 gap-1 text-[11px] border-b border-dashed border-slate-400 pb-2">
              <div>
                <strong>Order #:</strong> {order.id}
              </div>
              <div className="text-right">
                <strong>Type:</strong> <span className="uppercase text-rose-700 font-bold">{order.orderType.replace('_', ' ')}</span>
              </div>
              {isDineIn && (
                <div className="col-span-2 text-sm font-black bg-rose-50 text-rose-800 p-1 rounded border border-rose-200 text-center my-0.5">
                  🪑 DINE-IN: {tableDisplay}
                </div>
              )}
              <div>
                <strong>Date:</strong> {new Date(order.createdAt).toLocaleDateString('en-IN')}
              </div>
              <div className="text-right">
                <strong>Time:</strong> {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div>
                <strong>Customer:</strong> {order.customer.name}
              </div>
              <div className="text-right">
                <strong>Phone:</strong> {order.customer.phone}
              </div>
              {type === 'kot' && (
                <div className="col-span-2 font-bold text-amber-800">
                  <strong>KOT Station:</strong> {order.kotStation || 'Master Kitchen Dispatch'}
                </div>
              )}
            </div>

            {/* Items Table */}
            <div>
              <div className="flex justify-between font-black border-b border-slate-400 pb-1 text-[11px]">
                <span className="w-12">QTY</span>
                <span className="flex-1">ITEM & CUSTOMIZATION</span>
                {type === 'receipt' && <span className="w-14 text-right">AMT (₹)</span>}
              </div>

              <div className="divide-y divide-dashed divide-slate-300 py-1 space-y-1.5">
                {/* Pizza Station Items */}
                {pizzaItems.length > 0 && type === 'kot' && (
                  <div className="text-[10px] font-bold text-rose-700 uppercase pt-1">
                    --- [STATION 1: PIZZA DECK OVEN] ---
                  </div>
                )}
                {pizzaItems.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-start text-xs pt-1">
                    <span className="w-8 font-black text-sm text-slate-950">{it.quantity} x</span>
                    <div className="flex-1 pr-1">
                      <div className="font-black text-slate-900">{it.menuItem.name}</div>
                      {it.selectedShape && (
                        <div className="text-[10px] font-black text-rose-700">
                          Shape: [{it.selectedShape}]{' '}
                          {it.selectedShape === 'R' ? 'Rectangular' : it.selectedShape === 'C' ? 'Circular' : 'Square'}
                        </div>
                      )}
                      {it.selectedCrust && <div className="text-[10px] text-slate-600">{it.selectedCrust}</div>}
                      {it.spiceLevel && <div className="text-[10px] text-rose-600 font-bold">Spice: {it.spiceLevel}</div>}
                      {it.specialInstructions && (
                        <div className="text-[10px] font-black text-amber-900 bg-amber-50 p-0.5 rounded mt-0.5">
                          NOTE: {it.specialInstructions}
                        </div>
                      )}
                    </div>
                    {type === 'receipt' && (
                      <span className="w-14 text-right font-bold font-mono">
                        {(it.unitPrice * it.quantity).toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}

                {/* Wok / Chinese Items */}
                {wokItems.length > 0 && type === 'kot' && (
                  <div className="text-[10px] font-bold text-amber-700 uppercase pt-2">
                    --- [STATION 2: CHINESE WOK & STARTERS] ---
                  </div>
                )}
                {wokItems.map((it, idx) => (
                  <div key={`wok-${idx}`} className="flex justify-between items-start text-xs pt-1">
                    <span className="w-8 font-black text-sm text-slate-950">{it.quantity} x</span>
                    <div className="flex-1 pr-1">
                      <div className="font-black text-slate-900">{it.menuItem.name}</div>
                      {it.specialInstructions && (
                        <div className="text-[10px] font-black text-amber-900 bg-amber-50 p-0.5 rounded mt-0.5">
                          NOTE: {it.specialInstructions}
                        </div>
                      )}
                    </div>
                    {type === 'receipt' && (
                      <span className="w-14 text-right font-bold font-mono">
                        {(it.unitPrice * it.quantity).toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}

                {/* Drink Items */}
                {drinkItems.length > 0 && (
                  <>
                    {type === 'kot' && (
                      <div className="text-[10px] font-bold text-blue-700 uppercase pt-2">
                        --- [STATION 3: BEVERAGE & WATER COUNTER] ---
                      </div>
                    )}
                    {drinkItems.map((it, idx) => (
                      <div key={`dr-${idx}`} className="flex justify-between items-start text-xs pt-1">
                        <span className="w-8 font-black text-sm text-slate-950">{it.quantity} x</span>
                        <div className="flex-1 pr-1">
                          <div className="font-black text-slate-900">{it.menuItem.name}</div>
                        </div>
                        {type === 'receipt' && (
                          <span className="w-14 text-right font-bold font-mono">
                            {(it.unitPrice * it.quantity).toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Receipt Totals (Only on Customer Receipt) */}
            {type === 'receipt' ? (
              <div className="border-t border-dashed border-slate-400 pt-2 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{order.itemTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST (5% CGST+SGST):</span>
                  <span>₹{order.tax.toFixed(2)}</span>
                </div>
                {order.deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span>Delivery Fee:</span>
                    <span>₹{order.deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                {order.discount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Discount ({order.couponCode}):</span>
                    <span>-₹{order.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm border-t border-b border-slate-900 py-1 my-1">
                  <span>NET TOTAL:</span>
                  <span>₹{order.grandTotal.toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-center pt-1 font-bold">
                  Payment Status: {order.paymentStatus.toUpperCase()} ({order.paymentMethod.toUpperCase()})
                </div>
                <div className="text-[10px] text-center text-slate-500 pt-1">
                  Thank You for Dining with MOZZ Pizzateria!
                </div>
              </div>
            ) : (
              <div className="border-t border-dashed border-slate-400 pt-2 text-[10px] text-center text-slate-600">
                *** END OF KOT SLIP ***
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-white flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
          >
            Close
          </button>
          <button
            onClick={handleBrowserPrint}
            className={`flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-xs ${
              type === 'kot' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>{type === 'kot' ? 'Print KOT to Kitchen' : 'Print Customer Receipt'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
