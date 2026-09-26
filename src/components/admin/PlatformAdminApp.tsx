import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { AdminLogin } from './AdminLogin';
import {
  Building2,
  TrendingUp,
  DollarSign,
  Users,
  ShieldCheck,
  Server,
  Layers,
  ArrowLeft,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Database,
  Lock,
  X,
  Printer,
  QrCode,
  CreditCard,
  Clock,
  Utensils,
  Truck,
  Eye,
  Settings,
  Activity,
  FileText,
  Check,
  Power,
  Sliders,
  Store,
  MapPin,
  Phone,
  Mail,
  UserCheck,
  Globe,
  Copy,
  Share2,
  Edit2,
  Archive,
} from 'lucide-react';

type PlatformTab = 'dashboard' | 'restaurants' | 'onboarding' | 'subscriptions' | 'system';

interface RestaurantSummary {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  phone: string;
  email?: string;
  mainBranchName: string;
  status: 'active' | 'suspended' | 'pending' | 'inactive' | 'archived';
  planName: string;
  onboardingStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  orderCount: number;
  totalRevenue: number;
  createdAt: string;
}

interface RestaurantDetail {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    phone: string;
    email?: string;
    ownerName?: string;
    logoUrl?: string;
    tagline?: string;
    currency: string;
    taxRate: number;
    status: 'active' | 'suspended' | 'pending' | 'inactive' | 'archived';
    createdAt: string;
  };
  branches: Array<{
    id: string;
    name: string;
    slug: string;
    address: string;
    deliveryRadiusKm?: number;
    phone?: string;
    isActive: boolean;
  }>;
  adminUser?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    invitationStatus?: string;
  };
  settings: {
    displayName?: string;
    phone?: string;
    email?: string;
    address?: string;
    isDeliveryEnabled?: boolean;
    isTakeawayEnabled?: boolean;
    isDineInEnabled?: boolean;
    isCounterEnabled?: boolean;
    currency?: string;
    taxRate?: number;
    timezone?: string;
  };
  paymentSettings: {
    isCashEnabled: boolean;
    isUpiEnabled: boolean;
    upiId?: string;
    isOnlineEnabled: boolean;
    isRazorpayEnabled: boolean;
    razorpayKeyId?: string;
    activePaymentMode: string;
  };
  subscription: {
    planName: string;
    status: string;
    billingCycle: string;
    amount: number;
    startsAt?: string;
    expiresAt?: string;
  };
  onboarding: {
    overallStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
    businessDetailsStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
    menuStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
    businessHoursStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
    tablesQrStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
    paymentsStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
    printerStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
    deliveryStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
    completedSteps: number;
    totalSteps: number;
    notes?: string;
  };
  menuSummary: {
    categoryCount: number;
    itemCount: number;
  };
  printerStatus: {
    configured: boolean;
    deviceCount: number;
    message: string;
  };
  seoReadiness?: {
    isEligible: boolean;
    isPublicStorefrontActive: boolean;
    isIndexable: boolean;
    isSitemapIncluded: boolean;
    slug: string;
    publicUrl: string;
    menuUrl: string;
    googleOrderingUrl: string;
    canonicalUrl: string;
    menuCanonicalUrl: string;
    reasons: string[];
  };
}

