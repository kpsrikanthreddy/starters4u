import { MarketplacePaymentProvider } from './MarketplacePaymentProvider.js';
import { CashfreeEasySplitProvider } from './providers/cashfreeEasySplitProvider.js';
import { RazorpayRouteProvider } from './providers/razorpayRouteProvider.js';

export class PaymentService {
  private providers: Map<string, MarketplacePaymentProvider> = new Map();

  constructor() {
    this.registerProvider(new CashfreeEasySplitProvider());
    this.registerProvider(new RazorpayRouteProvider());
  }

  public registerProvider(provider: MarketplacePaymentProvider): void {
    this.providers.set(provider.providerName.toLowerCase(), provider);
  }

  public getProvider(name?: string): MarketplacePaymentProvider {
    if (name && this.providers.has(name.toLowerCase())) {
      return this.providers.get(name.toLowerCase())!;
    }
    // Default priority: Cashfree if configured, else Razorpay, else Cashfree (unconfigured adapter)
    const cashfree = this.providers.get('cashfree');
    if (cashfree?.isConfigured()) {
      return cashfree;
    }
    const razorpay = this.providers.get('razorpay');
    if (razorpay?.isConfigured()) {
      return razorpay;
    }
    return cashfree || razorpay || new CashfreeEasySplitProvider();
  }

  public getAllProviders(): MarketplacePaymentProvider[] {
    return Array.from(this.providers.values());
  }

  public getProvidersStatus(): Record<string, { configured: boolean; name: string }> {
    const status: Record<string, { configured: boolean; name: string }> = {};
    for (const [key, provider] of this.providers.entries()) {
      status[key] = {
        name: provider.providerName,
        configured: provider.isConfigured(),
      };
    }
    return status;
  }
}

export const paymentService = new PaymentService();
