import { Injectable } from '@nestjs/common';
import {
  CheckoutParams,
  CheckoutResult,
  PaymentProvider,
  PaymentProviderName,
  RefundParams,
  VerifyTransactionParams,
  VerifyTransactionResult,
} from './payment-provider.interface';
import { PayChanguService } from '../services/paychangu.service';

/**
 * PayChangu implementation of the PaymentProvider contract. All gateway details
 * are delegated to PayChanguService so business logic stays provider-agnostic.
 */
@Injectable()
export class PayChanguProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'PAYCHANGU';

  constructor(private readonly paychanguService: PayChanguService) {}

  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    return this.paychanguService.createCheckoutSession(params);
  }

  verifyTransaction(
    params: VerifyTransactionParams,
  ): Promise<VerifyTransactionResult> {
    return this.paychanguService.verifyTransaction(params.reference);
  }

  refund(params: RefundParams): Promise<void> {
    return this.paychanguService.refund(params.reference, params.reason);
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    return this.paychanguService.verifyWebhookSignature(rawBody, signature);
  }
}
