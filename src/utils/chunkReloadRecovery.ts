import React from 'react';

export const CHUNK_RELOAD_KEY = 'starters4u_chunk_reload';

/**
 * Detect whether an error is caused by a failed dynamic import / stale chunk load.
 * This happens when a new Vite build is deployed with new chunk hashes,
 * but a client has an older index.html or older runtime in memory.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);

  const lower = message.toLowerCase();

  return (
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('importing a module script failed') ||
    lower.includes('error loading dynamically imported module') ||
    lower.includes('chunkloaderror') ||
    lower.includes('failed to load module script') ||
    lower.includes('error resolving module specifier') ||
    (lower.includes('unexpected token') && lower.includes('<')) ||
    (typeof error === 'object' && error !== null && 'name' in error && (error as any).name === 'ChunkLoadError')
  );
}

/**
 * Performs ONE controlled hard reload if a chunk load failure is detected.
 * Guards against infinite reload loops using sessionStorage.
 * Returns true if a reload was initiated, or false if already reloaded or not a chunk error.
 */
export function handleChunkLoadRecovery(error: unknown): boolean {
  if (typeof window === 'undefined') return false;

  if (isChunkLoadError(error)) {
    try {
      const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      if (!alreadyReloaded) {
        console.warn(
          '[Starters4U Chunk Recovery] Stale/missing JavaScript chunk detected after deployment. Triggering one-time page reload...',
          error
        );
        sessionStorage.setItem(CHUNK_RELOAD_KEY, Date.now().toString());
        // Force hard reload from server
        window.location.reload();
        return true;
      } else {
        console.error(
          '[Starters4U Chunk Recovery] Dynamic chunk failed to load even after reload attempt:',
          error
        );
      }
    } catch (storageErr) {
      console.error('[Starters4U Chunk Recovery] SessionStorage error during recovery check:', storageErr);
    }
  }

  return false;
}

/**
 * Clears the reload guard flag once the application or admin portal mounts successfully.
 */
export function clearChunkReloadFlag(): void {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    }
  } catch {
    // Ignore storage exceptions (e.g. strict privacy mode)
  }
}

/**
 * Robust wrapper around React.lazy with automatic chunk-load retry and deployment recovery.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      console.error('[Starters4U LazyLoad] Dynamic chunk import failed:', error);

      if (isChunkLoadError(error)) {
        const reloaded = handleChunkLoadRecovery(error);
        if (reloaded) {
          // Keep promise pending while window.location.reload() executes
          return new Promise<{ default: T }>(() => {});
        }
      }

      throw error;
    }
  });
}

/**
 * Determines whether the current execution context is on an admin domain or route.
 * Admin portals are 100% dynamic/private and must NEVER be hydrated against
 * pre-rendered customer marketing SSG HTML.
 */
export function isAdminRouteOrHost(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const host = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();

    return (
      host.startsWith('admin.') ||
      host.includes('admin') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/restaurant-admin') ||
      pathname.startsWith('/platform-admin') ||
      search.includes('tab=dashboard') ||
      search.includes('section=dashboard')
    );
  } catch {
    return false;
  }
}

/**
 * Installs global window error listeners to capture Vite preload and module loading errors.
 */
export function initChunkRecoveryListeners(): void {
  if (typeof window === 'undefined') return;

  // Vite emits 'vite:preloadError' when dynamic import preload fails
  window.addEventListener('vite:preloadError', (event: any) => {
    console.warn('[Starters4U] Vite preload error event captured:', event);
    handleChunkLoadRecovery(event?.payload || event);
  });

  // Global unhandled promise rejection listener for dynamic import errors
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (isChunkLoadError(event.reason)) {
      console.warn('[Starters4U] Unhandled dynamic chunk rejection captured:', event.reason);
      const reloaded = handleChunkLoadRecovery(event.reason);
      if (reloaded) {
        event.preventDefault();
      }
    }
  });
}