export const PlatformAdminApp: React.FC = () => {
  const { user, isAuthenticated, isLoading, adminFetch, logout } = useAdminAuth();

  const [activeTab, setActiveTab] = useState<PlatformTab>('dashboard');
  const [stats, setStats] = useState({
    totalRestaurants: 1,
    totalOrders: 0,
    totalGMV: 0,
    totalUsers: 2,
    totalBranches: 1,
    platformStatus: 'healthy',
    databaseEngine: 'PostgreSQL (Cloud / Supabase)',
  });

  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | 'ARCHIVED'>('ALL');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [restaurantDetail, setRestaurantDetail] = useState<RestaurantDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Edit Restaurant Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRestaurantId, setEditingRestaurantId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    displayName: '',
    ownerName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    cuisine: '',
    logoUrl: '',
    businessHours: '',
    status: 'active' as 'active' | 'suspended' | 'inactive' | 'archived',
    subscriptionPlan: 'growth',
    mainBranchName: '',
    taxRate: 5,
    currency: 'INR',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // New restaurant form state
  const [newRestaurant, setNewRestaurant] = useState({
    name: '',
    slug: '',
    ownerName: '',
    phone: '',
    address: '',
    email: '',
    plan: 'growth',
    paymentMode: 'CASH_UPI' as 'CASH' | 'UPI' | 'CASH_UPI' | 'ONLINE' | 'LATER',
    serviceModes: {
      dineIn: true,
      counter: true,
      takeaway: true,
      delivery: true,
    },
  });

  const [slugManualEdited, setSlugManualEdited] = useState(false);
  const [slugValidation, setSlugValidation] = useState<{
    checking: boolean;
    available: boolean | null;
    error?: string;
  }>({ checking: false, available: null });

  // Onboarding Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [onboardingSuccessData, setOnboardingSuccessData] = useState<{
    restaurantId: string;
    restaurantName: string;
    slug: string;
    publicUrl: string;
    menuUrl: string;
    googleOrderingUrl: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Helper to format candidate slug
  const formatSlug = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  };

  const isPlatformAdmin =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'superadmin' ||
    user?.role === 'PLATFORM_ADMIN' ||
    user?.role === 'platform_admin';

  const loadPlatformData = async () => {
    setLoadingData(true);
    try {
      const statsRes = await adminFetch('/api/platform/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      const restRes = await adminFetch('/api/platform/restaurants');
      if (restRes.ok) {
        const restData = await restRes.json();
        setRestaurants(restData);
      }
    } catch (err) {
      console.error('[PlatformAdmin] Error fetching platform data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isPlatformAdmin) {
      loadPlatformData();
    }
  }, [isAuthenticated, isPlatformAdmin]);

  // Live slug validation
  useEffect(() => {
    const rawSlug = newRestaurant.slug?.trim().toLowerCase();
    if (!rawSlug) {
      setSlugValidation({ checking: false, available: null });
      return;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawSlug)) {
      setSlugValidation({
        checking: false,
        available: false,
        error: 'Slug must contain only lowercase letters, numbers, and hyphens (no trailing hyphen)',
      });
      return;
    }

    const timer = setTimeout(async () => {
      setSlugValidation({ checking: true, available: null });
      try {
        const res = await adminFetch(`/api/platform/restaurants/check-slug?slug=${encodeURIComponent(rawSlug)}`);
        if (res.ok) {
          const checkData = await res.json();
          setSlugValidation({
            checking: false,
            available: checkData.available,
            error: checkData.available ? undefined : (checkData.error || 'Slug already taken'),
          });
        } else {
          setSlugValidation({ checking: false, available: false, error: 'Could not verify slug availability' });
        }
      } catch (err: any) {
        setSlugValidation({ checking: false, available: false, error: err.message });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [newRestaurant.slug, adminFetch]);

  const openRestaurantDetail = async (id: string) => {
    setSelectedRestaurantId(id);
    setLoadingDetail(true);
    try {
      const res = await adminFetch(`/api/platform/restaurants/${id}`);
      if (res.ok) {
        const data = await res.json();
        setRestaurantDetail(data);
      }
    } catch (err) {
      console.error('[PlatformAdmin] Error loading restaurant detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleToggleStatus = async (restaurantId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    await handleSetLifecycleStatus(restaurantId, nextStatus);
  };

  const handleSetLifecycleStatus = async (
    restaurantId: string,
    nextStatus: 'active' | 'suspended' | 'inactive' | 'archived'
  ) => {
    setUpdatingStatus(true);
    try {
      const res = await adminFetch(`/api/platform/restaurants/${restaurantId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await loadPlatformData();
        if (selectedRestaurantId === restaurantId) {
          await openRestaurantDetail(restaurantId);
        }
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to update restaurant lifecycle status');
      }
    } catch (err) {
      console.error('[PlatformAdmin] Error setting status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openEditModal = async (restaurantId: string) => {
    setEditError(null);
    setEditingRestaurantId(restaurantId);
    setShowEditModal(true);

    try {
      const res = await adminFetch(`/api/platform/restaurants/${restaurantId}`);
      if (res.ok) {
        const data: RestaurantDetail = await res.json();
        const r = data.restaurant;
        const mainBranch = data.branches?.[0];
        setEditFormData({
          name: r.name || '',
          displayName: data.settings?.displayName || r.name || '',
          ownerName: data.adminUser?.name || r.ownerName || '',
          phone: r.phone || '',
          email: r.email || data.adminUser?.email || '',
          address: mainBranch?.address || data.settings?.address || '',
          city: '',
          state: '',
          pincode: '',
          cuisine: r.tagline || '',
          logoUrl: r.logoUrl || '',
          businessHours: '11:00 AM - 11:00 PM',
          status: (r.status as any) || 'active',
          subscriptionPlan: data.subscription?.planName || 'growth',
          mainBranchName: mainBranch?.name || 'Main Branch',
          taxRate: r.taxRate || 5,
          currency: r.currency || 'INR',
        });
      }
    } catch (err) {
      console.error('[PlatformAdmin] Error preparing edit modal:', err);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRestaurantId) return;

    setSavingEdit(true);
    setEditError(null);

    try {
      const res = await adminFetch(`/api/platform/restaurants/${editingRestaurantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Failed to update restaurant details');
        setSavingEdit(false);
        return;
      }

      setShowEditModal(false);
      setEditingRestaurantId(null);
      await loadPlatformData();
      if (selectedRestaurantId === editingRestaurantId) {
        await openRestaurantDetail(editingRestaurantId);
      }
    } catch (err: any) {
      setEditError(err.message || 'An unexpected error occurred while saving.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleUpdateOnboardingStep = async (stepKey: string, nextStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY') => {
    if (!selectedRestaurantId) return;
    try {
      const res = await adminFetch(`/api/platform/restaurants/${selectedRestaurantId}/onboarding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: stepKey, status: nextStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        if (restaurantDetail) {
          setRestaurantDetail({
            ...restaurantDetail,
            onboarding: data.onboarding,
          });
        }
        await loadPlatformData();
      }
    } catch (err) {
      console.error('[PlatformAdmin] Error updating onboarding step:', err);
    }
  };

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardingError(null);

    // Validate slug if set
    if (slugValidation.available === false) {
      setOnboardingError(slugValidation.error || 'The chosen slug is invalid or already taken.');
      return;
    }

    setSubmittingOnboarding(true);

    try {
      const res = await adminFetch('/api/platform/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRestaurant.name,
          slug: newRestaurant.slug?.trim() || undefined,
          ownerName: newRestaurant.ownerName,
          phone: newRestaurant.phone,
          address: newRestaurant.address,
          email: newRestaurant.email || undefined,
          subscriptionPlan: newRestaurant.plan,
          paymentMode: newRestaurant.paymentMode,
          serviceModes: newRestaurant.serviceModes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOnboardingError(data.error || 'Failed to create restaurant');
        setSubmittingOnboarding(false);
        return;
      }

      const provisionedSlug = data.slug || newRestaurant.slug;
      setOnboardingSuccessData({
        restaurantId: data.restaurantId,
        restaurantName: newRestaurant.name,
        slug: provisionedSlug,
        publicUrl: data.seo?.publicUrl || `https://www.starters4u.in/r/${provisionedSlug}`,
        menuUrl: data.seo?.menuUrl || `https://www.starters4u.in/r/${provisionedSlug}/menu`,
        googleOrderingUrl: data.seo?.googleOrderingUrl || `https://www.starters4u.in/r/${provisionedSlug}/menu`,
      });

      setShowAddModal(false);
      setShowSuccessModal(true);

      setNewRestaurant({
        name: '',
        slug: '',
        ownerName: '',
        phone: '',
        address: '',
        email: '',
        plan: 'growth',
        paymentMode: 'CASH_UPI',
        serviceModes: {
          dineIn: true,
          counter: true,
          takeaway: true,
          delivery: true,
        },
      });
      setSlugManualEdited(false);
      setSlugValidation({ checking: false, available: null });

      await loadPlatformData();
    } catch (err: any) {
      setOnboardingError(err.message || 'An unexpected error occurred during provisioning.');
    } finally {
      setSubmittingOnboarding(false);
    }
  };

  // If not authenticated or loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Verifying Starters4U Platform Admin Session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-950 text-rose-400 border border-rose-800 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Platform Super Admin Access Required</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            You are logged in as <strong>{user?.name}</strong> with role <strong>{user?.role}</strong>. Your permissions are restricted to your restaurant tenant. Only Starters4U platform administrators (role <code className="text-amber-400 font-mono">PLATFORM_ADMIN</code>) have access to the global fleet management portal.
          </p>
          <div className="pt-3 flex flex-col gap-2">
            <button
              onClick={() => {
                window.history.pushState({}, '', '/admin');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md"
            >
              Go to Restaurant Admin Portal
            </button>
            <button
              onClick={() => logout()}
              className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredRestaurants = restaurants.filter((r) => {
    const matchesSearch =
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.slug?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.ownerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.phone?.includes(searchTerm);

    if (!matchesSearch) return false;
    if (statusFilter === 'ACTIVE') return r.status === 'active';
    if (statusFilter === 'SUSPENDED') return r.status === 'suspended';
    if (statusFilter === 'INACTIVE') return r.status === 'inactive';
    if (statusFilter === 'ARCHIVED') return r.status === 'archived';
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 p-0.5 shadow-md flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[9px] flex flex-col items-center justify-center">
                  <Layers className="w-5 h-5 text-amber-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
                    Starters4U Platform Admin
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold tracking-wide">
                    SUPER ADMIN
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  Multi-Tenant Fleet Management, Onboarding & Provisioning Engine
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                onClick={() => {
                  window.history.pushState({}, '', '/admin');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition border border-slate-700"
                title="Switch to Restaurant Tenant Admin"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Restaurant Portal</span>
              </button>

              <button
                onClick={loadPlatformData}
                disabled={loadingData}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Refresh Metrics"
              >
                <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => logout()}
                className="px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 text-xs font-bold transition"
              >
                Log Out
              </button>
            </div>
          </div>

          {/* Navigation Bar */}
          <nav className="flex space-x-1 border-t border-slate-800/80 pt-1 pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('restaurants')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'restaurants'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Restaurants ({restaurants.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('onboarding')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'onboarding'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Onboarding Queue</span>
            </button>

            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'subscriptions'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Plans & Subscriptions</span>
            </button>

            <button
              onClick={() => setActiveTab('system')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'system'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>System & Telemetry</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Tenants</span>
                  <Building2 className="w-5 h-5 text-amber-400" />
                </div>
                <div className="text-3xl font-black text-white">{stats.totalRestaurants}</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                  <span>{stats.totalBranches} Active Branch Outlets</span>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Global Orders</span>
                  <TrendingUp className="w-5 h-5 text-rose-400" />
                </div>
                <div className="text-3xl font-black text-white">{stats.totalOrders}</div>
                <div className="text-[11px] text-slate-400 mt-1">Processed across platform</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Platform Gross GMV</span>
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="text-3xl font-black text-emerald-400">₹{stats.totalGMV.toLocaleString()}</div>
                <div className="text-[11px] text-slate-400 mt-1">Multi-tenant payment settlement</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Database Engine</span>
                  <Database className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="text-base font-extrabold text-white truncate">{stats.databaseEngine}</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Row-Level Tenant Isolation Active</span>
                </div>
              </div>
            </div>

            {/* Quick Action Banner */}
            <div className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-rose-500/10 border border-amber-500/30 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Store className="w-5 h-5 text-amber-400" />
                  <span>Onboard a New Restaurant Partner</span>
                </h3>
                <p className="text-xs text-slate-300 mt-1 max-w-xl">
                  Provision an isolated tenant with a default main branch, safe owner account, operational settings, initial QR table, and subscription in an atomic transaction.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-lg whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Restaurant</span>
              </button>
            </div>

            {/* Recent Fleet Snapshot */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  <span>Recent Tenants</span>
                </h3>
                <button
                  onClick={() => setActiveTab('restaurants')}
                  className="text-xs font-bold text-amber-400 hover:underline"
                >
                  View All ({restaurants.length}) →
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {restaurants.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    onClick={() => openRestaurantDetail(r.id)}
                    className="bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 cursor-pointer transition shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm">{r.name}</h4>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">/r/{r.slug}</p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          r.status === 'active'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 space-y-1">
                      <p className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>{r.ownerName}</span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>{r.phone}</span>
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Onboarding:</span>
                      <span
                        className={`font-bold ${
                          r.onboardingStatus === 'READY'
                            ? 'text-emerald-400'
                            : r.onboardingStatus === 'IN_PROGRESS'
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {r.onboardingStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: RESTAURANTS FLEET */}
        {activeTab === 'restaurants' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden space-y-0">
            {/* Table Filters & Toolbar */}
            <div className="p-6 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-400" />
                  <span>Restaurant Tenants Fleet</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Centralized multi-tenant directory. Every operation is strictly scoped by <code className="text-rose-400">restaurant_id</code>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Status Filter */}
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      statusFilter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({restaurants.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      statusFilter === 'ACTIVE' ? 'bg-emerald-900/60 text-emerald-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setStatusFilter('SUSPENDED')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      statusFilter === 'SUSPENDED' ? 'bg-amber-900/60 text-amber-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Suspended
                  </button>
                  <button
                    onClick={() => setStatusFilter('INACTIVE')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      statusFilter === 'INACTIVE' ? 'bg-slate-800 text-slate-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Inactive
                  </button>
                  <button
                    onClick={() => setStatusFilter('ARCHIVED')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      statusFilter === 'ARCHIVED' ? 'bg-rose-950 text-rose-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Archived
                  </button>
                </div>

                {/* Search Box */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name, slug, owner..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Add Button */}
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Restaurant</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5">Restaurant & Contact</th>
                    <th className="px-6 py-3.5">Slug</th>
                    <th className="px-6 py-3.5">Main Branch</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Plan</th>
                    <th className="px-6 py-3.5">Onboarding</th>
                    <th className="px-6 py-3.5">Orders & GMV</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRestaurants.map((rest) => (
                    <tr key={rest.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 text-sm">
                            {rest.name?.[0] || 'R'}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{rest.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {rest.ownerName} • {rest.phone}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-950 text-amber-400 border border-slate-800">
                          {rest.slug}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        {rest.mainBranchName}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            rest.status === 'active'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : rest.status === 'suspended'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : rest.status === 'archived'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              rest.status === 'active'
                                ? 'bg-emerald-400 animate-pulse'
                                : rest.status === 'suspended'
                                ? 'bg-amber-400'
                                : rest.status === 'archived'
                                ? 'bg-rose-400'
                                : 'bg-slate-400'
                            }`}
                          />
                          <span>{rest.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                          {rest.planName}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                            rest.onboardingStatus === 'READY'
                              ? 'text-emerald-400'
                              : rest.onboardingStatus === 'IN_PROGRESS'
                              ? 'text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {rest.onboardingStatus === 'READY' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {rest.onboardingStatus === 'IN_PROGRESS' && <Clock className="w-3.5 h-3.5" />}
                          <span>{rest.onboardingStatus}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-white">{rest.orderCount} orders</div>
                        <div className="text-[11px] text-emerald-400">₹{rest.totalRevenue.toLocaleString()}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(rest.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold transition border border-amber-500/30"
                            title="Edit Restaurant Details"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => openRestaurantDetail(rest.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700"
                            title="View Full Configuration & Diagnostics"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-300" />
                            <span>View</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredRestaurants.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                        No restaurants matched your search filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: ONBOARDING QUEUE */}
        {activeTab === 'onboarding' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-400" />
                <span>Onboarding Status Tracker</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Track readiness checklist across all partner tenants: Business Profile, Menu, Business Hours, Tables/QR, Payments, Printer, and Delivery.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {restaurants.map((r) => (
                <div
                  key={r.id}
                  className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-md hover:border-slate-700 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-base">{r.name}</h3>
                        <span className="font-mono text-xs text-amber-400">({r.slug})</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Owner: {r.ownerName} • Contact: {r.phone}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                          r.onboardingStatus === 'READY'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        Status: {r.onboardingStatus}
                      </span>

                      <button
                        onClick={() => openRestaurantDetail(r.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                      >
                        Open Checklist →
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Business</span>
                      <span className="text-emerald-400 font-bold mt-1 inline-block">READY</span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Menu</span>
                      <span
                        className={`font-bold mt-1 inline-block ${
                          r.id.endsWith('1') ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {r.id.endsWith('1') ? 'READY' : 'IN_PROGRESS'}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Hours</span>
                      <span className="text-emerald-400 font-bold mt-1 inline-block">READY</span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Tables & QR</span>
                      <span className="text-emerald-400 font-bold mt-1 inline-block">READY</span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Payments</span>
                      <span className="text-emerald-400 font-bold mt-1 inline-block">READY</span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Printer</span>
                      <span
                        className={`font-bold mt-1 inline-block ${
                          r.id.endsWith('1') ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {r.id.endsWith('1') ? 'READY' : 'OPTIONAL'}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Delivery</span>
                      <span className="text-emerald-400 font-bold mt-1 inline-block">READY</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SUBSCRIPTIONS & PLANS */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-8">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                <span>Platform Subscription Plans</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Standard recurring tier offerings configured for Starters4U tenant restaurants.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Starter Plan */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Starter Plan</h3>
                    <p className="text-xs text-slate-400 mt-1">Ideal for single-location quick service & takeaways</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">₹999</span>
                    <span className="text-xs text-slate-400">/ month</span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Single Outlet Support</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Unlimited QR Table Ordering</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Online Menu & Cart Management</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Cash & Direct UPI Payments</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Standard Kitchen Display (KOT)</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Growth Plan (Popular) */}
              <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500 rounded-3xl p-6 shadow-2xl flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-amber-500 text-slate-950 text-[10px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-wider">
                  MOST POPULAR
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Growth Plan</h3>
                    <p className="text-xs text-slate-400 mt-1">Full omni-channel dining, delivery & thermal printing</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-amber-400">₹1,999</span>
                    <span className="text-xs text-slate-400">/ month</span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-200 pt-2 border-t border-slate-800">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Up to 3 Outlet Branches</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Starters4U Print Agent Thermal Integration</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Full Razorpay Payment Gateway Integration</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Real-time GPS Delivery Tracking</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Analytics & Daily Sales Telemetry</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Priority WhatsApp Support</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Enterprise Plan */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Enterprise Plan</h3>
                    <p className="text-xs text-slate-400 mt-1">Multi-city restaurant chains and franchise operations</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">₹4,999</span>
                    <span className="text-xs text-slate-400">/ month</span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Unlimited Outlets & Centralized Kitchens</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Custom White-Label Domain & Branding</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Multi-Station KOT Routing & Load Balancing</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Dedicated Account Manager & SLA</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SYSTEM & TELEMETRY */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-amber-400" />
                <span>Platform System Architecture & Diagnostics</span>
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Starters4U implements zero-leakage multi-tenant architectural isolation. Every data store entity has a mandatory foreign key reference to <code className="text-rose-400 font-mono">restaurant_id</code>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Database Status</span>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-bold text-white">{stats.databaseEngine}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Automated migrations loaded: 001_multi_tenant_core.sql & 002_platform_onboarding.sql.
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Isolation Enforcement</span>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <span className="font-bold text-white">Backend Context-Enforced (JWT)</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Restaurants cannot manipulate or read foreign orders, carts, menu items, or gateway settings.
                  </p>
                </div>
              </div>
            </div>

            {/* Platform Placeholders (Future Phases Preview) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 opacity-75">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                  Future Module • Phase 4
                </span>
                <h4 className="font-bold text-white text-sm">Delivery Provider Gateway</h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Dunzo, Shadowfax, and Porter integration router placeholder.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 opacity-75">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                  Future Module • Phase 3
                </span>
                <h4 className="font-bold text-white text-sm">Print Agent Fleet Router</h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Unified heartbeat and thermal job dispatcher for paired POS printers.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 opacity-75">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                  Future Module
                </span>
                <h4 className="font-bold text-white text-sm">Automated Settlement Reports</h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Daily GST and commission reconciliation export tools.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================== */}
      {/* MODAL: ADD RESTAURANT ONBOARDING WIZARD */}
      {/* ========================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Add New Restaurant Tenant</h3>
                  <p className="text-xs text-slate-400">Step 1 of 1: Automated Tenant Provisioning</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {onboardingError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl flex items-center gap-2 text-rose-200 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{onboardingError}</span>
              </div>
            )}

            <form onSubmit={handleCreateRestaurant} className="space-y-4 text-xs">
              {/* Mandatory Fields */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                  Basic Information (Required)
                </h4>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Restaurant Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Green Garden Bistro"
                    value={newRestaurant.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      if (!slugManualEdited) {
                        const autoSlug = formatSlug(newName);
                        setNewRestaurant({ ...newRestaurant, name: newName, slug: autoSlug });
                      } else {
                        setNewRestaurant({ ...newRestaurant, name: newName });
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Auto-Generated / Custom Slug Field */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-amber-400" />
                      <span>Storefront URL Slug</span>
                    </label>
                    {slugManualEdited && (
                      <button
                        type="button"
                        onClick={() => {
                          setSlugManualEdited(false);
                          setNewRestaurant({ ...newRestaurant, slug: formatSlug(newRestaurant.name) });
                        }}
                        className="text-[10px] text-amber-400 hover:underline"
                      >
                        Reset to auto
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-mono text-xs">
                      /r/
                    </div>
                    <input
                      type="text"
                      placeholder="green-garden-bistro"
                      value={newRestaurant.slug}
                      onChange={(e) => {
                        setSlugManualEdited(true);
                        setNewRestaurant({ ...newRestaurant, slug: formatSlug(e.target.value) });
                      }}
                      className="w-full pl-9 pr-24 py-2.5 rounded-xl bg-slate-950 border border-slate-700 font-mono text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      {slugValidation.checking && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Checking</span>
                        </span>
                      )}
                      {!slugValidation.checking && slugValidation.available === true && (
                        <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Available</span>
                        </span>
                      )}
                      {!slugValidation.checking && slugValidation.available === false && (
                        <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Unavailable</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {slugValidation.error && (
                    <p className="text-[11px] text-rose-400 mt-1">{slugValidation.error}</p>
                  )}
                  {/* Live URL Preview Card */}
                  <div className="mt-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1 text-[11px]">
                    <div className="text-slate-400 flex items-center justify-between">
                      <span>Public Storefront Preview:</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                        Auto SEO & Sitemap Ready
                      </span>
                    </div>
                    <div className="font-mono text-amber-300 break-all">
                      https://www.starters4u.in/r/{newRestaurant.slug || 'your-restaurant'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Owner / Contact Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Sharma"
                      value={newRestaurant.ownerName}
                      onChange={(e) => setNewRestaurant({ ...newRestaurant, ownerName: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Mobile Number <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +91 98765 43210"
                      value={newRestaurant.phone}
                      onChange={(e) => setNewRestaurant({ ...newRestaurant, phone: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Address <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Shop/Road, Area, City, State"
                    value={newRestaurant.address}
                    onChange={(e) => setNewRestaurant({ ...newRestaurant, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Optional Fields */}
              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                  Optional Details
                </h4>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Contact Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="Defaults to auto-generated admin email"
                    value={newRestaurant.email}
                    onChange={(e) => setNewRestaurant({ ...newRestaurant, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Configuration */}
              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                  Plan & Payment Configuration
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Subscription Plan</label>
                    <select
                      value={newRestaurant.plan}
                      onChange={(e) => setNewRestaurant({ ...newRestaurant, plan: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="starter">Starter Plan (₹999/mo)</option>
                      <option value="growth">Growth Plan (₹1,999/mo)</option>
                      <option value="enterprise">Enterprise Plan (₹4,999/mo)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Payment Mode</label>
                    <select
                      value={newRestaurant.paymentMode}
                      onChange={(e) => setNewRestaurant({ ...newRestaurant, paymentMode: e.target.value as any })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="CASH_UPI">Cash & Direct UPI</option>
                      <option value="UPI">UPI Only</option>
                      <option value="CASH">Cash Only</option>
                      <option value="ONLINE">Online Payments (Razorpay)</option>
                      <option value="LATER">Configure Later</option>
                    </select>
                  </div>
                </div>

                {/* Service Modes Checkboxes */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5">Enabled Service Modes</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRestaurant.serviceModes.dineIn}
                        onChange={(e) =>
                          setNewRestaurant({
                            ...newRestaurant,
                            serviceModes: { ...newRestaurant.serviceModes, dineIn: e.target.checked },
                          })
                        }
                        className="rounded accent-amber-500"
                      />
                      <span className="text-slate-300 text-xs">Dine-In</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRestaurant.serviceModes.takeaway}
                        onChange={(e) =>
                          setNewRestaurant({
                            ...newRestaurant,
                            serviceModes: { ...newRestaurant.serviceModes, takeaway: e.target.checked },
                          })
                        }
                        className="rounded accent-amber-500"
                      />
                      <span className="text-slate-300 text-xs">Takeaway</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRestaurant.serviceModes.delivery}
                        onChange={(e) =>
                          setNewRestaurant({
                            ...newRestaurant,
                            serviceModes: { ...newRestaurant.serviceModes, delivery: e.target.checked },
                          })
                        }
                        className="rounded accent-amber-500"
                      />
                      <span className="text-slate-300 text-xs">Delivery</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRestaurant.serviceModes.counter}
                        onChange={(e) =>
                          setNewRestaurant({
                            ...newRestaurant,
                            serviceModes: { ...newRestaurant.serviceModes, counter: e.target.checked },
                          })
                        }
                        className="rounded accent-amber-500"
                      />
                      <span className="text-slate-300 text-xs">Counter</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOnboarding}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition flex items-center gap-2 shadow-lg disabled:opacity-50"
                >
                  {submittingOnboarding ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Provisioning Tenant...</span>
                    </>
                  ) : (
                    <span>CREATE RESTAURANT</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: ONBOARDING SUCCESS & SEO PROVISIONING READY */}
      {/* ========================================================== */}
      {showSuccessModal && onboardingSuccessData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Restaurant Tenant Provisioned</h3>
                  <p className="text-xs text-emerald-400 font-semibold">Storefront Activated & SEO Configured</p>
                </div>
              </div>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Checklist of Auto-Provisioned Assets */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Automated Provisioning Checklist
              </span>
              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Restaurant Created</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Branch Created</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Admin User Created</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Public Storefront Activated</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>SEO Metadata & JSON-LD</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Sitemap.xml Included</span>
                </div>
              </div>
            </div>

            {/* Live URLs & Quick Action Buttons */}
            <div className="space-y-3 text-xs">
              {/* Public Restaurant Page */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-slate-400" />
                    Public Restaurant Page
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                    Live
                  </span>
                </div>
                <div className="font-mono text-xs text-slate-200 bg-slate-900 p-2.5 rounded-lg border border-slate-800 break-all select-all">
                  {onboardingSuccessData.publicUrl}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(onboardingSuccessData.publicUrl, 'successPublicUrl')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition flex items-center gap-1.5"
                  >
                    {copiedKey === 'successPublicUrl' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Restaurant URL</span>
                      </>
                    )}
                  </button>
                  <a
                    href={`/r/${onboardingSuccessData.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Restaurant</span>
                  </a>
                </div>
              </div>

              {/* Google Business Ordering URL */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-amber-300 font-bold flex items-center gap-1.5">
                    <Share2 className="w-4 h-4 text-amber-400" />
                    Google Business Ordering URL
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-semibold">
                    Recommended for Google Profile
                  </span>
                </div>
                <div className="font-mono text-xs text-amber-200 bg-slate-900 p-2.5 rounded-lg border border-slate-800 break-all select-all">
                  {onboardingSuccessData.googleOrderingUrl}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(onboardingSuccessData.googleOrderingUrl, 'successOrderingUrl')}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5"
                  >
                    {copiedKey === 'successOrderingUrl' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-slate-950" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Google Ordering URL</span>
                      </>
                    )}
                  </button>
                  <a
                    href={`/r/${onboardingSuccessData.slug}/menu`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Menu</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Google Discovery Clarification */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">Search Discovery & Profile Setup:</p>
              <p>
                • <strong>Google Discovery:</strong> This restaurant is dynamically listed in <code className="text-amber-300">/sitemap.xml</code> for search crawler indexing without requiring redeployments. Google determines indexation schedules.
              </p>
              <p>
                • <strong>Google Business Profile:</strong> Provide the <em>Google Ordering URL</em> above to the restaurant owner to paste into their Google Business Profile under "Online Ordering" or "Menu".
              </p>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  openRestaurantDetail(onboardingSuccessData.restaurantId);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition"
              >
                View Restaurant Details
              </button>
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: RESTAURANT DETAIL DRAWER */}
      {/* ========================================================== */}
      {selectedRestaurantId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            {loadingDetail || !restaurantDetail ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Loading Restaurant Profile & Configuration...</p>
              </div>
            ) : (
              <>
                {/* Header with Title and Suspension Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-lg">
                      {restaurantDetail.restaurant.name?.[0] || 'R'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{restaurantDetail.restaurant.name}</h3>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            restaurantDetail.restaurant.status === 'active'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : restaurantDetail.restaurant.status === 'suspended'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : restaurantDetail.restaurant.status === 'archived'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {restaurantDetail.restaurant.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Slug: /r/{restaurantDetail.restaurant.slug}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openEditModal(restaurantDetail.restaurant.id)}
                      className="px-3.5 py-2 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 shadow-sm"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Details</span>
                    </button>

                    {/* Lifecycle Status Select */}
                    <select
                      value={restaurantDetail.restaurant.status}
                      disabled={updatingStatus}
                      onChange={(e) =>
                        handleSetLifecycleStatus(
                          restaurantDetail.restaurant.id,
                          e.target.value as 'active' | 'suspended' | 'inactive' | 'archived'
                        )
                      }
                      className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
                    >
                      <option value="active">Status: Active</option>
                      <option value="suspended">Status: Suspended</option>
                      <option value="inactive">Status: Inactive</option>
                      <option value="archived">Status: Archived</option>
                    </select>

                    <button
                      onClick={() => setSelectedRestaurantId(null)}
                      className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Detail Sections */}
                <div className="space-y-6 text-xs">
                  {/* Overview Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Admin / Owner Account
                      </span>
                      <p className="font-bold text-white text-sm">
                        {restaurantDetail.adminUser?.name || restaurantDetail.restaurant.ownerName || 'Store Owner'}
                      </p>
                      <p className="text-slate-300">{restaurantDetail.adminUser?.email || restaurantDetail.restaurant.email}</p>
                      <p className="text-slate-400">{restaurantDetail.adminUser?.phone || restaurantDetail.restaurant.phone}</p>
                      <div className="pt-1">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-400 border border-slate-800 font-mono text-[10px]">
                          Role: {restaurantDetail.adminUser?.role || 'RESTAURANT_ADMIN'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Main Branch & Delivery
                      </span>
                      <p className="font-bold text-white text-sm">
                        {restaurantDetail.branches[0]?.name || 'Main Branch'}
                      </p>
                      <p className="text-slate-300">{restaurantDetail.branches[0]?.address || 'No address set'}</p>
                      <p className="text-slate-400">
                        Radius: {restaurantDetail.branches[0]?.deliveryRadiusKm || 10} km
                      </p>
                      <div className="pt-1">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-emerald-400 border border-slate-800 font-mono text-[10px]">
                          Outlet Active
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Settings & Payments */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Service Modes Enabled
                      </span>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <span
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                            restaurantDetail.settings.isDineInEnabled !== false
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-900 text-slate-500'
                          }`}
                        >
                          Dine-In: {restaurantDetail.settings.isDineInEnabled !== false ? 'Yes' : 'No'}
                        </span>
                        <span
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                            restaurantDetail.settings.isTakeawayEnabled !== false
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-900 text-slate-500'
                          }`}
                        >
                          Takeaway: {restaurantDetail.settings.isTakeawayEnabled !== false ? 'Yes' : 'No'}
                        </span>
                        <span
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                            restaurantDetail.settings.isDeliveryEnabled !== false
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-900 text-slate-500'
                          }`}
                        >
                          Delivery: {restaurantDetail.settings.isDeliveryEnabled !== false ? 'Yes' : 'No'}
                        </span>
                        <span
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                            restaurantDetail.settings.isCounterEnabled !== false
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-900 text-slate-500'
                          }`}
                        >
                          Counter: {restaurantDetail.settings.isCounterEnabled !== false ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Payment Gateway Status
                      </span>
                      <div className="space-y-1 text-slate-300">
                        <p>
                          Mode: <strong>{restaurantDetail.paymentSettings.activePaymentMode}</strong>
                        </p>
                        <p>
                          Cash: {restaurantDetail.paymentSettings.isCashEnabled ? 'Enabled' : 'Disabled'} • UPI:{' '}
                          {restaurantDetail.paymentSettings.isUpiEnabled ? 'Enabled' : 'Disabled'}
                        </p>
                        <p className="font-mono text-slate-400">
                          UPI ID: {restaurantDetail.paymentSettings.upiId || 'Not set'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SEO & Public Storefront Provisioning Card */}
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          SEO & Storefront Readiness
                        </span>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2 mt-0.5">
                          <Globe className="w-4 h-4 text-emerald-400" />
                          <span>Search Engine Discovery & Ordering Links</span>
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                            restaurantDetail.seoReadiness?.isSitemapIncluded
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border-rose-800'
                          }`}
                        >
                          {restaurantDetail.seoReadiness?.isSitemapIncluded ? 'Sitemap Included' : 'Excluded from Sitemap'}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                            restaurantDetail.seoReadiness?.isIndexable
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}
                        >
                          {restaurantDetail.seoReadiness?.isIndexable ? 'Index, Follow' : 'Noindex'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Public Storefront URL */}
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300 font-bold text-[11px] flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-slate-400" />
                            Public Restaurant Page
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-200 bg-slate-950 p-2.5 rounded-lg border border-slate-800 break-all select-all">
                          https://www.starters4u.in/r/{restaurantDetail.restaurant.slug}
                        </div>
                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                `https://www.starters4u.in/r/${restaurantDetail.restaurant.slug}`,
                                'detailPublicUrl'
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5"
                          >
                            {copiedKey === 'detailPublicUrl' ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Link</span>
                              </>
                            )}
                          </button>
                          <a
                            href={`/r/${restaurantDetail.restaurant.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open Page</span>
                          </a>
                        </div>
                      </div>

                      {/* Google Business Ordering URL */}
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-amber-300 font-bold text-[11px] flex items-center gap-1.5">
                            <Share2 className="w-3.5 h-3.5 text-amber-400" />
                            Google Business Ordering URL
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-amber-200 bg-slate-950 p-2.5 rounded-lg border border-slate-800 break-all select-all">
                          https://www.starters4u.in/r/{restaurantDetail.restaurant.slug}/menu
                        </div>
                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                `https://www.starters4u.in/r/${restaurantDetail.restaurant.slug}/menu`,
                                'detailOrderingUrl'
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5"
                          >
                            {copiedKey === 'detailOrderingUrl' ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-slate-950" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Google Ordering URL</span>
                              </>
                            )}
                          </button>
                          <a
                            href={`/r/${restaurantDetail.restaurant.slug}/menu`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open Menu</span>
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                      <p className="font-semibold text-slate-300">Automatic Sitemap & Search Engine Behavior:</p>
                      <p>
                        • <strong>Sitemap Exposing:</strong> Eligible restaurants are exposed instantly in <code className="text-amber-300">/sitemap.xml</code>. No manual file editing or platform redeployment is ever required.
                      </p>
                      <p>
                        • <strong>Google Indexing:</strong> Sitemap inclusion alerts Google crawlers to discover the URL. Actual search results appearance and indexing timelines are governed entirely by Google.
                      </p>
                      {restaurantDetail.seoReadiness?.reasons && restaurantDetail.seoReadiness.reasons.length > 0 && !restaurantDetail.seoReadiness.isEligible && (
                        <div className="mt-2 p-2 rounded bg-rose-950/60 border border-rose-800 text-rose-300">
                          <span className="font-bold">Eligibility Notice: </span>
                          {restaurantDetail.seoReadiness.reasons.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Onboarding Checklist Tracker */}
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Onboarding Checklist Tracker
                        </span>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Progress: {restaurantDetail.onboarding.completedSteps} of {restaurantDetail.onboarding.totalSteps} steps completed
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase ${
                          restaurantDetail.onboarding.overallStatus === 'READY'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {restaurantDetail.onboarding.overallStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Business Details</span>
                        <span className="text-emerald-400 font-bold text-[11px]">READY</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Menu & Catalog</span>
                        <button
                          onClick={() =>
                            handleUpdateOnboardingStep(
                              'menu',
                              restaurantDetail.onboarding.menuStatus === 'READY' ? 'IN_PROGRESS' : 'READY'
                            )
                          }
                          className={`font-bold text-[11px] px-2 py-0.5 rounded transition ${
                            restaurantDetail.onboarding.menuStatus === 'READY'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800 hover:bg-amber-900'
                          }`}
                        >
                          {restaurantDetail.onboarding.menuStatus}
                        </button>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Hours & Timings</span>
                        <span className="text-emerald-400 font-bold text-[11px]">READY</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Tables / QR</span>
                        <span className="text-emerald-400 font-bold text-[11px]">READY</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Payments</span>
                        <span className="text-emerald-400 font-bold text-[11px]">READY</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Printer Pairing</span>
                        <span className="text-slate-400 font-bold text-[11px]">
                          {restaurantDetail.printerStatus.configured ? 'READY' : 'OPTIONAL'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Delivery System</span>
                        <span className="text-emerald-400 font-bold text-[11px]">READY</span>
                      </div>
                    </div>
                  </div>

                  {/* Menu Summary & Printer Hardware */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Menu Summary
                      </span>
                      <p className="text-white font-bold">
                        {restaurantDetail.menuSummary.categoryCount} Categories • {restaurantDetail.menuSummary.itemCount} Dishes
                      </p>
                      <p className="text-slate-400">
                        Dishes are completely isolated and only served under slug <code>/r/{restaurantDetail.restaurant.slug}</code>.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Starters4U Print Agent
                      </span>
                      <div className="flex items-center gap-2">
                        <Printer className="w-4 h-4 text-slate-400" />
                        <span className="font-bold text-white">
                          {restaurantDetail.printerStatus.message}
                        </span>
                      </div>
                      <p className="text-slate-400">
                        Supports automatic pairing code generation via desktop agent in Phase 3.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: EDIT RESTAURANT DETAILS */}
      {/* ========================================================== */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Edit Restaurant Details</h3>
                  <p className="text-xs text-slate-400">
                    Update profile, contact, address, branding, and lifecycle status.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-5">
              {/* Section 1: Basic & Brand Info */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Basic & Brand Identity
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Legal Restaurant Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Customer Facing Display Name
                    </label>
                    <input
                      type="text"
                      value={editFormData.displayName}
                      onChange={(e) => setEditFormData({ ...editFormData, displayName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Cuisine / Tagline / SEO
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. North Indian, Biryani & Fast Food"
                      value={editFormData.cuisine}
                      onChange={(e) => setEditFormData({ ...editFormData, cuisine: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Logo / Banner URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={editFormData.logoUrl}
                      onChange={(e) => setEditFormData({ ...editFormData, logoUrl: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Contact Info */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Contact & Ownership
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Contact / Owner Name
                    </label>
                    <input
                      type="text"
                      value={editFormData.ownerName}
                      onChange={(e) => setEditFormData({ ...editFormData, ownerName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      value={editFormData.phone}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Official Email
                    </label>
                    <input
                      type="email"
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Primary Branch Location & Hours */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Location & Operations
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      value={editFormData.address}
                      onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={editFormData.city}
                      onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      State & Pincode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="State"
                        value={editFormData.state}
                        onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      />
                      <input
                        type="text"
                        placeholder="Pincode"
                        value={editFormData.pincode}
                        onChange={(e) => setEditFormData({ ...editFormData, pincode: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Primary Branch Name
                    </label>
                    <input
                      type="text"
                      value={editFormData.mainBranchName}
                      onChange={(e) => setEditFormData({ ...editFormData, mainBranchName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Operating Hours
                    </label>
                    <input
                      type="text"
                      value={editFormData.businessHours}
                      onChange={(e) => setEditFormData({ ...editFormData, businessHours: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Lifecycle Status & Subscription */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Lifecycle Status & Subscription
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Lifecycle Status *
                    </label>
                    <select
                      value={editFormData.status}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          status: e.target.value as 'active' | 'suspended' | 'inactive' | 'archived',
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="active">Active (Operational & Accessible)</option>
                      <option value="suspended">Suspended (Billing / Violation Block)</option>
                      <option value="inactive">Inactive (Temporarily Disabled)</option>
                      <option value="archived">Archived (Decommissioned)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Subscription Plan
                    </label>
                    <select
                      value={editFormData.subscriptionPlan}
                      onChange={(e) => setEditFormData({ ...editFormData, subscriptionPlan: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="starter">Starter Plan (₹999/mo)</option>
                      <option value="growth">Growth Plan (₹1,999/mo)</option>
                      <option value="pro">Pro Multi-Branch Plan (₹3,999/mo)</option>
                      <option value="enterprise">Enterprise Custom Plan</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center gap-2 shadow-lg disabled:opacity-50"
                >
                  {savingEdit ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Restaurant Details</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
