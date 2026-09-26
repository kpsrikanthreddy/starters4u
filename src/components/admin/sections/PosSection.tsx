import React, { useState, useEffect, useMemo } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { soundService } from '../../../utils/audio';
import { loadRazorpayScript } from '../../../utils/razorpay.js';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  ShoppingBag,
  CreditCard,
  Banknote,
  QrCode,
  Utensils,
  User,
  Phone,
  CheckCircle2,
  Sparkles,
  Percent,
  X,
} from 'lucide-react';

interface CartItem {
  id: string;
  itemId: string;
  name: string;
  shape?: 'R' | 'C' | 'S';
  shapeName?: string;
  price: number;
  quantity: number;
  specialInstructions?: string;
}

export const PosSection: React.FC = () => {
  const { user, restaurant, adminFetch } = useAdminAuth();
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<'takeaway' | 'dine_in' | 'delivery'>('takeaway');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('+91 98765 43210');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCreatedOrder, setLastCreatedOrder] = useState<any | null>(null);

  // Variant Selection State for POS
  const [selectedVariantItem, setSelectedVariantItem] = useState<any | null>(null);

  // Load Menu and Tables for this tenant
  useEffect(() => {
    const loadData = async () => {
      try {
        const [menuRes, tablesRes] = await Promise.all([
          adminFetch('/api/admin/menu'),
          adminFetch('/api/admin/tables'),
        ]);

        if (menuRes.ok) {
          const items = await menuRes.json();
          if (Array.isArray(items)) {
            setMenuItems(items);
            const cats = Array.from(new Set(items.map((i: any) => i.category || 'General')));
            setCategories(cats);
          }
        }

        if (tablesRes.ok) {
          const tbls = await tablesRes.json();
          if (Array.isArray(tbls)) {
            setTables(tbls);
            if (tbls.length > 0) {
              setSelectedTable(tbls[0].tableNumber);
            }
          }
        }
      } catch (err) {
        console.error('[POS] Error loading menu or tables:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [adminFetch]);

  // Add item to cart or prompt variant selector for pocket pizzas
  const addToCart = (item: any) => {
    if (item.inStock === false) return;

    // If item has pocket pizza shape variants, trigger shape modal
    if (item.isPocketPizza || item.prices?.R) {
      setSelectedVariantItem(item);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((ci) => ci.id === item.id);
      if (existing) {
        return prev.map((ci) => (ci.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci));
      }
      return [
        ...prev,
        {
          id: item.id,
          itemId: item.id,
          name: item.name,
          price: Number(item.price || 0),
          quantity: 1,
        },
      ];
    });
    soundService.playChime('pop');
  };

  // Add a specific shape variant to cart
  const addVariantToCart = (item: any, shape: 'R' | 'C' | 'S') => {
    const shapeMeta = {
      R: { name: 'Rectangular', price: item.prices?.R ?? 149 },
      C: { name: 'Circular', price: item.prices?.C ?? 179 },
      S: { name: 'Square', price: item.prices?.S ?? 199 },
    }[shape];

    const cartId = `${item.id}_${shape}`;
    const variantPrice = Number(shapeMeta.price);
    const fullName = `${item.name} (${shapeMeta.name} [${shape}])`;

    setCart((prev) => {
      const existing = prev.find((ci) => ci.id === cartId);
      if (existing) {
        return prev.map((ci) => (ci.id === cartId ? { ...ci, quantity: ci.quantity + 1 } : ci));
      }
      return [
        ...prev,
        {
          id: cartId,
          itemId: item.id,
          name: fullName,
          shape,
          shapeName: shapeMeta.name,
          price: variantPrice,
          quantity: 1,
        },
      ];
    });

    setSelectedVariantItem(null);
    soundService.playChime('pop');
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((ci) => {
          if (ci.id === itemId) {
            const newQty = ci.quantity + delta;
            return newQty > 0 ? { ...ci, quantity: newQty } : null;
          }
          return ci;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const clearCart = () => {
    setCart([]);
    setDiscountAmount(0);
  };

  // Calculations
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const tax = Math.round(subtotal * 0.05); // 5% GST
  const grandTotal = Math.max(0, subtotal + tax - discountAmount);

  // Submit Order
  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      alert('Cart is empty. Please select menu items.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isCash = paymentMethod === 'cash';

      const payload = {
        orderType,
        tableNumber: orderType === 'dine_in' ? selectedTable : undefined,
        customer: {
          name: customerName.trim() || 'Walk-in Customer',
          phone: customerPhone.trim() || '+91 00000 00000',
        },
        items: cart.map((ci) => ({
          itemId: ci.itemId || ci.id,
          name: ci.name,
          quantity: ci.quantity,
          price: ci.price,
          unitPrice: ci.price,
          totalPrice: ci.price * ci.quantity,
          shape: ci.shape,
          specialInstructions: ci.specialInstructions,
        })),
        paymentMethod: isCash ? 'cash' : 'razorpay',
        paymentStatus: isCash ? 'paid' : 'pending',
        discount: discountAmount,
      };

      const res = await adminFetch('/api/admin/pos/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to place order: ${err.error || 'Server error'}`);
        setIsSubmitting(false);
        return;
      }

      const data = await res.json();
      const createdOrder = data.order;

      // Section 12: If CASH selected, do NOT launch Razorpay
      if (isCash) {
        setLastCreatedOrder(createdOrder);
        clearCart();
        soundService.playChime('success');
        setIsSubmitting(false);
        return;
      }

      // Section 12: If ONLINE selected, launch Razorpay!
      const sdkReady = await loadRazorpayScript();
      if (!sdkReady || typeof window.Razorpay !== 'function') {
        alert('Could not load Razorpay SDK. Order is saved with pending payment.');
        setLastCreatedOrder(createdOrder);
        setIsSubmitting(false);
        return;
      }

      const orderRes = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: createdOrder.id,
          app_order_id: createdOrder.id,
          orderType: createdOrder.orderType,
          restaurantId: createdOrder.restaurantId,
          notes: {
            pos_counter: 'true',
            order_id: createdOrder.id,
            order_number: createdOrder.orderNumber,
          },
        }),
      });

      const orderData = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok || !orderData.order_id) {
        alert(orderData.error || 'Online payment initialization failed. Order remains pending.');
        setLastCreatedOrder(createdOrder);
        setIsSubmitting(false);
        return;
      }

      const options = {
        key: orderData.key_id || orderData.keyId,
        order_id: orderData.order_id || orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: restaurant?.name || 'MOZZ Chinese & Pizzateria',
        description: `POS Counter Order #${createdOrder.orderNumber}`,
        image: '/favicon.svg',
        prefill: {
          name: customerName.trim() || 'Counter Customer',
          contact: customerPhone.trim() || '',
        },
        theme: { color: '#E11D48' },
        handler: async function (response: any) {
          try {
            const verifyRes = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                app_order_id: createdOrder.id,
                orderId: createdOrder.id,
              }),
            });

            if (verifyRes.ok) {
              setLastCreatedOrder({
                ...createdOrder,
                paymentStatus: 'paid',
                status: 'confirmed',
                paymentId: response.razorpay_payment_id,
              });
              clearCart();
              soundService.playChime('success');
            } else {
              alert('Payment signature verification failed. Please check payment status.');
            }
          } catch (err: any) {
            console.error('POS payment verification error:', err);
            alert('Error verifying payment.');
          } finally {
            setIsSubmitting(false);
          }
        },
        modal: {
          ondismiss: function () {
            setIsSubmitting(false);
            setLastCreatedOrder(createdOrder);
            alert('Online payment was cancelled. Order remains saved as pending.');
          },
        },
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.open();
    } catch (err: any) {
      alert(`Error submitting order: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
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
  }, [menuItems, selectedCategory, searchQuery]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left Column: Menu Item Catalog */}
      <div className="lg:col-span-7 xl:col-span-8 space-y-4">
        {/* Search & Category Filter */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Quick search dishes, beverages, combos..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Items ({menuItems.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Grid */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading tenant menu items...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <Utensils className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold">No menu items found</p>
            <p className="text-[11px] mt-0.5">Add items in the Menu section or reset to sample catalog.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredItems.map((item) => {
              const inStock = item.inStock !== false;
              const hasVariants = Boolean(item.isPocketPizza || item.prices?.R);
              const cartCount = cart
                .filter((ci) => ci.itemId === item.id || ci.id === item.id)
                .reduce((acc, ci) => acc + ci.quantity, 0);

              return (
                <button
                  key={item.id}
                  disabled={!inStock}
                  onClick={() => addToCart(item)}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between relative group cursor-pointer ${
                    !inStock
                      ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                      : cartCount > 0
                      ? 'bg-rose-50/50 border-rose-300 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  {cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white font-extrabold text-[10px] flex items-center justify-center shadow-xs">
                      {cartCount}
                    </span>
                  )}

                  <div>
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-20 object-cover rounded-xl mb-2"
                      />
                    )}
                    <div className="font-extrabold text-xs text-slate-900 line-clamp-1">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold flex items-center justify-between">
                      <span>{item.category}</span>
                      {!inStock && <span className="text-rose-600 font-bold">86 Out</span>}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between pt-2 border-t border-slate-100">
                    <div>
                      <span className="font-black text-xs text-slate-900 block">
                        {hasVariants ? `From ₹${item.prices?.R ?? 149}` : `₹${item.price ?? 0}`}
                      </span>
                      {hasVariants && (
                        <span className="text-[9px] font-bold text-rose-600 block">
                          [R, C, S] Shapes
                        </span>
                      )}
                    </div>
                    <span
                      className={`p-1 rounded-lg ${
                        inStock
                          ? 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition'
                          : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Column: POS Billing Cart */}
      <div className="lg:col-span-5 xl:col-span-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-5 sticky top-20 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-rose-600" />
              <h2 className="font-extrabold text-sm text-slate-900">Current Order Cart</h2>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-[11px] text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Order Type Toggle */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold">
            <button
              onClick={() => setOrderType('takeaway')}
              className={`py-1.5 rounded-lg transition ${
                orderType === 'takeaway' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Takeaway
            </button>
            <button
              onClick={() => setOrderType('dine_in')}
              className={`py-1.5 rounded-lg transition ${
                orderType === 'dine_in' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Dine-In
            </button>
            <button
              onClick={() => setOrderType('delivery')}
              className={`py-1.5 rounded-lg transition ${
                orderType === 'delivery' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Delivery
            </button>
          </div>

          {/* Table Picker for Dine-In */}
          {orderType === 'dine_in' && (
            <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-600 shrink-0">Table Number:</span>
              <select
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-rose-500"
              >
                {tables.length === 0 && <option value="1">Table 1</option>}
                {tables.map((t) => (
                  <option key={t.id} value={t.tableNumber}>
                    Table {t.tableNumber} {t.tableName ? `(${t.tableName})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Customer Details Inputs */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Customer</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Name"
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Phone</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+91 Phone"
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* Cart Item Rows */}
          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Tap dishes on the left to add to bill
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex-1 pr-2">
                    <div className="font-bold text-slate-800">{item.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {item.shape ? (
                        <span className="font-bold text-rose-600 mr-1">
                          [{item.shape}] {item.shapeName} •
                        </span>
                      ) : null}
                      ₹{item.price} each
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-1 hover:bg-slate-200 rounded-l-lg text-slate-600 transition"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-bold text-xs text-slate-800">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="p-1 hover:bg-slate-200 rounded-r-lg text-slate-600 transition"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="font-black text-slate-900 w-14 text-right">
                      ₹{item.price * item.quantity}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
              Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`py-2 px-1 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  paymentMethod === 'cash'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span className="text-[10px]">Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`py-2 px-1 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  paymentMethod === 'upi'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-800 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span className="text-[10px]">UPI QR</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`py-2 px-1 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  paymentMethod === 'card'
                    ? 'bg-blue-50 border-blue-500 text-blue-800 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span className="text-[10px]">Card / POS</span>
              </button>
            </div>
          </div>

          {/* Pricing Summary */}
          <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>Subtotal</span>
              <span>₹{subtotal}</span>
            </div>
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>Taxes (5% GST)</span>
              <span>₹{tax}</span>
            </div>

            {/* Optional Discount */}
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-500">Discount (₹)</span>
              <input
                type="number"
                min="0"
                value={discountAmount || ''}
                onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-16 text-right px-2 py-0.5 rounded bg-white border border-slate-200 text-xs font-bold"
              />
            </div>

            <div className="flex justify-between text-slate-900 font-black text-base pt-2 border-t border-slate-200">
              <span>Grand Total</span>
              <span>₹{grandTotal}</span>
            </div>
          </div>

          {/* Place & Print Button */}
          <button
            disabled={cart.length === 0 || isSubmitting}
            onClick={handlePlaceOrder}
            className={`w-full py-3 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-md ${
              cart.length === 0 || isSubmitting
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>{isSubmitting ? 'Processing Order...' : `Charge ₹${grandTotal} & Print KOT`}</span>
          </button>

          {/* Last Created Order Notification */}
          {lastCreatedOrder && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Order <strong>{lastCreatedOrder.orderNumber || lastCreatedOrder.id.slice(0, 8)}</strong>{' '}
                  placed successfully!
                </span>
              </div>
              <button
                onClick={() => window.print()}
                className="text-[10px] font-bold underline hover:text-emerald-700"
              >
                Print
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pocket Pizza Shape Variant Selection Modal */}
      {selectedVariantItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-rose-600 tracking-wider">
                  Select Pizza Shape / Variant
                </span>
                <h3 className="font-extrabold text-base text-slate-900 mt-0.5">
                  {selectedVariantItem.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 capitalize">
                  {selectedVariantItem.category?.replace(/_/g, ' ')}
                </p>
              </div>
              <button
                onClick={() => setSelectedVariantItem(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              {/* Option R */}
              <button
                type="button"
                onClick={() => addVariantToCart(selectedVariantItem, 'R')}
                className="w-full p-3.5 rounded-2xl border border-slate-200 hover:border-rose-500 hover:bg-rose-50/30 text-left transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-rose-100 text-slate-800 group-hover:text-rose-700 font-black text-sm flex items-center justify-center">
                    [R]
                  </div>
                  <div>
                    <div className="font-extrabold text-xs text-slate-900 group-hover:text-rose-700">
                      Rectangular Pocket (Regular)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Crisp rectangular crust, regular pocket size
                    </div>
                  </div>
                </div>
                <div className="font-black text-sm text-slate-900 group-hover:text-rose-700">
                  ₹{selectedVariantItem.prices?.R ?? 149}
                </div>
              </button>

              {/* Option C */}
              <button
                type="button"
                onClick={() => addVariantToCart(selectedVariantItem, 'C')}
                className="w-full p-3.5 rounded-2xl border border-slate-200 hover:border-rose-500 hover:bg-rose-50/30 text-left transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-rose-100 text-slate-800 group-hover:text-rose-700 font-black text-sm flex items-center justify-center">
                    [C]
                  </div>
                  <div>
                    <div className="font-extrabold text-xs text-slate-900 group-hover:text-rose-700">
                      Circular Pocket (Classic)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Classic deep round crust, balanced crust-to-cheese
                    </div>
                  </div>
                </div>
                <div className="font-black text-sm text-slate-900 group-hover:text-rose-700">
                  ₹{selectedVariantItem.prices?.C ?? 179}
                </div>
              </button>

              {/* Option S */}
              <button
                type="button"
                onClick={() => addVariantToCart(selectedVariantItem, 'S')}
                className="w-full p-3.5 rounded-2xl border border-slate-200 hover:border-rose-500 hover:bg-rose-50/30 text-left transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-rose-100 text-slate-800 group-hover:text-rose-700 font-black text-sm flex items-center justify-center">
                    [S]
                  </div>
                  <div>
                    <div className="font-extrabold text-xs text-slate-900 group-hover:text-rose-700">
                      Square Pocket (Signature)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Large square shareable pocket loaded with extra toppings
                    </div>
                  </div>
                </div>
                <div className="font-black text-sm text-slate-900 group-hover:text-rose-700">
                  ₹{selectedVariantItem.prices?.S ?? 199}
                </div>
              </button>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setSelectedVariantItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
