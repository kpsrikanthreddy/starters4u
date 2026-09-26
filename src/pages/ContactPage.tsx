import React, { useState } from 'react';
import { SeoRouteConfig } from '../types/seoTypes';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { SeoFaqSection } from '../components/SeoFaqSection';
import { BUSINESS_INFO, getFormattedLocation } from '../config/businessInfo';
import { MapPin, MessageSquare, Send, CheckCircle, Clock, ShoppingBag } from 'lucide-react';

interface ContactPageProps {
  routeConfig: SeoRouteConfig;
}

export const ContactPage: React.FC<ContactPageProps> = ({ routeConfig }) => {
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    orderId: '',
    message: '',
    website_url: '', // Honeypot field for bot detection
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    // Client-side format checks
    const cleanPhone = formData.phone.trim().replace(/[\s\-()]/g, '');
    if (cleanPhone && !/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      setSubmitError('Please enter a valid phone number (e.g. 10-digit mobile).');
      setIsSubmitting(false);
      return;
    }

    const cleanOrderId = formData.orderId.trim();
    if (cleanOrderId && !/^[A-Za-z0-9\-_]{4,50}$/.test(cleanOrderId)) {
      setSubmitError('Please enter a valid Order ID format (e.g. MOZZ-8901).');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit inquiry');
      }

      setInquiryId(data.inquiryId);
      setFormSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || 'An error occurred while submitting your message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <Breadcrumbs items={routeConfig.breadcrumbs} />

      <header className="bg-white border-b border-stone-200 py-10 sm:py-14 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md mb-3">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Customer Inquiries & Support</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-stone-900 font-display">
            {routeConfig.h1}
          </h1>
          <p className="text-stone-600 text-base sm:text-lg mt-3 leading-relaxed">
            Need assistance with an existing order, menu inquiries, or takeaway pickup? Connect with the Starters4U team for MOZZ Chinese & Pizzateria in {BUSINESS_INFO.locality}, {BUSINESS_INFO.city}.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Left Column: Location & Live Order Support */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-base mb-3">
                <MapPin className="w-5 h-5 text-primary-600" />
                <span>Restaurant Location</span>
              </div>
              <p className="text-stone-700 text-sm font-semibold">
                {BUSINESS_INFO.restaurantName}
              </p>
              <p className="text-stone-600 text-sm mt-1 leading-relaxed">
                {getFormattedLocation()}
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-base mb-3">
                <ShoppingBag className="w-5 h-5 text-amber-600" />
                <span>Live Order Assistance</span>
              </div>
              <p className="text-stone-600 text-xs sm:text-sm leading-relaxed mb-4">
                Have an active delivery or takeaway order placed through Starters4U? You can inspect real-time preparation and dispatch status at any time.
              </p>
              <a
                href="/?view=track"
                className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs sm:text-sm font-semibold transition"
              >
                Open Live Order Tracker
              </a>
            </div>
          </div>

          {/* Right Column: Customer Message Form */}
          <div className="md:col-span-7">
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-xs">
              <h2 className="text-xl font-bold text-stone-900 font-display mb-2">
                Send an Online Message
              </h2>
              <p className="text-stone-600 text-xs sm:text-sm mb-6 leading-relaxed">
                Fill out the inquiry form below for feedback, order questions, or store inquiries.
              </p>

              {submitError && (
                <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl">
                  {submitError}
                </div>
              )}

              {formSubmitted ? (
                <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <h3 className="font-bold text-emerald-900 text-sm sm:text-base">
                    Message Received
                  </h3>
                  <p className="text-emerald-700 text-xs sm:text-sm mt-1">
                    Thank you for reaching out. Your inquiry has been securely recorded.
                  </p>
                  {inquiryId && (
                    <p className="mt-2 text-xs font-mono font-semibold text-emerald-800 bg-emerald-100/60 inline-block px-2.5 py-1 rounded">
                      Reference: {inquiryId}
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Invisible Honeypot Field */}
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="website_url">Website</label>
                    <input
                      id="website_url"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={formData.website_url}
                      onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Your Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Srikanth Reddy"
                      className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="10-digit mobile number"
                      className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Order ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.orderId}
                      onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
                      placeholder="e.g., MOZZ-8901"
                      className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Message / Inquiry Details
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Please describe your question or feedback..."
                      className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold text-sm transition flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSubmitting ? 'Sending Message...' : 'Submit Inquiry'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <SeoFaqSection faqs={routeConfig.faqs} />
    </div>
  );
};
