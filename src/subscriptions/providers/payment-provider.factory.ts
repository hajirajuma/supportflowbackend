import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PayChanguProvider } from './paychangu.provider';
import {
  PaymentProvider,
  PaymentProviderName,
} from './payment-provider.interface';

/**
 * Resolves a PaymentProvider by name. Registering a new provider (e.g. Stripe)
 * is a one-line change here — no subscription/billing logic is touched.
 */
@Injectable()
export class PaymentProviderFactory {
  private readonly providers = new Map<PaymentProviderName, PaymentProvider>();

  constructor(paychangu: PayChanguProvider) {
    this.providers.set(paychangu.name, paychangu);
  }

  get(name: PaymentProviderName): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new InternalServerErrorException(
        `Payment provider "${name}" is not registered`,
      );
    }
    return provider;
  }

  get default(): PaymentProvider {
    return this.providers.get('PAYCHANGU')!;
  }
}
