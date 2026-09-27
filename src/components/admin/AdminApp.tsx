import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { clearChunkReloadFlag } from '../../utils/chunkReloadRecovery';
import { AdminLogin } from './AdminLogin';
import { AdminNavbar } from './AdminNavbar';
import { PrintDevicesSection } from './PrintDevicesSection';
import { DashboardSection } from './sections/DashboardSection';
import { OrdersSection } from './sections/OrdersSection';
import { PosSection } from './sections/PosSection';
import { MenuSection } from './sections/MenuSection';
import { TablesSection } from './sections/TablesSection';
import { CustomersSection } from './sections/CustomersSection';
import { PaymentsSection } from './sections/PaymentsSection';
import { DeliverySection } from './sections/DeliverySection';
import { ReportsSection } from './sections/ReportsSection';
import { StaffSection } from './sections/StaffSection';
import { SettingsSection } from './sections/SettingsSection';
import { StockSection } from './sections/StockSection';
import {
  LayoutDashboard,
  ShoppingBag,
  ChefHat,
  Utensils,
  Boxes,
  QrCode,
  Users,
  CreditCard,
  Truck,
  Printer,
  BarChart3,
  ShieldCheck,
  Settings,
} from 'lucide-react';

type AdminSection =
  | 'dashboard'
  | 'orders'
  | 'pos'
  | 'menu'
  | 'stock'
  | 'tables'
  | 'customers'
  | 'payments'
  | 'delivery'
  | 'printers'
  | 'reports'
  | 'staff'
  | 'settings';

export const AdminApp: React.FC = () => {
  const { user, restaurant, isAuthenticated, isLoading } = useAdminAuth();

  const [activeSection, setActiveSection] = useState<AdminSection>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const tab = p.get('section') || p.get('tab');
      if (tab && [
        'dashboard',
        'orders',
        'pos',
        'menu',
        'stock',
        'tables',
        'customers',
        'payments',
        'delivery',
        'printers',
        'reports',
        'staff',
        'settings',
      ].includes(tab)) {
        return tab as AdminSection;
      }
      if (window.location.pathname.includes('/print-devices')) {
        return 'printers';
      }
    }
    return 'dashboard';
  });

  const handleNavChange = (section: AdminSection) => {
    setActiveSection(section);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', section);
      window.history.replaceState({}, '', url.toString());
    }
  };

  // Reset chunk reload session guard once AdminApp is mounted successfully
  useEffect(() => {
    clearChunkReloadFlag();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Verifying Restaurant Admin Session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  const userRole = user?.role || 'RESTAURANT_OWNER';

  const navItems = React.useMemo(() => {
    const allItems: { id: AdminSection; label: string; icon: React.ReactNode; allowedRoles: string[] }[] = [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER'] },
      { id: 'orders', label: 'Orders & Kitchen', icon: <ChefHat className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN'] },
      { id: 'pos', label: 'POS Billing', icon: <ShoppingBag className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER', 'CASHIER'] },
      { id: 'menu', label: 'Menu Catalog', icon: <Utensils className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER'] },
      { id: 'stock', label: 'Stock Management', icon: <Boxes className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER', 'KITCHEN'] },
      { id: 'tables', label: 'Tables & QR', icon: <QrCode className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER', 'CASHIER'] },
      { id: 'customers', label: 'Customers CRM', icon: <Users className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER'] },
      { id: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER'] },
      { id: 'delivery', label: 'Delivery Fees', icon: <Truck className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER'] },
      { id: 'printers', label: 'Print Devices', icon: <Printer className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN'] },
      { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER'] },
      { id: 'staff', label: 'Staff & Roles', icon: <ShieldCheck className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER'] },
      { id: 'settings', label: 'Outlet Settings', icon: <Settings className="w-4 h-4" />, allowedRoles: ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'BRANCH_MANAGER'] },
    ];

    return allItems.filter((item) => item.allowedRoles.includes(userRole));
  }, [userRole]);

  // If current activeSection is not permitted for this role, auto-switch to first allowed tab
  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((n) => n.id === activeSection)) {
      setActiveSection(navItems[0].id);
    }
  }, [navItems, activeSection]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900">
      {/* Top Navbar with Dynamic Tenant Branding */}
      <AdminNavbar />

      {/* Sub-Header Horizontal Navigation Bar */}
      <nav className="bg-slate-900 border-b border-slate-800 text-slate-300 px-4 sm:px-6 lg:px-8 py-2 sticky top-16 z-20 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto gap-2 no-scrollbar">
          <div className="flex items-center space-x-1 sm:space-x-1.5">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  id={`admin-tab-${item.id}`}
                  onClick={() => handleNavChange(item.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40'
                      : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium text-slate-300">
              {restaurant?.name || user?.restaurantName || 'Tenant'} Synced
            </span>
          </div>
        </div>
      </nav>

      {/* Main Admin Section Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeSection === 'dashboard' && (
          <DashboardSection onNavigate={(sec) => handleNavChange(sec as AdminSection)} />
        )}
        {activeSection === 'orders' && <OrdersSection />}
        {activeSection === 'pos' && <PosSection />}
        {activeSection === 'menu' && <MenuSection />}
        {activeSection === 'stock' && <StockSection />}
        {activeSection === 'tables' && <TablesSection />}
        {activeSection === 'customers' && <CustomersSection />}
        {activeSection === 'payments' && <PaymentsSection />}
        {activeSection === 'delivery' && <DeliverySection />}
        {activeSection === 'printers' && <PrintDevicesSection />}
        {activeSection === 'reports' && <ReportsSection />}
        {activeSection === 'staff' && <StaffSection />}
        {activeSection === 'settings' && <SettingsSection />}
      </main>
    </div>
  );
};
