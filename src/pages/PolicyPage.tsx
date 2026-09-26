import React from 'react';
import { SeoRouteConfig } from '../types/seoTypes';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { BUSINESS_INFO } from '../config/businessInfo';
import { ShieldCheck, FileText, AlertCircle } from 'lucide-react';

interface PolicyPageProps {
  routeConfig: SeoRouteConfig;
}

export const PolicyPage: React.FC<PolicyPageProps> = ({ routeConfig }) => {
  const path = routeConfig.path;

  let policyContent: {
    badge: string;
    sections: Array<{ title: string; content: string[] }>;
  };

  if (path === '/privacy-policy') {
    policyContent = {
      badge: 'Data Protection & Privacy',
      sections: [
        {
          title: '1. Information We Collect',
          content: [
            'When you place an online food order through Starters4U for MOZZ Chinese & Pizzateria, we collect essential operational information including your customer name, contact mobile number, delivery address, and landmark.',
            'For dining table QR orders, device-level session tokens are stored temporarily in your local browser session storage to keep your table cart synchronized.',
          ],
        },
        {
          title: '2. Payment Security',
          content: [
            'All online payments are securely processed by Razorpay (a PCI-DSS compliant payment gateway). Starters4U does not store your credit card numbers, debit card PINs, CVV codes, or net banking credentials on our servers.',
          ],
        },
        {
          title: '3. Use of Information',
          content: [
            'Your contact number and delivery details are used solely to prepare, fulfill, and update you regarding your active food order.',
            'We do not sell, rent, or trade your personal information to external third-party advertisers.',
          ],
        },
        {
          title: '4. Cookies & Local Storage',
          content: [
            'We utilize client-side local storage exclusively to remember your active cart selections, preferred order mode (Delivery vs. Takeaway), and active order tracking ID across browser refreshes.',
          ],
        },
      ],
    };
  } else if (path === '/terms-and-conditions') {
    policyContent = {
      badge: 'Customer Terms of Service',
      sections: [
        {
          title: '1. Platform & Restaurant Relationship',
          content: [
            'Starters4U provides the digital technology interface for MOZZ Chinese & Pizzateria. Food preparation, packaging, and kitchen dispatch are handled directly by MOZZ in Gachibowli, Hyderabad.',
          ],
        },
        {
          title: '2. Menu Pricing & Availability',
          content: [
            'All menu prices are displayed in Indian Rupees (INR ₹). While we strive for 100% accurate stock levels, occasional ingredient shortages may require substituting an item or issuing a full refund after notifying you.',
          ],
        },
        {
          title: '3. Order Placement & Acceptance',
          content: [
            'An order placed via Starters4U constitutes an offer to purchase. Acceptance occurs once the kitchen registers and confirms the order.',
          ],
        },
        {
          title: '4. Delivery & Takeaway Timelines',
          content: [
            'Estimated preparation and delivery times are guidelines. Weather, traffic, and high kitchen volume during peak hours in Gachibowli may occasionally extend delivery duration.',
          ],
        },
      ],
    };
  } else {
    // Refund & Cancellation Policy
    policyContent = {
      badge: 'Cancellation & Refund Framework',
      sections: [
        {
          title: '1. Order Cancellation Policy',
          content: [
            'Because food is prepared fresh to order, cancellations can only be requested prior to kitchen preparation commencing.',
            'Once kitchen preparation or oven baking is underway, orders cannot be cancelled due to the perishable nature of freshly prepared food.',
          ],
        },
        {
          title: '2. Damaged or Incorrect Items',
          content: [
            'If an item is delivered damaged, spilled, or missing from your order, please notify customer support immediately with your Order ID.',
            'Verified missing or damaged items will be refunded to your original payment method or re-delivered promptly.',
          ],
        },
        {
          title: '3. Refund Processing',
          content: [
            'Approved refunds for online payments are credited back to the original payment source in accordance with standard payment gateway and banking processing procedures.',
          ],
        },
        {
          title: '4. Non-Delivery or Address Errors',
          content: [
            'Customers are responsible for providing an accurate delivery address and accessible contact phone number in Gachibowli. If our delivery personnel cannot reach you after reasonable attempts, the order may be marked fulfilled.',
          ],
        },
      ],
    };
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Breadcrumbs items={routeConfig.breadcrumbs} />

      <header className="bg-white border-b border-stone-200 py-10 sm:py-14 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md mb-3">
            <FileText className="w-3.5 h-3.5" />
            <span>{policyContent.badge}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-stone-900 font-display">
            {routeConfig.h1}
          </h1>
          <p className="text-stone-600 text-sm sm:text-base mt-2">
            Applicable to customers of Starters4U and MOZZ Chinese & Pizzateria in {BUSINESS_INFO.locality}, {BUSINESS_INFO.city}.
          </p>

          <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-amber-50 rounded-xl text-amber-900 text-xs leading-relaxed border border-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              <strong>Operational Policy Notice:</strong> This document outlines current operational procedures for online ordering, fulfillment, and payment handling via Starters4U for MOZZ Chinese & Pizzateria. It represents an active operational draft and does not constitute formal legal counsel. For policy clarifications, please contact store management.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        {policyContent.sections.map((sec, idx) => (
          <section key={idx} className="bg-white rounded-2xl p-6 sm:p-8 border border-stone-200 shadow-xs">
            <h2 className="text-lg sm:text-xl font-bold text-stone-900 font-display mb-3">
              {sec.title}
            </h2>
            <div className="space-y-2.5 text-stone-600 text-xs sm:text-sm leading-relaxed">
              {sec.content.map((p, pIdx) => (
                <p key={pIdx}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
};
