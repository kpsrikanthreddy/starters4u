import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { useRestaurant } from '../context/RestaurantContext';
import { BUSINESS_INFO, getFormattedLocation } from '../config/businessInfo';
import {
  ShoppingBag,
  Clock,
  ShieldAlert,
  Volume2,
  VolumeX,
  MapPin,
  Flame,
  UtensilsCrossed,
  Sparkles,
  Phone,
  HelpCircle,
  Menu as MenuIcon,
  X,
  Lock,
  ShieldCheck,
  QrCode,
  ExternalLink,
  Search,
} from 'lucide-react';
import { OrderType } from '../types';
import { SearchModal } from './SearchModal';

interface NavbarProps {
  currentView: 'menu' | 'track' | string;
  onNavigate: (view: 'menu' | 'track') => void;
  onOpenShapeGuide: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  onOpenShapeGuide,
}) => {
  const {
    itemCount,
    grandTotal,
    setIsCartOpen,
    activeOrder,
    orderType,
    setOrderType,
    tableNumber,
    setTableNumber,
    qrSession,
    isModeLocked,
    switchQRSession,
    clearQRSession,
    soundEnabled,
    toggleSound,
    isAdminAuthenticated,
    customerDetails,
    isCustomerVerified,
    setIsCustomerModalOpen,
  } = useStore();

  const {
    restaurantName,
    tagline,
    logoUrl,
    selectedBranch,
    isFlagship,
    phone,
    address,
    estimatedDeliveryMinutes,
    deliveryRadiusKm,
  } = useRestaurant();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [showQRInfoModal, setShowQRInfoModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');

  // Global keyboard shortcut (Cmd+K / Ctrl+K / slash) to open search
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an existing input or textarea
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-800 shadow-xs">
      {/* Top micro banner */}
      <div className="bg-slate-900 px-4 py-1.5 text-xs text-slate-300 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950 shrink-0">
              {isFlagship ? 'NEW' : 'LIVE'}
            </span>
            <span className="font-medium text-slate-200 truncate">
              {isFlagship
                ? 'Korean-Style Pocket Pizzas in 3 Shapes: [R] Rectangular, [C] Circular, [S] Square!'
                : `${restaurantName} • Fresh Craft Orders Delivered Hot & Fast!`}
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-4 text-[11px] text-slate-400 shrink-0">
            {isFlagship && (
              <>
                <button
                  onClick={onOpenShapeGuide}
                  className="hover:text-amber-300 underline underline-offset-2 flex items-center gap-1 transition cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Shape Guide (R, C, S)
                </button>
                <span className="text-slate-600">•</span>
              </>
            )}
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="w-3 h-3 text-rose-400" /> 11:00 AM – 11:30 PM
            </span>
            {isFlagship && (
              <>
                <span className="text-slate-600">•</span>
                <a
                  href="https://instagram.com/mozzpizzateria"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 hover:text-amber-300 font-semibold"
                >
                  @mozzpizzateria
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18 gap-2 sm:gap-3">
          {/* [Restaurant/Location] Left Container */}
          <div className="flex items-center gap-2 sm:gap-2.5 lg:gap-3 min-w-0">
            {/* Brand Logo & Name */}
            <div
              onClick={() => onNavigate('menu')}
              className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group min-w-0 shrink"
              id="brand-logo"
            >
              {/* Logo Badge */}
              {isFlagship ? (
                <div className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 p-0.5 shadow-md shadow-rose-950/10 group-hover:scale-105 transition-transform duration-200 shrink-0">
                  <div className="w-full h-full bg-slate-900 rounded-[9px] flex flex-col items-center justify-center p-0.5 text-center">
                    <span className="text-[10px] sm:text-xs font-black tracking-tighter text-amber-400 leading-none">
                      m<span className="text-rose-500">O</span>zz
                    </span>
                    <span className="text-[6px] sm:text-[7px] font-bold tracking-widest text-slate-300 uppercase">
                      Pocket
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-rose-500 p-0.5 shadow-md group-hover:scale-105 transition-transform duration-200 shrink-0">
                  <div className="w-full h-full bg-slate-900 rounded-[9px] flex flex-col items-center justify-center p-0.5 text-center">
                    <span className="text-[11px] sm:text-xs font-black tracking-wider text-amber-400 leading-none uppercase">
                      {restaurantName.slice(0, 3)}
                    </span>
                    <span className="text-[6px] sm:text-[7px] font-bold tracking-widest text-slate-300 uppercase">
                      Craft
                    </span>
                  </div>
                </div>
              )}

              {/* Brand Title */}
              <div className="min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <span className="text-lg sm:text-xl lg:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 bg-clip-text text-transparent truncate">
                    {isFlagship ? 'MOZZ' : restaurantName}
                  </span>
                  <span className="hidden 2xl:inline-block text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200 whitespace-nowrap shrink-0">
                    {isFlagship ? 'Chinese & Pizzateria' : (selectedBranch?.name || 'Kitchen')}
                  </span>
                </div>
              </div>
            </div>

            {/* Live Location Pill (Part of Restaurant/Location) */}
            <button
              onClick={() => setShowLocationModal(true)}
              id="navbar-live-location-btn"
              className="hidden sm:flex items-center gap-1.5 px-2 py-1 lg:px-2.5 lg:py-1.5 rounded-xl text-xs font-semibold text-emerald-900 bg-emerald-50/90 hover:bg-emerald-100/90 border border-emerald-200/90 transition-all cursor-pointer shadow-2xs shrink-0"
              title={`Verified Kitchen Location: ${selectedBranch?.locality || 'Hyderabad'}. Click for live delivery & takeaway details.`}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="font-bold text-emerald-950 text-xs truncate max-w-[90px] lg:max-w-[140px]">
                {selectedBranch?.locality || (isFlagship ? 'Gachibowli' : (selectedBranch?.name || 'Hyderabad'))}
              </span>
              <span className="text-[9px] px-1 py-0.2 bg-emerald-200/70 text-emerald-900 rounded font-black uppercase tracking-wider shrink-0">
                LIVE
              </span>
            </button>
          </div>

          {/* Right Action Bar: [Full Menu] [Order Tracking] [Phone] [Takeaway] [Sound] [Cart] [Mobile Menu] */}
          <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 shrink-0 ml-auto">
            {/* [Full Menu] */}
            <button
              onClick={() => onNavigate('menu')}
              id="navbar-full-menu-btn"
              className={`hidden md:flex items-center gap-1 lg:gap-1.5 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-xl text-xs lg:text-sm font-semibold transition-all shrink-0 cursor-pointer ${
                currentView === 'menu'
                  ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Explore Full Menu"
            >
              <UtensilsCrossed className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
              <span className="hidden lg:inline">Full Menu</span>
              <span className="lg:hidden">Menu</span>
            </button>

            {/* [Order Tracking] */}
            <button
              onClick={() => onNavigate('track')}
              id="navbar-order-tracking-btn"
              className={`hidden md:flex items-center gap-1 lg:gap-1.5 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-xl text-xs lg:text-sm font-semibold transition-all relative shrink-0 cursor-pointer ${
                currentView === 'track'
                  ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Track Live Order"
            >
              <Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
              <span className="hidden lg:inline">Order Tracking</span>
              <span className="lg:hidden">Track</span>
              {activeOrder && activeOrder.status !== 'delivered' && activeOrder.status !== 'cancelled' && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
              )}
            </button>

            {/* [Phone] Customer Details */}
            <button
              onClick={() => setIsCustomerModalOpen(true)}
              id="header-customer-details-btn"
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-xl border text-xs font-semibold transition shrink-0 cursor-pointer ${
                isCustomerVerified
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 shadow-2xs'
              }`}
              title={isCustomerVerified ? 'Click to edit Customer Details' : 'Enter Customer Details'}
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-bold whitespace-nowrap">
                {isCustomerVerified
                  ? `${customerDetails.name} (+91 ${customerDetails.phone.slice(-4)})`
                  : 'Enter Customer Details'}
              </span>
            </button>

            {/* [Takeaway] Dining Mode Selector Pill */}
            {isModeLocked ? (
              <button
                onClick={() => setShowQRInfoModal(true)}
                id="navbar-dining-mode-btn"
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-xl bg-amber-50/90 border border-amber-300 text-xs text-amber-950 hover:bg-amber-100 transition shadow-xs shrink-0 cursor-pointer"
                title="Entry source verified and locked by QR token. Click for details or testing."
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-bold whitespace-nowrap">
                  {qrSession.source === 'table_qr'
                    ? `${tableNumber || qrSession.tableNumber || 'Table 1'} (Dine-In)`
                    : 'Counter (Takeaway)'}
                </span>
                <Lock className="w-3 h-3 text-amber-700 shrink-0" />
              </button>
            ) : (
              <button
                onClick={() => setShowOrderTypeModal(true)}
                id="navbar-dining-mode-btn"
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 hover:bg-slate-200 transition shrink-0 cursor-pointer"
                title="Change Delivery / Takeaway"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="capitalize font-semibold text-slate-800 whitespace-nowrap">
                  {orderType === 'delivery' ? (
                    <>
                      <span className="hidden lg:inline">Home Delivery</span>
                      <span className="lg:hidden">Delivery</span>
                    </>
                  ) : (
                    'Takeaway'
                  )}
                </span>
                <span className="text-[10px] text-slate-500 hidden lg:inline">Edit</span>
              </button>
            )}

            {/* [Sound] Kitchen Chimes Toggle - Directly after Takeaway */}
            <button
              onClick={toggleSound}
              id="navbar-sound-toggle-btn"
              aria-label="Toggle Sound"
              className="p-2 sm:p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition shrink-0 min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer"
              title={soundEnabled ? 'Mute Kitchen Chimes' : 'Enable Kitchen Chimes'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-600 shrink-0" /> : <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />}
            </button>

            {/* [Cart ₹XX] Cart Trigger - Directly after Sound */}
            <button
              onClick={() => setIsCartOpen(true)}
              id="cart-drawer-trigger"
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-2 sm:px-3.5 sm:py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-xs sm:text-sm shadow-sm shadow-rose-600/20 active:scale-95 transition-all shrink-0 min-h-[38px] cursor-pointer"
              title="Open Shopping Cart"
            >
              <div className="relative shrink-0">
                <ShoppingBag className="w-4 h-4" />
                {itemCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-amber-400 text-slate-950 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                    {itemCount}
                  </span>
                )}
              </div>
              <span className="whitespace-nowrap font-bold">
                {itemCount > 0 ? (
                  <>
                    <span className="hidden sm:inline">Cart </span>₹{grandTotal.toFixed(0)}
                  </>
                ) : (
                  'Cart'
                )}
              </span>
            </button>

            {/* Mobile Menu Trigger (Screens < md) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              id="navbar-mobile-menu-btn"
              className="md:hidden p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 shrink-0 min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer"
              aria-label={mobileMenuOpen ? 'Close Menu' : 'Open Menu'}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Dedicated Search Bar Row: Positioned below main navigation row and above hero section */}
      <div
        id="navbar-dedicated-search-row"
        className="w-full bg-slate-50/80 border-t border-slate-100/90 py-2 sm:py-2.5 px-3 sm:px-4 md:px-6"
      >
        <div className="w-full max-w-3xl lg:max-w-4xl mx-auto">
          <div
            onClick={() => setIsSearchModalOpen(true)}
            id="navbar-search-bar-container"
            className="group relative flex items-center w-full h-10 sm:h-11 px-3 sm:px-4 rounded-xl sm:rounded-2xl bg-white border border-slate-200/90 hover:border-slate-300 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-400/30 shadow-2xs hover:shadow-xs transition-all duration-150 cursor-pointer"
            title="Search food menu (⌘K)"
          >
            {/* Left Search Icon - Vertically Centered */}
            <div className="flex items-center justify-center shrink-0 mr-2.5 text-[#4A1010]">
              <Search className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.2] text-[#4A1010]" />
            </div>

            {/* Wide Search Input Field */}
            <input
              type="text"
              id="header-search-input"
              value={searchInputValue}
              onChange={(e) => {
                setSearchInputValue(e.target.value);
                setIsSearchModalOpen(true);
              }}
              onFocus={() => setIsSearchModalOpen(true)}
              onClick={(e) => {
                e.stopPropagation();
                setIsSearchModalOpen(true);
              }}
              placeholder="Search for pizza, momos, Chinese, fried rice..."
              className="w-full min-w-0 bg-transparent border-0 p-0 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 placeholder:truncate focus:outline-none font-medium cursor-pointer"
              aria-label="Search for pizza, momos, Chinese, fried rice..."
            />

            {/* Desktop / Tablet Keyboard Shortcut Badge */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0 ml-2">
              <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 bg-slate-100 rounded border border-slate-200/80 shadow-2xs">
                ⌘K
              </kbd>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 pt-3 pb-5 space-y-2 shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs text-slate-500">Order Mode:</span>
            {isModeLocked ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>
                  {qrSession.source === 'table_qr'
                    ? `${tableNumber || qrSession.tableNumber || 'Table 1'} (Dine-In)`
                    : 'Counter (Takeaway)'}
                </span>
                <Lock className="w-2.5 h-2.5 text-amber-700" />
              </div>
            ) : (
              <div className="flex gap-1.5">
                {(['delivery', 'takeaway'] as OrderType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setOrderType(type)}
                    className={`px-2.5 py-1 rounded-lg text-xs capitalize font-semibold transition ${
                      orderType === type
                        ? 'bg-rose-600 text-white font-bold shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {type === 'delivery' ? 'Delivery' : 'Takeaway'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 1. Mobile Drawer Search - First Position */}
          <button
            onClick={() => {
              setIsSearchModalOpen(true);
              setMobileMenuOpen(false);
            }}
            id="mobile-drawer-search-btn"
            className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 border border-amber-500/60 shadow-xs shadow-amber-400/30 flex items-center justify-between transition-all min-h-[44px]"
          >
            <span className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-950 stroke-[2.5]" />
              <span>Search Dishes &amp; Pizzas</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-300/90 text-amber-950 font-bold uppercase tracking-wider">
              Instant
            </span>
          </button>

          {/* Customer Details (Mobile Drawer) */}
          <button
            onClick={() => {
              setIsCustomerModalOpen(true);
              setMobileMenuOpen(false);
            }}
            id="mobile-drawer-customer-btn"
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold border flex items-center justify-between transition ${
              isCustomerVerified
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="font-bold">
                {isCustomerVerified
                  ? `${customerDetails.name} (+91 ${customerDetails.phone.slice(-4)})`
                  : 'Enter Customer Details'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Edit</span>
          </button>

          {/* Live Location Details (Before Full Menu) */}
          <button
            onClick={() => {
              setShowLocationModal(true);
              setMobileMenuOpen(false);
            }}
            id="mobile-drawer-live-location-btn"
            className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/90 text-emerald-950 flex items-center justify-between transition-colors shadow-2xs"
          >
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <div>
                <div className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  {selectedBranch?.locality || selectedBranch?.name || (isFlagship ? 'Gachibowli, Hyderabad' : restaurantName)}
                </div>
                <div className="text-[10px] text-emerald-700 font-normal">
                  Kitchen Live • Delivering Now ({estimatedDeliveryMinutes || 30}m)
                </div>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-200/70 text-emerald-900 font-bold uppercase tracking-wider">
              Live Info
            </span>
          </button>

          <button
            onClick={() => {
              onNavigate('menu');
              setMobileMenuOpen(false);
            }}
            className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-slate-100 flex items-center gap-2"
          >
            <UtensilsCrossed className="w-4 h-4 text-rose-500" />
            Explore Full Menu
          </button>

          <button
            onClick={() => {
              onNavigate('track');
              setMobileMenuOpen(false);
            }}
            className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-slate-100 flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-rose-500" />
              Order Tracking
            </span>
            {activeOrder && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 font-bold">
                {activeOrder.status}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Online Order Type Selector Modal (Only for direct web users) */}
      {showOrderTypeModal && !isModeLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 text-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Select Order Delivery Option</h3>
            <p className="text-xs text-slate-500 mb-5">
              Online customer order modes are verified for home delivery or direct takeaway.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                type="button"
                onClick={() => setOrderType('delivery')}
                className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 text-center transition ${
                  orderType === 'delivery'
                    ? 'bg-rose-50 border-rose-400 text-rose-700 font-bold shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="text-3xl">🛵</span>
                <span className="text-xs font-bold">Home Delivery</span>
                <span className="text-[10px] text-slate-500">Delivered to your location</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderType('takeaway')}
                className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 text-center transition ${
                  orderType === 'takeaway'
                    ? 'bg-rose-50 border-rose-400 text-rose-700 font-bold shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="text-3xl">🛍️</span>
                <span className="text-xs font-bold">Self Takeaway</span>
                <span className="text-[10px] text-slate-500">Pickup from outlet</span>
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowOrderTypeModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition shadow-xs"
              >
                Confirm Option
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Security & Session Verification Modal */}
      {showQRInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 text-slate-800 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">QR Entry Source Verification</h3>
                  <p className="text-[11px] text-slate-500">Backend Cryptographic Token Security</p>
                </div>
              </div>
              <button
                onClick={() => setShowQRInfoModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-3.5">
                <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-900">
                  <Lock className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Order Mode Determined by Backend: {qrSession.orderMode.toUpperCase()}</span>
                </div>
                <p className="text-xs text-emerald-800/90 mt-1">
                  Customers cannot manually tamper or alter dining modes. Orders placed in this session are locked to{' '}
                  <strong>
                    {qrSession.source === 'table_qr'
                      ? `${tableNumber || qrSession.tableNumber} (Dine-In Session)`
                      : 'Counter Express (Takeaway)'}
                  </strong>.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-1.5 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">Entry Source:</span>
                  <span className="font-mono font-bold text-slate-900">{qrSession.source}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Session Status:</span>
                  <span className="font-bold text-emerald-600">✓ Cryptographically Signed & Validated</span>
                </div>
                {qrSession.tableNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Assigned Table:</span>
                    <span className="font-bold text-slate-900">{qrSession.tableNumber}</span>
                  </div>
                )}
                {qrSession.token && (
                  <div className="pt-1.5 border-t border-slate-200">
                    <span className="text-slate-500 block text-[10px] mb-0.5">Signed QR Token:</span>
                    <span className="font-mono text-[10px] break-all bg-white px-2 py-1 rounded border border-slate-200 block text-slate-600">
                      {qrSession.token}
                    </span>
                  </div>
                )}
              </div>

              {/* Simulation bar for easy testing */}
              <div className="pt-2">
                <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-rose-500" />
                  <span>Test or Switch Entry Source (Simulator):</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      switchQRSession({ source: 'table_qr', orderMode: 'dine_in', tableNumber: 'Table 7' });
                      setShowQRInfoModal(false);
                    }}
                    className="p-2 rounded-xl text-center text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200"
                  >
                    🍽️ Table 7 QR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      switchQRSession({ source: 'table_qr', orderMode: 'dine_in', tableNumber: 'Table 3' });
                      setShowQRInfoModal(false);
                    }}
                    className="p-2 rounded-xl text-center text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200"
                  >
                    🍽️ Table 3 QR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      switchQRSession({ source: 'counter_qr', orderMode: 'takeaway' });
                      setShowQRInfoModal(false);
                    }}
                    className="p-2 rounded-xl text-center text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200"
                  >
                    🛍️ Counter QR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearQRSession();
                      setShowQRInfoModal(false);
                    }}
                    className="p-2 rounded-xl text-center text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200"
                  >
                    🛵 Direct Web
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowQRInfoModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Location Details Modal */}
      {showLocationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="live-location-title"
        >
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 text-slate-800 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center shadow-xs">
                  <MapPin className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 id="live-location-title" className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>Live Kitchen Details</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 uppercase tracking-wider">
                      Open Now
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isFlagship ? `${BUSINESS_INFO.restaurantName} • Starters4U` : `${restaurantName} • ${selectedBranch?.name || 'Branch'}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLocationModal(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                aria-label="Close location details modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs text-slate-600">
              {/* Active Kitchen Live Alert */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 flex items-start gap-3">
                <span className="relative flex h-3 w-3 shrink-0 mt-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <div>
                  <p className="font-bold text-emerald-950 text-xs">
                    Live Kitchen Active & Taking Orders
                  </p>
                  <p className="text-emerald-800 text-[11px] mt-0.5 leading-relaxed">
                    {isFlagship
                      ? 'Freshly baking Korean-style pocket pizzas & wok-firing Chinese starters to order in Gachibowli.'
                      : `Preparing fresh culinary specialties to order at ${selectedBranch?.name || restaurantName}.`}
                  </p>
                </div>
              </div>

              {/* Verified Location Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Verified Address
                  </span>
                  <p className="text-xs font-black text-slate-900 mt-1">
                    {selectedBranch?.address || (isFlagship ? BUSINESS_INFO.streetAddress : address)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedBranch?.locality || (isFlagship ? `${BUSINESS_INFO.locality}, ${BUSINESS_INFO.city}` : 'Hyderabad')}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Delivery Speed
                  </span>
                  <p className="text-xs font-black text-slate-900 mt-1">
                    {estimatedDeliveryMinutes || 30} Minutes
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Hot delivery & fast self-takeaway pickup
                  </p>
                </div>
              </div>

              {/* Service Areas & Coverage */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Delivery Coverage Radius
                </span>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Serving within a <strong>{deliveryRadiusKm || 5}km</strong> radius of {selectedBranch?.locality || (isFlagship ? 'Gachibowli' : restaurantName)}.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 flex items-center justify-between text-[11px] text-amber-900">
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Operating Hours: 11:00 AM – 11:30 PM (Daily)
                </span>
                <span className="font-bold text-amber-800">
                  All 7 Days
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-3">
                {isFlagship && (
                  <a
                    href="/delivery-information"
                    onClick={() => setShowLocationModal(false)}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Delivery Info</span>
                    <span>→</span>
                  </a>
                )}
                {(selectedBranch?.latitude && selectedBranch?.longitude) ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedBranch.latitude},${selectedBranch.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Get Directions (Google Maps)</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : isFlagship && BUSINESS_INFO.googleMapsUrl ? (
                  <a
                    href={BUSINESS_INFO.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Get Directions (Google Maps)</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLocationModal(false);
                    onNavigate('menu');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition shadow-xs"
                >
                  Explore Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Quick Search Modal */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => {
          setIsSearchModalOpen(false);
          setSearchInputValue('');
        }}
        initialQuery={searchInputValue}
        onNavigateToMenu={(query) => {
          if (query) {
            window.location.href = `/menu?q=${encodeURIComponent(query)}`;
          } else {
            onNavigate('menu');
          }
        }}
      />
    </header>
  );
};
