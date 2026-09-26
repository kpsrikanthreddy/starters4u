import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useApiLoadingStatus,
  APILoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Navigation,
  LocateFixed,
  AlertCircle,
  Store,
  Key,
  Compass,
} from 'lucide-react';
import { Order } from '../types';
import { BUSINESS_INFO } from '../config/businessInfo';
import { useStore } from '../context/StoreContext';
import { useRestaurant } from '../context/RestaurantContext';
import { TrackingMapErrorBoundary } from './TrackingMapErrorBoundary';

/**
 * ============================================================================
 * ROUTE & DIRECTIONS API ARCHITECTURE AND BILLING SKU DOCUMENTATION:
 * ============================================================================
 * 
 * 1. Enabled APIs:
 *    - Google Maps JavaScript API (Map rendering & AdvancedMarkerElement)
 *    - Google Directions API (Turn-by-turn route geometry)
 * 
 * 2. Billing SKU & Cost Profile:
 *    - Directions API SKU: "Directions" (~$5.00 per 1,000 requests) or Routes API "Routes: Compute Routes".
 *    - If requested on every status polling cycle (e.g. 10s intervals), an active customer session
 *      would consume 360 API calls per hour ($1.80/user/hour), creating unsustainable cloud billing.
 * 
 * 3. Request Frequency & Throttling Enforcement:
 *    - Route calculation is cached and executed AT MOST ONCE per unique origin-destination pair.
 *    - Periodic order polling (for kitchen status updates) strictly NEVER re-invokes DirectionsService.
 *    - If Google Directions API is unavailable or unconfigured, the app displays both markers
 *      (Restaurant & Confirmed Delivery Location) and provides high-performance native Google Maps
 *      deep links for live turn-by-turn GPS navigation, eliminating additional API costs.
 * 
 * 4. Directions Link Strategy:
 *    - Restaurant Directions: Opens the owner-confirmed MOZZ Google Maps listing
 *      (https://maps.app.goo.gl/H9R6Fma2rBVmt3uN9).
 *    - Staff Delivery Navigation: Opens Google Maps turn-by-turn directions with the restaurant
 *      entrance as origin and the customer's confirmed delivery coordinates as destination.
 * ============================================================================
 */

// Mandatory Internal Attribution per Google Maps Platform Code Assist guidelines
const GMP_INTERNAL_ATTRIBUTION = 'gmp_mcp_codeassist_v1_aistudio';

// Confirmed Source Location of MOZZ Chinese & Pizzateria from owner-supplied Google Maps listing
// LAT: 17.442509, LNG: 78.353966
export const MOZZ_RESTAURANT_LOCATION = {
  lat: BUSINESS_INFO.geo?.latitude ?? 17.442509,
  lng: BUSINESS_INFO.geo?.longitude ?? 78.353966,
  name: BUSINESS_INFO.restaurantName,
  address:
    BUSINESS_INFO.fullAddress ||
    BUSINESS_INFO.streetAddress ||
    'Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli, Hyderabad, Telangana',
  locality: `${BUSINESS_INFO.locality}, ${BUSINESS_INFO.city}`,
  placeId: BUSINESS_INFO.googlePlaceId || 'ChIJQ_8-QkKTyzsRcb3W1I0llIM',
  googleMapsUrl: BUSINESS_INFO.googleMapsUrl || 'https://maps.app.goo.gl/H9R6Fma2rBVmt3uN9',
};

// Backwards compatibility alias
export const MOZZ_SOURCE_LOCATION = MOZZ_RESTAURANT_LOCATION;

// Calculate Haversine distance in Kilometers
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of Earth in KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

interface GoogleMapsLiveTrackerProps {
  order: Order;
  onAddressDetected?: (address: string, coords: { lat: number; lng: number }) => void;
}

