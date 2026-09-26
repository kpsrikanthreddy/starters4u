import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { PizzaShape, CartItemAddon, CartItem } from '../types';
import { SHAPE_DETAILS, POCKET_PIZZA_ADDONS, BEVERAGES_ADDONS } from '../data/menuData';
import { X, Sparkles, Plus, Minus, Check, Flame, Layers } from 'lucide-react';

export const PizzaCustomizerModal: React.FC = () => {
  const {
    isCustomizerOpen,
    selectedCustomizerItem,
    closeCustomizer,
    addToCart,
    promptCustomerVerification,
  } = useStore();

  const [shape, setShape] = useState<PizzaShape>('C');
  const [crust, setCrust] = useState<string>('Korean Pocket Crust');
  const [spiceLevel, setSpiceLevel] = useState<'Mild' | 'Medium' | 'Authentic Spicy'>('Medium');
  const [selectedAddons, setSelectedAddons] = useState<CartItemAddon[]>([]);
  const [instructions, setInstructions] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);

  useEffect(() => {
    if (selectedCustomizerItem) {
      setShape('C');
      setCrust('Korean Pocket Crust');
      setSpiceLevel(selectedCustomizerItem.spicyLevel && selectedCustomizerItem.spicyLevel > 1 ? 'Medium' : 'Mild');
      setSelectedAddons([]);
      setInstructions('');
      setQuantity(1);
    }
  }, [selectedCustomizerItem]);

  if (!isCustomizerOpen || !selectedCustomizerItem) return null;

  const isPocketPizza = selectedCustomizerItem.isPocketPizza;

  // Base price
  let basePrice = 0;
  if (isPocketPizza && selectedCustomizerItem.prices) {
    basePrice = selectedCustomizerItem.prices[shape];
  } else {
    basePrice = selectedCustomizerItem.price || 0;
  }

  // Crust cost
  const crustCost = crust.includes('Cheese Burst') ? 40 : 0;

  // Addons cost
  const addonsCost = selectedAddons.reduce((sum, a) => sum + a.price, 0);

  const unitTotal = basePrice + crustCost + addonsCost;
  const grandTotal = unitTotal * quantity;

  const toggleAddon = (addon: CartItemAddon) => {
    setSelectedAddons((prev) => {
      const exists = prev.some((a) => a.id === addon.id);
      if (exists) {
        return prev.filter((a) => a.id !== addon.id);
      }
      return [...prev, addon];
    });
  };

  const handleAddToCart = () => {
    promptCustomerVerification(() => {
      const newCartItem: CartItem = {
        cartItemId: `${selectedCustomizerItem.id}-${shape}-${Date.now()}`,
        menuItem: selectedCustomizerItem,
        selectedShape: isPocketPizza ? shape : undefined,
        selectedCrust: isPocketPizza ? crust : undefined,
        spiceLevel: spiceLevel,
        addons: selectedAddons,
        specialInstructions: instructions.trim() || undefined,
        unitPrice: unitTotal,
        quantity,
      };

      addToCart(newCartItem);
      closeCustomizer();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col text-slate-800 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 bg-white flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                Customizing
              </span>
              {isPocketPizza && (
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" /> Korean Pocket Pizza
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">{selectedCustomizerItem.name}</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-md">{selectedCustomizerItem.description}</p>
          </div>

          <button
            onClick={closeCustomizer}
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* 1. Shape Selection (For Pocket Pizzas) */}
          {isPocketPizza && selectedCustomizerItem.prices && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-rose-500" /> 1. Select Pocket Shape & Size
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['R', 'C', 'S'] as PizzaShape[]).map((shapeKey) => {
                  const details = SHAPE_DETAILS[shapeKey];
                  const price = selectedCustomizerItem.prices![shapeKey];
                  const isSelected = shape === shapeKey;

                  return (
                    <div
                      key={shapeKey}
                      onClick={() => setShape(shapeKey)}
                      className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                        isSelected
                          ? 'bg-rose-50 border-rose-500 shadow-xs ring-1 ring-rose-500'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-black px-2 py-0.5 rounded ${
                            isSelected ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            [{shapeKey}] {details.tier}
                          </span>
                          <span className="text-xs font-black text-rose-600">₹{price}</span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm">{details.name}</h4>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">{details.tagline}</p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between">
                        <span>{details.serves}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-rose-600 font-bold" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Crust Preference */}
          {isPocketPizza && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                2. Choose Pocket Crust Style
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => setCrust('Korean Pocket Crust')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                    crust === 'Korean Pocket Crust'
                      ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-500'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="font-bold text-slate-900 text-xs">Standard Korean Pocket Crust</div>
                    <div className="text-[11px] text-slate-500">Crisp golden dough with standard mozzarella fold</div>
                  </div>
                  <span className="text-xs text-slate-500 font-bold">Free</span>
                </div>

                <div
                  onClick={() => setCrust('Cheese Burst Pocket')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                    crust === 'Cheese Burst Pocket'
                      ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-500'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="font-bold text-rose-700 text-xs">Extra Cheese Burst Pocket</div>
                    <div className="text-[11px] text-slate-500">Gooey molten cheese injected inside outer pocket edges</div>
                  </div>
                  <span className="text-xs text-rose-600 font-bold">+₹40</span>
                </div>
              </div>
            </div>
          )}

          {/* 3. Spice Level */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-rose-500" />
              {isPocketPizza ? '3.' : '1.'} Spice Level Preference
            </label>

            <div className="grid grid-cols-3 gap-3">
              {(['Mild', 'Medium', 'Authentic Spicy'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSpiceLevel(level)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold text-center transition ${
                    spiceLevel === level
                      ? 'bg-rose-50 border-rose-500 text-rose-700 ring-1 ring-rose-500'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {level === 'Mild' && '🌿 Mild'}
                  {level === 'Medium' && '🌶️ Medium'}
                  {level === 'Authentic Spicy' && '🔥 Extra Hot'}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Add-on Dips & Enhancements */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              {isPocketPizza ? '4.' : '2.'} Add-on Dips & Chilled Drinks
            </label>

            <div className="space-y-2">
              {[...POCKET_PIZZA_ADDONS, ...BEVERAGES_ADDONS].map((addon) => {
                const isSelected = selectedAddons.some((a) => a.id === addon.id);
                return (
                  <div
                    key={addon.id}
                    onClick={() => toggleAddon(addon)}
                    className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-rose-50 border-rose-400 text-slate-900'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                        isSelected ? 'bg-rose-600 border-rose-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="text-xs font-medium">{addon.name}</span>
                    </div>
                    <span className="text-xs font-bold text-rose-600">+₹{addon.price}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. Special Cooking Instructions */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Special Chef Instructions (Optional)
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Extra crispy crust, dip on the side, no raw onion"
              maxLength={100}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:bg-white transition"
            />
          </div>
        </div>

        {/* Modal Sticky Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          {/* Quantity Stepper */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-bold text-slate-900">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add to Cart CTA */}
          <button
            onClick={handleAddToCart}
            id="modal-add-to-cart-btn"
            className="flex-1 py-3 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-xs flex items-center justify-between transition active:scale-[0.99]"
          >
            <span>Add to Order</span>
            <span className="text-white font-black">₹{grandTotal}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
