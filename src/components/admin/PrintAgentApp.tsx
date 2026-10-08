import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Printer,
  Wifi,
  WifiOff,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Laptop,
  CheckCircle2,
  Server,
  Activity,
  LogOut,
  Building2,
  Clock,
  Radio,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';

const STORAGE_KEYS = {
  DEVICE_ID: 'starters4u_print_device_id',
  DEVICE_NAME: 'starters4u_print_device_name',
  RESTAURANT_ID: 'starters4u_print_restaurant_id',
  RESTAURANT_NAME: 'starters4u_print_restaurant_name',
  BRANCH_ID: 'starters4u_print_branch_id',
  BRANCH_NAME: 'starters4u_print_branch_name',
  BACKEND_URL: 'starters4u_print_backend_url',
  DEVICE_TOKEN: 'starters4u_print_device_token',
};

const DEFAULT_BACKEND_URL = 'https://www.starters4u.in';
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds (Requirement 2)
const ONLINE_TIMEOUT_MS = 90000; // 90 seconds (Requirement 4)

export const PrintAgentApp: React.FC = () => {
  // Saved device credentials
  const [deviceId, setDeviceId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.DEVICE_ID) || '';
  });
  const [deviceName, setDeviceName] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.DEVICE_NAME) || 'Windows POS Terminal';
  });
  const [restaurantId, setRestaurantId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.RESTAURANT_ID) || '';
  });
  const [restaurantName, setRestaurantName] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.RESTAURANT_NAME) || '';
  });
  const [branchId, setBranchId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.BRANCH_ID) || '';
  });
  const [branchName, setBranchName] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.BRANCH_NAME) || '';
  });
  const [backendUrl, setBackendUrl] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BACKEND_URL);
    if (saved && !saved.includes('admin.starters4u.in')) return saved;
    // Default to origin in browser or fallback to production canonical domain
    if (typeof window !== 'undefined' && window.location.origin && !window.location.hostname.startsWith('admin.')) {
      return window.location.origin;
    }
    return DEFAULT_BACKEND_URL;
  });
  const [deviceToken, setDeviceToken] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN) || '';
  });

  // Pairing input states
  const [pairingCodeInput, setPairingCodeInput] = useState<string>('');
  const [pairingDeviceNameInput, setPairingDeviceNameInput] = useState<string>('Front Counter Thermal POS');
  const [isPairing, setIsPairing] = useState<boolean>(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  // Heartbeat & status states
  const [isSendingHeartbeat, setIsSendingHeartbeat] = useState<boolean>(false);
  const [lastHeartbeatSuccess, setLastHeartbeatSuccess] = useState<string | null>(null);
  const [lastApiError, setLastApiError] = useState<string | null>(null);
  const [heartbeatCounter, setHeartbeatCounter] = useState<number>(0);
  const [secondsUntilNext, setSecondsUntilNext] = useState<number>(30);
  const [isOnline, setIsOnline] = useState<boolean>(false);

  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isPaired = Boolean(deviceToken && restaurantId && branchId && deviceId);

  // Normalize backend URL (Requirement 5: Must use https://www.starters4u.in, do not use admin.starters4u.in)
  const sanitizeBackendUrl = (url: string): string => {
    let clean = (url || '').trim().replace(/\/+$/, '');
    if (clean.includes('admin.starters4u.in')) {
      clean = clean.replace('admin.starters4u.in', 'www.starters4u.in');
    }
    if (clean === 'https://starters4u.in' || clean === 'http://starters4u.in' || clean === 'starters4u.in') {
      clean = 'https://www.starters4u.in';
    }
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    return clean;
  };

  // Perform authenticated heartbeat call
  const sendHeartbeat = useCallback(
    async (
      overrideToken?: string,
      overrideDeviceId?: string,
      overrideRestaurantId?: string,
      overrideBranchId?: string
    ) => {
      const activeToken = overrideToken || deviceToken;
      const activeDevId = overrideDeviceId || deviceId;
      const activeRestId = overrideRestaurantId || restaurantId;
      const activeBrId = overrideBranchId || branchId;

      if (!activeToken) return;

      setIsSendingHeartbeat(true);
      const targetUrl = sanitizeBackendUrl(backendUrl);

      try {
        const endpoint = `${targetUrl}/api/print-agent/devices/heartbeat`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeToken}`,
            'x-device-token': activeToken,
          },
          body: JSON.stringify({
            deviceId: activeDevId,
            restaurantId: activeRestId,
            branchId: activeBrId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          const nowIso = new Date().toISOString();
          setLastHeartbeatSuccess(nowIso);
          setLastApiError(null);
          setIsOnline(true);
          setHeartbeatCounter((prev) => prev + 1);
        } else {
          const errorMsg = data.error || `HTTP ${res.status}: Failed to update heartbeat`;
          setLastApiError(`${errorMsg} (${new Date().toLocaleTimeString()})`);
          setIsOnline(false);
        }
      } catch (err: any) {
        setLastApiError(`${err.message || 'Network error'} (${new Date().toLocaleTimeString()})`);
        setIsOnline(false);
      } finally {
        setIsSendingHeartbeat(false);
        setSecondsUntilNext(30);
      }
    },
    [deviceToken, backendUrl, deviceId, restaurantId, branchId]
  );

  // Requirement 2: Immediately send authenticated heartbeat, then repeat every 30 seconds
  useEffect(() => {
    if (!isPaired) {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setIsOnline(false);
      return;
    }

    // Immediate heartbeat on mount or pairing
    sendHeartbeat();

    // 30-second interval
    heartbeatTimerRef.current = setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    // Countdown timer for next heartbeat
    setSecondsUntilNext(30);
    countdownTimerRef.current = setInterval(() => {
      setSecondsUntilNext((prev) => (prev > 1 ? prev - 1 : 30));
    }, 1000);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isPaired, sendHeartbeat]);

  // Requirement 4: Evaluate online status based on 90s window
  useEffect(() => {
    if (!lastHeartbeatSuccess) {
      setIsOnline(false);
      return;
    }

    const checkTimeout = () => {
      const diffMs = Date.now() - new Date(lastHeartbeatSuccess).getTime();
      setIsOnline(diffMs <= ONLINE_TIMEOUT_MS && diffMs >= -120000);
    };

    checkTimeout();
    const interval = setInterval(checkTimeout, 5000);
    return () => clearInterval(interval);
  }, [lastHeartbeatSuccess]);

  // Handle pairing code submission
  const handlePairDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairingError(null);

    const cleanCode = pairingCodeInput.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setPairingError('Please enter a valid 6-digit numeric pairing code.');
      return;
    }

    const cleanUrl = sanitizeBackendUrl(backendUrl);
    const assignedDeviceId = deviceId || `win-pos-${Math.random().toString(36).substring(2, 8)}`;
    const assignedDeviceName = pairingDeviceNameInput.trim() || 'Windows POS Terminal';

    setIsPairing(true);

    try {
      const endpoint = `${cleanUrl}/api/print-agent/devices/pair`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairingCode: cleanCode,
          deviceId: assignedDeviceId,
          deviceName: assignedDeviceName,
          platform: 'win32',
          appVersion: '1.0.0',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Pairing failed. The code may be invalid or expired.');
      }

      // Requirement 1: Persist deviceId, restaurantId, branchId, backendUrl, and secure token
      const resolvedDeviceId = data.deviceId || data.device?.deviceId || assignedDeviceId;
      const resolvedRestaurantId = data.restaurantId || data.restaurant?.id || data.device?.restaurantId;
      const resolvedRestaurantName = data.restaurant?.name || 'Starters4U Restaurant';
      const resolvedBranchId = data.branchId || data.branch?.id || data.device?.branchId;
      const resolvedBranchName = data.branch?.name || 'Main Branch';
      const resolvedToken = data.deviceToken || data.token;

      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, resolvedDeviceId);
      localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, assignedDeviceName);
      localStorage.setItem(STORAGE_KEYS.RESTAURANT_ID, resolvedRestaurantId);
      localStorage.setItem(STORAGE_KEYS.RESTAURANT_NAME, resolvedRestaurantName);
      localStorage.setItem(STORAGE_KEYS.BRANCH_ID, resolvedBranchId);
      localStorage.setItem(STORAGE_KEYS.BRANCH_NAME, resolvedBranchName);
      localStorage.setItem(STORAGE_KEYS.BACKEND_URL, cleanUrl);
      localStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, resolvedToken);

      setDeviceId(resolvedDeviceId);
      setDeviceName(assignedDeviceName);
      setRestaurantId(resolvedRestaurantId);
      setRestaurantName(resolvedRestaurantName);
      setBranchId(resolvedBranchId);
      setBranchName(resolvedBranchName);
      setBackendUrl(cleanUrl);
      setDeviceToken(resolvedToken);
      setPairingCodeInput('');

      // Send initial heartbeat immediately with the fresh token and credentials
      await sendHeartbeat(resolvedToken, resolvedDeviceId, resolvedRestaurantId, resolvedBranchId);
    } catch (err: any) {
      setPairingError(err.message || 'Failed to communicate with Starters4U backend server.');
    } finally {
      setIsPairing(false);
    }
  };

  // Disconnect / Unpair device
  const handleUnpair = async () => {
    if (!window.confirm('Are you sure you want to disconnect this terminal? You will need a new 6-digit code from Restaurant Admin to pair again.')) {
      return;
    }

    try {
      const cleanUrl = sanitizeBackendUrl(backendUrl);
      if (deviceToken) {
        await fetch(`${cleanUrl}/api/print-agent/devices/deactivate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${deviceToken}`,
          },
        }).catch(() => {});
      }
    } finally {
      // Clear local storage
      Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
      setDeviceToken('');
      setRestaurantId('');
      setBranchId('');
      setIsOnline(false);
      setLastHeartbeatSuccess(null);
      setLastApiError(null);
    }
  };

  // Format relative time helper
  const formatRelativeTime = (isoString?: string | null) => {
    if (!isoString) return 'None yet';
    const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSec < 0 || diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 120) return '1 minute ago';
    return `${Math.floor(diffSec / 60)}m ago`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-base tracking-tight">Starters4U Print Agent</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  Windows POS v1.0.0
                </span>
              </div>
              <p className="text-xs text-slate-400">Desktop Thermal POS & Kitchen Ticket Dispatcher</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Online Status Badge */}
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center gap-2 ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span>{isOnline ? 'Agent Online' : 'Agent Offline'}</span>
            </div>

            {isPaired && (
              <button
                onClick={handleUnpair}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                title="Disconnect & Unpair this terminal"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Unpair</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-6">
        {/* Pairing Box (if NOT paired) */}
        {!isPaired ? (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5" /> Hardware Terminal Setup
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white">Pair Desktop Print Agent</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter the 6-digit code generated from{' '}
                  <span className="text-rose-400 font-bold">Restaurant Admin &gt; Print Devices</span> to register this
                  terminal.
                </p>
              </div>

              {pairingError && (
                <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl flex items-start gap-3 text-rose-300 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    <p className="font-bold">Pairing Failed</p>
                    <p className="mt-0.5 text-rose-400">{pairingError}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handlePairDevice} className="space-y-4">
                {/* Backend URL (Requirement 5) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-slate-400" /> Backend Base URL
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">Use https://www.starters4u.in</span>
                  </label>
                  <input
                    type="url"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    required
                    placeholder="https://www.starters4u.in"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition"
                  />
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Info className="w-3 h-3 text-amber-400" />
                    Always use <span className="font-mono text-slate-300">https://www.starters4u.in</span>. Do not use admin.starters4u.in.
                  </p>
                </div>

                {/* 6-digit pairing code */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-rose-400" /> 6-Digit Pairing Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    inputMode="numeric"
                    value={pairingCodeInput}
                    onChange={(e) => setPairingCodeInput(e.target.value.replace(/\D/g, ''))}
                    required
                    placeholder="e.g. 748291"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-2xl font-black text-rose-400 font-mono tracking-widest text-center focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition"
                  />
                </div>

                {/* Terminal Device Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-slate-400" /> Terminal Name
                  </label>
                  <input
                    type="text"
                    value={pairingDeviceNameInput}
                    onChange={(e) => setPairingDeviceNameInput(e.target.value)}
                    required
                    placeholder="Front Counter Thermal POS"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPairing || pairingCodeInput.length !== 6}
                  className="w-full py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black text-xs uppercase tracking-wider transition shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isPairing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Authenticating Hardware with Backend...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Pair & Establish Secure Connection</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Paired & Active Terminal Console */
          <div className="space-y-6">
            {/* Top Status Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start sm:items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${
                    isOnline
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}
                >
                  {isOnline ? <Wifi className="w-7 h-7" /> : <WifiOff className="w-7 h-7" />}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xl font-black ${
                        isOnline ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {isOnline ? 'Online • Actively Dispatching' : 'Offline • Reconnecting'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      (Next heartbeat in {secondsUntilNext}s)
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Paired with <strong className="text-white">{restaurantName || 'Restaurant'}</strong> (
                    {branchName || 'Branch'})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => sendHeartbeat()}
                  disabled={isSendingHeartbeat}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition flex items-center gap-2 border border-slate-700 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSendingHeartbeat ? 'animate-spin text-rose-400' : ''}`} />
                  <span>Send Heartbeat Now</span>
                </button>
              </div>
            </div>

            {/* Requirement 6: Clear Diagnostics Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-rose-500" />
                  <h3 className="text-base font-black text-white">Device Diagnostics & Telemetry</h3>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">Heartbeats Sent: {heartbeatCounter}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Paired Restaurant */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-rose-400" /> Paired Restaurant
                  </span>
                  <div className="text-sm font-bold text-white">{restaurantName || 'Configured Restaurant'}</div>
                  <div className="text-[11px] font-mono text-slate-400 truncate" title={restaurantId}>
                    ID: {restaurantId}
                  </div>
                </div>

                {/* 2. Paired Branch */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" /> Paired Branch
                  </span>
                  <div className="text-sm font-bold text-white">{branchName || 'Main Dining Branch'}</div>
                  <div className="text-[11px] font-mono text-slate-400 truncate" title={branchId}>
                    ID: {branchId}
                  </div>
                </div>

                {/* 3. Device Identification */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-blue-400" /> Hardware Device ID
                  </span>
                  <div className="text-sm font-bold text-white">{deviceName}</div>
                  <div className="text-[11px] font-mono text-slate-400 truncate" title={deviceId}>
                    {deviceId}
                  </div>
                </div>

                {/* 4. Backend Base URL */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-emerald-400" /> Target Backend URL
                  </span>
                  <div className="text-sm font-mono font-bold text-emerald-400 truncate">{backendUrl}</div>
                  <div className="text-[11px] text-slate-400">Strictly HTTPS • starters4u.in</div>
                </div>

                {/* 5. Last Successful Heartbeat */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-purple-400" /> Last Successful Heartbeat
                  </span>
                  <div className="text-sm font-bold text-white">
                    {formatRelativeTime(lastHeartbeatSuccess)}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate">
                    {lastHeartbeatSuccess
                      ? new Date(lastHeartbeatSuccess).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : 'Awaiting response...'}
                  </div>
                </div>

                {/* 6. Last API Error */}
                <div
                  className={`border rounded-2xl p-4 space-y-1 ${
                    lastApiError
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <AlertTriangle className={`w-3.5 h-3.5 ${lastApiError ? 'text-rose-400' : 'text-slate-400'}`} />
                    Last API Error
                  </span>
                  <div
                    className={`text-xs font-mono font-bold truncate ${
                      lastApiError ? 'text-rose-300' : 'text-emerald-400'
                    }`}
                  >
                    {lastApiError || 'None (Healthy)'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {lastApiError ? 'Check network connectivity' : 'All systems operating normally'}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions & Links */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <h4 className="text-sm font-black text-white">Need to verify status in Restaurant Admin?</h4>
                <p className="text-xs text-slate-400">
                  Open Print Devices in your admin dashboard. It polls automatically every 10 seconds.
                </p>
              </div>

              <a
                href="/admin?tab=print-devices"
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition flex items-center gap-1.5 border border-slate-700"
              >
                <span>View in Admin Dashboard</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
