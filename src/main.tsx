import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App.tsx';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
import {
  initChunkRecoveryListeners,
  isAdminRouteOrHost,
} from './utils/chunkReloadRecovery';
import './index.css';

// Initialize global listeners for Vite dynamic import & chunk loading errors
initChunkRecoveryListeners();

const container = document.getElementById('root');

if (!container) {
  console.error('[Starters4U Boot Error] Target container #root not found in document.');
} else {
  const isAdmin = isAdminRouteOrHost();

  // Inspect container children to determine if real pre-rendered HTML exists
  // (ignoring empty whitespace, newlines, or comment nodes)
  const hasPreRenderedElements = Array.from(container.childNodes).some(
    (node) => node.nodeType === Node.ELEMENT_NODE
  );

  const rootElement = (
    <StrictMode>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </StrictMode>
  );

  if (isAdmin) {
    // Admin portals (e.g. admin.starters4u.in, /admin, /restaurant-admin, /platform-admin)
    // are strictly private, dynamic SPAs. They must NEVER hydrate against pre-rendered
    // customer SSG HTML that may have been served by index.html.
    if (container.hasChildNodes()) {
      container.replaceChildren();
    }

    createRoot(container).render(rootElement);
  } else if (hasPreRenderedElements) {
    // Production public customer SSG pages: hydrate pre-rendered markup for fast paint & SEO
    try {
      hydrateRoot(container, rootElement, {
        onRecoverableError(error, errorInfo) {
          console.warn(
            '[Starters4U Hydration Notice] Recoverable mismatch during customer page hydration:',
            error,
            errorInfo
          );
        },
      });
    } catch (hydrationError) {
      console.error(
        '[Starters4U Hydration Error] Failed to hydrate pre-rendered HTML. Falling back to dynamic client render:',
        hydrationError
      );
      container.replaceChildren();
      createRoot(container).render(rootElement);
    }
  } else {
    // Standard dynamic client-side mount
    createRoot(container).render(rootElement);
  }
}
