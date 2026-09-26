import React, { useState, useEffect, Suspense } from 'react';
import { RestaurantProvider, useRestaurant } from './context/RestaurantContext';
import { StoreProvider, useStore } from './context/StoreContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { Navbar } from './components/Navbar';
import { BannerPromise } from './components/BannerPromise';
import { MenuSection } from './components/MenuSection';
import { PizzaCustomizerModal } from './components/PizzaCustomizerModal';
import { CartDrawer } from './components/CartDrawer';
import { CartConflictModal } from './components/CartConflictModal';
import { RestaurantNoticeBanner } from './components/RestaurantNoticeBanner';
import { LiveOrderTracker } from './components/LiveOrderTracker';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CustomerDetailsModal } from './components/CustomerDetailsModal';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { CategoryPage } from './pages/CategoryPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { PolicyPage } from './pages/PolicyPage';
import { ChineseSpecialsPage } from './pages/ChineseSpecialsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RestaurantNotFoundPage } from './pages/RestaurantNotFoundPage';
import { MarketplaceHeader } from './components/marketplace/MarketplaceHeader';
import { MarketplaceFooter } from './components/marketplace/MarketplaceFooter';
import { MarketplaceHome } from './pages/marketplace/MarketplaceHome';
import { PartnerOnboardingPage } from './pages/marketplace/PartnerOnboardingPage';
import { getRouteConfig, PUBLIC_ROUTES } from './routes';
import { SeoRouteConfig } from './types/seoTypes';
import { updateDocumentMetadata } from './utils/updateDocumentMetadata';
import { CANONICAL_DOMAIN } from './config/businessInfo';
import { FoodCategory, Order } from './types';
import { ShoppingBag, ArrowRight, Loader2 } from 'lucide-react';

// Code-split heavy interactive and admin components (Item 12)
const AdminApp = React.lazy(() =>
  import('./components/admin/AdminApp').then((m) => ({ default: m.AdminApp }))
);
const PlatformAdminApp = React.lazy(() =>
  import('./components/admin/PlatformAdminApp').then((m) => ({ default: m.PlatformAdminApp }))
);
const RazorpayCheckoutModal = React.lazy(() =>
  import('./components/RazorpayCheckoutModal').then((m) => ({ default: m.RazorpayCheckoutModal }))
);
const ShapeGuideModal = React.lazy(() =>
  import('./components/ShapeGuideModal').then((m) => ({ default: m.ShapeGuideModal }))
);

interface CustomerAppProps {
  currentPath: string;
  onNavigatePath: (path: string) => void;
}

/**
 * Customer Website Application
 * Supports both SEO-optimized static pre-rendered routes and interactive ordering
 */