export const GoogleMapsLiveTracker: React.FC<GoogleMapsLiveTrackerProps> = ({
  order,
  onAddressDetected,
}) => {
  const { updateOrderDeliveryLocation } = useStore();

  // Configured Google Maps API Key from environment or runtime
  const [apiKey, setApiKey] = useState<string>(() => {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
    return (
      metaEnv?.VITE_GOOGLE_MAPS_API_KEY ||
      (window as unknown as { __GOOGLE_MAPS_API_KEY?: string }).__GOOGLE_MAPS_API_KEY ||
      ''
    );
  });

  const [showKeyInput, setShowKeyInput] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const [hasAuthFailure, setHasAuthFailure] = useState(false);

  // Global listener for Google Maps auth failure
  useEffect(() => {
    const prevAuthFailure = (window as unknown as { gm_authFailure?: () => void }).gm_authFailure;
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      console.warn('[GoogleMapsLiveTracker] gm_authFailure intercepted: Google Maps authentication failed.');
      setHasAuthFailure(true);
      if (typeof prevAuthFailure === 'function') {
        try {
          prevAuthFailure();
        } catch {}
      }
    };

    return () => {
      (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = prevAuthFailure;
    };
  }, []);

  // Confirmed Customer Delivery Location State:
  // Starts with order.customer coordinates loaded from PostgreSQL.
  // Resiliently handles numbers and numeric strings.
  // Never displays simulated coordinates or artificial movement.
  const [customerCoords, setCustomerCoords] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
  } | null>(() => {
    const rawLat = order.customer?.latitude;
    const rawLng = order.customer?.longitude;
    const lat = typeof rawLat === 'number' ? rawLat : typeof rawLat === 'string' ? parseFloat(rawLat) : NaN;
    const lng = typeof rawLng === 'number' ? rawLng : typeof rawLng === 'string' ? parseFloat(rawLng) : NaN;
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng };
    }
    return null;
  });

  const [customerAddress, setCustomerAddress] = useState<string>(
    order.customer?.address || ''
  );
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const { restaurantName, selectedBranch, isFlagship, address } = useRestaurant();

  const restaurantOrigin = useMemo(() => {
    if (selectedBranch?.latitude && selectedBranch?.longitude) {
      return {
        lat: selectedBranch.latitude,
        lng: selectedBranch.longitude,
        name: selectedBranch.name || restaurantName,
        address: selectedBranch.address || address,
        locality: selectedBranch.locality || (isFlagship ? 'Gachibowli' : 'Hyderabad'),
        placeId: isFlagship ? MOZZ_RESTAURANT_LOCATION.placeId : '',
        googleMapsUrl: isFlagship 
          ? MOZZ_RESTAURANT_LOCATION.googleMapsUrl 
          : `https://www.google.com/maps/search/?api=1&query=${selectedBranch.latitude},${selectedBranch.longitude}`,
      };
    }
    return MOZZ_RESTAURANT_LOCATION;
  }, [selectedBranch, restaurantName, isFlagship, address]);

  // Synchronize state when order data updates from PostgreSQL
  useEffect(() => {
    if (
      typeof order.customer?.latitude === 'number' &&
      typeof order.customer?.longitude === 'number' &&
      !isNaN(order.customer.latitude) &&
      !isNaN(order.customer.longitude)
    ) {
      setCustomerCoords({
        lat: order.customer.latitude,
        lng: order.customer.longitude,
      });
      if (order.customer.address) {
        setCustomerAddress(order.customer.address);
      }
    }
  }, [order.customer?.latitude, order.customer?.longitude, order.customer?.address]);

  // Reverse geocode customer's verified GPS coordinates into human-readable street address
  const reverseGeocode = useCallback(
    async (lat: number, lng: number): Promise<string> => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { Accept: 'application/json' } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data && data.display_name) {
            const formatted = data.display_name;
            setCustomerAddress(formatted);
            if (onAddressDetected) {
              onAddressDetected(formatted, { lat, lng });
            }
            return formatted;
          }
        }
      } catch (err) {
        console.warn('[OrderTracking] Reverse geocode network fallback:', err);
      }

      const coordsAddress = `Confirmed Delivery Pin (${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E)`;
      setCustomerAddress(coordsAddress);
      if (onAddressDetected) {
        onAddressDetected(coordsAddress, { lat, lng });
      }
      return coordsAddress;
    },
    [onAddressDetected]
  );

  // Acquire customer's delivery coordinates from browser upon explicit user request and persist to PostgreSQL
  const acquireCustomerLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setCustomerCoords({
          lat: latitude,
          lng: longitude,
          accuracy: Math.round(accuracy),
        });
        setIsLocating(false);

        const detected = await reverseGeocode(latitude, longitude);

        // Persist confirmed coordinates to PostgreSQL so they survive page refresh and multi-device access
        try {
          await updateOrderDeliveryLocation(order.id, {
            latitude,
            longitude,
            address: detected || customerAddress || undefined,
          });
        } catch (err) {
          console.warn('[OrderTracking] Could not persist coordinates to PostgreSQL:', err);
        }
      },
      (error) => {
        setIsLocating(false);
        console.warn('[OrderTracking] Geolocation error:', error.message);
        if (error.code === error.PERMISSION_DENIED) {
          setGeoError('Location permission denied. Showing confirmed delivery location.');
        } else {
          setGeoError('Unable to retrieve GPS coordinates. Showing confirmed delivery location.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, [reverseGeocode, updateOrderDeliveryLocation, order.id, customerAddress]);

  // Distance Calculation ONLY when confirmed customer coordinates are available
  const distanceKm = useMemo(() => {
    if (!customerCoords) return null;
    return calculateDistanceKm(
      restaurantOrigin.lat,
      restaurantOrigin.lng,
      customerCoords.lat,
      customerCoords.lng
    );
  }, [customerCoords, restaurantOrigin]);

  // Turn-by-Turn Delivery Navigation URL (Restaurant Origin -> Customer Coordinates Destination)
  const deliveryNavigationUrl = useMemo(() => {
    if (customerCoords) {
      return `https://www.google.com/maps/dir/?api=1&origin=${restaurantOrigin.lat},${restaurantOrigin.lng}&destination=${customerCoords.lat},${customerCoords.lng}`;
    }
    const dest = customerAddress || order.customer?.address || 'Gachibowli, Hyderabad';
    return `https://www.google.com/maps/dir/?api=1&origin=${restaurantOrigin.lat},${restaurantOrigin.lng}&destination=${encodeURIComponent(dest)}`;
  }, [customerCoords, customerAddress, order.customer?.address, restaurantOrigin]);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tempApiKey.trim();
    setApiKey(clean);
    (window as unknown as { __GOOGLE_MAPS_API_KEY?: string }).__GOOGLE_MAPS_API_KEY = clean;
    setShowKeyInput(false);
  };

  return (
    <div className="space-y-4">
      {/* Top Order Tracking & Location Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 border border-slate-800 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span>Order Tracking</span>
                <span className="bg-emerald-950/80 text-emerald-300 px-2 py-0.5 text-[10px] rounded border border-emerald-800">
                  RESTAURANT LOCATION CONFIRMED
                </span>
              </div>
              <div className="text-xs text-slate-300 font-medium mt-0.5">
                {distanceKm !== null
                  ? `Transit Distance: ${distanceKm} km from ${restaurantOrigin.name} to Confirmed delivery location`
                  : `Centred on ${restaurantOrigin.name} (${restaurantOrigin.locality})`}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={acquireCustomerLocation}
              disabled={isLocating}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition disabled:opacity-50 cursor-pointer"
              title="Pin and persist confirmed delivery coordinates in PostgreSQL"
            >
              <LocateFixed className={`w-3.5 h-3.5 text-emerald-400 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'Locating...' : customerCoords ? 'Update Confirmed Location' : 'Pin Confirmed Location'}</span>
            </button>

            {/* Restaurant Directions Button: Opens confirmed listing */}
            <a
              href={restaurantOrigin.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              title={`Open confirmed ${restaurantOrigin.name} Google Maps listing and get directions`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Restaurant Directions</span>
            </a>

            {/* Staff Delivery Navigation Button: Restaurant -> Confirmed Delivery Location */}
            <a
              href={deliveryNavigationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              title="Open Google Maps with restaurant as origin and customer coordinates as destination"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Delivery Navigation</span>
            </a>
          </div>
        </div>

        {/* Source & Destination Waypoint Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 text-xs">
          {/* Confirmed Restaurant Location */}
          <div className="flex items-start gap-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="w-7 h-7 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
              <Store className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                <span>Restaurant location</span>
              </div>
              <div className="font-bold text-slate-200 truncate">{restaurantOrigin.name}</div>
              <div className="text-slate-400 text-[11px] truncate" title={restaurantOrigin.address}>
                {restaurantOrigin.address}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                {restaurantOrigin.lat}, {restaurantOrigin.lng}
              </div>
            </div>
          </div>

          {/* Customer Destination Location */}
          <div className="flex items-start gap-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <span>Customer-confirmed delivery location</span>
                {customerCoords?.accuracy && (
                  <span className="text-slate-500 font-normal">±{customerCoords.accuracy}m</span>
                )}
              </div>
              <div className="font-bold text-slate-200 truncate">
                {order.customer?.name ? `${order.customer.name}'s Delivery Address` : 'Confirmed delivery location'}
              </div>
              <div className="text-slate-400 text-[11px] truncate" title={customerAddress || order.customer?.address || 'Address confirmed at checkout'}>
                {customerAddress || order.customer?.address || 'Address confirmed at checkout'}
              </div>
              {customerCoords ? (
                <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                  Confirmed Coordinates: {customerCoords.lat.toFixed(6)}, {customerCoords.lng.toFixed(6)}
                </div>
              ) : (
                <div className="text-[10px] text-amber-400/90 mt-0.5">
                  Coordinates pending • Tap 'Pin Confirmed Location' to save GPS
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Required Live Rider Telemetry Disclaimer Banner */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="font-medium text-slate-200">
              Live rider location is not currently available. Order progress below reflects updates from the restaurant.
            </span>
          </div>
          <div className="text-slate-400 text-[10px]">
            Kitchen status updated in real-time
          </div>
        </div>

        {geoError && (
          <div className="mt-2.5 text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-900/50 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{geoError}</span>
          </div>
        )}
      </div>

      {/* Main Google Maps Interactive Container */}
      <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-slate-900">
        {apiKey && !hasAuthFailure ? (
          <TrackingMapErrorBoundary
            restaurantLocation={restaurantOrigin}
            customerLocation={
              customerCoords
                ? {
                    lat: customerCoords.lat,
                    lng: customerCoords.lng,
                    address: customerAddress || order.customer?.address,
                  }
                : null
            }
            onRetry={() => setHasAuthFailure(false)}
          >
            <APIProvider apiKey={apiKey}>
              <MapWrapper
                restaurantCoords={restaurantOrigin}
                customerCoords={customerCoords}
                restaurantListingUrl={restaurantOrigin.googleMapsUrl}
                deliveryNavigationUrl={deliveryNavigationUrl}
                onAuthFailure={() => setHasAuthFailure(true)}
              />
            </APIProvider>
          </TrackingMapErrorBoundary>
        ) : (
          <StaticCartographicMap
            restaurantCoords={restaurantOrigin}
            customerCoords={customerCoords}
            distanceKm={distanceKm}
            restaurantListingUrl={restaurantOrigin.googleMapsUrl}
            deliveryNavigationUrl={deliveryNavigationUrl}
            onOpenKeyConfig={() => setShowKeyInput(true)}
          />
        )}

        {/* Floating Quick Key Config Badge */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
          <button
            onClick={() => setShowKeyInput((prev) => !prev)}
            className="px-2.5 py-1 rounded-lg bg-slate-900/85 backdrop-blur-md hover:bg-slate-900 text-slate-300 text-[11px] font-medium border border-slate-700/80 shadow-md flex items-center gap-1 transition cursor-pointer"
            title="Configure browser Google Maps API Key"
          >
            <Key className="w-3 h-3 text-amber-400" />
            <span>{apiKey ? 'API Key Active' : 'Configure Maps Key'}</span>
          </button>
        </div>

        {/* API Key Modal / Form */}
        {showKeyInput && (
          <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white text-slate-900 rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-rose-600" />
                  Google Maps API Key
                </h4>
                <button
                  onClick={() => setShowKeyInput(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs p-1"
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-slate-600 mt-2 mb-3">
                Provide a browser-restricted Google Maps JavaScript API key (or configure <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-600">VITE_GOOGLE_MAPS_API_KEY</code>).
              </p>
              <form onSubmit={handleSaveKey} className="space-y-3">
                <input
                  type="text"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-rose-500"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowKeyInput(false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Save & Load Map
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// MapBoundsController: Auto-fits bounds when both markers exist, or centers on MOZZ Restaurant at zoom 16
const MapBoundsController: React.FC<{
  restaurantCoords: { lat: number; lng: number };
  customerCoords: { lat: number; lng: number } | null;
}> = ({ restaurantCoords, customerCoords }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    try {
      if (customerCoords && typeof google !== 'undefined' && google.maps?.LatLngBounds) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: restaurantCoords.lat, lng: restaurantCoords.lng });
        bounds.extend({ lat: customerCoords.lat, lng: customerCoords.lng });
        map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
      } else {
        map.setCenter({ lat: restaurantCoords.lat, lng: restaurantCoords.lng });
        map.setZoom(16);
      }
    } catch (boundsErr) {
      console.warn('[GoogleMaps] Error adjusting map bounds:', boundsErr);
    }
  }, [map, restaurantCoords, customerCoords]);

  return null;
};

/**
 * RouteDirectionsRenderer:
 * Caches and calculates the turn-by-turn route geometry AT MOST ONCE.
 * Does NOT repeatedly invoke Directions API during status polling.
 */
const RouteDirectionsRenderer: React.FC<{
  restaurantCoords: { lat: number; lng: number };
  customerCoords: { lat: number; lng: number } | null;
}> = ({ restaurantCoords, customerCoords }) => {
  const map = useMap();
  const routesLibrary = useMapsLibrary('routes');
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
  const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);
  const lastCalculatedRouteKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!routesLibrary || !map) return;
    try {
      setDirectionsService(new routesLibrary.DirectionsService());
      setDirectionsRenderer(
        new routesLibrary.DirectionsRenderer({
          map,
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: '#e11d48',
            strokeWeight: 4,
            strokeOpacity: 0.85,
          },
        })
      );
    } catch (initErr) {
      console.warn('[GoogleMaps] Error creating DirectionsService/Renderer:', initErr);
    }
  }, [routesLibrary, map]);

  useEffect(() => {
    if (!directionsService || !directionsRenderer) return;

    if (!customerCoords) {
      try {
        directionsRenderer.setMap(null);
      } catch {}
      lastCalculatedRouteKeyRef.current = null;
      return;
    }

    const routeKey = `${customerCoords.lat.toFixed(5)},${customerCoords.lng.toFixed(5)}`;
    // If the route was already calculated for these exact coordinates, skip calling DirectionsService
    if (lastCalculatedRouteKeyRef.current === routeKey) {
      return;
    }

    try {
      directionsRenderer.setMap(map);
      const travelMode =
        typeof google !== 'undefined' && google.maps?.TravelMode?.DRIVING
          ? google.maps.TravelMode.DRIVING
          : ('DRIVING' as any);
      const okStatus =
        typeof google !== 'undefined' && google.maps?.DirectionsStatus?.OK
          ? google.maps.DirectionsStatus.OK
          : 'OK';

      directionsService.route(
        {
          origin: { lat: restaurantCoords.lat, lng: restaurantCoords.lng },
          destination: { lat: customerCoords.lat, lng: customerCoords.lng },
          travelMode,
        },
        (response, status) => {
          try {
            if (status === okStatus && response) {
              directionsRenderer.setDirections(response);
              lastCalculatedRouteKeyRef.current = routeKey;
            } else {
              console.warn('[GoogleMaps] Directions request status:', status);
            }
          } catch (setDirErr) {
            console.warn('[GoogleMaps] Error applying directions result:', setDirErr);
          }
        }
      );
    } catch (routeErr) {
      console.warn('[GoogleMaps] Error requesting directions:', routeErr);
    }

    return () => {
      try {
        if (directionsRenderer) {
          directionsRenderer.setMap(null);
        }
      } catch {}
    };
  }, [directionsService, directionsRenderer, restaurantCoords, customerCoords, map]);

  return null;
};

// MapWrapper: Renders inside APIProvider with Google Maps API
interface MapWrapperProps {
  restaurantCoords: typeof MOZZ_RESTAURANT_LOCATION;
  customerCoords: { lat: number; lng: number } | null;
  restaurantListingUrl: string;
  deliveryNavigationUrl: string;
  onAuthFailure?: () => void;
}

const MapWrapper: React.FC<MapWrapperProps> = ({
  restaurantCoords,
  customerCoords,
  restaurantListingUrl,
  deliveryNavigationUrl,
  onAuthFailure,
}) => {
  const loadingStatus = useApiLoadingStatus();

  useEffect(() => {
    if (
      loadingStatus === APILoadingStatus.FAILED ||
      loadingStatus === APILoadingStatus.AUTH_FAILURE
    ) {
      onAuthFailure?.();
    }
  }, [loadingStatus, onAuthFailure]);

  if (loadingStatus === APILoadingStatus.FAILED || loadingStatus === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-300 bg-slate-900">
        <AlertCircle className="w-10 h-10 text-amber-500 mb-2" />
        <h4 className="text-sm font-bold text-white mb-1">Google Maps Authentication Note</h4>
        <p className="text-xs text-slate-400 max-w-sm mb-4">
          The configured Google Maps API key reported an authentication notice. You can view locations and get turn-by-turn navigation directly on Google Maps.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a
            href={restaurantListingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition"
          >
            Restaurant Directions
          </a>
          <a
            href={deliveryNavigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition"
          >
            Delivery Navigation
          </a>
        </div>
      </div>
    );
  }

  return (
    <Map
      mapId="DEMO_MAP_ID"
      defaultCenter={{ lat: restaurantCoords.lat, lng: restaurantCoords.lng }}
      defaultZoom={16}
      gestureHandling="greedy"
      disableDefaultUI={false}
      style={{ width: '100%', height: '100%' }}
      internalUsageAttributionIds={[GMP_INTERNAL_ATTRIBUTION]}
    >
      {/* Auto-fit bounds controller */}
      <MapBoundsController
        restaurantCoords={restaurantCoords}
        customerCoords={customerCoords}
      />

      {/* Route renderer - only calculated once when customer coordinates exist */}
      <RouteDirectionsRenderer
        restaurantCoords={restaurantCoords}
        customerCoords={customerCoords}
      />

      {/* 1. Verified MOZZ Restaurant Marker (Always present at verified coordinates) */}
      <AdvancedMarker
        position={{ lat: restaurantCoords.lat, lng: restaurantCoords.lng }}
        title={`${restaurantCoords.name} (Restaurant Location)`}
      >
        <div className="flex flex-col items-center cursor-pointer group">
          <div className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-black text-[11px] shadow-lg border border-rose-400 whitespace-nowrap mb-1 flex items-center gap-1">
            <span>MOZZ Restaurant</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-rose-600 border-2 border-white shadow-xl flex items-center justify-center text-white text-lg group-hover:scale-110 transition-transform">
            🏪
          </div>
          <div className="w-2 h-2 bg-rose-600 rotate-45 -mt-1 shadow-sm" />
        </div>
      </AdvancedMarker>

      {/* 2. Customer-Confirmed Delivery Location Marker (Only when confirmed coordinates exist) */}
      {customerCoords && (
        <AdvancedMarker
          position={{ lat: customerCoords.lat, lng: customerCoords.lng }}
          title="Customer-confirmed delivery location"
        >
          <div className="flex flex-col items-center cursor-pointer group">
            <div className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-black text-[11px] shadow-lg border border-emerald-400 whitespace-nowrap mb-1 flex items-center gap-1">
              <span>Confirmed delivery location</span>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 border-2 border-white shadow-xl flex items-center justify-center text-white text-lg group-hover:scale-110 transition-transform">
              📍
            </div>
            <div className="w-2 h-2 bg-emerald-600 rotate-45 -mt-1 shadow-sm" />
          </div>
        </AdvancedMarker>
      )}
    </Map>
  );
};

// StaticCartographicMap: High-reliability offline SVG map with verified coordinates and deep links
interface StaticCartographicMapProps {
  restaurantCoords: typeof MOZZ_RESTAURANT_LOCATION;
  customerCoords: { lat: number; lng: number } | null;
  distanceKm: number | null;
  restaurantListingUrl: string;
  deliveryNavigationUrl: string;
  onOpenKeyConfig: () => void;
}

const StaticCartographicMap: React.FC<StaticCartographicMapProps> = ({
  restaurantCoords,
  customerCoords,
  distanceKm,
  restaurantListingUrl,
  deliveryNavigationUrl,
  onOpenKeyConfig,
}) => {
  return (
    <div className="relative w-full h-full bg-[#1e293b] flex flex-col justify-between p-4 overflow-hidden select-none">
      {/* Background cartographic grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#33415515_1px,transparent_1px),linear-gradient(to_bottom,#33415515_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Top Map Badges */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-1.5 shadow flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-bold text-white">Confirmed Locations Map</span>
          <span className="text-[10px] text-slate-400">| Gachibowli, Hyderabad</span>
        </div>

        {distanceKm !== null && (
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-1.5 shadow text-right">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Transit Distance</div>
            <div className="text-xs font-black text-emerald-400">{distanceKm} km</div>
          </div>
        )}
      </div>

      {/* Map Surface Representation */}
      <div className="relative z-10 w-full h-full flex items-center justify-around py-4">
        {/* 1. Confirmed MOZZ Restaurant Marker */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="bg-rose-600 text-white font-black px-3 py-1 rounded-xl text-xs shadow-lg border border-rose-400 flex items-center gap-1.5">
            <span>Restaurant location</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-600 border-2 border-white text-white flex items-center justify-center font-bold text-xl shadow-xl shadow-rose-950/60">
            🏪
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2 text-[11px] shadow-lg max-w-[220px]">
            <div className="font-bold text-white text-xs">{restaurantCoords.name}</div>
            <div className="text-rose-400 text-[10px] font-medium mt-0.5">Plot no 31, Vinayak Nagar, Indira Nagar</div>
            <div className="text-slate-400 text-[10px]">Gachibowli, Hyderabad</div>
            <div className="text-slate-500 text-[9px] font-mono mt-0.5">
              {restaurantCoords.lat.toFixed(6)}° N, {restaurantCoords.lng.toFixed(6)}° E
            </div>
          </div>
        </div>

        {/* Route indicator line ONLY when customerCoords exist */}
        {customerCoords && (
          <div className="flex-1 max-w-[160px] mx-2 flex flex-col items-center">
            <div className="text-[10px] text-emerald-400 font-bold mb-1">{distanceKm} km transit</div>
            <div className="w-full border-t-2 border-dashed border-emerald-400/70 relative">
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
        )}

        {/* 2. Customer-Confirmed Delivery Location Marker */}
        {customerCoords ? (
          <div className="flex flex-col items-center gap-1.5 text-center">
            <div className="bg-emerald-600 text-white font-black px-3 py-1 rounded-xl text-xs shadow-lg border border-emerald-400 flex items-center gap-1.5">
              <span>Confirmed delivery location</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 border-2 border-white text-white flex items-center justify-center font-bold text-xl shadow-xl shadow-emerald-950/60">
              📍
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2 text-[11px] shadow-lg max-w-[220px]">
              <div className="font-bold text-emerald-400 text-xs">Confirmed delivery location</div>
              <div className="text-slate-400 text-[10px] font-mono mt-0.5">
                {customerCoords.lat.toFixed(6)}° N, {customerCoords.lng.toFixed(6)}° E
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden sm:flex flex-col items-center text-center p-3 bg-slate-900/60 border border-slate-800 rounded-2xl max-w-xs">
            <MapPin className="w-6 h-6 text-slate-500 mb-1" />
            <div className="text-xs font-bold text-slate-300">Confirmed delivery location pending</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Map is centered on MOZZ Restaurant. Tap 'Pin Confirmed Location' above to save GPS.
            </div>
          </div>
        )}
      </div>

      {/* Bottom Map Controls Footer */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700/60 text-xs">
        <div className="flex items-center gap-2 text-slate-300 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Verified MOZZ Coordinates: 17.442509, 78.353966</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenKeyConfig}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
          >
            Google Maps Key
          </button>

          <a
            href={restaurantListingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            title="Open verified MOZZ Google Maps listing"
          >
            <Store className="w-3.5 h-3.5" />
            <span>Restaurant Directions</span>
          </a>

          <a
            href={deliveryNavigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            title="Open turn-by-turn navigation in Google Maps"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Delivery Navigation</span>
          </a>
        </div>
      </div>
    </div>
  );
};
