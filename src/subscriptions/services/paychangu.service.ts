import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import {
  CheckoutParams,
  CheckoutResult,
  VerifyTransactionResult,
} from '../providers/payment-provider.interface';

interface PayChanguConfig {
  secretKey: string;
  publicKey: string;
  baseUrl: string;
  isSandbox: boolean;
}

interface PayChanguCheckoutPayload {
  amount: number;
  currency: string;
  email: string;
  first_name?: string;
  last_name?: string;
  tx_ref: string;
  callback_url: string;
  return_url: string;
  customization?: {
    title?: string;
    description?: string;
  };
  meta?: Record<string, unknown>;
}

/**
 * Thin HTTP client for the official PayChangu v1 API. Kept provider-specific so
 * the PaymentProvider adapter stays a pure mapping layer.
 *
 * Sandbox mode is enabled by default (PAYCHANGU_ENV !== "live"). All amounts are
 * sent as whole-currency numbers as required by PayChangu.
 */
@Injectable()
export class PayChanguService {
  private readonly logger = new Logger(PayChanguService.name);
  private readonly config: PayChanguConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      secretKey: this.configService.get<string>('paychangu.secretKey') ?? '',
      publicKey: this.configService.get<string>('paychangu.publicKey') ?? '',
      baseUrl:
        this.configService.get<string>('paychangu.baseUrl') ??
        'https://api.paychangu.com',
      isSandbox: this.configService.get<boolean>('paychangu.isSandbox') ?? true,
    };
  }

  get sandbox(): boolean {
    return this.config.isSandbox;
  }

  get providerName(): 'PAYCHANGU' {
    return 'PAYCHANGU';
  }

  /**
   * POST /v1/payments/request — creates a hosted checkout session.
   */
  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const payload: PayChanguCheckoutPayload = {
      amount: params.amount,
      currency: params.currency,
      email: params.customer.email,
      first_name: params.customer.name,
      tx_ref: params.reference,
      callback_url: params.callbackUrl,
      return_url: params.returnUrl,
      customization: {
        title: 'SupportFlow Subscription',
        description: params.description,
      },
      meta: params.metadata,
    };

    const response = await this.request<any>(
      '/v1/payments/request',
      'POST',
      payload as unknown as Record<string, unknown>,
    );

    const checkoutUrl =
      response?.data?.checkout_url ??
      response?.data?.link ??
      response?.checkout_url ??
      response?.data?.redirect_url;

    if (!checkoutUrl) {
      throw new Error(
        `PayChangu did not return a checkout URL: ${JSON.stringify(response)}`,
      );
    }

    return {
      checkoutUrl,
      reference: params.reference,
      providerTransactionId: response?.data?.id ?? undefined,
      raw: response,
    };
  }

  /**
   * GET /v1/payments/{tx_ref}/verify — authoritative transaction status.
   */
  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    const response = await this.request<any>(
      `/v1/payments/${encodeURIComponent(reference)}/verify`,
      'GET',
    );

    const data = response?.data ?? response ?? {};
    const rawStatus = String(
      data?.status ?? data?.payment_status ?? 'PENDING',
    ).toUpperCase();

    return {
      status: this.mapStatus(rawStatus),
      reference: data?.tx_ref ?? reference,
      providerTransactionId: data?.id ?? data?.transaction_id ?? undefined,
      amount: Number(data?.amount ?? 0),
      currency: data?.currency ?? 'USD',
      paymentMethod: data?.payment_method ?? undefined,
      paidAt: data?.paid_at ? new Date(data.paid_at) : undefined,
      raw: response,
    };
  }

  /** POST /v1/payments/{tx_ref}/refund — refunds a successful transaction. */
  async refund(reference: string, reason?: string): Promise<void> {
    await this.request<any>(
      `/v1/payments/${encodeURIComponent(reference)}/refund`,
      'POST',
      { reason: reason ?? 'Customer requested refund' },
    );
  }

  /**
   * Verifies the HMAC-SHA256 signature PayChangu attaches to webhook requests.
   * The signature is computed over the raw request body using the configured
   * webhook secret.
   */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const secret =
      this.configService.get<string>('paychangu.webhookSecret') ??
      this.config.secretKey;
    if (!secret) {
      this.logger.warn(
        'No PayChangu webhook secret configured; rejecting webhook',
      );
      return false;
    }

    const body = Buffer.isBuffer(rawBody)
      ? rawBody.toString()
      : String(rawBody ?? '');

    const expected = createHmac('sha256', secret).update(body).digest('hex');

    const provided = (signature ?? '').trim();
    const match = provided === expected;

    // Support "sha256=<hex>" style prefixes used by some providers.
    const prefixed = provided.replace(/^sha256=/, '').trim();
    const matchesPrefixed = prefixed.length > 0 && prefixed === expected;

    return match || matchesPrefixed;
  }

  private mapStatus(raw: string): VerifyTransactionResult['status'] {
    switch (raw) {
      case 'SUCCESSFUL':
      case 'SUCCESS':
      case 'COMPLETED':
      case 'PAID':
        return 'successful';
      case 'FAILED':
      case 'DECLINED':
        return 'failed';
      case 'CANCELLED':
      case 'CANCELED':
      case 'ABANDONED':
        return 'cancelled';
      case 'EXPIRED':
        return 'expired';
      case 'REFUNDED':
      case 'REFUND':
        return 'refunded';
      case 'PENDING':
      case 'INITIATED':
      case 'PROCESSING':
      default:
        return 'pending';
    }
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.config.secretKey) {
      throw new UnauthorizedException(
        'PayChangu secret key is not configured. Set PAYCHANGU_SECRET_KEY.',
      );
    }

    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.config.secretKey}`,
    };

    const init: RequestInit = { method, headers };

    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    this.logger.log(
      `PayChangu ${method} ${path} (sandbox=${this.config.isSandbox})`,
    );

    const res = await fetch(url, init);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `PayChangu request failed (${res.status}) ${path}: ${text.slice(0, 500)}`,
      );
    }

    return (await res.json()) as T;
  }
}