const CustomerApp: React.FC<CustomerAppProps> = ({ currentPath, onNavigatePath }) => {
  const {
    itemCount,
    grandTotal,
    setIsCartOpen,
    isCustomerModalOpen,
    setIsCustomerModalOpen,
  } = useStore();

  const {
    restaurant,
    restaurantName,
    restaurantNotFound,
    restaurantSlug,
    tagline,
    logoUrl,
    address,
    isTenantRoute,
    isFlagship,
  } = useRestaurant();

  // Fix Tracker Hydration (Item 11): Keep server and client HTML matched during initial mount ('page'),
  // then transition view in an effect after hydration completes.
  const [currentView, setCurrentView] = useState<'page' | 'track'>('page');

  const [isShapeGuideOpen, setIsShapeGuideOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Sync view state if URL query has ?view=track after mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'track' || window.location.pathname === '/track') {
        setCurrentView('track');
      }

      const handlePop = () => {
        const p = new URLSearchParams(window.location.search);
        if (p.get('view') === 'track' || window.location.pathname === '/track') {
          setCurrentView('track');
        } else {
          setCurrentView('page');
        }
      };
      window.addEventListener('popstate', handlePop);
      return () => window.removeEventListener('popstate', handlePop);
    }
  }, []);

  const handleOrderCompleted = (createdOrder: Order) => {
    setIsCheckoutOpen(false);
    setCurrentView('track');
    if (typeof window !== 'undefined') {
      const trackUrl = isFlagship
        ? `/?view=track&orderId=${encodeURIComponent(createdOrder.id)}`
        : `/r/${restaurantSlug}/track/${encodeURIComponent(createdOrder.id)}`;
      window.history.pushState({}, '', trackUrl);
    }
  };

  // Find SEO route config
  const normalizedPath = currentPath.split('?')[0].replace(/\/$/, '') || '/';
  const routeConfig = getRouteConfig(normalizedPath);

  // Implement Client-Side Metadata Updates (Item 7 & Task 5 route-aware head cleanup)
  useEffect(() => {
    updateDocumentMetadata(routeConfig, normalizedPath, {
      isTracking: currentView === 'track' || normalizedPath === '/track' || normalizedPath.includes('/track') || currentPath.includes('view=track'),
      restaurantNotFound: isTenantRoute && restaurantNotFound,
      restaurant: restaurantSlug ? {
        name: restaurantName || restaurantSlug,
        slug: restaurantSlug,
        tagline: tagline || undefined,
        logoUrl: logoUrl || undefined,
        locality: address?.includes('Gachibowli') ? 'Gachibowli' : (address ? address.split(',')[0].trim() : 'Hyderabad'),
        address: address || undefined,
        cuisines: isFlagship ? ['Chinese', 'Pizza', 'Momos', 'Fast Food'] : ['Multi-Cuisine', 'Fast Food'],
      } : null,
    });
  }, [routeConfig, normalizedPath, currentView, currentPath, isTenantRoute, restaurantNotFound, restaurantSlug, restaurantName, tagline, logoUrl, address, isFlagship]);

  // Render the appropriate main content based on route
  const renderMainContent = () => {
    if (isTenantRoute && restaurantNotFound) {
      return (
        <RestaurantNotFoundPage
          slug={restaurantSlug}
          onNavigateHome={() => onNavigatePath('/')}
        />
      );
    }

    const isOnboardingRoute = normalizedPath === '/onboarding';
    if (isOnboardingRoute) {
      return <PartnerOnboardingPage onNavigate={onNavigatePath} />;
    }

    const isTrackRoute =
      currentView === 'track' ||
      normalizedPath === '/track' ||
      normalizedPath.startsWith('/track/') ||
      normalizedPath.includes('/track') ||
      currentPath.includes('view=track');

    if (isTrackRoute) {
      return (
        <ErrorBoundary
          fallbackTitle="Order Tracking Notice"
          fallbackMessage="The order tracking page encountered an unexpected issue while refreshing. Your order has been placed and is safely registered with the restaurant."
        >
          <LiveOrderTracker
            onBackToMenu={() => {
              setCurrentView('page');
              onNavigatePath(isFlagship ? '/r/mozz' : `/r/${restaurantSlug}`);
            }}
          />
        </ErrorBoundary>
      );
    }

    // Dynamic Restaurant Storefront and Menu routes (/r/:slug, /r/:slug/menu)
    if (normalizedPath.startsWith('/r/')) {
      const isMenuSubroute = normalizedPath.endsWith('/menu');
      const activeName = restaurantName || restaurant?.name || 'Restaurant';

      if (isMenuSubroute) {
        const customMenuConfig: SeoRouteConfig = routeConfig || {
          path: normalizedPath,
          canonicalUrl: `${CANONICAL_DOMAIN}${normalizedPath}`,
          title: `${activeName} Menu - Order Online | Starters4U`,
          metaDescription: `Explore dishes, prices, and combos from ${activeName}. Order online on Starters4U.`,
          h1: `${activeName} Menu`,
          isPublicIndexable: true,
          targetKeywords: [activeName, 'Menu', 'Food Delivery', 'Starters4U'],
          breadcrumbs: [
            { name: 'Home', path: '/' },
            { name: 'Restaurants', path: '/restaurants' },
            { name: activeName, path: `/r/${restaurantSlug}` },
            { name: 'Menu', path: normalizedPath },
          ],
        };
        return <MenuPage routeConfig={customMenuConfig} currentPath={currentPath} />;
      }

      // Storefront landing page
      const customStorefrontConfig: SeoRouteConfig = routeConfig || {
        path: normalizedPath,
        canonicalUrl: `${CANONICAL_DOMAIN}${normalizedPath}`,
        title: `${activeName} | Order Online on Starters4U`,
        metaDescription: `${activeName} - Order online for fast delivery and takeaway on Starters4U.`,
        h1: `Order Online from ${activeName}`,
        isPublicIndexable: true,
        targetKeywords: [activeName, 'Restaurant', 'Order Food Online', 'Starters4U'],
        breadcrumbs: [
          { name: 'Home', path: '/' },
          { name: 'Restaurants', path: '/restaurants' },
          { name: activeName, path: normalizedPath },
        ],
      };
      return (
        <HomePage
          routeConfig={customStorefrontConfig}
          onOpenShapeGuide={() => setIsShapeGuideOpen(true)}
        />
      );
    }

    if (!routeConfig) {
      // Dynamic QR direct entry paths (e.g. /table/*, /counter)
      if (
        normalizedPath.startsWith('/table/') ||
        normalizedPath.startsWith('/counter')
      ) {
        return (
          <>
            <BannerPromise
              onSelectCategory={() => {
                const el = document.getElementById('menu-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              onOpenShapeGuide={() => setIsShapeGuideOpen(true)}
            />
            <MenuSection
              selectedCategory="all"
              onSelectCategory={() => {}}
              onOpenShapeGuide={() => setIsShapeGuideOpen(true)}
            />
          </>
        );
      }
      return <NotFoundPage />;
    }

    switch (routeConfig.path) {
      case '/':
      case '/restaurants':
        return <MarketplaceHome onNavigate={onNavigatePath} />;

      case '/r/mozz':
        return (
          <HomePage
            routeConfig={routeConfig}
            onOpenShapeGuide={() => setIsShapeGuideOpen(true)}
          />
        );

      case '/menu':
        return <MenuPage routeConfig={routeConfig} currentPath={currentPath} />;

      case '/chinese-restaurant-gachibowli':
      case '/chinese-starters-gachibowli':
      case '/veg-starters-gachibowli':
      case '/non-veg-starters-gachibowli':
      case '/pizza-gachibowli':
      case '/korean-pocket-pizza-hyderabad':
      case '/momos-gachibowli':
        return <CategoryPage routeConfig={routeConfig} />;

      case '/chinese-specials-gachibowli':
        return <ChineseSpecialsPage routeConfig={routeConfig} />;

      case '/about':
        return <AboutPage routeConfig={routeConfig} />;

      case '/contact':
        return <ContactPage routeConfig={routeConfig} />;

      case '/delivery-information':
        return <DeliveryPage routeConfig={routeConfig} />;

      case '/privacy-policy':
      case '/terms-and-conditions':
      case '/refund-and-cancellation-policy':
        return <PolicyPage routeConfig={routeConfig} />;

      default:
        return <NotFoundPage />;
    }
  };

  const isMarketplaceRoute = normalizedPath === '/' || normalizedPath === '/restaurants';
  const isOnboardingRoute = normalizedPath === '/onboarding';

  if (isOnboardingRoute) {
    return <PartnerOnboardingPage onNavigate={onNavigatePath} />;
  }

  if (isMarketplaceRoute) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-800 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
        <MarketplaceHeader onNavigate={onNavigatePath} />
        <main className="flex-1">
          <MarketplaceHome onNavigate={onNavigatePath} />
        </main>
        <MarketplaceFooter onNavigate={onNavigatePath} />

        {/* Global Cart Conflict and Cart Drawer modals */}
        <CartConflictModal />
        <CartDrawer
          onOpenCheckout={() => {
            setIsCartOpen(false);
            setIsCheckoutOpen(true);
          }}
        />

        {isCheckoutOpen && (
          <Suspense fallback={null}>
            <RazorpayCheckoutModal
              isOpen={isCheckoutOpen}
              onClose={() => setIsCheckoutOpen(false)}
              onOrderCompleted={handleOrderCompleted}
            />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      {/* Restaurant suspension/inactive banner */}
      <RestaurantNoticeBanner />

      {/* Top Customer Navigation */}
      <Navbar
        currentView={currentView === 'track' ? 'track' : 'menu'}
        onNavigate={(view) => {
          if (view === 'track') {
            setCurrentView('track');
            onNavigatePath('/track');
          } else {
            setCurrentView('page');
            onNavigatePath(isFlagship ? '/r/mozz' : `/r/${restaurantSlug}`);
          }
        }}
        onOpenShapeGuide={() => setIsShapeGuideOpen(true)}
      />

      {/* Main Page Body */}
      <main className="flex-1">{renderMainContent()}</main>

      {/* Customer Footer with verified business info and crawlable internal links */}
      <Footer
        onNavigate={(view) => {
          if (view === 'track') {
            setCurrentView('track');
            onNavigatePath('/track');
          } else {
            setCurrentView('page');
            onNavigatePath(isFlagship ? '/r/mozz' : `/r/${restaurantSlug}`);
          }
        }}
        onOpenShapeGuide={() => setIsShapeGuideOpen(true)}
      />

      {/* Modals & Drawers */}
      <CustomerDetailsModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
      />

      <PizzaCustomizerModal />

      <CartConflictModal />

      <CartDrawer
        onOpenCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      {isCheckoutOpen && (
        <Suspense fallback={null}>
          <RazorpayCheckoutModal
            isOpen={isCheckoutOpen}
            onClose={() => setIsCheckoutOpen(false)}
            onOrderCompleted={handleOrderCompleted}
          />
        </Suspense>
      )}

      {isShapeGuideOpen && (
        <Suspense fallback={null}>
          <ShapeGuideModal
            isOpen={isShapeGuideOpen}
            onClose={() => setIsShapeGuideOpen(false)}
          />
        </Suspense>
      )}

      {/* Floating Mobile Cart Bar */}
      {itemCount > 0 && currentView !== 'track' && (
        <div className="sm:hidden fixed bottom-4 inset-x-4 z-40 animate-in slide-in-from-bottom duration-200">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 text-white font-black text-sm shadow-xl shadow-rose-900/20 flex items-center justify-between border border-rose-400/30 active:scale-[0.98] transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white text-rose-600 text-xs flex items-center justify-center font-black shadow-xs">
                {itemCount}
              </div>
              <span className="text-white font-bold">View Cart</span>
            </div>
            <div className="flex items-center gap-1.5 font-black text-white">
              <span>₹{grandTotal.toFixed(2)}</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default function App({ initialPath }: { initialPath?: string }) {
  const [currentPath, setCurrentPath] = useState(() => {
    if (initialPath) return initialPath;
    if (typeof window !== 'undefined') {
      return window.location.pathname + window.location.search;
    }
    return '/';
  });

  const [currentHost, setCurrentHost] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.hostname;
    }
    return '';
  });

  // Client-side routing with popstate and delegated link interceptor
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname + window.location.search);
      setCurrentHost(window.location.hostname);
    };

    window.addEventListener('popstate', handleLocationChange);

    // Delegated click listener for internal `<a href="/...">` links
    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href) return;

      // Only handle internal relative links (starting with single '/')
      if (
        href.startsWith('/') &&
        !href.startsWith('//') &&
        !href.startsWith('/api') &&
        !target.getAttribute('download') &&
        target.getAttribute('target') !== '_blank'
      ) {
        // Allow standard modifier keys (Ctrl, Cmd, Shift, Alt) for opening in new tab
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          return;
        }

        e.preventDefault();
        window.history.pushState({}, '', href);
        setCurrentPath(href);
        window.scrollTo(0, 0);
      }
    };

    document.addEventListener('click', handleDocumentClick);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      window.scrollTo(0, 0);
    }
  };

  // Determine application mode based on path and subdomain
  const isPlatformAdmin = currentPath.startsWith('/platform-admin');
  const isAdminPortal =
    currentPath.startsWith('/admin') ||
    currentHost.startsWith('admin.') ||
    currentPath.startsWith('/restaurant-admin');

  // Ensure administrative and platform admin portals immediately set private noindex directives
  useEffect(() => {
    if (isPlatformAdmin || isAdminPortal) {
      updateDocumentMetadata(undefined, currentPath, { isAdmin: true });
    }
  }, [isPlatformAdmin, isAdminPortal, currentPath]);

  return (
    <RestaurantProvider currentPath={currentPath}>
      <StoreProvider>
        <AdminAuthProvider>
          {isPlatformAdmin ? (
            <Suspense
              fallback={
                <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                  <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
                </div>
              }
            >
              <PlatformAdminApp />
            </Suspense>
          ) : isAdminPortal ? (
            <Suspense
              fallback={
                <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                  <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
                </div>
              }
            >
              <AdminApp />
            </Suspense>
          ) : (
            <CustomerApp currentPath={currentPath} onNavigatePath={navigateTo} />
          )}
        </AdminAuthProvider>
      </StoreProvider>
    </RestaurantProvider>
  );
}
