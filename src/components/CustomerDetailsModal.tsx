import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { User, Phone, CheckCircle2, X, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react';

interface CustomerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  subtitle?: string;
}

export const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Enter Customer Details',
  subtitle = 'Please provide your name and mobile number for your order updates.',
}) => {
  const { customerDetails, setCustomerDetails } = useStore();

  const [name, setName] = useState(customerDetails.name || '');
  const [phone, setPhone] = useState(customerDetails.phone || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(customerDetails.name || '');
      setPhone(customerDetails.phone || '');
      setError('');
    }
  }, [isOpen, customerDetails.name, customerDetails.phone]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const cleanPhone = phone.trim().replace(/\D/g, '');

    if (!trimmedName) {
      setError('Please enter your full name');
      return;
    }

    if (trimmedName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    // Strict Indian mobile number validation (10 digits starting with 6, 7, 8, or 9)
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setError('Please enter a valid 10-digit Indian mobile number (starts with 6, 7, 8, or 9)');
      return;
    }

    // Save to store context & localStorage
    setCustomerDetails({
      name: trimmedName,
      phone: cleanPhone,
    });

    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 text-slate-800 shadow-2xl relative overflow-hidden">
        {/* Top decorative gradient bar */}
        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-500 via-rose-500 to-amber-500" />

        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold">
              <Phone className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" />
              Customer Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              id="customer-name-input"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name (e.g. Rahul Sharma)"
              className="w-full bg-slate-50 border border-slate-200 focus:border-rose-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              Mobile Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs font-bold text-slate-500 pointer-events-none">
                +91
              </span>
              <input
                type="tel"
                id="customer-phone-input"
                required
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= 10) setPhone(val);
                }}
                placeholder="10-digit mobile number (e.g. 9876543210)"
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl pl-12 pr-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 outline-none transition"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <span>📱</span> We will send your order confirmation & live tracking updates to this mobile number.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              id="customer-submit-btn"
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 via-rose-600 to-amber-600 hover:opacity-95 text-white font-bold text-sm shadow-md shadow-emerald-950/20 active:scale-[0.99] transition flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Continue to Order</span>
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>100% Privacy Protected • Razorpay Verified Gateway</span>
          </div>
        </form>
      </div>
    </div>
  );
};
