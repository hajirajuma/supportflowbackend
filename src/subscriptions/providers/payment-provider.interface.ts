/**
 * Abstraction over any payment gateway (PayChangu today, Stripe / Flutterwave
 * later). Business logic in PaymentService depends ONLY on this interface so a
 * new provider can be added without touching subscription/billing logic.
 */
export interface CheckoutParams {
  /** Idempotency-safe external reference (also stored as Payment.reference). */
  reference: string;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  callbackUrl: string;
  customer: { email: string; name?: string };
  metadata?: Record<string, unknown>;
}

export interface CheckoutResult {
  checkoutUrl: string;
  reference: string;
  providerTransactionId?: string;
  raw?: unknown;
}

export type VerifyTransactionStatus =
  'successful' | 'failed' | 'cancelled' | 'expired' | 'refunded' | 'pending';

export interface VerifyTransactionParams {
  reference: string;
  providerTransactionId?: string;
}

export interface VerifyTransactionResult {
  status: VerifyTransactionStatus;
  reference: string;
  providerTransactionId?: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
  paidAt?: Date;
  raw?: unknown;
}

export interface RefundParams {
  reference: string;
  reason?: string;
}

export type PaymentProviderName = 'PAYCHANGU' | 'STRIPE' | 'FLUTTERWAVE';

export interface PaymentProvider {
  readonly name: PaymentProviderName;

  /** Creates a hosted checkout session and returns the redirect URL. */
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;

  /** Verifies a transaction server-side. Never trust client/callback data. */
  verifyTransaction(
    params: VerifyTransactionParams,
  ): Promise<VerifyTransactionResult>;

  /** Requests a refund for a previously successful payment. */
  refund(params: RefundParams): Promise<void>;

  /**
   * Verifies the signature attached to an inbound webhook request so only
   * authentic provider callbacks are processed.
   */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean;
}
