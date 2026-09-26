import React, { useState } from 'react';
import { MenuItem, PizzaShape, CartItem } from '../types';
import { useStore } from '../context/StoreContext';
import { useRestaurant } from '../context/RestaurantContext';
import { Flame, Plus, Minus, Check, SlidersHorizontal, Sparkles } from 'lucide-react';
import { SHAPE_DETAILS } from '../data/menuData';

interface FoodCardProps {
  item: MenuItem;
}

export const FoodCard: React.FC<FoodCardProps> = ({ item }) => {
  const { isSuspended } = useRestaurant();
  const {
    cart,
    addToCart,
    updateCartQuantity,
    openCustomizer,
    promptCustomerVerification,
  } = useStore();

  // Default shape for pocket pizzas is 'C' (Circular - Classic)
  const [selectedShape, setSelectedShape] = useState<PizzaShape>('C');
  const [imageError, setImageError] = useState(false);

  // Check if item is already in cart
  const cartItemsForThisProduct = cart.filter((c) => c.menuItem.id === item.id);
  const totalQtyInCart = cartItemsForThisProduct.reduce((sum, c) => sum + c.quantity, 0);

  // Price for pocket pizza based on selected shape, or base price for regular items
  const currentPrice = item.isPocketPizza && item.prices
    ? item.prices[selectedShape]
    : item.price || 0;

  const performAddToCart = () => {
    if (item.isPocketPizza) {
      // Add with selected shape and default crust
      const newCartItem: CartItem = {
        cartItemId: `${item.id}-${selectedShape}-${Date.now()}`,
        menuItem: item,
        selectedShape,
        selectedCrust: 'Korean Pocket Crust',
        spiceLevel: item.spicyLevel && item.spicyLevel > 1 ? 'Medium' : 'Mild',
        addons: [],
        unitPrice: currentPrice,
        quantity: 1,
      };
      addToCart(newCartItem);
    } else {
      const newCartItem: CartItem = {
        cartItemId: `${item.id}-std-${Date.now()}`,
        menuItem: item,
        addons: [],
        unitPrice: item.price || 0,
        quantity: 1,
      };
      addToCart(newCartItem);
    }
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.inStock) return;

    // Check / prompt customer name & WhatsApp number before adding to cart
    promptCustomerVerification(() => {
      performAddToCart();
    });
  };

  const handleOpenCustomize = (e: React.MouseEvent) => {
    e.stopPropagation();
    promptCustomerVerification(() => {
      openCustomizer(item);
    });
  };

  // Dietary symbol
  const renderDietaryIcon = () => {
    if (item.dietary === 'veg') {
      return (
        <span
          title="100% Pure Vegetarian"
          className="w-4 h-4 rounded-sm border-2 border-emerald-500 flex items-center justify-center p-0.5 flex-shrink-0"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
        </span>
      );
    }
    if (item.dietary === 'non-veg') {
      return (
        <span
          title="Non-Vegetarian"
          className="w-4 h-4 rounded-sm border-2 border-red-500 flex items-center justify-center p-0.5 flex-shrink-0"
        >
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
        </span>
      );
    }
    if (item.dietary === 'egg') {
      return (
        <span
          title="Contains Egg"
          className="w-4 h-4 rounded-sm border-2 border-amber-500 flex items-center justify-center p-0.5 flex-shrink-0"
        >
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
        </span>
      );
    }
    return (
      <span
        title="Dessert Sweet"
        className="w-4 h-4 rounded-sm border-2 border-purple-400 flex items-center justify-center p-0.5 flex-shrink-0"
      >
        <span className="w-2 h-2 rounded-full bg-purple-400"></span>
      </span>
    );
  };

  return (
    <div
      id={`food-card-${item.id}`}
      className={`bg-white border rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-sm ${
        item.inStock
          ? 'border-slate-200 hover:border-slate-300'
          : 'border-slate-100 opacity-60 bg-slate-50'
      }`}
    >
      {/* Card Header: Dietary Icon, Badges, Spicy Indicator */}
      <div>
        {item.image && !imageError && (
          <div className="relative w-full h-36 mb-3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
            <img
              src={item.image}
              alt={item.name}
              loading="lazy"
              onError={() => setImageError(true)}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {renderDietaryIcon()}
            {item.badge && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                {item.badge}
              </span>
            )}
            {item.isChefSpecial && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                Chef Special
              </span>
            )}
          </div>

          {/* Spicy chillies */}
          {item.spicyLevel && item.spicyLevel > 0 ? (
            <div className="flex items-center text-rose-500 text-xs" title={`Spicy Level: ${item.spicyLevel}/3`}>
              {Array.from({ length: item.spicyLevel }).map((_, i) => (
                <Flame key={i} className="w-3.5 h-3.5 fill-rose-500" />
              ))}
            </div>
          ) : null}
        </div>

        {/* Item Title & Description */}
        <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-snug mb-1.5">
          {item.name}
        </h3>
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">
          {item.description}
        </p>

        {/* Shape Selector for Korean Pocket Pizzas */}
        {item.isPocketPizza && item.prices && item.inStock && (
          <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 px-1 flex items-center justify-between">
              <span>Select Pocket Shape:</span>
              <span className="text-rose-600 font-semibold">
                {SHAPE_DETAILS[selectedShape].name} ({SHAPE_DETAILS[selectedShape].tier})
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(['R', 'C', 'S'] as PizzaShape[]).map((shape) => {
                const isSelected = selectedShape === shape;
                const price = item.prices ? item.prices[shape] : 0;
                return (
                  <button
                    key={shape}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedShape(shape);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-center transition flex flex-col items-center justify-center ${
                      isSelected
                        ? 'bg-rose-600 text-white font-black shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span className="text-xs font-bold leading-none">[{shape}]</span>
                    <span className={`text-[10px] mt-0.5 font-semibold ${isSelected ? 'text-rose-100' : 'text-slate-500'}`}>
                      ₹{price}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Card Footer: Price & Action Buttons */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-2">
        {/* Price display */}
        <div>
          <div className="text-[11px] text-slate-400 font-medium">
            {item.isPocketPizza ? `${SHAPE_DETAILS[selectedShape].tier} Pocket` : 'Price'}
          </div>
          <div className="text-lg font-black text-slate-900">
            ₹{currentPrice}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isSuspended ? (
            <span
              className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold select-none"
              title="Ordering is currently suspended for this restaurant"
            >
              Paused
            </span>
          ) : (
            <>
              {item.isPocketPizza && item.inStock && (
                <button
                  onClick={handleOpenCustomize}
                  title="Customize Crust, Dips & Spice Level"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 transition flex items-center gap-1 text-xs font-semibold"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-rose-500" />
                  <span className="hidden sm:inline">Customize</span>
                </button>
              )}

              {!item.inStock ? (
                <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold">
                  Sold Out
                </span>
              ) : !item.isPocketPizza && totalQtyInCart > 0 ? (
                // Stepper counter for regular items
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden p-0.5">
                  <button
                    onClick={() => {
                      const firstCartItem = cartItemsForThisProduct[0];
                      if (firstCartItem) {
                        updateCartQuantity(firstCartItem.cartItemId, -1);
                      }
                    }}
                    className="w-7 h-7 flex items-center justify-center text-rose-600 hover:bg-slate-200 rounded-lg transition"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 text-xs font-bold text-slate-900 min-w-[20px] text-center">
                    {totalQtyInCart}
                  </span>
                  <button
                    onClick={() => {
                      const firstCartItem = cartItemsForThisProduct[0];
                      if (firstCartItem) {
                        updateCartQuantity(firstCartItem.cartItemId, 1);
                      }
                    }}
                    className="w-7 h-7 flex items-center justify-center text-rose-600 hover:bg-slate-200 rounded-lg transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                // Standard Add button
                <button
                  onClick={handleQuickAdd}
                  id={`add-btn-${item.id}`}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs active:scale-95 transition flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>ADD</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
