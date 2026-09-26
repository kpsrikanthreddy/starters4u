import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { useRestaurant } from '../context/RestaurantContext';
import {
  X,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Tag,
  ArrowRight,
  Sparkles,
  MapPin,
  Phone,
  User,
  ShieldCheck,
  Check,
  Lock,
  LocateFixed,
  AlertCircle,
  RefreshCw,
  Navigation,
  Compass,
} from 'lucide-react';
import { OrderType } from '../types';
import { PROMO_COUPONS } from '../data/menuData';

// Fixed MOZZ restaurant coordinates in Gachibowli, Hyderabad (Never modify or replace)
const MOZZ_RESTAURANT_COORDINATES = {
  latitude: 17.442509,
  longitude: 78.353966,
};

// Calculate Haversine distance in Kilometers
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

interface CartDrawerProps {
  onOpenCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onOpenCheckout }) => {
  const { restaurant, selectedBranch, isSuspended } = useRestaurant();
  const {
    cart,
    isCartOpen,
    setIsCartOpen,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    subtotal,
    tax,
    deliveryFee,
    discountAmount,
    grandTotal,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    orderType,
    setOrderType,
    tableNumber,
    setTableNumber,
    qrSession,
    isModeLocked,
    customerDetails,
    setCustomerDetails,
    promptCustomerVerification,
  } = useStore();

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [validationError, setValidationError] = useState('');

  // GPS state
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showManualPin, setShowManualPin] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Request browser geolocation for delivery orders
  const handleCaptureGpsLocation = () => {
    setLocationError(null);
    setValidationError('');

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser. Please select a delivery area pin manually.');
      setShowManualPin(true);
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = Math.round(position.coords.accuracy || 10);
        const capturedAt = new Date().toISOString();

        setCustomerDetails({
          latitude: lat,
          longitude: lng,
          accuracy: accuracy,
          locationCapturedAt: capturedAt,
          locationSource: 'device_gps',
        });

        setIsLocating(false);
        setLocationError(null);

        // Attempt reverse geocoding to auto-fill street address if empty
        if (!customerDetails.address?.trim()) {
          setIsGeocoding(true);
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
              { headers: { Accept: 'application/json' } }
            );
            if (res.ok) {
              const data = await res.json();
              if (data && data.display_name) {
                setCustomerDetails({ address: data.display_name });
              }
            }
          } catch (err) {
            console.warn('[CartDrawer] Reverse geocode note:', err);
          } finally {
            setIsGeocoding(false);
          }
        }
      },
      (error) => {
        setIsLocating(false);
        let message = 'Unable to determine your GPS location.';
        if (error.code === 1) {
          // PERMISSION_DENIED
          message = 'Location permission was denied. Please allow location access in your browser or select a delivery area pin below.';
        } else if (error.code === 2) {
          // POSITION_UNAVAILABLE
          message = 'GPS location is temporarily unavailable. Check your device GPS or select a delivery area pin below.';
        } else if (error.code === 3) {
          // TIMEOUT
          message = 'Location request timed out. Please tap "Try Again" or select a delivery area pin below.';
        }
        setLocationError(message);
        setShowManualPin(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // When switching to delivery order type, prompt for location if not yet captured
  const handleSelectOrderType = (type: OrderType) => {
    setOrderType(type);
    setValidationError('');
    if (type === 'delivery' && !customerDetails.latitude && !isLocating) {
      handleCaptureGpsLocation();
    }
  };

  if (!isCartOpen) return null;

  const handleApplyCoupon = (code: string) => {
    setCouponError('');
    const res = applyCoupon(code);
    if (!res.success) {
      setCouponError(res.message);
    } else {
      setCouponInput('');
    }
  };

  const handleProceedToPayment = () => {
    setValidationError('');

    if (isSuspended) {
      setValidationError(`${restaurant?.name || 'This restaurant'} is temporarily suspended and cannot accept orders.`);
      return;
    }

    if (cart.length === 0) {
      setValidationError('Your cart is empty.');
      return;
    }

    const isVerified = promptCustomerVerification(() => {
      if (orderType === 'delivery') {
        if (!customerDetails.address?.trim()) {
          setValidationError('Please enter your delivery street address (Flat / House / Street).');
          return;
        }
        if (
          typeof customerDetails.latitude !== 'number' ||
          typeof customerDetails.longitude !== 'number' ||
          isNaN(customerDetails.latitude) ||
          isNaN(customerDetails.longitude)
        ) {
          setValidationError('Delivery orders require your verified GPS location. Tap "Use My Current Location" or select your delivery area.');
          return;
        }
      }
      onOpenCheckout();
    });

    if (!isVerified) {
      return;
    }

    const cleanPhone = (customerDetails.phone || '').trim().replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setValidationError('Please enter a valid 10-digit Indian mobile number (starts with 6, 7, 8, or 9).');
      promptCustomerVerification();
      return;
    }

    if (orderType === 'delivery') {
      if (!customerDetails.address?.trim()) {
        setValidationError('Please enter your delivery street address (Flat / House / Street).');
        return;
      }
      if (
        typeof customerDetails.latitude !== 'number' ||
        typeof customerDetails.longitude !== 'number' ||
        isNaN(customerDetails.latitude) ||
        isNaN(customerDetails.longitude)
      ) {
        setValidationError('Delivery orders require your verified GPS location. Tap "Use My Current Location" or select your delivery area.');
        return;
      }
    }

    onOpenCheckout();
  };

  const activeKitchenCoords =
    selectedBranch?.latitude && selectedBranch?.longitude
      ? { latitude: selectedBranch.latitude, longitude: selectedBranch.longitude }
      : MOZZ_RESTAURANT_COORDINATES;

  const distanceFromKitchenKm =
    customerDetails.latitude && customerDetails.longitude
      ? calculateDistanceKm(
          activeKitchenCoords.latitude,
          activeKitchenCoords.longitude,
          customerDetails.latitude,
          customerDetails.longitude
        )
      : null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={() => setIsCartOpen(false)}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-slate-200 text-slate-800 flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Your Food Basket</h2>
                <p className="text-xs text-slate-500">
                  {cart.length} unique item{cart.length === 1 ? '' : 's'} in order
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-slate-400 hover:text-rose-600 transition font-medium"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cart Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {cart.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <div className="w-16 h-16 rounded-full bg-white border border-slate-200 flex items-center justify-center text-3xl mb-3 shadow-xs">
                  🥟
                </div>
                <h3 className="text-base font-bold text-slate-900">Your basket is empty</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Add delicious Korean-Style Pocket Pizzas, crispy Chinese starters, or sweet dessert pizzas to start.
                </p>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="mt-4 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition shadow-xs"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <>
                {/* Order Type / Mode */}
                {isModeLocked ? (
                  <div className="bg-gradient-to-r from-amber-50/90 via-rose-50/50 to-amber-50/90 border border-amber-200/90 rounded-2xl p-3.5 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-100/80 border border-amber-300 flex items-center justify-center text-base shrink-0 shadow-xs">
                          {qrSession.source === 'table_qr' ? '🍽️' : '🛍️'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-sm">
                              {qrSession.source === 'table_qr'
                                ? `${tableNumber || qrSession.tableNumber || 'Table 1'} (Dine-In)`
                                : 'Counter Express (Takeaway)'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-0.5">
                              <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                              QR VERIFIED
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {qrSession.source === 'table_qr'
                              ? 'Order mode locked to your table via scanned QR code.'
                              : 'Order mode locked to Counter Takeaway via scanned QR code.'}
                          </p>
                        </div>
                      </div>
                      <div className="p-1 rounded-lg bg-amber-100/60 text-amber-800 border border-amber-200" title="Locked by QR Scan">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        Order Mode
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">Customer Selection</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['delivery', 'takeaway', 'dine_in'] as OrderType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleSelectOrderType(type)}
                          className={`py-2 px-2 rounded-xl text-xs font-bold text-center capitalize transition flex flex-col items-center justify-center gap-1 ${
                            orderType === type
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          <span className="text-base">
                            {type === 'delivery' ? '🛵' : type === 'takeaway' ? '🛍️' : '🍽️'}
                          </span>
                          <span className="text-[11px] leading-tight font-extrabold">
                            {type === 'delivery' ? 'Delivery' : type === 'takeaway' ? 'Takeaway' : 'Dine-In'}
                          </span>
                        </button>
                      ))}
                    </div>

                    {orderType === 'dine_in' && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <span>🪑 Table Number:</span>
                        </div>
                        <input
                          type="text"
                          value={tableNumber || 'Table 1'}
                          onChange={(e) => setTableNumber(e.target.value)}
                          placeholder="e.g. Table 4"
                          className="w-28 py-1 px-2.5 text-xs font-black text-rose-700 bg-white border border-slate-300 rounded-lg text-right focus:border-rose-500 outline-hidden"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Cart Items List */}
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Order Items
                  </div>

                  {cart.map((item) => (
                    <div
                      key={item.cartItemId}
                      className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-3 h-3 rounded-sm border flex items-center justify-center p-0.5 ${
                                item.menuItem.dietary === 'veg'
                                  ? 'border-emerald-500'
                                  : item.menuItem.dietary === 'non-veg'
                                  ? 'border-rose-500'
                                  : 'border-amber-500'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  item.menuItem.dietary === 'veg'
                                    ? 'bg-emerald-500'
                                    : item.menuItem.dietary === 'non-veg'
                                    ? 'bg-rose-500'
                                    : 'bg-amber-500'
                                }`}
                              />
                            </span>
                            <h4 className="font-bold text-slate-900 text-sm">{item.menuItem.name}</h4>
                          </div>

                          {/* Pocket Shape and customization tags */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {item.selectedShape && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                [{item.selectedShape}]{' '}
                                {item.selectedShape === 'R'
                                  ? 'Rectangular'
                                  : item.selectedShape === 'C'
                                  ? 'Circular'
                                  : 'Square'}
                              </span>
                            )}
                            {item.selectedCrust && item.selectedCrust.includes('Cheese Burst') && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                Cheese Burst
                              </span>
                            )}
                            {item.spiceLevel && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] text-slate-600 bg-slate-100">
                                {item.spiceLevel}
                              </span>
                            )}
                          </div>

                          {/* Addons */}
                          {item.addons.length > 0 && (
                            <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                              {item.addons.map((a) => (
                                <div key={a.id} className="flex items-center gap-1">
                                  <span className="text-rose-500">+</span>
                                  <span>{a.name} (₹{a.price})</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {item.specialInstructions && (
                            <div className="text-[10px] text-slate-500 italic mt-1">
                              Note: "{item.specialInstructions}"
                            </div>
                          )}
                        </div>

                        {/* Item Total Price */}
                        <div className="text-right">
                          <span className="text-sm font-black text-slate-900">
                            ₹{item.unitPrice * item.quantity}
                          </span>
                          <div className="text-[10px] text-slate-400">₹{item.unitPrice} each</div>
                        </div>
                      </div>

                      {/* Stepper & Delete */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <button
                          onClick={() => removeFromCart(item.cartItemId)}
                          className="text-slate-400 hover:text-rose-600 text-xs flex items-center gap-1 transition font-medium"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>

                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                          <button
                            onClick={() => updateCartQuantity(item.cartItemId, -1)}
                            className="w-6 h-6 flex items-center justify-center text-slate-600 hover:text-slate-900 rounded transition"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-slate-900 min-w-[20px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateCartQuantity(item.cartItemId, 1)}
                            className="w-6 h-6 flex items-center justify-center text-slate-600 hover:text-slate-900 rounded transition"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Customer Contact & Address Form */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-rose-500" />
                    Customer & Delivery Details
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Your Full Name *</label>
                      <input
                        type="text"
                        value={customerDetails.name}
                        onChange={(e) => setCustomerDetails({ name: e.target.value })}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-600" />
                        <span>10-Digit Mobile Number *</span>
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-3 text-xs font-bold text-slate-500 pointer-events-none">
                          +91
                        </span>
                        <input
                          type="tel"
                          value={customerDetails.phone}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val.length <= 10) setCustomerDetails({ phone: val });
                          }}
                          placeholder="9876543210"
                          maxLength={10}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 transition"
                        />
                      </div>
                    </div>

                    {orderType === 'delivery' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Delivery Address (Flat / House / Street) *
                          </label>
                          <textarea
                            value={customerDetails.address || ''}
                            onChange={(e) => setCustomerDetails({ address: e.target.value })}
                            placeholder="Flat 204, Skylark Heights, 2nd Main Road..."
                            rows={2}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 resize-none transition"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Landmark / Directions (Optional)
                          </label>
                          <input
                            type="text"
                            value={customerDetails.landmark || ''}
                            onChange={(e) => setCustomerDetails({ landmark: e.target.value })}
                            placeholder="Near Apollo Pharmacy / Metro Gate 2"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 transition"
                          />
                        </div>

                        {/* Delivery GPS Location Capture Section */}
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                            <span className="flex items-center gap-1">
                              <LocateFixed className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Customer Delivery GPS *</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              Required for Doorstep Delivery
                            </span>
                          </div>

                          {/* 1. Prominent "Use My Current Location" Button */}
                          <button
                            type="button"
                            onClick={handleCaptureGpsLocation}
                            disabled={isLocating}
                            id="use-current-location-btn"
                            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-sm shadow-emerald-700/20 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-80 disabled:cursor-wait cursor-pointer"
                          >
                            {isLocating ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                                <span>Getting your accurate location…</span>
                              </>
                            ) : (
                              <>
                                <Navigation className="w-4 h-4 text-emerald-100 shrink-0" />
                                <span>
                                  {customerDetails.latitude && customerDetails.longitude
                                    ? 'Re-fetch Current GPS Location'
                                    : 'Use My Current Location'}
                                </span>
                              </>
                            )}
                          </button>

                          {/* 2. Confirmed Coordinates & Accuracy Display Card */}
                          {customerDetails.latitude && customerDetails.longitude && (
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2 shadow-2xs">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold flex items-center gap-1.5 text-emerald-950">
                                      <span>Verified Delivery Pin</span>
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-200/90 text-emerald-900 uppercase">
                                        {customerDetails.locationSource === 'device_gps' ? 'Device GPS' : 'Map Pin'}
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-mono text-emerald-800 font-semibold mt-0.5">
                                      {customerDetails.latitude.toFixed(5)}° N, {customerDetails.longitude.toFixed(5)}° E
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={handleCaptureGpsLocation}
                                  disabled={isLocating}
                                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline underline-offset-2 flex items-center gap-1 shrink-0 transition"
                                  title="Refresh GPS Coordinates"
                                >
                                  <RefreshCw className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                                  <span>Update</span>
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/70 text-[10px] text-emerald-800">
                                <div>
                                  <span className="text-emerald-600 font-medium block">GPS Accuracy:</span>
                                  <span className="font-bold">±{Math.round(customerDetails.accuracy || 12)} metres</span>
                                </div>
                                <div>
                                  <span className="text-emerald-600 font-medium block">Distance from Kitchen:</span>
                                  <span className="font-bold">
                                    {distanceFromKitchenKm !== null ? `${distanceFromKitchenKm} km` : 'Near MOZZ'} (Gachibowli)
                                  </span>
                                </div>
                              </div>

                              {isGeocoding && (
                                <p className="text-[10px] text-emerald-700 flex items-center gap-1 animate-pulse">
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  Refining street address from GPS...
                                </p>
                              )}
                            </div>
                          )}

                          {/* 3. Location Error State with "Try Again" & "Select Pin" */}
                          {locationError && (
                            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <p className="font-bold text-rose-950">Location Permission or GPS Issue</p>
                                  <p className="text-[11px] text-rose-700 mt-0.5 leading-tight">{locationError}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={handleCaptureGpsLocation}
                                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition shadow-2xs cursor-pointer"
                                >
                                  Try Again
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowManualPin((prev) => !prev)}
                                  className="px-3 py-1 rounded-lg bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 font-semibold text-[11px] transition cursor-pointer"
                                >
                                  {showManualPin ? 'Hide Area Selector' : 'Choose Gachibowli Area'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 4. Manual Gachibowli Area / Landmark Selector Fallback */}
                          {(!customerDetails.latitude || showManualPin) && (
                            <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                                <span className="flex items-center gap-1.5 text-slate-900">
                                  <MapPin className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Select Gachibowli Landmark Area</span>
                                </span>
                                {customerDetails.latitude && (
                                  <button
                                    type="button"
                                    onClick={() => setShowManualPin(false)}
                                    className="text-slate-400 hover:text-slate-600 text-xs"
                                  >
                                    Close
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500">
                                If GPS is unavailable or blocked by your browser, tap your nearest Gachibowli landmark to lock delivery coordinates:
                              </p>
                              <div className="grid grid-cols-2 gap-1.5 pt-1">
                                {[
                                  {
                                    name: 'Vinayak Nagar / Indira Nagar',
                                    lat: 17.442509,
                                    lng: 78.353966,
                                    addr: 'Plot 31, Vinayak Nagar, Indira Nagar, Gachibowli, Hyderabad',
                                  },
                                  {
                                    name: 'DLF Cyber City / Cyber Hills',
                                    lat: 17.4498,
                                    lng: 78.3615,
                                    addr: 'DLF Cyber City Road, Gachibowli, Hyderabad',
                                  },
                                  {
                                    name: 'Financial District / Nanakramguda',
                                    lat: 17.4156,
                                    lng: 78.3427,
                                    addr: 'Financial District, Nanakramguda, Gachibowli, Hyderabad',
                                  },
                                  {
                                    name: 'Telecom Nagar / Flyover',
                                    lat: 17.4385,
                                    lng: 78.362,
                                    addr: 'Telecom Nagar, Gachibowli, Hyderabad',
                                  },
                                  {
                                    name: 'IIIT Hyderabad / Gowlidoddy',
                                    lat: 17.445,
                                    lng: 78.349,
                                    addr: 'Near IIIT Hyderabad Campus, Gachibowli, Hyderabad',
                                  },
                                  {
                                    name: 'Hitec City / Madhapur Border',
                                    lat: 17.4504,
                                    lng: 78.3808,
                                    addr: 'Hitec City / Madhapur, Hyderabad',
                                  },
                                ].map((loc) => (
                                  <button
                                    key={loc.name}
                                    type="button"
                                    onClick={() => {
                                      setCustomerDetails({
                                        latitude: loc.lat,
                                        longitude: loc.lng,
                                        accuracy: 25,
                                        locationCapturedAt: new Date().toISOString(),
                                        locationSource: 'map_pin',
                                        address: customerDetails.address?.trim()
                                          ? customerDetails.address
                                          : loc.addr,
                                      });
                                      setShowManualPin(false);
                                      setLocationError(null);
                                      setValidationError('');
                                    }}
                                    className="p-2 text-left rounded-lg bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-[10px] font-medium text-slate-800 transition flex flex-col justify-between shadow-2xs active:scale-[0.98]"
                                  >
                                    <span className="font-bold text-slate-900 truncate w-full">{loc.name}</span>
                                    <span className="text-slate-400 font-mono text-[9px] mt-0.5">
                                      {loc.lat.toFixed(4)}°, {loc.lng.toFixed(4)}°
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Privacy and verification reassurance note */}
                          <div className="flex items-start gap-1.5 text-[10px] text-slate-400 pt-0.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.2" />
                            <span>
                              GPS coordinates are used strictly to navigate our delivery rider directly to your doorstep in Gachibowli. No background tracking.
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Promo Code Box */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-rose-500" />
                      Promo & Discounts
                    </span>
                    {appliedCoupon && (
                      <button
                        onClick={removeCoupon}
                        className="text-[11px] text-rose-600 hover:underline font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {appliedCoupon ? (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 font-bold" />
                        <span>Code '{appliedCoupon}' Applied!</span>
                      </div>
                      <span className="font-bold text-emerald-700">-₹{discountAmount}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          placeholder="Enter Promo Code (e.g. MOZZFIRST)"
                          className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 uppercase focus:outline-none focus:border-rose-500 transition"
                        />
                        <button
                          onClick={() => handleApplyCoupon(couponInput)}
                          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-2xs"
                        >
                          Apply
                        </button>
                      </div>

                      {couponError && (
                        <p className="text-[11px] text-rose-600 font-medium">{couponError}</p>
                      )}

                      {/* Quick 1-click pills */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {PROMO_COUPONS.slice(0, 3).map((cp) => (
                          <button
                            key={cp.code}
                            onClick={() => handleApplyCoupon(cp.code)}
                            className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-700 hover:border-rose-400 hover:text-rose-600 transition flex items-center gap-1 shadow-2xs"
                          >
                            <span>{cp.code}</span>
                            <span className="text-slate-400">
                              ({cp.discountType === 'percentage' ? `${cp.discountValue}%` : `₹${cp.discountValue}`})
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Detailed Bill Summary */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Bill Summary
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Items Subtotal</span>
                    <span className="font-semibold text-slate-900">₹{subtotal.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>GST (5%)</span>
                    <span className="font-semibold text-slate-900">₹{tax.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Delivery Charges</span>
                    {deliveryFee === 0 ? (
                      <span className="text-emerald-600 font-bold">FREE</span>
                    ) : (
                      <span className="font-semibold text-slate-900">₹{deliveryFee}</span>
                    )}
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>Promo Discount</span>
                      <span>-₹{discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
                    <span>Grand Total</span>
                    <span className="text-lg font-black text-rose-600">₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sticky Checkout CTA Footer */}
          {cart.length > 0 && (
            <div className="p-4 sm:p-5 border-t border-slate-200 bg-white space-y-3">
              {validationError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {validationError}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-rose-600" />
                  Razorpay 256-bit Secure UPI & Cards
                </span>
                <span className="text-slate-400">Instant Verification</span>
              </div>

              {isSuspended ? (
                <div className="w-full py-3.5 px-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-sm text-center">
                  Ordering is Currently Paused
                </div>
              ) : (
                <button
                  onClick={handleProceedToPayment}
                  id="proceed-to-checkout-btn"
                  className="w-full py-3.5 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md shadow-rose-600/20 active:scale-[0.99] transition flex items-center justify-between"
                >
                  <span>Proceed to UPI & Pay</span>
                  <div className="flex items-center gap-1.5 font-black text-base text-white">
                    <span>₹{grandTotal.toFixed(2)}</span>
                    <ArrowRight className="w-5 h-5 stroke-[2.5]" />
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
