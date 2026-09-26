import React from 'react';
import { SeoFaqItem } from '../types/seoTypes';
import { HelpCircle, ChevronDown } from 'lucide-react';

interface SeoFaqSectionProps {
  faqs?: SeoFaqItem[];
  title?: string;
  subtitle?: string;
}

export const SeoFaqSection: React.FC<SeoFaqSectionProps> = ({
  faqs,
  title = 'Frequently Asked Questions',
  subtitle = 'Helpful details about ordering, preparation, and menu offerings.',
}) => {
  if (!faqs || faqs.length === 0) return null;

  return (
    <section className="py-12 bg-stone-50 border-t border-stone-200" aria-labelledby="faq-heading">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold mb-2">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Questions & Answers</span>
          </div>
          <h2 id="faq-heading" className="text-2xl sm:text-3xl font-bold text-stone-900 font-display">
            {title}
          </h2>
          <p className="text-stone-600 text-sm sm:text-base mt-1 max-w-xl mx-auto">
            {subtitle}
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <details
              key={idx}
              className="group bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs open:ring-1 open:ring-primary-400 transition-all"
            >
              <summary className="flex items-center justify-between p-4 sm:p-5 cursor-pointer list-none font-semibold text-stone-900 text-sm sm:text-base select-none hover:text-primary-700">
                <span className="pr-4">{faq.question}</span>
                <ChevronDown className="w-4 h-4 text-stone-400 group-open:rotate-180 transition-transform shrink-0" />
              </summary>
              <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-stone-600 text-xs sm:text-sm leading-relaxed border-t border-stone-100 pt-3">
                <p>{faq.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};
