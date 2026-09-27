import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { isChunkLoadError, handleChunkLoadRecovery, isAdminRouteOrHost, CHUNK_RELOAD_KEY } from '../utils/chunkReloadRecovery';

export interface GlobalErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  name?: string;
  onReset?: () => void;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isReloading: boolean;
  showDetails: boolean;
}

export class GlobalErrorBoundary extends Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isReloading: false,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<GlobalErrorBoundaryState> {
    const isChunkErr = isChunkLoadError(error);
    return {
      hasError: true,
      error,
      isReloading: isChunkErr,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Always log to console.error without swallowing
    console.error(
      `[GlobalErrorBoundary:${this.props.name || 'Root'}] Caught unhandled application error:`,
      error,
      errorInfo
    );

    this.setState({ errorInfo });

    // If caused by dynamic import / stale Vite chunk after deployment, attempt controlled reload
    if (isChunkLoadError(error)) {
      const initiated = handleChunkLoadRecovery(error);
      if (initiated) {
        this.setState({ isReloading: true });
      }
    }
  }

  handleManualReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleHardReloadWithClean = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {}
      // Force reload without cache
      window.location.href = window.location.href;
    }
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const isAdmin = isAdminRouteOrHost();
      const isChunk = isChunkLoadError(this.state.error);

      if (this.state.isReloading) {
        return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white px-4">
            <div className="flex flex-col items-center gap-4 text-center max-w-md">
              <div className="w-10 h-10 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
              <h2 className="text-lg font-bold text-slate-100">
                Updating to Latest Version...
              </h2>
              <p className="text-xs text-slate-400">
                A new version of the Starters4U platform was deployed. Refreshing application assets...
              </p>
            </div>
          </div>
        );
      }

      const defaultTitle = isAdmin
        ? 'Starters4U Admin could not load.'
        : 'Starters4U could not load.';

      const defaultMessage = isChunk
        ? 'A new system update was deployed or your browser is holding stale assets. Reloading the portal will fetch the latest version.'
        : isAdmin
          ? 'An unexpected error occurred while initializing the Starters4U Admin Portal. Reload the page to resume operations.'
          : 'An unexpected error occurred while loading this page. Please refresh to continue.';

      const title = this.props.fallbackTitle || defaultTitle;
      const message = this.props.fallbackMessage || defaultMessage;

      return (
        <div className={`min-h-screen ${isAdmin ? 'bg-slate-950 text-white' : 'bg-stone-50 text-stone-900'} flex flex-col items-center justify-center p-6 antialiased font-sans`}>
          <div className={`w-full max-w-lg ${isAdmin ? 'bg-slate-900 border-slate-800' : 'bg-white border-stone-200'} border rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200`}>
            {/* Header Icon */}
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-5">
              {isAdmin ? <ShieldAlert className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
            </div>

            {/* Error Title */}
            <h1 className="text-xl sm:text-2xl font-black tracking-tight mb-2">
              {title}
            </h1>

            {/* User-friendly message */}
            <p className={`text-xs sm:text-sm ${isAdmin ? 'text-slate-400' : 'text-stone-600'} max-w-sm mb-6 leading-relaxed`}>
              {message}
            </p>

            {/* Primary Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto mb-6">
              <button
                type="button"
                onClick={this.handleManualReload}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-900/30 transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 stroke-[2.5]" />
                <span>{isAdmin ? 'Reload Admin Portal' : 'Reload Page'}</span>
              </button>

              <button
                type="button"
                onClick={this.handleHardReloadWithClean}
                className={`w-full sm:w-auto px-5 py-3 rounded-xl ${
                  isAdmin
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                } active:scale-[0.98] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer`}
              >
                <RotateCcw className="w-4 h-4" />
                <span>Hard Reload</span>
              </button>
            </div>

            {/* Collapsible Diagnostic Details for Troubleshooting */}
            <div className="w-full pt-4 border-t border-slate-800/60 text-left">
              <button
                type="button"
                onClick={this.toggleDetails}
                className={`text-[11px] font-medium flex items-center justify-between w-full ${
                  isAdmin ? 'text-slate-500 hover:text-slate-400' : 'text-stone-400 hover:text-stone-600'
                } transition cursor-pointer`}
              >
                <span>Diagnostics & Error Details</span>
                {this.state.showDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {this.state.showDetails && (
                <div className={`mt-3 p-3 rounded-xl text-left text-[11px] font-mono overflow-x-auto max-h-48 ${
                  isAdmin ? 'bg-slate-950 text-rose-300 border border-slate-800' : 'bg-stone-100 text-rose-700 border border-stone-200'
                }`}>
                  <div className="font-bold mb-1">{this.state.error.name}: {this.state.error.message}</div>
                  {this.state.error.stack && (
                    <pre className="text-[10px] text-slate-400 whitespace-pre-wrap">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
