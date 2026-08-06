import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { PaymentProviderFactory } from '../providers/payment-provider.factory';
import { PaymentService } from './payment.service';

export interface WebhookEvent {
  event?: string;
  status?: string;
  reference?: string;
  tx_ref?: string;
  id?: string;
  data?: Record<string, any>;
}

const SUCCESS_EVENTS = [
  'payment.successful',
  'PAYMENT.SUCCESSFUL',
  'SUCCESSFUL',
  'SUCCESS',
  'COMPLETED',
  'PAID',
];
const FAILED_EVENTS = [
  'payment.failed',
  'PAYMENT.FAILED',
  'FAILED',
  'DECLINED',
];
const CANCELLED_EVENTS = [
  'payment.cancelled',
  'PAYMENT.CANCELLED',
  'CANCELLED',
  'CANCELED',
  'ABANDONED',
];
const EXPIRED_EVENTS = [
  'payment.expired',
  'PAYMENT.EXPIRED',
  'EXPIRED',
  'TIMEOUT',
];
const REFUNDED_EVENTS = [
  'payment.refunded',
  'PAYMENT.REFUNDED',
  'REFUNDED',
  'REFUND',
];

/**
 * Processes inbound gateway webhooks. Signature is always verified, processing
 * is idempotent (duplicate webhooks are no-ops), and every event is audited.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly auditLogService: AuditLogService,
    private readonly paymentService: PaymentService,
  ) {}

  /**
   * Entry point for POST /payments/webhook.
   * @param rawBody    the unparsed request body (required for HMAC verification)
   * @param signature  signature header supplied by the gateway
   * @param event      parsed webhook payload
   */
  async handle(
    rawBody: Buffer | string,
    signature: string,
    event: WebhookEvent,
  ) {
    const provider = this.providerFactory.default;

    const valid = provider.verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      this.logger.warn('Rejected webhook with invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const reference =
      event.reference ??
      event.tx_ref ??
      (event.data?.tx_ref as string | undefined) ??
      (event.data?.reference as string | undefined) ??
      (event.data?.id as string | undefined) ??
      null;

    const eventName =
      event.event ??
      event.status ??
      (event.data?.event as string | undefined) ??
      (event.data?.status as string | undefined) ??
      'unknown';

    if (!reference) {
      this.logger.log(
        `Webhook received with no reference (event=${eventName}); ignoring.`,
      );
      return { received: true, processed: false, reason: 'no-reference' };
    }

    let payment: any = null;
    if (reference.startsWith('sf_')) {
      payment = await this.paymentService.findByReference(reference);
    } else {
      payment = await (this.prisma as any).payment.findUnique({
        where: { reference },
        include: { plan: true },
      });
    }

    if (!payment) {
      // Try provider transaction id as a fallback lookup.
      payment = await (this.prisma as any).payment.findFirst({
        where: { providerTransactionId: reference },
        include: { plan: true },
      });
    }

    const auditMetadata = {
      event: eventName,
      reference,
      payloadKeys: Object.keys(event),
    };

    if (!payment) {
      this.logger.warn(`Webhook for unknown payment (${reference}); ignoring.`);
      await this.auditLogService.record({
        action: AUDIT_ACTIONS.WEBHOOK_RECEIVED,
        entityType: 'Payment',
        metadata: { ...auditMetadata, outcome: 'unknown-payment' },
      });
      return { received: true, processed: false, reason: 'unknown-payment' };
    }

    await this.auditLogService.record({
      organizationId: payment.organizationId,
      action: AUDIT_ACTIONS.WEBHOOK_RECEIVED,
      entityType: 'Payment',
      entityId: payment.id,
      metadata: auditMetadata,
    });

    // Idempotency: a terminal payment is never re-processed.
    const normalized = eventName.toUpperCase();
    const terminalMatches = this.terminalMatch(normalized, payment.status);
    if (terminalMatches) {
      return {
        received: true,
        processed: false,
        reason: 'duplicate',
        paymentId: payment.id,
      };
    }

    if (SUCCESS_EVENTS.some((e) => normalized === e.toUpperCase())) {
      await this.paymentService.processSuccess(payment);
      return {
        received: true,
        processed: true,
        outcome: 'SUCCESSFUL',
        paymentId: payment.id,
      };
    }

    if (FAILED_EVENTS.some((e) => normalized === e.toUpperCase())) {
      const reason =
        (event.data?.message as string | undefined) ??
        (event.data?.reason as string | undefined) ??
        'Payment failed.';
      await this.paymentService.processFailure(payment, reason);
      return {
        received: true,
        processed: true,
        outcome: 'FAILED',
        paymentId: payment.id,
      };
    }

    if (CANCELLED_EVENTS.some((e) => normalized === e.toUpperCase())) {
      await this.paymentService.processCancelled(payment);
      return {
        received: true,
        processed: true,
        outcome: 'CANCELLED',
        paymentId: payment.id,
      };
    }

    if (EXPIRED_EVENTS.some((e) => normalized === e.toUpperCase())) {
      await this.paymentService.processExpired(payment);
      return {
        received: true,
        processed: true,
        outcome: 'EXPIRED',
        paymentId: payment.id,
      };
    }

    if (REFUNDED_EVENTS.some((e) => normalized === e.toUpperCase())) {
      await this.paymentService.processRefunded(payment);
      return {
        received: true,
        processed: true,
        outcome: 'REFUNDED',
        paymentId: payment.id,
      };
    }

    this.logger.log(
      `Webhook event "${eventName}" for ${reference} is not actionable.`,
    );
    return { received: true, processed: false, reason: 'unhandled-event' };
  }

  private terminalMatch(eventName: string, paymentStatus: string): boolean {
    const map: Record<string, string[]> = {
      SUCCESSFUL: ['SUCCESSFUL'],
      SUCCESS: ['SUCCESSFUL'],
      COMPLETED: ['SUCCESSFUL'],
      PAID: ['SUCCESSFUL'],
      FAILED: ['FAILED'],
      DECLINED: ['FAILED'],
      CANCELLED: ['CANCELLED'],
      CANCELED: ['CANCELLED'],
      ABANDONED: ['CANCELLED'],
      EXPIRED: ['EXPIRED'],
      TIMEOUT: ['EXPIRED'],
      REFUNDED: ['REFUNDED'],
      REFUND: ['REFUNDED'],
    };
    const terminals = map[eventName];
    if (!terminals) return false;
    return terminals.includes(paymentStatus);
  }
}
