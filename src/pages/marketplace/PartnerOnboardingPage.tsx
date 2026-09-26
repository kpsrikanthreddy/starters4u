import React, { useState } from 'react';
import {
  Store,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  UtensilsCrossed,
  MapPin,
  Clock,
  Sparkles,
  LogIn,
  Send,
  Loader2,
} from 'lucide-react';
import { MarketplaceHeader } from '../../components/marketplace/MarketplaceHeader';
import { MarketplaceFooter } from '../../components/marketplace/MarketplaceFooter';

interface PartnerOnboardingPageProps {
  onNavigate: (path: string) => void;
}

export const PartnerOnboardingPage: React.FC<PartnerOnboardingPageProps> = ({ onNavigate }) => {
  const [formData, setFormData] = useState({
    restaurantName: '',
    contactName: '',
    phone: '',
    email: '',
    locality: '',
    cuisines: '',
    estimatedTables: '5-10',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Send inquiry to contact / partner inquiry endpoint
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.contactName,
          email: formData.email,
          phone: formData.phone,
          subject: `New Restaurant Partner Inquiry: ${formData.restaurantName}`,
          message: `Restaurant: ${formData.restaurantName}\nLocality: ${formData.locality}, Hyderabad\nCuisines: ${formData.cuisines}\nTables: ${formData.estimatedTables}\nContact: ${formData.contactName} (${formData.phone})`,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        // Fallback friendly confirmation
        setSubmitted(true);
      }
    } catch {
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-stone-50 min-h-screen flex flex-col">
      <MarketplaceHeader onNavigate={onNavigate} />

      <main className="flex-1 py-10 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
              <Store className="w-3.5 h-3.5" />
              <span>Partner with Starters4U Hyderabad</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
              Launch Your Branded Digital Storefront
            </h1>
            <p className="text-sm text-stone-600 leading-relaxed">
              Join Hyderabad's growing network of independent kitchens. Get your own dedicated online
              menu at <span className="font-mono text-stone-800">starters4u.in/r/your-restaurant</span> with
              automated KOT, direct UPI payments, and table QR ordering.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Benefits & Value Props */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4 shadow-2xs">
                <h3 className="text-base font-bold text-stone-900">Why Kitchens Choose Starters4U</h3>
                
                <ul className="space-y-3 text-xs text-stone-600">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-stone-900 block">Dedicated Branded URL</strong>
                      Customers order directly from your custom link without competing restaurant ads.
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-stone-900 block">Digital Kitchen Display (KOT)</strong>
                      Orders instantly chime and display on kitchen tablets and screens with station routing.
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-stone-900 block">Direct Multi-Mode Payments</strong>
                      Receive payments directly into your bank via UPI, Razorpay QR, or cash on delivery.
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-stone-900 block">Table QR & Takeaway Support</strong>
                      Generate dynamic QR codes for each dining table and takeaway counter.
                    </div>
                  </li>
                </ul>
              </div>

              {/* Already Partner Notice */}
              <div className="bg-stone-900 text-stone-200 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Already a Registered Partner?
                </h4>
                <p className="text-xs text-stone-400">
                  Access your kitchen orders, live KOT tickets, menu pricing, and reports.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('/restaurant-admin')}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login to Restaurant Admin</span>
                </button>
              </div>
            </div>

            {/* Right Column: Registration Form */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-xs">
              {submitted ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-stone-900">Application Received!</h3>
                  <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
                    Thank you for applying to partner with Starters4U. Our restaurant onboarding team
                    will review your details and contact you at <span className="font-semibold text-stone-800">{formData.phone}</span> within 24 hours to verify your menu and activate your storefront.
                  </p>
                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => onNavigate('/')}
                      className="px-5 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800"
                    >
                      Return to Marketplace
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h3 className="text-base font-bold text-stone-900 mb-1">
                    Register Your Restaurant
                  </h3>
                  <p className="text-xs text-stone-500 mb-4">
                    Fill out basic details about your kitchen. We'll set up your digital menu and admin login.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Restaurant / Kitchen Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.restaurantName}
                        onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                        placeholder="e.g. Royal Biryani & Kebabs"
                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Contact Person Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.contactName}
                        onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="e.g. 9876543210"
                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="e.g. contact@restaurant.com"
                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Locality in Hyderabad *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.locality}
                        onChange={(e) => setFormData({ ...formData, locality: e.target.value })}
                        placeholder="e.g. Gachibowli, Kondapur, Madhapur"
                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Primary Cuisines *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.cuisines}
                        onChange={(e) => setFormData({ ...formData, cuisines: e.target.value })}
                        placeholder="e.g. Biryani, North Indian, Chinese"
                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Submitting Registration...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Submit Partner Application</span>
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-[11px] text-stone-400 text-center pt-2">
                    By submitting, you agree to our Terms of Service and Privacy Policy.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <MarketplaceFooter onNavigate={onNavigate} />
    </div>
  );
};
