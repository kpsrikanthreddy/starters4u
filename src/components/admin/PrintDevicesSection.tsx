import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import {
  Printer,
  Wifi,
  WifiOff,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Laptop,
  Trash2,
  CheckCircle2,
  Monitor,
  Building2,
  Info,
  X,
  Radio,
} from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
}

interface PrintDevice {
  id: string;
  restaurantId: string;
  branchId: string;
  branchName?: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  isActive: boolean;
  lastHeartbeatAt: string;
  createdAt: string;
  updatedAt: string;
}

interface PairingCodeResponse {
  pairingCode: string;
  expiresAt: string;
  expiresInSeconds: number;
  restaurantId: string;
  branchId: string;
}

export const PrintDevicesSection: React.FC = () => {
  const { user, adminFetch } = useAdminAuth();

  // Role validation: Only RESTAURANT_OWNER, BRANCH_MANAGER, MANAGER, or SUPER_ADMIN
  const isPermitted = useMemo(() => {
    if (!user) return false;
    const role = (user.role || '').toUpperCase();
    return (
      role === 'SUPER_ADMIN' ||
      role === 'SUPERADMIN' ||
      role === 'RESTAURANT_OWNER' ||
      role === 'OWNER' ||
      role === 'ADMIN' ||
      role === 'BRANCH_MANAGER' ||
      role === 'MANAGER'
    );
  }, [user]);

  // Branch and device states
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [devices, setDevices] = useState<PrintDevice[]>([]);
  const [loadingBranches, setLoadingBranches] = useState<boolean>(true);
  const [loadingDevices, setLoadingDevices] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Pairing code states (Generated exclusively by backend)
  const [pairingData, setPairingData] = useState<PairingCodeResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  // Revocation state
  const [deviceToRevoke, setDeviceToRevoke] = useState<PrintDevice | null>(null);
  const [isRevoking, setIsRevoking] = useState<boolean>(false);

  // Fetch branches belonging to logged-in restaurant
  const fetchBranches = useCallback(async () => {
    setLoadingBranches(true);
    try {
      const res = await adminFetch('/api/admin/branches');
      if (res.ok) {
        const data = await res.json();
        setBranches(data);
        if (data.length > 0) {
          // If current selectedBranchId is empty or not in branches, select first
          setSelectedBranchId((prev) => {
            if (prev && data.some((b: Branch) => b.id === prev)) return prev;
            if (user?.branchId && data.some((b: Branch) => b.id === user.branchId)) return user.branchId;
            return data[0].id;
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setApiError(err.error || 'Failed to load restaurant branches.');
      }
    } catch (err: any) {
      setApiError(err.message || 'Network error fetching branches.');
    } finally {
      setLoadingBranches(false);
    }
  }, [adminFetch, user?.branchId]);

  // Fetch registered print devices for the restaurant
  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    setApiError(null);
    try {
      const queryParam = selectedBranchId ? `?branchId=${encodeURIComponent(selectedBranchId)}` : '';
      const res = await adminFetch(`/api/admin/print-devices${queryParam}`);
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setApiError(err.error || 'Failed to load print devices.');
      }
    } catch (err: any) {
      setApiError(err.message || 'Network error fetching print devices.');
    } finally {
      setLoadingDevices(false);
    }
  }, [adminFetch, selectedBranchId]);

  // Initial load
  useEffect(() => {
    if (isPermitted) {
      fetchBranches();
    }
  }, [isPermitted, fetchBranches]);

  useEffect(() => {
    if (isPermitted) {
      fetchDevices();
    }
  }, [isPermitted, fetchDevices]);

  // Live countdown timer for pairing code
  useEffect(() => {
    if (!pairingData || !pairingData.expiresAt) {
      setRemainingSeconds(0);
      setIsExpired(false);
      return;
    }

    const updateTimer = () => {
      const diffMs = new Date(pairingData.expiresAt).getTime() - Date.now();
      const seconds = Math.floor(diffMs / 1000);
      if (seconds <= 0) {
        setRemainingSeconds(0);
        setIsExpired(true);
      } else {
        setRemainingSeconds(seconds);
        setIsExpired(false);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [pairingData]);

  // Generate pairing code calling backend endpoint
  const handleGenerateCode = async () => {
    if (!selectedBranchId) {
      setApiError('Please select a branch first.');
      return;
    }

    setIsGenerating(true);
    setApiError(null);
    setCopied(false);

    try {
      const res = await adminFetch('/api/admin/print-devices/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: selectedBranchId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate pairing code');
      }

      setPairingData({
        pairingCode: data.pairingCode,
        expiresAt: data.expiresAt,
        expiresInSeconds: data.expiresInSeconds || 600,
        restaurantId: data.restaurantId,
        branchId: data.branchId,
      });
      setIsExpired(false);
    } catch (err: any) {
      setApiError(err.message || 'Error communicating with backend.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy pairing code to clipboard
  const handleCopyCode = async () => {
    if (!pairingData?.pairingCode || isExpired) return;
    try {
      await navigator.clipboard.writeText(pairingData.pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  // Revoke device handler
  const handleConfirmRevoke = async () => {
    if (!deviceToRevoke) return;
    setIsRevoking(true);
    try {
      const res = await adminFetch(`/api/admin/print-devices/${deviceToRevoke.id}/deactivate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to deactivate device');
      }
      setDeviceToRevoke(null);
      await fetchDevices();
    } catch (err: any) {
      setApiError(err.message || 'Failed to revoke device.');
    } finally {
      setIsRevoking(false);
    }
  };

  // Format countdown mm:ss
  const formatCountdown = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format relative heartbeat
  const formatHeartbeat = (isoString?: string) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 120) return '1 minute ago';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Check device status
  const getDeviceStatus = (device: PrintDevice) => {
    if (!device.isActive) {
      return { label: 'Revoked', color: 'bg-slate-100 text-slate-600 border-slate-300', isOnline: false };
    }
    const diffMs = Date.now() - new Date(device.lastHeartbeatAt).getTime();
    const isOnline = diffMs < 2 * 60 * 1000; // online if heartbeat within 2 minutes
    if (isOnline) {
      return { label: 'Online', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', isOnline: true };
    }
    return { label: 'Offline', color: 'bg-amber-50 text-amber-700 border-amber-200', isOnline: false };
  };

  // Unauthorized Access State (Requirement 2 & 17)
  if (!isPermitted) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-3xl border border-rose-200 p-8 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Access Restricted</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Only authenticated <span className="font-bold text-slate-900">Restaurant Owners</span>,{' '}
            <span className="font-bold text-slate-900">Branch Managers</span>, and authorized administrative accounts
            are permitted to access Print Devices and generate POS pairing codes.
          </p>
          <p className="text-xs text-slate-400 font-mono">Current role: {user?.role || 'UNAUTHENTICATED'}</p>
        </div>
      </div>
    );
  }

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5 text-rose-600" />
              Thermal POS Hardware Integration
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Tenant Isolated
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Print Devices & POS Pairing
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
            Connect desktop thermal receipt and Kitchen Order Ticket (KOT) printers. Generate a secure, single-use
            6-digit pairing code to authenticate the Starters4U Windows Print Agent at this branch.
          </p>
        </div>

        {/* Branch Selector (Populated exclusively with branches belonging to logged-in restaurant) */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 min-w-[280px] space-y-2">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
            <Building2 className="w-3.5 h-3.5 text-rose-600" />
            Active Restaurant Branch
          </label>
          {loadingBranches ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
              <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
              <span>Loading outlet branches...</span>
            </div>
          ) : branches.length === 0 ? (
            <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200">
              No branches found for your restaurant account.
            </div>
          ) : (
            <select
              id="branch-selector"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 transition shadow-xs cursor-pointer"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {selectedBranch && (
            <p className="text-[11px] text-slate-500 truncate">
              {selectedBranch.address || 'Outlet branch selected for pairing'}
            </p>
          )}
        </div>
      </div>

      {/* Global API Error Alert */}
      {apiError && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-start justify-between gap-3 text-rose-800 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold">API Action Failed</p>
              <p className="text-xs text-rose-700 mt-0.5">{apiError}</p>
            </div>
          </div>
          <button
            onClick={() => setApiError(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-bold p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Section 1: Pairing Code Generator Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Radio className="w-5 h-5 text-rose-600 animate-pulse" />
              Desktop POS Pairing Station
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Pair a Windows or Linux desktop running the Starters4U Print Agent to enable instant automatic printing.
            </p>
          </div>

          <button
            id="generate-pairing-code-btn"
            onClick={handleGenerateCode}
            disabled={isGenerating || loadingBranches || branches.length === 0}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 text-white font-extrabold text-xs shadow-lg shadow-rose-900/20 hover:from-rose-500 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Requesting Code...</span>
              </>
            ) : (
              <>
                <Printer className="w-4 h-4" />
                <span>{pairingData && !isExpired ? 'Generate New Code' : 'Generate Pairing Code'}</span>
              </>
            )}
          </button>
        </div>

        {/* Pairing Code Display Area */}
        {pairingData && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            {isExpired ? (
              /* Expired Code State (Requirement 10 & 17) */
              <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
                  <Clock className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Pairing Code Expired</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    The previous 10-minute pairing code has expired and has been securely invalidated. Click below to
                    request a fresh pairing code.
                  </p>
                </div>
                <button
                  onClick={handleGenerateCode}
                  disabled={isGenerating}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition inline-flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>Generate New Pairing Code</span>
                </button>
              </div>
            ) : (
              /* Active Code Prominent Display (Requirements 7, 8, 9) */
              <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-700/60 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-3 py-1 rounded-full inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      Active 6-Digit Pairing Code
                    </span>
                    <p className="text-xs text-slate-400">
                      Enter this code in the Starters4U Print Agent desktop application on your POS computer.
                    </p>
                  </div>

                  {/* Countdown Timer Badge */}
                  <div className="bg-slate-800/80 border border-slate-700 rounded-2xl px-4 py-2 flex items-center gap-3 self-start sm:self-auto">
                    <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Expires In</div>
                      <div className="text-base font-black font-mono text-amber-300">
                        {formatCountdown(remainingSeconds)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Big Prominent 6-Digit PIN Display */}
                <div className="bg-black/40 border border-slate-700/80 rounded-2xl p-6 sm:p-8 text-center flex flex-col items-center justify-center space-y-4">
                  <div className="text-xs text-slate-400 font-medium">One-Time Registration PIN</div>
                  <div
                    id="displayed-pairing-code"
                    className="text-4xl sm:text-6xl font-black font-mono tracking-[0.3em] text-white select-all drop-shadow-md"
                  >
                    {pairingData.pairingCode}
                  </div>
                  <p className="text-xs text-slate-400">
                    Valid until:{' '}
                    <span className="font-bold text-slate-200">
                      {new Date(pairingData.expiresAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>{' '}
                    (10-minute window)
                  </p>
                </div>

                {/* Controls & Expiry Notification */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <Info className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Single-use code. Will auto-pair terminal and securely issue encrypted token.</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      id="copy-pairing-code-btn"
                      onClick={handleCopyCode}
                      className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs transition flex items-center gap-2 active:scale-95 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400">Copied to Clipboard!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleGenerateCode}
                      disabled={isGenerating}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                      <span>Regenerate</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!pairingData && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-slate-600">
              <Laptop className="w-5 h-5 text-rose-600 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-slate-900">Ready to pair a new terminal:</span> Select the target
                outlet branch above and click <span className="font-semibold text-rose-600">Generate Pairing Code</span>.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Registered Print Devices List (Requirement 14, 15, 16, 19) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Monitor className="w-5 h-5 text-slate-700" />
              Registered Print Devices & Hardware Terminals
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Active hardware paired with this restaurant account. Monitored via secure heartbeat.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDevices}
              disabled={loadingDevices}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDevices ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>

        {/* Devices Table / Grid */}
        {loadingDevices ? (
          <div className="py-12 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold">Querying restaurant hardware status...</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Printer className="w-10 h-10 mx-auto text-slate-300" />
            <div className="max-w-md mx-auto space-y-1">
              <p className="text-sm font-bold text-slate-700">No print devices paired yet</p>
              <p className="text-xs text-slate-500">
                Install the Starters4U Print Agent on your billing or kitchen PC, click{' '}
                <span className="font-semibold text-rose-600">Generate Pairing Code</span> above, and enter the 6-digit
                code in the desktop application.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Device Name & ID</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Heartbeat</th>
                  <th className="px-5 py-3.5">Platform & Version</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((device) => {
                  const status = getDeviceStatus(device);
                  return (
                    <tr key={device.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <Laptop className="w-4 h-4 text-slate-500" />
                          <span>{device.deviceName || 'Windows POS Terminal'}</span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 mt-0.5">{device.deviceId}</div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="font-bold text-slate-800">
                          {device.branchName ||
                            branches.find((b) => b.id === device.branchId)?.name ||
                            'Main Branch'}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase inline-flex items-center gap-1.5 ${status.color}`}
                        >
                          {status.isOnline ? (
                            <Wifi className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <WifiOff className="w-3 h-3 text-slate-400" />
                          )}
                          {status.label}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        <div className="font-medium">{formatHeartbeat(device.lastHeartbeatAt)}</div>
                        {device.lastHeartbeatAt && (
                          <div className="text-[10px] text-slate-400">
                            {new Date(device.lastHeartbeatAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        <div className="font-mono text-xs">v{device.appVersion || '1.0.0'}</div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">{device.platform || 'win32'}</div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        {device.isActive ? (
                          <button
                            id={`revoke-device-${device.deviceId}`}
                            onClick={() => setDeviceToRevoke(device)}
                            className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Revoke</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Revoked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Revoking Device (Requirement 15) */}
      {deviceToRevoke && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900">Revoke POS Print Device?</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Are you sure you want to disconnect and revoke{' '}
                <span className="font-bold text-slate-900">{deviceToRevoke.deviceName}</span> (
                <span className="font-mono text-rose-600">{deviceToRevoke.deviceId}</span>)?
              </p>
              <p className="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200 mt-3">
                This will immediately invalidate the device’s authorization token and terminate all active thermal
                receipt and KOT printing streams.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeviceToRevoke(null)}
                disabled={isRevoking}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-revoke-device-btn"
                onClick={handleConfirmRevoke}
                disabled={isRevoking}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-900/20 transition flex items-center gap-1.5 cursor-pointer"
              >
                {isRevoking ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Revoking Device...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Revoke</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
