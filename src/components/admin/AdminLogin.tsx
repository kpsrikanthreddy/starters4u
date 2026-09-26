import React, { useState } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import {
  Lock,
  Mail,
  ShieldAlert,
  ArrowRight,
  Eye,
  EyeOff,
  Building2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Globe,
} from 'lucide-react';

interface AdminLoginProps {
  onLoginSuccess?: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const { login } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [restaurantSlug, setRestaurantSlug] = useState('mozz');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim()) {
      setErrorMessage('Please enter your admin email address.');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('Please enter your secret password or PIN.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password, restaurantSlug);
      if (result.success) {
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      } else {
        setErrorMessage(result.message || 'Invalid email or password. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred during login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFillCredentials = (demoEmail: string, demoPin: string, demoSlug: string = 'mozz') => {
    setEmail(demoEmail);
    setPassword(demoPin);
    setRestaurantSlug(demoSlug);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-rose-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[300px] bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 p-0.5 shadow-xl shadow-rose-950/40 mb-4">
          <div className="w-full h-full bg-slate-900 rounded-[14px] flex flex-col items-center justify-center p-1 text-white">
            <Building2 className="w-6 h-6 text-amber-400" />
            <span className="text-[7px] font-bold tracking-widest text-slate-300 uppercase mt-0.5">
              ADMIN
            </span>
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          Restaurant Admin Portal
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
          Secure, tenant-isolated operations for orders, KOT kitchen stations, live menu, and payments.
        </p>
      </div>

      {/* Main Login Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 relative z-10">
        <div className="bg-slate-900/90 backdrop-blur-xl py-8 px-6 sm:px-10 shadow-2xl border border-slate-800 rounded-3xl">
          {errorMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Authentication Failed</p>
                <p className="mt-0.5 text-rose-200/90">{errorMessage}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Staff / Admin Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@mozzpizzateria.com"
                  autoComplete="email"
                  required
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Password / PIN Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  Secret PIN / Password
                </label>
                <span className="text-[10px] text-slate-500">Encrypted with Bcrypt (12 rounds)</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="block w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-transparent transition tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Restaurant Slug Field (Optional Multi-tenant identifier) */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Restaurant Outlet Slug
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Building2 className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={restaurantSlug}
                  onChange={(e) => setRestaurantSlug(e.target.value)}
                  placeholder="mozz"
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold text-xs shadow-lg shadow-rose-900/30 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In to Admin Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials for Fast Evaluation */}
          <div className="mt-6 pt-6 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-3">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Quick Test Credentials
              </span>
              <span className="text-slate-500">Click to fill</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleFillCredentials('admin@mozzpizzateria.com', '8888', 'mozz')}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition flex flex-col text-[11px]"
              >
                <div className="flex items-center justify-between font-bold text-slate-200">
                  <span>🏪 MOZZ Admin</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300">MOZZ</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5">PIN: 8888</span>
              </button>

              <button
                type="button"
                onClick={() => handleFillCredentials('admin@testrestaurant.com', '8888', 'test-restaurant')}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition flex flex-col text-[11px]"
              >
                <div className="flex items-center justify-between font-bold text-slate-200">
                  <span>🍕 Test Tenant</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-400/20 text-indigo-300">Tenant</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5">PIN: 8888</span>
              </button>

              <button
                type="button"
                onClick={() => handleFillCredentials('superadmin@starters4u.in', '9999', 'platform')}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition flex flex-col text-[11px]"
              >
                <div className="flex items-center justify-between font-bold text-slate-200">
                  <span>🛡️ Super Admin</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">Global</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5">PIN: 9999</span>
              </button>
            </div>
          </div>
        </div>

        {/* Security Footer Notice */}
        <div className="mt-6 text-center text-slate-500 text-[11px] space-y-1">
          <p className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Protected by PostgreSQL Multi-Tenant Row Security & JWT Tokens</span>
          </p>
          <p>
            Starters4U Restaurant Operating System • Dedicated Domain: <span className="font-mono text-slate-400">admin.starters4u.in</span>
          </p>
        </div>
      </div>
    </div>
  );
};
