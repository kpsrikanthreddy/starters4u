import React, { useState } from 'react';
import { Order } from '../types';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  TrendingUp,
  Clock,
  MapPin,
  ChefHat,
  Printer,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
} from 'lucide-react';

interface OrderCalendarViewProps {
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  onPrintKOT?: (order: Order) => void;
  onPrintBill?: (order: Order) => void;
  onDeleteOrder?: (orderId: string) => void;
  onDeleteKOT?: (orderId: string) => void;
}

export const OrderCalendarView: React.FC<OrderCalendarViewProps> = ({
  orders,
  onSelectOrder,
  onPrintKOT,
  onPrintBill,
  onDeleteOrder,
  onDeleteKOT,
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateString, setSelectedDateString] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [filterType, setFilterType] = useState<'all' | 'dine_in' | 'delivery' | 'takeaway'>('all');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const jumpToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateString(today.toISOString().split('T')[0]);
  };

  // Group orders by ISO date string (YYYY-MM-DD)
  const ordersByDate: Record<string, Order[]> = {};
  orders.forEach((ord) => {
    try {
      const datePart = ord.createdAt.split('T')[0];
      if (!ordersByDate[datePart]) {
        ordersByDate[datePart] = [];
      }
      ordersByDate[datePart].push(ord);
    } catch {
      // ignore
    }
  });

  // Compute days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday

  // Days array
  const daysArray: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    daysArray.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysArray.push(d);
  }

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  // Selected date's orders
  const selectedDayOrders = (ordersByDate[selectedDateString] || []).filter((ord) => {
    if (filterType === 'all') return true;
    return ord.orderType === filterType;
  });

  // Selected date statistics
  const dayRevenue = selectedDayOrders.reduce(
    (sum, o) => sum + (o.paymentStatus === 'paid' ? o.grandTotal : 0),
    0
  );
  const dineInCount = selectedDayOrders.filter((o) => o.orderType === 'dine_in').length;
  const deliveryCount = selectedDayOrders.filter((o) => o.orderType === 'delivery').length;
  const takeawayCount = selectedDayOrders.filter((o) => o.orderType === 'takeaway').length;

  const todayString = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Calendar Header Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-black text-slate-900">Order Calendar & Daily History</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Browse past orders, daily sales totals, and KOT dispatches by clicking on any date.
          </p>
        </div>

        {/* Month Navigator */}
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
          <button
            onClick={prevMonth}
            className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 shadow-2xs border border-slate-200 transition"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="font-black text-slate-800 text-sm px-3 min-w-[140px] text-center">
            {monthNames[month]} {year}
          </span>

          <button
            onClick={nextMonth}
            className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 shadow-2xs border border-slate-200 transition"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={jumpToToday}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs ml-1"
          >
            Today
          </button>
        </div>
      </div>

      {/* Main Grid: Calendar on Left + Daily Order Feed on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Month Calendar (7 cols on lg) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-800 text-sm tracking-wide">
              {monthNames[month]} {year} Days
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-600"></span> Orders Present
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Selected Date
              </span>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-slate-400 text-xs py-2 border-b border-slate-100">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Day Cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {daysArray.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="h-16 rounded-2xl bg-slate-50/50" />;
              }

              const padDay = day < 10 ? `0${day}` : `${day}`;
              const padMonth = month + 1 < 10 ? `0${month + 1}` : `${month + 1}`;
              const cellDateStr = `${year}-${padMonth}-${padDay}`;

              const dayOrders = ordersByDate[cellDateStr] || [];
              const orderCount = dayOrders.length;
              const cellTotal = dayOrders.reduce(
                (sum, o) => sum + (o.paymentStatus === 'paid' ? o.grandTotal : 0),
                0
              );

              const isSelected = selectedDateString === cellDateStr;
              const isToday = cellDateStr === todayString;

              return (
                <button
                  key={cellDateStr}
                  onClick={() => setSelectedDateString(cellDateStr)}
                  className={`h-20 p-1.5 rounded-2xl border text-left flex flex-col justify-between transition relative overflow-hidden group ${
                    isSelected
                      ? 'bg-rose-50 border-rose-500 shadow-sm ring-2 ring-rose-500/20'
                      : orderCount > 0
                      ? 'bg-white border-slate-200 hover:border-rose-300 hover:bg-slate-50'
                      : 'bg-slate-50/70 border-slate-100 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-black w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday
                          ? 'bg-rose-600 text-white'
                          : isSelected
                          ? 'bg-rose-200 text-rose-900'
                          : 'text-slate-800'
                      }`}
                    >
                      {day}
                    </span>

                    {orderCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-rose-600 text-white font-black text-[10px]">
                        {orderCount}
                      </span>
                    )}
                  </div>

                  {orderCount > 0 ? (
                    <div className="w-full">
                      <div className="text-[11px] font-black text-emerald-700 font-mono leading-tight">
                        ₹{cellTotal}
                      </div>
                      <div className="text-[9px] text-slate-500 truncate">
                        {dayOrders.filter((o) => o.orderType === 'dine_in').length} Dine •{' '}
                        {dayOrders.filter((o) => o.orderType === 'delivery').length} Del
                      </div>
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-300">No orders</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Orders for Selected Date (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Selected Date Summary Banner */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  Selected Date
                </span>
                <h3 className="text-base font-black text-slate-900">
                  {new Date(selectedDateString + 'T00:00:00').toLocaleDateString('en-IN', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
              </div>

              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black">
                {selectedDayOrders.length} Order{selectedDayOrders.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Quick Metrics for Selected Date */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-2xl">
                <span className="text-[11px] text-emerald-800 font-semibold">Total Revenue</span>
                <div className="text-lg font-black text-emerald-700 font-mono mt-0.5">
                  ₹{dayRevenue.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl">
                <span className="text-[11px] text-rose-800 font-semibold">Breakdown</span>
                <div className="text-[11px] text-slate-700 font-bold mt-1">
                  🪑 {dineInCount} Dine-In • 🛵 {deliveryCount} Del • 🛍️ {takeawayCount} Take
                </div>
              </div>
            </div>

            {/* Order Type Filter Tabs */}
            <div className="flex gap-1 pt-1 overflow-x-auto text-xs">
              {[
                { id: 'all', label: 'All' },
                { id: 'dine_in', label: '🪑 Dine-In' },
                { id: 'delivery', label: '🛵 Delivery' },
                { id: 'takeaway', label: '🛍️ Takeaway' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id as any)}
                  className={`px-3 py-1 rounded-xl font-bold transition whitespace-nowrap ${
                    filterType === f.id
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* List of Orders for Selected Date */}
          <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
            {selectedDayOrders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center text-slate-500 shadow-sm">
                <div className="text-3xl mb-2">🗓️</div>
                <h4 className="font-bold text-slate-800 text-sm">No Orders on this Date</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Select a different date from the calendar to view its order history and KOTs.
                </p>
              </div>
            ) : (
              selectedDayOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-rose-300 transition space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-rose-600 text-sm">#{ord.id}</span>
                      {ord.kotNumber ? (
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono font-black text-[10px]">
                            {ord.kotNumber}
                          </span>
                          {onDeleteKOT && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Delete KOT ${ord.kotNumber} for Order #${ord.id}?`)) {
                                  onDeleteKOT(ord.id);
                                }
                              }}
                              title="Delete / Clear KOT Ticket"
                              className="p-0.5 rounded hover:bg-rose-100 text-amber-800 hover:text-rose-600 transition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500">
                        {new Date(ord.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          ord.status === 'delivered'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : ord.status === 'cancelled'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {ord.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="flex justify-between items-center font-bold text-slate-800">
                      <span>
                        {ord.customer.name} ({ord.customer.phone})
                      </span>
                      <span className="font-mono text-rose-600 font-black">₹{ord.grandTotal.toFixed(2)}</span>
                    </div>

                    <div className="text-[11px] text-slate-500">
                      {ord.customer.tableNumber ? (
                        <span className="text-rose-700 font-bold">🪑 Table {ord.customer.tableNumber}</span>
                      ) : (
                        <span className="capitalize">{ord.orderType}</span>
                      )}
                      {' • '}
                      <span>{ord.items.length} item{ord.items.length > 1 ? 's' : ''}</span>
                      {' • '}
                      <span className="uppercase text-slate-700 font-semibold">{ord.paymentMethod}</span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-[11px] text-slate-700 space-y-0.5 mt-1">
                      {ord.items.map((it, i) => (
                        <div key={i} className="flex justify-between">
                          <span>
                            {it.quantity}x {it.menuItem.name}
                            {it.selectedShape && ` [${it.selectedShape}]`}
                          </span>
                          <span className="font-mono font-medium">₹{it.unitPrice * it.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions: Print KOT / Print Bill / Delete Order */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                    {onPrintKOT && ord.kotNumber && (
                      <button
                        onClick={() => onPrintKOT(ord)}
                        className="py-1 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-bold transition flex items-center gap-1"
                      >
                        <ChefHat className="w-3 h-3 text-amber-700" />
                        <span>KOT Slip</span>
                      </button>
                    )}
                    {onPrintBill && (
                      <button
                        onClick={() => onPrintBill(ord)}
                        className="py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-[11px] font-bold transition flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3 text-slate-600" />
                        <span>Tax Invoice</span>
                      </button>
                    )}
                    {onDeleteOrder && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Permanently delete Order #${ord.id}? This cannot be undone.`)) {
                            onDeleteOrder(ord.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-100 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition"
                        title="Delete Order Permanently"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
