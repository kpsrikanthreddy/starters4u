import React from 'react';
import { X, Sparkles, CheckCircle, ShieldCheck, Flame, Heart } from 'lucide-react';
import { SHAPE_DETAILS } from '../data/menuData';

interface ShapeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectShapeFilter?: (shape: 'R' | 'C' | 'S') => void;
}

export const ShapeGuideModal: React.FC<ShapeGuideModalProps> = ({
  isOpen,
  onClose,
  onSelectShapeFilter,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 text-slate-800 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center max-w-xl mx-auto mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5 text-rose-600" />
            Introducing Korean-Style Pocket Pizzas
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Choose Your Pizza Shape
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Freshly baked to order with our premium in-house cheese blend folded inside hand-stretched golden pocket dough.
          </p>
        </div>

        {/* 3 Shape Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Rectangular [R] */}
          <div className="bg-slate-50/70 border border-slate-200 hover:border-rose-300 rounded-2xl p-5 flex flex-col items-center text-center transition group hover:bg-white hover:shadow-sm">
            {/* Visual Icon */}
            <div className="w-24 h-16 rounded-lg bg-gradient-to-r from-rose-500 via-amber-500 to-rose-400 p-0.5 mb-4 shadow-sm group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-white rounded-[6px] flex flex-col items-center justify-center p-2 relative overflow-hidden">
                <div className="absolute inset-0 bg-rose-50/50 flex items-center justify-center">
                  <div className="w-16 h-8 border-2 border-dashed border-rose-400 rounded flex items-center justify-center">
                    <span className="text-xs font-black text-rose-600">R</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="inline-block px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-xs mb-1">
              [R] REGULAR
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">Rectangular</h3>
            <p className="text-xs text-rose-600 font-semibold italic mt-0.5 mb-2">
              "Bigger bites, more delight."
            </p>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Long handheld pocket crust loaded edge-to-edge. Ideal for individual cravings and crisp handheld bites.
            </p>
            <div className="mt-auto w-full pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-400">Size:</span>
              <span className="font-semibold text-slate-700">Regular Pocket</span>
            </div>
          </div>

          {/* Circular [C] */}
          <div className="bg-white border-2 border-rose-500 rounded-2xl p-5 flex flex-col items-center text-center transition group relative shadow-md">
            <div className="absolute -top-3 bg-rose-600 text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider shadow-xs">
              Classic Choice
            </div>

            {/* Visual Icon */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-rose-500 via-amber-500 to-rose-400 p-0.5 mb-4 shadow-sm group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-white rounded-full flex flex-col items-center justify-center p-2 relative overflow-hidden">
                <div className="w-14 h-14 rounded-full border-2 border-dashed border-rose-500 flex items-center justify-center bg-rose-50">
                  <span className="text-xs font-black text-rose-600">C</span>
                </div>
              </div>
            </div>

            <div className="inline-block px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-xs mb-1 border border-rose-200">
              [C] CLASSIC
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">Circular</h3>
            <p className="text-xs text-rose-600 font-semibold italic mt-0.5 mb-2">
              "Classic shape, timeless taste."
            </p>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              The timeless round deep-dish pocket. Perfect balance between bubbling cheese core and golden crust.
            </p>
            <div className="mt-auto w-full pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-400">Size:</span>
              <span className="font-semibold text-slate-700">Classic Pocket</span>
            </div>
          </div>

          {/* Square [S] */}
          <div className="bg-slate-50/70 border border-slate-200 hover:border-rose-300 rounded-2xl p-5 flex flex-col items-center text-center transition group hover:bg-white hover:shadow-sm">
            {/* Visual Icon */}
            <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 p-0.5 mb-4 shadow-sm group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-white rounded-[10px] flex flex-col items-center justify-center p-2 relative overflow-hidden">
                <div className="w-14 h-14 border-2 border-dashed border-rose-400 rounded-md flex items-center justify-center bg-rose-50/50">
                  <span className="text-xs font-black text-rose-600">S</span>
                </div>
              </div>
            </div>

            <div className="inline-block px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-xs mb-1">
              [S] SIGNATURE
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">Square</h3>
            <p className="text-xs text-rose-600 font-semibold italic mt-0.5 mb-2">
              "Perfect edges, perfect share."
            </p>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Signature jumbo square pocket. Loaded with double in-house cheese blend & extra toppings to the corners.
            </p>
            <div className="mt-auto w-full pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-400">Size:</span>
              <span className="font-semibold text-slate-700">Shareable Pocket</span>
            </div>
          </div>
        </div>

        {/* Brand Promises Grid */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
          <h4 className="text-xs font-bold uppercase tracking-widest text-rose-600 mb-3 text-center">
            The MOZZ Pizzateria Promise
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="flex flex-col items-center p-2">
              <span className="text-lg mb-1">🌾</span>
              <span className="text-[11px] font-semibold text-slate-800">Fresh Dough Prepared Daily</span>
            </div>
            <div className="flex flex-col items-center p-2">
              <span className="text-lg mb-1">🧀</span>
              <span className="text-[11px] font-semibold text-slate-800">Premium In-House Cheese Blend</span>
            </div>
            <div className="flex flex-col items-center p-2">
              <span className="text-lg mb-1">🥟</span>
              <span className="text-[11px] font-semibold text-slate-800">Korean Pocket Style</span>
            </div>
            <div className="flex flex-col items-center p-2">
              <span className="text-lg mb-1">🔥</span>
              <span className="text-[11px] font-semibold text-slate-800">Freshly Baked to Order</span>
            </div>
            <div className="flex flex-col items-center p-2 col-span-2 sm:col-span-1">
              <span className="text-lg mb-1">⭐</span>
              <span className="text-[11px] font-semibold text-slate-800">Consistent Great Taste</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={onClose}
            className="px-8 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-xs transition"
          >
            Explore Pocket Pizzas Now
          </button>
        </div>
      </div>
    </div>
  );
};
