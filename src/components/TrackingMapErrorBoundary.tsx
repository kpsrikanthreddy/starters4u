import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Navigation, ExternalLink, MapPin } from 'lucide-react';

export interface TrackingMapErrorBoundaryProps {
  children: ReactNode;
  restaurantLocation?: {
    name: string;
    lat: number;
    lng: number;
    googleMapsUrl?: string;
  };
  customerLocation?: {
    address?: string;
    lat?: number;
    lng?: number;
  } | null;
  onRetry?: () => void;
}

interface TrackingMapErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * TrackingMapErrorBoundary
 *
 * Dedicated Error Boundary specifically isolating Google Maps and map rendering failures.
 * If Google Maps fails to authenticate, throws DOM reconciliation errors, or has library
 * loader issues, this Error Boundary catches the failure immediately.
 *
 * It prevents the failure from bubbling up and crashing the entire Tracking Page, ensuring
 * kitchen status, order timeline, items list, bill breakdown, and customer details remain
 * fully visible and interactive.
 */
export class TrackingMapErrorBoundary extends Component<
  TrackingMapErrorBoundaryProps,
  TrackingMapErrorBoundaryState
> {
  constructor(props: TrackingMapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<TrackingMapErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[TrackingMapErrorBoundary] Caught map runtime exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      const { restaurantLocation, customerLocation } = this.props;
      const restUrl =
        restaurantLocation?.googleMapsUrl ||
        (restaurantLocation
          ? `https://www.google.com/maps/search/?api=1&query=${restaurantLocation.lat},${restaurantLocation.lng}`
          : 'https://www.google.com/maps');

      const deliveryUrl =
        customerLocation?.lat && customerLocation?.lng
          ? `https://www.google.com/maps/dir/?api=1&destination=${customerLocation.lat},${customerLocation.lng}`
          : restUrl;

      return (
        <div
          id="tracking-map-error-boundary-fallback"
          className="relative w-full rounded-2xl overflow-hidden border border-amber-400/60 bg-slate-900 text-slate-100 p-5 sm:p-6 shadow-md"
        >
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#33415515_1px,transparent_1px),linear-gradient(to_bottom,#33415515_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white">
                  Interactive Map Temporarily Unavailable
                </h4>
                <p className="text-[11px] text-slate-400">
                  Showing verified order coordinates & navigation links
                </p>
              </div>
            </div>

            <button
              onClick={this.handleRetry}
              type="button"
              id="retry-tracking-map-btn"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>Retry Map</span>
            </button>
          </div>

          {/* Location details summary */}
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3 my-4 text-xs">
            {/* Restaurant origin */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <span>Restaurant Location</span>
              </div>
              <div className="font-semibold text-white">
                {restaurantLocation?.name || 'MOZZ Pizzateria'}
              </div>
              <div className="text-slate-400 text-[11px] mt-0.5">
                Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli, Hyderabad
              </div>
              {restaurantLocation?.lat && restaurantLocation?.lng && (
                <div className="text-[10px] font-mono text-slate-500 mt-1">
                  GPS: {restaurantLocation.lat.toFixed(6)}, {restaurantLocation.lng.toFixed(6)}
                </div>
              )}
            </div>

            {/* Delivery destination */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                <Navigation className="w-3.5 h-3.5 text-emerald-500" />
                <span>Confirmed Delivery Destination</span>
              </div>
              <div className="font-semibold text-white">
                {customerLocation?.address || 'Customer Confirmed Address'}
              </div>
              {customerLocation?.lat && customerLocation?.lng ? (
                <div className="text-[10px] font-mono text-emerald-400 mt-1">
                  GPS: {customerLocation.lat.toFixed(6)}, {customerLocation.lng.toFixed(6)}
                </div>
              ) : (
                <div className="text-slate-400 text-[11px] mt-0.5">
                  Standard delivery zone: Gachibowli, Hyderabad
                </div>
              )}
            </div>
          </div>

          {/* Navigation Action Buttons */}
          <div className="relative z-10 flex flex-wrap gap-2 pt-2">
            <a
              href={restUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Restaurant in Google Maps</span>
            </a>
            <a
              href={deliveryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Open Delivery Navigation</span>
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default TrackingMapErrorBoundary;
