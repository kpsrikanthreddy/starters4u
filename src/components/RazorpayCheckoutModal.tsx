import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { useRestaurant } from '../context/RestaurantContext';
import { PaymentMethod, Order } from '../types';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import {
  X,
  ShieldCheck,
  QrCode,
  Smartphone,
  CreditCard,
  Building2,
  Banknote,
  CheckCircle2,
  Lock,
  Zap,
  ExternalLink,
  AlertCircle,
  Copy,
  Check,
  ArrowRight,
  Info,
  Loader2,
  RefreshCw,
  Clock,
  Ban,
} from 'lucide-react';

import { loadRazorpayScript } from '../utils/razorpay.js';

interface RazorpayCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCompleted: (order: Order) => void;
}

export const RazorpayCheckoutModal: React.FC<RazorpayCheckoutModalProps> = ({
  isOpen,
  onClose,
  onOrderCompleted,
}) => {
  const { grandTotal, customerDetails, createOrder, orderType } = useStore();
  const { restaurantId, restaurantSlug, restaurantName } = useRestaurant();

  // Payment route determined authoritatively by server
  const [paymentRoute, setPaymentRoute] = useState<'DIRECT_RESTAURANT_UPI' | 'MARKETPLACE_PROVIDER' | null>(null);
  const [directUpiData, setDirectUpiData] = useState<{
    provider: string;
    merchantUpiId: string;
    merchantDisplayName: string;
    upiIntentUri: string;
    googlePayIntentUri?: string;
    phonePeIntentUri?: string;
    paytmIntentUri?: string;
    bhimIntentUri?: string;
  } | null>(null);
  const [directQrDataUrl, setDirectQrDataUrl] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [isLoadingRoute, setIsLoadingRoute] = useState(true);

  // Authoritative Direct UPI state tracking
  const [paymentId, setPaymentId] = useState<string>('');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [directUpiStatus, setDirectUpiStatus] = useState<'pending' | 'paid' | 'failed' | 'expired' | 'cancelled'>('pending');
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    }
    return false;
  });
  const [mobileStep, setMobileStep] = useState<'choose_app' | 'verifying'>('choose_app');
  const [showQrOnMobile, setShowQrOnMobile] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'standard' | 'upi' | 'card' | 'netbanking' | 'cod'>('standard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [processingStep, setProcessingStep] = useState('Connecting to Bank Gateway...');
  const [errorMessage, setErrorMessage] = useState('');
  const [razorpayAvailable, setRazorpayAvailable] = useState<boolean | null>(null);
  const [pendingAppOrder, setPendingAppOrder] = useState<any>(null);

  // Window resize listener for responsive mobile flow
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Authoritatively query server for payment route
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage('');
    setIsLoadingRoute(true);

    fetch('/api/payments/route-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId,
        restaurantSlug,
        orderType,
        amount: grandTotal,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (data.route === 'DIRECT_RESTAURANT_UPI' && data.directUpi) {
          setPaymentRoute('DIRECT_RESTAURANT_UPI');
          setDirectUpiData(data.directUpi);
          const pId = data.paymentId || data.directUpi.paymentId || '';
          const ordNum = data.orderNumber || data.directUpi.orderNumber || '';
          setPaymentId(pId);
          setOrderNumber(ordNum);
          setDirectUpiStatus('pending');
          setMobileStep('choose_app');
          setShowQrOnMobile(false);
          setRazorpayAvailable(false); // Direct UPI bypasses Razorpay entirely

          // Generate authentic UPI QR Code data URL using qrcode library
          if (data.directUpi.upiIntentUri) {
            QRCode.toDataURL(data.directUpi.upiIntentUri, {
              width: 320,
              margin: 1,
              color: {
                dark: '#0f172a',
                light: '#ffffff',
              },
            })
              .then((url) => setDirectQrDataUrl(url))
              .catch((err) => console.error('Failed to generate direct UPI QR:', err));
          }
        } else {
          // Delivery / Marketplace provider flow (Razorpay)
          setPaymentRoute('MARKETPLACE_PROVIDER');
          setDirectUpiData(null);
          setPaymentId('');
          setOrderNumber('');
          if (data.isRazorpayAvailable !== undefined) {
            setRazorpayAvailable(data.isRazorpayAvailable);
          }
        }
      })
      .catch((err) => {
        console.error('Error determining payment route:', err);
        // Default to fallback marketplace provider check
        setPaymentRoute('MARKETPLACE_PROVIDER');
      })
      .finally(() => {
        setIsLoadingRoute(false);
      });
  }, [isOpen, restaurantId, restaurantSlug, orderType, grandTotal]);

  // Server-side authoritative status polling:
  // Polls GET /api/payments/:paymentId/status every 2.5 seconds
  useEffect(() => {
    if (!isOpen || paymentRoute !== 'DIRECT_RESTAURANT_UPI' || !paymentId) return;
    if (directUpiStatus === 'paid' || directUpiStatus === 'cancelled') return;

    let isSubscribed = true;
    let pollInterval: any = null;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/payments/${encodeURIComponent(paymentId)}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isSubscribed) return;

        if (data.status === 'paid') {
          setDirectUpiStatus('paid');
          if (pollInterval) clearInterval(pollInterval);
          handleVerifiedPaymentSuccess(paymentId);
        } else if (data.status === 'failed') {
          setDirectUpiStatus('failed');
        } else if (data.status === 'expired') {
          setDirectUpiStatus('expired');
        } else if (data.status === 'cancelled') {
          setDirectUpiStatus('cancelled');
        } else {
          setDirectUpiStatus('pending');
        }
      } catch (err) {
        console.warn('[DirectUPI] Status polling check failed:', err);
      }
    };

    pollInterval = setInterval(checkStatus, 2500);

    return () => {
      isSubscribed = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isOpen, paymentRoute, paymentId, directUpiStatus]);

  if (!isOpen) return null;

  // Finalizes the order ONLY after server-side verification confirms payment as paid
  const handleVerifiedPaymentSuccess = async (verifiedPaymentId: string) => {
    try {
      setIsProcessing(true);
      setProcessingStep('Payment verified! Confirming order with the kitchen...');

      const createdOrder = await createOrder('upi', verifiedPaymentId, {
        direct_upi: true,
        paymentAttemptId: verifiedPaymentId,
        merchant_upi: directUpiData?.merchantUpiId,
        provider: directUpiData?.provider,
      });

      setPaymentSuccess(true);

      try {
        confetti({
          particleCount: 110,
          spread: 75,
          origin: { y: 0.6 },
          colors: ['#059669', '#10B981', '#34D399', '#ffffff'],
        });
      } catch {}

      setTimeout(() => {
        onOrderCompleted(createdOrder);
        setPaymentSuccess(false);
        onClose();
      }, 1600);
    } catch (err: any) {
      console.error('[DirectUPI] Error recording verified order:', err);
      setErrorMessage(err.message || 'Payment confirmed, but failed to record order.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Safe Payment Cancellation:
  // Cancels the payment session on server, leaves order unplaced, and closes modal
  const handleCancelPayment = async () => {
    try {
      setIsCancelling(true);
      if (paymentId) {
        await fetch(`/api/payments/${encodeURIComponent(paymentId)}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Customer cancelled payment attempt' }),
        }).catch(() => {});
      }
    } finally {
      setIsCancelling(false);
      setDirectUpiStatus('cancelled');
      onClose();
    }
  };

  // Try again after failed / expired / cancelled session
  const handleTryAgain = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage('');
      const res = await fetch('/api/payments/initiate-direct-upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          restaurantSlug,
          amount: grandTotal,
        }),
      });
      const data = await res.json();
      if (data.success && data.paymentId) {
        setPaymentId(data.paymentId);
        setOrderNumber(data.orderNumber);
        setDirectUpiStatus('pending');
        setMobileStep('choose_app');
        setShowQrOnMobile(false);
        setDirectUpiData({
          provider: data.provider,
          merchantUpiId: data.merchantUpiId,
          merchantDisplayName: data.merchantDisplayName,
          upiIntentUri: data.upiIntentUri,
          googlePayIntentUri: data.googlePayIntentUri,
          phonePeIntentUri: data.phonePeIntentUri,
          paytmIntentUri: data.paytmIntentUri,
          bhimIntentUri: data.bhimIntentUri,
        });
        if (data.upiIntentUri) {
          QRCode.toDataURL(data.upiIntentUri, {
            width: 320,
            margin: 1,
            color: { dark: '#0f172a', light: '#ffffff' },
          }).then((url) => setDirectQrDataUrl(url));
        }
      }
    } catch (err: any) {
      setErrorMessage('Failed to re-initialize payment attempt. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyUpiId = () => {
    if (!directUpiData?.merchantUpiId) return;
    navigator.clipboard.writeText(directUpiData.merchantUpiId).then(() => {
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    });
  };

  // Real Razorpay Checkout Launcher (Production Only - No Simulations)
  const launchRazorpayCheckout = async (preferredFilter?: { method?: string }) => {
    setErrorMessage('');

    if (orderType === 'delivery') {
      if (typeof customerDetails.latitude !== 'number' || typeof customerDetails.longitude !== 'number') {
        setErrorMessage('Delivery orders require verified GPS coordinates. Please close this window and tap "Use My Current Location".');
        return;
      }
    }

    setIsProcessing(true);
    setProcessingStep('Recording authoritative order...');

    try {
      // Step 1: Store authoritative server-side order with status: placed, paymentStatus: pending
      // Customer cannot tamper with item prices, discounts, taxes, or order totals.
      let activeOrder = pendingAppOrder;
      if (!activeOrder) {
        activeOrder = await createOrder('razorpay', undefined, undefined, 'pending');
        setPendingAppOrder(activeOrder);
      }

      setProcessingStep('Connecting to secure payment gateway...');

      // Step 2: Request Razorpay order passing the authoritative order ID
      // Backend enforces that amount comes from the database order.grandTotal!
      const orderRes = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: activeOrder.id,
          app_order_id: activeOrder.id,
          orderType: activeOrder.orderType,
          restaurantId: activeOrder.restaurantId || restaurantId,
          restaurantSlug,
          receipt: `rcpt_${(activeOrder.orderNumber || Date.now().toString()).slice(-20)}`,
          notes: {
            customer_name: customerDetails.name || 'Customer',
            customer_phone: customerDetails.phone || '',
            order_id: activeOrder.id,
            order_number: activeOrder.orderNumber,
          },
        }),
      });

      const orderData = await orderRes.json().catch(() => ({}));

      // If configuration is absent/invalid (HTTP 503) or order creation fails:
      if (!orderRes.ok || !orderData.order_id) {
        setIsProcessing(false);
        setErrorMessage(
          orderData.error ||
          orderData.message ||
          'Online payment is temporarily unavailable. Please try again later.'
        );
        return;
      }

      const razorpayOrderId: string = orderData.order_id || orderData.orderId;
      const keyId: string = orderData.key_id || orderData.keyId;

      // Step 3: Ensure Razorpay Checkout SDK is ready
      const sdkReady = await loadRazorpayScript();
      if (!sdkReady || typeof window.Razorpay !== 'function') {
        setIsProcessing(false);
        setErrorMessage('Could not load secure payment gateway. Please check your network connection.');
        return;
      }

      setIsProcessing(false);

      // Step 4: Configure official Razorpay Options
      const options: any = {
        key: keyId,
        order_id: razorpayOrderId,
        amount: orderData.amount, // Authoritative paise from backend
        currency: orderData.currency || 'INR',
        name: restaurantName || 'MOZZ Chinese & Pizzateria',
        description: `${activeOrder.orderType === 'dine_in' ? 'Dine-In' : activeOrder.orderType === 'takeaway' ? 'Takeaway' : activeOrder.orderType === 'counter' ? 'Counter' : 'Delivery'} Order #${activeOrder.orderNumber || ''}`,
        image: '/favicon.svg',
        prefill: {
          name: customerDetails.name || 'MOZZ Customer',
          contact: customerDetails.phone || '',
          email: 'customer@mozzpizzateria.com',
        },
        notes: {
          address: customerDetails.address || (activeOrder.orderType === 'dine_in' ? 'Dine-In' : 'Takeaway/Pickup'),
          restaurant: restaurantName || 'MOZZ Chinese & Pizzateria',
          order_id: activeOrder.id,
          order_number: activeOrder.orderNumber,
        },
        theme: {
          color: '#E11D48', // Rose 600
        },
        handler: async function (response: any) {
          setIsProcessing(true);
          setProcessingStep('Verifying payment signature with bank...');

          try {
            // Step 5: Verify signature on backend server-side
            const verifyRes = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                app_order_id: activeOrder.id,
                orderId: activeOrder.id,
              }),
            });

            const verifyData = await verifyRes.json().catch(() => ({}));

            if (!verifyRes.ok || !verifyData.success) {
              setIsProcessing(false);
              setErrorMessage(
                verifyData.error ||
                'Payment verification failed. If money was debited, please contact support with reference: ' +
                  response.razorpay_payment_id
              );
              return;
            }

            // Step 6: Backend signature verified! Order status is confirmed and marked paid
            setProcessingStep('Payment Verified! Confirming order with MOZZ Kitchen...');
            const confirmedOrder = {
              ...activeOrder,
              paymentStatus: 'paid',
              status: 'confirmed',
              paymentId: response.razorpay_payment_id,
            };

            setIsProcessing(false);
            setPaymentSuccess(true);

            try {
              confetti({
                particleCount: 120,
                spread: 80,
                origin: { y: 0.6 },
                colors: ['#F59E0B', '#EF4444', '#10B981', '#ffffff'],
              });
            } catch {}

            setTimeout(() => {
              onOrderCompleted(confirmedOrder);
              setPaymentSuccess(false);
              onClose();
            }, 2000);
          } catch (err: any) {
            console.error('Payment post-verification error:', err);
            setIsProcessing(false);
            setErrorMessage(err.message || 'Error completing verified order. Please contact support.');
          }
        },
        modal: {
          ondismiss: function () {
            setIsProcessing(false);
            setErrorMessage('Payment was cancelled. You can retry when you are ready.');
          },
        },
      };

      if (preferredFilter?.method) {
        options.config = {
          display: {
            blocks: {
              preferred: {
                name: 'Pay using ' + preferredFilter.method.toUpperCase(),
                instruments: [{ method: preferredFilter.method }],
              },
            },
            sequence: ['block.preferred'],
          },
        };
      }

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.on('payment.failed', function (response: any) {
        setIsProcessing(false);
        const reason = response.error?.description || response.error?.reason || 'Transaction failed or was declined by bank.';
        setErrorMessage(`Payment failed: ${reason}. Please try again or choose another payment method.`);
      });
      rzpInstance.open();
    } catch (err: any) {
      console.error('Razorpay checkout error:', err);
      setIsProcessing(false);
      setErrorMessage(
        err?.message || 'Online payment is temporarily unavailable. Please try again later.'
      );
    }
  };

  // Cash on Delivery Order Creation (Real COD order with cod_pending status)
  const handleConfirmCodOrder = async () => {
    try {
      setErrorMessage('');

      if (orderType === 'delivery') {
        if (typeof customerDetails.latitude !== 'number' || typeof customerDetails.longitude !== 'number') {
          setErrorMessage('Delivery orders require verified GPS coordinates. Please close this window and tap "Use My Current Location".');
          return;
        }
      }

      setIsProcessing(true);
      setProcessingStep('Confirming COD order with MOZZ Kitchen...');

      const createdOrder = await createOrder('cod');

      setIsProcessing(false);
      setPaymentSuccess(true);

      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#F59E0B', '#EF4444', '#10B981', '#ffffff'],
        });
      } catch {}

      setTimeout(() => {
        onOrderCompleted(createdOrder);
        setPaymentSuccess(false);
        onClose();
      }, 1800);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err.message || 'Failed to place COD order. Please try again.');
    }
  };

  return (
    <div id="razorpay-checkout-modal-container" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div id="razorpay-checkout-modal-card" className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col text-slate-800 shadow-2xl overflow-hidden relative">
        {/* Processing / Success Full Overlay */}
        {isProcessing && (
          <div id="payment-processing-overlay" className="absolute inset-0 z-50 bg-white/95 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-rose-200 border-t-rose-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-rose-600">
                ₹
              </div>
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-base font-bold text-slate-900">Processing Payment</h3>
              <p className="text-xs text-rose-600 font-semibold animate-pulse">{processingStep}</p>
              <p className="text-[11px] text-slate-400">Do not refresh or close this window.</p>
            </div>
          </div>
        )}

        {paymentSuccess && (
          <div id="payment-success-overlay" className="absolute inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-500 text-emerald-600 flex items-center justify-center text-3xl shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                Order Received
              </span>
              <h3 className="text-2xl font-black text-slate-900">Order Confirmed!</h3>
              <p className="text-xs text-slate-500">
                Sent to MOZZ Kitchen for Korean-Style baking & wok-toss.
              </p>
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="bg-slate-900 p-5 border-b border-slate-800 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            {paymentRoute === 'DIRECT_RESTAURANT_UPI' ? (
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center font-black text-white text-lg shadow-xs">
                <QrCode className="w-5 h-5 text-white" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-lg italic shadow-xs">
                R
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white">
                  {paymentRoute === 'DIRECT_RESTAURANT_UPI' ? 'Direct UPI Payment' : 'Razorpay Secure Checkout'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  paymentRoute === 'DIRECT_RESTAURANT_UPI'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                }`}>
                  {paymentRoute === 'DIRECT_RESTAURANT_UPI' ? 'INSTANT UPI' : 'VERIFIED'}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Merchant: <strong className="text-white">{directUpiData?.merchantDisplayName || restaurantName || 'MOZZ Chinese & Pizzateria'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Amount Payable</div>
              <div className="text-xl font-black text-amber-400">₹{grandTotal.toFixed(2)}</div>
            </div>
            <button
              id="btn-close-razorpay-modal"
              onClick={onClose}
              disabled={isProcessing}
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Customer Notification Bar */}
        <div className="bg-emerald-50/90 px-5 py-2 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-1 text-xs text-emerald-900">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Customer: <strong className="font-bold">{customerDetails.name || 'Customer'}</strong> • Mobile:{' '}
              <strong className="font-bold font-mono">+91 {customerDetails.phone || '8179620607'}</strong>
            </span>
          </div>
          {orderType === 'delivery' && customerDetails.latitude && customerDetails.longitude ? (
            <span className="text-[11px] text-emerald-800 font-mono bg-emerald-100/90 px-2 py-0.5 rounded border border-emerald-300">
              📍 GPS: {customerDetails.latitude.toFixed(4)}°, {customerDetails.longitude.toFixed(4)}° (±{Math.round(customerDetails.accuracy || 15)}m)
            </span>
          ) : (
            <span className="text-[11px] text-emerald-700 hidden sm:inline font-medium">
              {orderType === 'dine_in' ? '🍽️ Dine-In Order' : orderType === 'takeaway' ? '🥡 Takeaway Order' : 'Counter Order'} • Instant Kitchen Confirmation
            </span>
          )}
        </div>

        {/* Error Notification Banner */}
        {errorMessage && (
          <div id="payment-error-banner" className="p-3 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between px-5">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage('')} className="text-rose-500 hover:text-rose-700 font-bold text-xs ml-3 shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {/* Loading Route Spinner */}
        {isLoadingRoute ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3">
            <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-rose-600 animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Selecting fastest payment channel...</p>
          </div>
        ) : paymentRoute === 'DIRECT_RESTAURANT_UPI' && directUpiData ? (
          /* DIRECT RESTAURANT UPI VIEW (STARTERS4U DIRECT UPI PANEL) - ZERO RAZORPAY */
          <div id="direct-restaurant-upi-panel" className="flex-1 p-4 sm:p-6 overflow-y-auto max-h-[75vh] bg-white space-y-5">
            {/* Top Merchant Identity Banner */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Direct Restaurant Payment
                  </span>
                  {orderNumber && (
                    <span className="text-[11px] font-mono font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                      Order #{orderNumber}
                    </span>
                  )}
                </div>
                <h4 className="text-base font-black text-slate-900">{directUpiData.merchantDisplayName}</h4>
                <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
                  <span>VPA: <strong>{directUpiData.merchantUpiId}</strong></span>
                  <button
                    id="btn-copy-merchant-upi"
                    onClick={handleCopyUpiId}
                    className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 transition flex items-center gap-1 text-[11px] font-sans font-semibold cursor-pointer"
                    title="Copy UPI ID"
                  >
                    {copiedUpi ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUpi ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-right shadow-2xs">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Exact Amount Payable</div>
                <div className="text-2xl font-black text-slate-900">₹{grandTotal.toFixed(2)}</div>
              </div>
            </div>

            {/* Error Message if any */}
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* MOBILE VIEW vs DESKTOP VIEW */}
            {isMobile && !showQrOnMobile ? (
              /* MOBILE REQUIRED FLOW */
              <div className="space-y-4">
                {mobileStep === 'choose_app' ? (
                  /* Step 1: Choose UPI App (Primary Mobile Flow) */
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                        <span>Choose UPI App</span>
                      </h4>
                      <p className="text-xs text-slate-500">
                        Tap your preferred UPI app to pay exact amount <strong className="text-slate-800">₹{grandTotal.toFixed(2)}</strong>
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      {/* Google Pay */}
                      <a
                        id="btn-direct-gpay-intent"
                        href={directUpiData.googlePayIntentUri || directUpiData.upiIntentUri}
                        onClick={() => setMobileStep('verifying')}
                        className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-500 bg-white hover:bg-blue-50/50 flex items-center justify-between transition group shadow-2xs active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center font-black text-blue-600 text-base shadow-2xs">
                            G
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition">Google Pay</div>
                            <div className="text-[11px] text-slate-500">Instant UPI Transfer</div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition" />
                      </a>

                      {/* PhonePe */}
                      <a
                        id="btn-direct-phonepe-intent"
                        href={directUpiData.phonePeIntentUri || directUpiData.upiIntentUri}
                        onClick={() => setMobileStep('verifying')}
                        className="p-3.5 rounded-xl border border-slate-200 hover:border-purple-500 bg-white hover:bg-purple-50/50 flex items-center justify-between transition group shadow-2xs active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center font-black text-purple-600 text-base shadow-2xs">
                            P
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold text-slate-900 group-hover:text-purple-600 transition">PhonePe</div>
                            <div className="text-[11px] text-slate-500">UPI Instant Payment</div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition" />
                      </a>

                      {/* Paytm */}
                      <a
                        id="btn-direct-paytm-intent"
                        href={directUpiData.paytmIntentUri || directUpiData.upiIntentUri}
                        onClick={() => setMobileStep('verifying')}
                        className="p-3.5 rounded-xl border border-slate-200 hover:border-sky-500 bg-white hover:bg-sky-50/50 flex items-center justify-between transition group shadow-2xs active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center font-black text-sky-600 text-base shadow-2xs">
                            ₹
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold text-slate-900 group-hover:text-sky-600 transition">Paytm UPI</div>
                            <div className="text-[11px] text-slate-500">Fast UPI Payment</div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-sky-600 transition" />
                      </a>

                      {/* Other UPI App */}
                      <a
                        id="btn-direct-any-upi-intent"
                        href={directUpiData.upiIntentUri}
                        onClick={() => setMobileStep('verifying')}
                        className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-500 bg-white hover:bg-emerald-50/50 flex items-center justify-between transition group shadow-2xs active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center font-black text-emerald-600 text-sm shadow-2xs">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition">Other UPI App</div>
                            <div className="text-[11px] text-slate-500">BHIM, Cred, Amazon Pay, etc.</div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition" />
                      </a>
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowQrOnMobile(true)}
                        className="text-xs text-slate-500 hover:text-slate-800 text-center py-1 underline font-medium cursor-pointer"
                      >
                        Scan QR code with another phone instead
                      </button>

                      {/* Cancel Payment Button */}
                      <button
                        type="button"
                        id="btn-cancel-direct-upi-mobile"
                        onClick={handleCancelPayment}
                        disabled={isCancelling}
                        className="w-full py-3 px-4 rounded-xl border border-slate-300 hover:border-slate-400 bg-white text-slate-700 hover:text-slate-900 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                      >
                        <X className="w-4 h-4 text-slate-500" />
                        <span>Cancel Payment</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Step 2: Customer returned from UPI app -> Verifying payment state */
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-4">
                    {directUpiStatus === 'paid' ? (
                      <div className="space-y-3">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                          <CheckCircle2 className="w-7 h-7" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-emerald-900">Payment Successful</h4>
                          <p className="text-xs text-emerald-700 mt-1">Payment verified server-side. Placing your order...</p>
                        </div>
                      </div>
                    ) : directUpiStatus === 'failed' ? (
                      <div className="space-y-3">
                        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                          <AlertCircle className="w-7 h-7" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-slate-900">Payment failed</h4>
                          <p className="text-xs text-slate-500 mt-1">Payment was not completed or was declined by the bank.</p>
                        </div>
                        <div className="flex gap-2 justify-center pt-2">
                          <button
                            onClick={handleTryAgain}
                            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Try Again</span>
                          </button>
                          <button
                            onClick={handleCancelPayment}
                            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 transition cursor-pointer"
                          >
                            Cancel Payment
                          </button>
                        </div>
                      </div>
                    ) : directUpiStatus === 'expired' ? (
                      <div className="space-y-3">
                        <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                          <Clock className="w-7 h-7" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-slate-900">Payment session expired</h4>
                          <p className="text-xs text-slate-500 mt-1">The session timed out before payment was received.</p>
                        </div>
                        <div className="flex gap-2 justify-center pt-2">
                          <button
                            onClick={handleTryAgain}
                            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Try Again</span>
                          </button>
                          <button
                            onClick={handleCancelPayment}
                            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 transition cursor-pointer"
                          >
                            Cancel Payment
                          </button>
                        </div>
                      </div>
                    ) : directUpiStatus === 'cancelled' ? (
                      <div className="space-y-3">
                        <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center mx-auto">
                          <Ban className="w-7 h-7" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-slate-900">Payment cancelled</h4>
                          <p className="text-xs text-slate-500 mt-1">This payment attempt was cancelled.</p>
                        </div>
                        <div className="flex gap-2 justify-center pt-2">
                          <button
                            onClick={handleTryAgain}
                            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Try Again</span>
                          </button>
                          <button
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 transition cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Pending state */
                      <div className="space-y-4">
                        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                          <Loader2 className="w-7 h-7 animate-spin text-amber-600" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-base font-bold text-slate-900">Verifying payment...</h4>
                          <p className="text-xs font-semibold text-amber-700 flex items-center justify-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            Waiting for payment confirmation...
                          </p>
                          <p className="text-[11px] text-slate-500 max-w-xs mx-auto pt-1">
                            Checking bank records for <strong>₹{grandTotal.toFixed(2)}</strong>. Do not close this window.
                          </p>
                        </div>

                        <div className="pt-2 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => setMobileStep('choose_app')}
                            className="w-full py-2.5 px-4 rounded-xl border border-slate-300 hover:border-slate-400 bg-white text-slate-700 text-xs font-semibold transition cursor-pointer"
                          >
                            Change UPI App
                          </button>

                          <button
                            type="button"
                            id="btn-cancel-direct-upi-pending"
                            onClick={handleCancelPayment}
                            disabled={isCancelling}
                            className="w-full py-3 px-4 rounded-xl border border-slate-300 hover:border-slate-400 bg-white text-slate-700 hover:text-slate-900 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                          >
                            <X className="w-4 h-4 text-slate-500" />
                            <span>Cancel Payment</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* DESKTOP REQUIRED FLOW (or mobile with showQrOnMobile = true) */
              <div className="space-y-5">
                <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-4">
                  {/* Status Indicator */}
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs">
                    {directUpiStatus === 'paid' ? (
                      <span className="bg-emerald-100 text-emerald-800 border-emerald-300 flex items-center gap-1.5 px-3 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Payment Successful</span>
                      </span>
                    ) : directUpiStatus === 'failed' ? (
                      <span className="bg-rose-100 text-rose-800 border-rose-300 flex items-center gap-1.5 px-3 py-1 rounded-full">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Payment Failed</span>
                      </span>
                    ) : directUpiStatus === 'expired' ? (
                      <span className="bg-amber-100 text-amber-800 border-amber-300 flex items-center gap-1.5 px-3 py-1 rounded-full">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Payment Session Expired</span>
                      </span>
                    ) : directUpiStatus === 'cancelled' ? (
                      <span className="bg-slate-200 text-slate-700 border-slate-300 flex items-center gap-1.5 px-3 py-1 rounded-full">
                        <Ban className="w-3.5 h-3.5 text-slate-500" />
                        <span>Payment Cancelled</span>
                      </span>
                    ) : (
                      <span className="bg-amber-50 text-amber-800 border-amber-200/80 flex items-center gap-2 px-3 py-1 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span>Waiting for payment...</span>
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <h5 className="text-sm font-bold text-slate-900">Scan QR Code with any UPI App</h5>
                    <p className="text-xs text-slate-500">
                      Open Google Pay, PhonePe, Paytm, or BHIM on your mobile and scan to pay <strong className="text-slate-800 font-bold">₹{grandTotal.toFixed(2)}</strong>
                    </p>
                  </div>

                  {directQrDataUrl ? (
                    <div className="p-3 bg-white rounded-2xl border-2 border-slate-900 shadow-md inline-block">
                      <img
                        id="img-direct-upi-qr"
                        src={directQrDataUrl}
                        alt="Direct UPI Payment QR"
                        className="w-56 h-56 rounded-lg object-contain"
                      />
                      <div className="mt-2 text-center space-y-0.5">
                        <div className="text-[10px] font-bold tracking-wider text-slate-700 uppercase">
                          {directUpiData.merchantDisplayName}
                        </div>
                        <div className="text-[9px] font-mono text-slate-400">
                          {directUpiData.merchantUpiId}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-56 h-56 rounded-2xl bg-slate-200 animate-pulse flex items-center justify-center text-xs text-slate-400">
                      Generating QR...
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-slate-600 font-medium max-w-sm">
                    <Info className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Payment will be verified server-side. Once confirmed, this screen will automatically advance.</span>
                  </div>

                  {isMobile && showQrOnMobile && (
                    <button
                      type="button"
                      onClick={() => setShowQrOnMobile(false)}
                      className="text-xs text-emerald-700 hover:text-emerald-800 font-bold underline cursor-pointer"
                    >
                      ← Back to Choose UPI App
                    </button>
                  )}
                </div>

                {/* Primary Action on Desktop: Cancel Payment */}
                <div className="pt-1 space-y-2">
                  {directUpiStatus === 'failed' || directUpiStatus === 'expired' || directUpiStatus === 'cancelled' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        id="btn-retry-direct-upi"
                        onClick={handleTryAgain}
                        disabled={isProcessing}
                        className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Try Again</span>
                      </button>
                      <button
                        type="button"
                        id="btn-cancel-direct-upi"
                        onClick={handleCancelPayment}
                        disabled={isCancelling}
                        className="py-3 px-4 rounded-xl border border-slate-300 hover:border-slate-400 bg-white text-slate-700 hover:text-slate-900 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
                      >
                        <X className="w-3.5 h-3.5 text-slate-500" />
                        <span>Cancel Payment</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      id="btn-cancel-direct-upi"
                      onClick={handleCancelPayment}
                      disabled={isCancelling || isProcessing}
                      className="w-full py-3.5 px-6 rounded-2xl border-2 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold text-sm flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      <X className="w-4 h-4 text-slate-500" />
                      <span>Cancel Payment</span>
                    </button>
                  )}
                  <p className="text-center text-[11px] text-slate-400">
                    Your cart remains saved. No charge or order is placed until payment is verified.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* MARKETPLACE PROVIDER (RAZORPAY) FLOW - USED FOR DELIVERY OR WHEN DIRECT UPI NOT ENABLED */
          <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
            {/* Left Payment Options Sidebar */}
            <div className="md:col-span-4 bg-slate-50 border-r border-slate-200 p-3 space-y-1 text-xs">
              <button
                id="tab-razorpay-standard"
                onClick={() => setActiveTab('standard')}
                className={`w-full p-3 rounded-xl flex items-center gap-2.5 transition text-left ${
                  activeTab === 'standard'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <div>
                  <div className="flex items-center gap-1">
                    <span>Razorpay Standard</span>
                    <span className="text-[9px] bg-amber-400 text-slate-950 px-1 rounded font-black">FAST</span>
                  </div>
                  <div className={`text-[10px] ${activeTab === 'standard' ? 'text-blue-100' : 'text-slate-400'}`}>
                    UPI, Cards, NetBanking
                  </div>
                </div>
              </button>

              <button
                id="tab-razorpay-upi"
                onClick={() => setActiveTab('upi')}
                className={`w-full p-3 rounded-xl flex items-center gap-2.5 transition text-left ${
                  activeTab === 'upi'
                    ? 'bg-rose-600 text-white font-bold shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <div>
                  <div>UPI & QR</div>
                  <div className={`text-[10px] ${activeTab === 'upi' ? 'text-rose-100' : 'text-slate-400'}`}>
                    GPay, PhonePe, Paytm
                  </div>
                </div>
              </button>

              <button
                id="tab-razorpay-card"
                onClick={() => setActiveTab('card')}
                className={`w-full p-3 rounded-xl flex items-center gap-2.5 transition text-left ${
                  activeTab === 'card'
                    ? 'bg-rose-600 text-white font-bold shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <div>
                  <div>Cards</div>
                  <div className={`text-[10px] ${activeTab === 'card' ? 'text-rose-100' : 'text-slate-400'}`}>
                    Visa, Mastercard, RuPay
                  </div>
                </div>
              </button>

              <button
                id="tab-razorpay-netbanking"
                onClick={() => setActiveTab('netbanking')}
                className={`w-full p-3 rounded-xl flex items-center gap-2.5 transition text-left ${
                  activeTab === 'netbanking'
                    ? 'bg-rose-600 text-white font-bold shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <div>
                  <div>Net Banking</div>
                  <div className={`text-[10px] ${activeTab === 'netbanking' ? 'text-rose-100' : 'text-slate-400'}`}>
                    All Major Indian Banks
                  </div>
                </div>
              </button>

              <button
                id="tab-razorpay-cod"
                onClick={() => setActiveTab('cod')}
                className={`w-full p-3 rounded-xl flex items-center gap-2.5 transition text-left ${
                  activeTab === 'cod'
                    ? 'bg-rose-600 text-white font-bold shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <div>
                  <div>Cash on Delivery</div>
                  <div className={`text-[10px] ${activeTab === 'cod' ? 'text-rose-100' : 'text-slate-400'}`}>
                    Pay cash upon delivery
                  </div>
                </div>
              </button>
            </div>

            {/* Right Tab Content View */}
            <div className="md:col-span-8 p-5 sm:p-6 overflow-y-auto max-h-[60vh] md:max-h-full bg-white">
              {/* 0. Razorpay Standard Tab */}
              {activeTab === 'standard' && (
                <div className="space-y-5 text-center py-2">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto text-2xl shadow-xs">
                    ⚡
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">Razorpay One-Click Checkout</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Pay securely using Google Pay, PhonePe, Paytm, UPI, Debit/Credit Cards or NetBanking.
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Merchant:</span>
                      <span className="font-bold text-slate-900">{restaurantName || 'MOZZ Chinese & Pizzateria'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Payment Protection:</span>
                      <span className="font-semibold text-emerald-600 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> 256-bit Bank Verified
                      </span>
                    </div>
                    <div className="flex justify-between text-xs pt-1 border-t border-slate-200">
                      <span className="text-slate-700 font-bold">Total Bill:</span>
                      <span className="font-black text-rose-600 text-sm">₹{grandTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    id="btn-pay-razorpay-standard"
                    onClick={() => launchRazorpayCheckout()}
                    disabled={isProcessing}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-rose-600 to-amber-600 hover:opacity-95 text-white font-bold text-sm shadow-md shadow-blue-950/20 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50"
                  >
                    <Zap className="w-4 h-4 text-amber-300" />
                    <span>Pay ₹{grandTotal.toFixed(2)} with Razorpay</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </button>
                </div>
              )}

              {/* 1. UPI & QR Tab */}
              {activeTab === 'upi' && (
                <div className="space-y-5 text-center py-2">
                  <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto text-2xl shadow-xs">
                    <QrCode className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">UPI & QR Code Payment</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Pay instantly via Google Pay, PhonePe, Paytm, BHIM, or any UPI App through Razorpay.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                      Google Pay
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                      PhonePe
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                      Paytm UPI
                    </div>
                  </div>

                  <button
                    id="btn-pay-razorpay-upi"
                    onClick={() => launchRazorpayCheckout({ method: 'upi' })}
                    disabled={isProcessing}
                    className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Pay ₹{grandTotal.toFixed(2)} via UPI Gateway</span>
                  </button>
                </div>
              )}

              {/* 2. Debit & Credit Cards */}
              {activeTab === 'card' && (
                <div className="space-y-5 text-center py-2">
                  <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto text-2xl shadow-xs">
                    <CreditCard className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">Debit & Credit Cards</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Visa, MasterCard, RuPay, Maestro and Diners Club cards accepted with OTP 3D-Secure verification.
                    </p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800">Bank-Grade 3D Secure Protection</p>
                    <p className="text-[11px] text-slate-500">Your card credentials are encrypted directly with the RBI-authorized gateway.</p>
                  </div>

                  <button
                    id="btn-pay-razorpay-card"
                    onClick={() => launchRazorpayCheckout({ method: 'card' })}
                    disabled={isProcessing}
                    className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Pay ₹{grandTotal.toFixed(2)} via Secure Card</span>
                  </button>
                </div>
              )}

              {/* 3. NetBanking */}
              {activeTab === 'netbanking' && (
                <div className="space-y-5 text-center py-2">
                  <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto text-2xl shadow-xs">
                    <Building2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">Net Banking</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Over 50+ Indian banks supported including HDFC, ICICI, SBI, Axis, and Kotak.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto text-xs font-semibold text-slate-700">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">HDFC</div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">ICICI</div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">SBI</div>
                  </div>

                  <button
                    id="btn-pay-razorpay-netbanking"
                    onClick={() => launchRazorpayCheckout({ method: 'netbanking' })}
                    disabled={isProcessing}
                    className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Proceed to NetBanking Portal</span>
                  </button>
                </div>
              )}

              {/* 4. Cash on Delivery (COD) */}
              {activeTab === 'cod' && (
                <div className="text-center space-y-4 py-3">
                  <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto text-2xl shadow-2xs">
                    💵
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">Cash on Delivery (COD)</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Keep exact cash of ₹{grandTotal.toFixed(2)} ready at delivery. UPI on delivery is also accepted by the delivery rider.
                    </p>
                  </div>

                  <button
                    id="btn-confirm-cod-order"
                    onClick={handleConfirmCodOrder}
                    disabled={isProcessing}
                    className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition disabled:opacity-50"
                  >
                    Confirm Order with Cash on Delivery
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Security Badge */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 px-5">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            PCI-DSS Level 1 Certified 256-bit Encryption
          </span>
          <span className="text-slate-700 font-semibold">MOZZ Kitchens Pvt Ltd</span>
        </div>
      </div>
    </div>
  );
};
