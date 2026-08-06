import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { NotificationTypeValue } from '../../notifications/enums/notification.enums';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { PaymentProviderFactory } from '../providers/payment-provider.factory';
import { VerifyTransactionResult } from '../providers/payment-provider.interface';
import { BillingEmailService } from './billing-email.service';
import { InvoiceService } from './invoice.service';
import { TrialService } from './trial.service';
import { SubscriptionService } from './subscription.service';
import {
  SubscriptionAccess,
  BillingIntervalValue,
} from '../enums/subscription.enums';
import type { Request } from 'express';
import { forwardRef, Inject } from '@nestjs/common';

export interface InitiateCheckoutParams {
  organizationId: string;
  subscriptionId?: string | null;
  plan: any;
  billingInterval: BillingIntervalValue;
  description: string;
  returnUrl?: string;
  callbackUrl?: string;
  access: SubscriptionAccess;
  request?: Request;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly auditLogService: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly billingEmailService: BillingEmailService,
    private readonly invoiceService: InvoiceService,
    private readonly trialService: TrialService,
    @Inject(forwardRef(() => SubscriptionService))
    private readonly subscriptionService: SubscriptionService,
  ) {}

  /**
   * Creates a PayChangu hosted checkout session. NEVER trusts anything the
   * client says about the payment; the amount/plan are derived server-side.
   */
  async initiateCheckout(params: InitiateCheckoutParams) {
    const provider = this.providerFactory.default;

    const amount =
      params.billingInterval === BillingIntervalValue.YEARLY
        ? Number(params.plan.priceYearly ?? 0)
        : Number(params.plan.priceMonthly ?? 0);

    if (amount <= 0) {
      throw new BadRequestException(
        'This plan is free or has no price for the selected billing interval.',
      );
    }

    const reference = `sf_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

    const payment = await (this.prisma as any).payment.create({
      data: {
        organizationId: params.organizationId,
        subscriptionId: params.subscriptionId ?? null,
        planId: params.plan.id,
        amount,
        currency: params.plan.currency ?? 'USD',
        provider: provider.name,
        reference,
        idempotencyKey: reference,
        status: 'INITIATED',
        metadata: {
          billingInterval: params.billingInterval,
          planCode: params.plan.code,
          ...(params.metadata ?? {}),
        },
      },
    });

    const returnUrl =
      params.returnUrl ??
      `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/billing/success?reference=${reference}`;
    const callbackUrl =
      params.callbackUrl ??
      `${process.env.API_URL ?? 'http://localhost:3001'}/payments/webhook`;

    const checkout = await provider.createCheckoutSession({
      reference,
      amount,
      currency: payment.currency,
      description: params.description,
      returnUrl,
      callbackUrl,
      customer: {
        email: params.access.email,
        name: '',
      },
      metadata: {
        paymentId: payment.id,
        organizationId: params.organizationId,
      },
    });

    if (checkout.providerTransactionId) {
      await (this.prisma as any).payment.update({
        where: { id: payment.id },
        data: { providerTransactionId: checkout.providerTransactionId },
      });
    }

    await this.auditLogService.record({
      organizationId: params.organizationId,
      actorId: params.access.userId,
      actorEmail: params.access.email,
      action: AUDIT_ACTIONS.PAYMENT_INITIATED,
      entityType: 'Payment',
      entityId: payment.id,
      metadata: {
        reference,
        amount,
        currency: payment.currency,
        planCode: params.plan.code,
        billingInterval: params.billingInterval,
      },
      request: params.request,
    });

    const owner = await this.trialService.findOwner(params.organizationId);
    if (owner) {
      await this.notificationService.create({
        userId: owner.id,
        organizationId: params.organizationId,
        type: NotificationTypeValue.PAYMENT_INITIATED,
        title: 'Payment initiated',
        body: `A payment of ${payment.currency} ${amount} for ${params.plan.name} has been initiated.`,
        data: {
          reference,
          amount,
          currency: payment.currency,
          planCode: params.plan.code,
        },
        relatedEntityType: 'Payment',
        relatedEntityId: payment.id,
      });
    }

    return {
      checkoutUrl: checkout.checkoutUrl,
      reference,
      paymentId: payment.id,
      amount,
      currency: payment.currency,
    };
  }

  /**
   * Server-side transaction verification. Returns the payment and the frontend
   * redirect URL. Idempotent: an already-finalized payment short-circuits.
   */
  async verifyPayment(params: {
    organizationId: string;
    reference: string;
    access: SubscriptionAccess;
    redirectUrl?: string;
  }) {
    const payment = await this.findByReference(
      params.reference,
      params.organizationId,
      params.access.isPlatformAdmin,
    );
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (this.isTerminal(payment.status)) {
      return this.buildVerifiedResponse(payment, params.redirectUrl);
    }

    const provider = this.providerFactory.get(
      (payment.provider as 'PAYCHANGU') ?? 'PAYCHANGU',
    );

    let verification: VerifyTransactionResult;
    try {
      verification = await provider.verifyTransaction({
        reference: payment.reference,
        providerTransactionId: payment.providerTransactionId ?? undefined,
      });
    } catch (error) {
      this.logger.warn(
        `PayChangu verification failed for ${payment.reference}: ${(error as Error).message}`,
      );
      return this.buildVerifiedResponse(payment, params.redirectUrl);
    }

    await this.applyVerification(payment, verification);

    const updated = await (this.prisma as any).payment.findUnique({
      where: { id: payment.id },
      include: { plan: true },
    });

    return this.buildVerifiedResponse(updated, params.redirectUrl);
  }

  /** Applies a provider verification result to the payment (idempotent). */
  async applyVerification(
    payment: any,
    verification: VerifyTransactionResult,
  ): Promise<void> {
    switch (verification.status) {
      case 'successful':
        await this.processSuccess(payment, verification);
        break;
      case 'failed':
        await this.processFailure(
          payment,
          (verification.raw as { message?: string } | undefined)?.message,
        );
        break;
      case 'cancelled':
        await this.processCancelled(payment);
        break;
      case 'expired':
        await this.processExpired(payment);
        break;
      case 'refunded':
        await this.processRefunded(payment);
        break;
      case 'pending':
      default:
        this.logger.log(`Payment ${payment.reference} still pending.`);
    }
  }

  private buildVerifiedResponse(payment: any, redirectUrl?: string) {
    const base =
      redirectUrl ??
      `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/billing/result`;
    const sep = base.includes('?') ? '&' : '?';
    const redirect = `${base}${sep}reference=${encodeURIComponent(payment.reference)}&status=${payment.status}`;

    return {
      reference: payment.reference,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      paymentMethod: payment.paymentMethod ?? null,
      receiptNumber: payment.receiptNumber ?? null,
      failureReason: payment.failureReason ?? null,
      redirectUrl: redirect,
    };
  }

  // --------------------------------------------------------------------------
  // Webhook-dispatched transitions (idempotent)
  // --------------------------------------------------------------------------

  async processSuccess(
    payment: any,
    verification?: VerifyTransactionResult,
  ): Promise<void> {
    if (this.isTerminal(payment.status)) return;

    const receiptNumber = this.nextReceiptNumber();

    await (this.prisma as any).payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESSFUL',
        paidAt: new Date(),
        receiptNumber,
        paymentMethod:
          verification?.paymentMethod ?? payment.paymentMethod ?? null,
        providerTransactionId:
          verification?.providerTransactionId ??
          payment.providerTransactionId ??
          null,
        failureReason: null,
      },
    });

    // Unlock features: activate the subscription for the purchased plan.
    await this.subscriptionService.activateSubscriptionForPayment(payment);

    const plan = payment.plan ?? (await this.loadPlan(payment.planId));

    await this.invoiceService.generate({
      organizationId: payment.organizationId,
      subscriptionId: payment.subscriptionId,
      planId: payment.planId,
      paymentId: payment.id,
      planName: plan?.name ?? 'Subscription',
      description: `${plan?.name ?? 'Subscription'} (${payment.metadata?.billingInterval ?? 'MONTHLY'})`,
      amount: Number(payment.amount),
      currency: payment.currency,
      paid: true,
      receiptReference: payment.reference,
    });

    await this.auditLogService.record({
      organizationId: payment.organizationId,
      action: AUDIT_ACTIONS.PAYMENT_COMPLETED,
      entityType: 'Payment',
      entityId: payment.id,
      metadata: {
        reference: payment.reference,
        amount: Number(payment.amount),
        currency: payment.currency,
        receiptNumber,
      },
    });

    const owner = await this.trialService.findOwner(payment.organizationId);
    if (owner) {
      await this.notificationService.create({
        userId: owner.id,
        organizationId: payment.organizationId,
        type: NotificationTypeValue.PAYMENT_SUCCESSFUL,
        title: 'Payment successful',
        body: `Your payment of ${payment.currency} ${Number(payment.amount)} was received. Receipt: ${receiptNumber}.`,
        data: {
          reference: payment.reference,
          amount: Number(payment.amount),
          currency: payment.currency,
          receiptNumber,
        },
        relatedEntityType: 'Payment',
        relatedEntityId: payment.id,
        email: {
          to: owner.email ?? '',
          firstName: owner.firstName ?? '',
          subject: 'Payment successful',
          html: `<p>Your payment of <strong>${payment.currency} ${Number(payment.amount)}</strong> was received successfully.</p>`,
        },
      });

      if (plan) {
        await this.billingEmailService.paymentReceipt(
          {
            organizationId: payment.organizationId,
            to: owner.email ?? '',
            firstName: owner.firstName ?? '',
          },
          {
            name: plan.name,
            code: plan.code,
            amount: Number(payment.amount),
            currency: payment.currency,
            interval: payment.metadata?.billingInterval ?? 'MONTHLY',
          },
          {
            reference: payment.reference,
            receiptNumber,
            paidAt: new Date(),
          },
        );
      }
    }
  }

  async processFailure(payment: any, reason?: string): Promise<void> {
    if (this.isTerminal(payment.status)) return;

    const failureReason = reason ?? 'Payment was declined by the provider.';

    await (this.prisma as any).payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason },
    });

    await this.auditLogService.record({
      organizationId: payment.organizationId,
      action: AUDIT_ACTIONS.PAYMENT_FAILED,
      entityType: 'Payment',
      entityId: payment.id,
      metadata: { reference: payment.reference, reason: failureReason },
    });

    const owner = await this.trialService.findOwner(payment.organizationId);
    if (owner) {
      await this.notificationService.create({
        userId: owner.id,
        organizationId: payment.organizationId,
        type: NotificationTypeValue.PAYMENT_FAILED,
        title: 'Payment failed',
        body: failureReason,
        data: { reference: payment.reference, reason: failureReason },
        relatedEntityType: 'Payment',
        relatedEntityId: payment.id,
      });

      const plan = payment.plan ?? (await this.loadPlan(payment.planId));
      if (plan) {
        await this.billingEmailService.paymentFailure(
          {
            organizationId: payment.organizationId,
            to: owner.email ?? '',
            firstName: owner.firstName ?? '',
          },
          plan.name,
          failureReason,
        );
      }
    }
  }

  async processCancelled(payment: any): Promise<void> {
    if (this.isTerminal(payment.status)) return;
    await (this.prisma as any).payment.update({
      where: { id: payment.id },
      data: {
        status: 'CANCELLED',
        failureReason: 'Payment was cancelled by the customer.',
      },
    });
    await this.auditLogService.record({
      organizationId: payment.organizationId,
      action: AUDIT_ACTIONS.PAYMENT_FAILED,
      entityType: 'Payment',
      entityId: payment.id,
      metadata: { reference: payment.reference, cancelled: true },
    });
  }

  async processExpired(payment: any): Promise<void> {
    if (this.isTerminal(payment.status)) return;
    await (this.prisma as any).payment.update({
      where: { id: payment.id },
      data: { status: 'EXPIRED', failureReason: 'Payment session expired.' },
    });
  }

  async processRefunded(payment: any): Promise<void> {
    if (payment.status === 'REFUNDED') return;
    await (this.prisma as any).payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', failureReason: 'Payment was refunded.' },
    });
    await this.auditLogService.record({
      organizationId: payment.organizationId,
      action: AUDIT_ACTIONS.PAYMENT_FAILED,
      entityType: 'Payment',
      entityId: payment.id,
      metadata: { reference: payment.reference, refunded: true },
    });
  }

  // --------------------------------------------------------------------------
  // History / reads
  // --------------------------------------------------------------------------

  async history(organizationId: string, page: number, limit: number) {
    const where = { organizationId };
    const [total, payments] = await Promise.all([
      (this.prisma as any).payment.count({ where }),
      (this.prisma as any).payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: { plan: { select: { name: true, code: true } } },
      }),
    ]);

    return {
      data: payments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(organizationId: string, id: string, isPlatformAdmin = false) {
    const payment = await (this.prisma as any).payment.findUnique({
      where: { id },
      include: {
        plan: true,
        subscription: true,
        invoice: true,
        organization: { select: { name: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (!isPlatformAdmin && payment.organizationId !== organizationId) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  async findByReference(
    reference: string,
    organizationId?: string,
    isPlatformAdmin = false,
  ) {
    const payment = await (this.prisma as any).payment.findUnique({
      where: { reference },
      include: { plan: true },
    });
    if (!payment) return null;
    if (
      !isPlatformAdmin &&
      organizationId &&
      payment.organizationId !== organizationId
    ) {
      return null;
    }
    return payment;
  }

  findByIdempotencyKey(key: string) {
    return (this.prisma as any).payment.findUnique({
      where: { idempotencyKey: key },
      include: { plan: true },
    });
  }

  private isTerminal(status: string): boolean {
    return [
      'SUCCESSFUL',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
      'EXPIRED',
    ].includes(status);
  }

  private nextReceiptNumber(): string {
    const now = new Date();
    const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    return `RCT-${ymd}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  private loadPlan(planId?: string | null) {
    if (!planId) return null;
    return (this.prisma as any).subscriptionPlan.findUnique({
      where: { id: planId },
    });
  }
}
