import React from 'react';
import { useStore } from '../context/StoreContext';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export const CartConflictModal: React.FC = () => {
  const { crossRestaurantConflict, resolveCrossRestaurantConflict } = useStore();

  if (!crossRestaurantConflict) return null;

  const { existingRestaurantName, newRestaurantName, pendingItem } = crossRestaurantConflict;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-slate-800">
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <button
            onClick={() => resolveCrossRestaurantConflict(false)}
            className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-900">Replace Cart Items?</h3>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Your cart contains items from <strong className="text-slate-900">{existingRestaurantName}</strong>.
            Would you like to clear your existing cart and start a new order from <strong className="text-slate-900">{newRestaurantName}</strong>?
          </p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
          <span>Adding: <strong className="text-slate-900">{pendingItem.menuItem.name}</strong></span>
          <span className="font-bold text-slate-900">₹{pendingItem.unitPrice * pendingItem.quantity}</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={() => resolveCrossRestaurantConflict(false)}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
          >
            Keep Existing Cart
          </button>
          <button
            onClick={() => resolveCrossRestaurantConflict(true)}
            className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-rose-200"
          >
            <Trash2 className="w-4 h-4" />
            Clear Cart & Continue
          </button>
        </div>
      </div>
    </div>
  );
};
