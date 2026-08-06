import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { NotificationTypeValue } from '../../notifications/enums/notification.enums';
import { PlanService } from './plan.service';
import { TrialService } from './trial.service';
import { PaymentService } from './payment.service';
import { BillingEmailService } from './billing-email.service';
import { UsageTrackingService } from './usage-tracking.service';
import { FeatureGateService } from './feature-gate.service';
import {
  BillingIntervalValue,
  SubscriptionAccess,
} from '../enums/subscription.enums';
import { UpgradePlanDto } from '../dto/upgrade-plan.dto';
import { DowngradePlanDto } from '../dto/downgrade-plan.dto';
import { RenewSubscriptionDto } from '../dto/renew-subscription.dto';
import { CancelSubscriptionDto } from '../dto/cancel-subscription.dto';
import { ResumeSubscriptionDto } from '../dto/resume-subscription.dto';
import type { Request } from 'express';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: PlanService,
    private readonly trialService: TrialService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly billingEmailService: BillingEmailService,
    private readonly usageTrackingService: UsageTrackingService,
    private readonly featureGateService: FeatureGateService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
  ) {}

  // --------------------------------------------------------------------------
  // Reads
  // --------------------------------------------------------------------------

  /**
   * Starts the 14-day free trial for a newly registered organization.
   * Delegates to TrialService; called at registration time.
   */
  startTrialForOrganization(
    organizationId: string,
    ownerUserId?: string,
    ownerEmail?: string,
    ownerName?: string,
  ) {
    return this.trialService.startTrial(
      organizationId,
      ownerUserId,
      ownerEmail,
      ownerName,
    );
  }

  /**
   * Returns the current subscription (with plan, trial and entitlement info) for
   * an organization.
   */
  async getCurrent(organizationId: string, access?: SubscriptionAccess) {
    const org = await (this.prisma as any).organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        billingEmail: true,
        trialEndsAt: true,
        currentSubscriptionId: true,
      },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    let subscription: any = org.currentSubscriptionId
      ? await (this.prisma as any).organizationSubscription.findUnique({
          where: { id: org.currentSubscriptionId },
          include: { plan: true, pendingPlan: true },
        })
      : null;

    if (!subscription) {
      subscription = await (
        this.prisma as any
      ).organizationSubscription.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        include: { plan: true, pendingPlan: true },
      });
    }

    if (!subscription) {
      // Fresh organization without an initialized trial.
      if (access && !access.isPlatformAdmin) {
        await this.trialService.startTrial(
          organizationId,
          access.userId,
          access.email,
        );
        return this.getCurrent(organizationId, access);
      }
      return {
        subscription: null,
        trial: this.trialService.getTrialInfo(null),
        entitlements: await this.featureGateService.getPlan(organizationId),
      };
    }

    const trial = this.trialService.getTrialInfo(subscription);
    const entitlements = await this.featureGateService.getPlan(organizationId);
    const usage =
      await this.usageTrackingService.getCurrentUsage(organizationId);

    return {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        billingInterval: subscription.billingInterval,
        plan: subscription.plan,
        pendingPlan: subscription.pendingPlan ?? null,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        renewsAt: subscription.renewsAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        paymentProvider: subscription.paymentProvider,
        createdAt: subscription.createdAt,
      },
      trial,
      entitlements,
      usage,
    };
  }

  // --------------------------------------------------------------------------
  // Plan changes
  // --------------------------------------------------------------------------

  async upgrade(
    organizationId: string,
    dto: UpgradePlanDto,
    access: SubscriptionAccess,
    request?: Request,
  ) {
    this.assertTenantAdmin(access);
    const current = await this.getCurrent(organizationId);
    const target = await this.planService.getById(dto.planId);

    if (!target.isActive) {
      throw new BadRequestException('This plan is not available for purchase.');
    }

    const interval =
      dto.billingInterval ??
      current.subscription?.billingInterval ??
      BillingIntervalValue.MONTHLY;
    const targetPrice = this.priceFor(target, interval);
    const currentPrice = current.subscription
      ? this.priceFor(current.subscription.plan, interval)
      : 0;

    if (targetPrice < currentPrice) {
      throw new BadRequestException(
        'This appears to be a downgrade. Use the downgrade endpoint instead.',
      );
    }

    // Schedule the plan change; it takes effect once payment succeeds.
    const subscriptionId = current.subscription?.id;
    if (subscriptionId) {
      await (this.prisma as any).organizationSubscription.update({
        where: { id: subscriptionId },
        data: {
          pendingPlanId: target.id,
          status: 'PENDING_PAYMENT',
          billingInterval: interval,
        },
      });
    }

    return this.paymentService.initiateCheckout({
      organizationId,
      subscriptionId,
      plan: target,
      billingInterval: interval,
      description: `${target.name} (${interval})`,
      returnUrl: dto.returnUrl,
      access,
      request,
      metadata: {
        changeType: 'UPGRADE',
        fromPlanId: current.subscription?.plan?.id ?? null,
      },
    });
  }

  async downgrade(
    organizationId: string,
    dto: DowngradePlanDto,
    access: SubscriptionAccess,
    request?: Request,
  ) {
    this.assertTenantAdmin(access);
    const current = await this.getCurrent(organizationId);
    if (!current.subscription) {
      throw new BadRequestException('No active subscription to downgrade.');
    }

    const target = await this.planService.getById(dto.planId);
    if (!target.isActive) {
      throw new BadRequestException('This plan is not available.');
    }

    const interval =
      dto.billingInterval ?? current.subscription.billingInterval;
    const targetPrice = this.priceFor(target, interval);
    const currentPrice = this.priceFor(current.subscription.plan, interval);

    if (targetPrice > currentPrice) {
      throw new BadRequestException(
        'This appears to be an upgrade. Use the upgrade endpoint instead.',
      );
    }

    const immediately = dto.immediately === true;

    if (immediately) {
      await this.applyPlanChange(
        current.subscription.id,
        target,
        interval,
        access,
        'DOWNGRADE',
      );
      return this.getCurrent(organizationId);
    }

    // Default: apply at the end of the current period (proration-ready).
    await (this.prisma as any).organizationSubscription.update({
      where: { id: current.subscription.id },
      data: { pendingPlanId: target.id, billingInterval: interval },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
      entityType: 'OrganizationSubscription',
      entityId: current.subscription.id,
      metadata: {
        change: 'DOWNGRADE_SCHEDULED',
        from: current.subscription.plan.code,
        to: target.code,
        effective: current.subscription.currentPeriodEnd,
      },
      request,
    });

    const owner = await this.trialService.findOwner(organizationId);
    if (owner) {
      await this.notificationService.create({
        userId: owner.id,
        organizationId,
        type: NotificationTypeValue.PLAN_CHANGED,
        title: `Downgrade to ${target.name} scheduled`,
        body: `Your plan will change to ${target.name} at the end of the current billing period.`,
        data: {
          toPlan: target.code,
          effective: current.subscription.currentPeriodEnd,
        },
        relatedEntityType: 'OrganizationSubscription',
        relatedEntityId: current.subscription.id,
      });
    }

    return this.getCurrent(organizationId);
  }

  async renew(
    organizationId: string,
    dto: RenewSubscriptionDto,
    access: SubscriptionAccess,
    request?: Request,
  ) {
    this.assertTenantAdmin(access);
    const current = await this.getCurrent(organizationId);
    if (!current.subscription) {
      throw new BadRequestException('No subscription to renew.');
    }

    const interval =
      dto.billingInterval ?? current.subscription.billingInterval;
    const plan = current.subscription.plan;

    if (plan.code === 'FREE') {
      throw new BadRequestException('The FREE plan does not require renewal.');
    }

    await (this.prisma as any).organizationSubscription.update({
      where: { id: current.subscription.id },
      data: { status: 'PENDING_PAYMENT', billingInterval: interval },
    });

    return this.paymentService.initiateCheckout({
      organizationId,
      subscriptionId: current.subscription.id,
      plan,
      billingInterval: interval,
      description: `${plan.name} renewal (${interval})`,
      returnUrl: dto.returnUrl,
      access,
      request,
      metadata: { changeType: 'RENEWAL' },
    });
  }

  async cancel(
    organizationId: string,
    dto: CancelSubscriptionDto,
    access: SubscriptionAccess,
    request?: Request,
  ) {
    this.assertTenantAdmin(access);
    const current = await this.getCurrent(organizationId);
    if (!current.subscription) {
      throw new NotFoundException('No active subscription to cancel.');
    }

    const subscription = current.subscription;
    const atPeriodEnd = dto.atPeriodEnd !== false;

    if (subscription.status === 'CANCELLED') {
      throw new BadRequestException('This subscription is already cancelled.');
    }

    const updated = await (this.prisma as any).organizationSubscription.update({
      where: { id: subscription.id },
      data: {
        status: atPeriodEnd ? 'ACTIVE' : 'CANCELLED',
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
        pendingPlanId: null,
      },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.SUBSCRIPTION_CANCELLED,
      entityType: 'OrganizationSubscription',
      entityId: subscription.id,
      metadata: { reason: dto.reason ?? null, atPeriodEnd },
      request,
    });

    const owner = await this.trialService.findOwner(organizationId);
    if (owner) {
      await this.notificationService.create({
        userId: owner.id,
        organizationId,
        type: NotificationTypeValue.SUBSCRIPTION_CANCELLED,
        title: 'Subscription cancelled',
        body: atPeriodEnd
          ? `Your ${subscription.plan.name} subscription stays active until ${subscription.currentPeriodEnd?.toISOString().slice(0, 10)}.`
          : `Your ${subscription.plan.name} subscription has been cancelled.`,
        data: { atPeriodEnd, reason: dto.reason ?? null },
        relatedEntityType: 'OrganizationSubscription',
        relatedEntityId: subscription.id,
      });

      await this.billingEmailService.subscriptionCancelled(
        {
          organizationId,
          to: owner.email ?? '',
          firstName: owner.firstName ?? '',
        },
        subscription.plan.name,
        atPeriodEnd ? subscription.currentPeriodEnd : new Date(),
      );
    }

    return {
      status: updated.status,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      canceledAt: updated.canceledAt,
      effectiveEnd: atPeriodEnd ? subscription.currentPeriodEnd : new Date(),
    };
  }

  async resume(
    organizationId: string,
    dto: ResumeSubscriptionDto,
    access: SubscriptionAccess,
    request?: Request,
  ) {
    this.assertTenantAdmin(access);
    const current = await this.getCurrent(organizationId);
    if (!current.subscription) {
      throw new NotFoundException('No subscription to resume.');
    }

    const subscription = current.subscription;

    // Grace path: cancelled at period end and period still running.
    if (
      subscription.cancelAtPeriodEnd &&
      ['ACTIVE', 'CANCELLED', 'PENDING_PAYMENT'].includes(subscription.status)
    ) {
      await (this.prisma as any).organizationSubscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: false,
          canceledAt: null,
          status: 'ACTIVE',
        },
      });

      await this.auditLogService.record({
        organizationId,
        actorId: access.userId,
        actorEmail: access.email,
        action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
        entityType: 'OrganizationSubscription',
        entityId: subscription.id,
        metadata: { change: 'RESUME', grace: true },
        request,
      });

      return this.getCurrent(organizationId);
    }

    // Otherwise: pay to re-activate.
    const interval = dto.billingInterval ?? subscription.billingInterval;
    await (this.prisma as any).organizationSubscription.update({
      where: { id: subscription.id },
      data: { status: 'PENDING_PAYMENT', cancelAtPeriodEnd: false },
    });

    return this.paymentService.initiateCheckout({
      organizationId,
      subscriptionId: subscription.id,
      plan: subscription.plan,
      billingInterval: interval,
      description: `${subscription.plan.name} reactivation (${interval})`,
      returnUrl: dto.returnUrl,
      access,
      request,
      metadata: { changeType: 'RESUME' },
    });
  }

  // --------------------------------------------------------------------------
  // Usage
  // --------------------------------------------------------------------------

  async usage(organizationId: string) {
    const [usage, plan] = await Promise.all([
      this.usageTrackingService.getCurrentUsage(organizationId),
      this.featureGateService.getPlan(organizationId),
    ]);

    const usageWithLimits: Record<
      string,
      { current: number; limit: number; unit?: string }
    > = {};
    for (const [key, current] of Object.entries(usage)) {
      const limitKey = key === 'storageBytes' ? 'storageLimitBytes' : key;
      usageWithLimits[key] = {
        current,
        limit: plan.limits[limitKey] ?? 0,
        ...(key === 'storageBytes' ? { unit: 'bytes' } : {}),
      };
    }

    return { plan, usage: usageWithLimits };
  }

  // --------------------------------------------------------------------------
  // Activation (called by PaymentService when a payment succeeds)
  // --------------------------------------------------------------------------

  /**
   * Activates a subscription after a successful payment. Idempotent and handles
   * initial activation, upgrades, downgrades and renewals.
   */
  async activateSubscriptionForPayment(payment: any): Promise<void> {
    let subscriptionId = payment.subscriptionId;

    if (!subscriptionId) {
      const current = await (
        this.prisma as any
      ).organizationSubscription.findFirst({
        where: {
          organizationId: payment.organizationId,
          status: {
            in: [
              'TRIALING',
              'PENDING_PAYMENT',
              'ACTIVE',
              'PAST_DUE',
              'EXPIRED',
              'CANCELLED',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      subscriptionId = current?.id ?? null;
    }

    if (!subscriptionId) {
      this.logger.error(
        `No subscription to activate for payment ${payment.id}`,
      );
      return;
    }

    const subscription = await (
      this.prisma as any
    ).organizationSubscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, pendingPlan: true },
    });
    if (!subscription) return;

    const wasActive = subscription.status === 'ACTIVE';
    const interval =
      payment.metadata?.billingInterval ?? subscription.billingInterval;

    const newPlan =
      subscription.pendingPlanId &&
      subscription.pendingPlanId === payment.planId
        ? subscription.pendingPlan
        : (payment.plan ?? subscription.plan);

    const now = new Date();
    const periodEnd = this.endOfPeriod(now, interval);

    const periodStart = wasActive
      ? (subscription.currentPeriodStart ?? now)
      : now;

    await (this.prisma as any).organizationSubscription.update({
      where: { id: subscription.id },
      data: {
        planId: newPlan?.id ?? subscription.planId,
        pendingPlanId: null,
        status: 'ACTIVE',
        billingInterval: interval,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        renewsAt: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        trialStartedAt:
          subscription.trialStartedAt ??
          (subscription.status === 'TRIALING' ? now : null),
        trialEndsAt: null,
        paymentProvider: payment.provider,
        providerSubscriptionId:
          payment.providerTransactionId ?? subscription.providerSubscriptionId,
      },
    });

    await (this.prisma as any).organization.update({
      where: { id: payment.organizationId },
      data: {
        currentSubscriptionId: subscription.id,
        status: 'ACTIVE',
        trialEndsAt: null,
      },
    });

    await this.auditLogService.record({
      organizationId: payment.organizationId,
      action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
      entityType: 'OrganizationSubscription',
      entityId: subscription.id,
      metadata: {
        change: wasActive ? 'RENEWAL' : 'ACTIVATION',
        planCode: newPlan?.code ?? subscription.plan.code,
        interval,
        periodEnd: periodEnd.toISOString(),
      },
    });

    const owner = await this.trialService.findOwner(payment.organizationId);
    if (owner && newPlan) {
      const notifType = wasActive
        ? NotificationTypeValue.SUBSCRIPTION_RENEWED
        : NotificationTypeValue.SUBSCRIPTION_ACTIVATED;
      const title = wasActive
        ? 'Subscription renewed'
        : `Subscription activated — ${newPlan.name}`;

      await this.notificationService.create({
        userId: owner.id,
        organizationId: payment.organizationId,
        type: notifType,
        title,
        body: wasActive
          ? `Your ${newPlan.name} subscription has been renewed until ${periodEnd.toISOString().slice(0, 10)}.`
          : `Your ${newPlan.name} subscription is now active until ${periodEnd.toISOString().slice(0, 10)}.`,
        data: {
          planCode: newPlan.code,
          interval,
          periodEnd: periodEnd.toISOString(),
        },
        relatedEntityType: 'OrganizationSubscription',
        relatedEntityId: subscription.id,
      });

      const planInfo = {
        name: newPlan.name,
        code: newPlan.code,
        amount: Number(payment.amount ?? 0),
        currency: payment.currency,
        interval,
      };
      if (wasActive) {
        await this.billingEmailService.subscriptionRenewed(
          {
            organizationId: payment.organizationId,
            to: owner.email ?? '',
            firstName: owner.firstName ?? '',
          },
          planInfo,
        );
      } else {
        await this.billingEmailService.subscriptionActivated(
          {
            organizationId: payment.organizationId,
            to: owner.email ?? '',
            firstName: owner.firstName ?? '',
          },
          planInfo,
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // Scheduled jobs
  // --------------------------------------------------------------------------

  /**
   * Applies scheduled plan changes (downgrades) at period end, expires
   * subscriptions past their current period, and flags past-due status. Hourly.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processSubscriptionLifecycle(): Promise<void> {
    const now = new Date();

    // Apply pending plan changes when the current period has ended.
    const dueChanges = await (
      this.prisma as any
    ).organizationSubscription.findMany({
      where: {
        pendingPlanId: { not: null },
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        OR: [{ currentPeriodEnd: { lte: now } }, { cancelAtPeriodEnd: true }],
      },
      include: { pendingPlan: true },
    });

    for (const subscription of dueChanges) {
      if (subscription.pendingPlan) {
        await this.applyPlanChange(
          subscription.id,
          subscription.pendingPlan,
          subscription.billingInterval,
          undefined,
          'DOWNGRADE',
        );
      }
    }

    // Expire ACTIVE subscriptions whose period ended and are not set to renew.
    const dueExpiry = await (
      this.prisma as any
    ).organizationSubscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { lte: now },
      },
    });

    for (const subscription of dueExpiry) {
      const freePlan = await (this.prisma as any).subscriptionPlan.findUnique({
        where: { code: 'FREE' },
      });

      await (this.prisma as any).organizationSubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'EXPIRED',
          cancelAtPeriodEnd: false,
          ...(freePlan ? { planId: freePlan.id } : {}),
        },
      });

      await (this.prisma as any).organization.update({
        where: { id: subscription.organizationId },
        data: { status: freePlan ? 'ACTIVE' : 'SUSPENDED' },
      });

      await this.auditLogService.record({
        organizationId: subscription.organizationId,
        action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
        entityType: 'OrganizationSubscription',
        entityId: subscription.id,
        metadata: { change: 'EXPIRED', downgradedToFree: !!freePlan },
      });

      const owner = await this.trialService.findOwner(
        subscription.organizationId,
      );
      if (owner) {
        await this.notificationService.create({
          userId: owner.id,
          organizationId: subscription.organizationId,
          type: NotificationTypeValue.SUBSCRIPTION_EXPIRED,
          title: 'Your subscription has ended',
          body: freePlan
            ? 'Your paid subscription has ended. You are now on the FREE plan — upgrade to restore full access.'
            : 'Your subscription has expired and your workspace has been suspended.',
          data: {},
          relatedEntityType: 'OrganizationSubscription',
          relatedEntityId: subscription.id,
        });
      }
    }
  }

  private async applyPlanChange(
    subscriptionId: string,
    targetPlan: any,
    interval: BillingIntervalValue,
    access?: SubscriptionAccess,
    changeType = 'DOWNGRADE',
  ) {
    const subscription = await (
      this.prisma as any
    ).organizationSubscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!subscription) return;

    await (this.prisma as any).organizationSubscription.update({
      where: { id: subscriptionId },
      data: {
        planId: targetPlan.id,
        pendingPlanId: null,
        billingInterval: interval,
      },
    });

    await this.auditLogService.record({
      organizationId: subscription.organizationId,
      actorId: access?.userId,
      actorEmail: access?.email,
      action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
      entityType: 'OrganizationSubscription',
      entityId: subscriptionId,
      metadata: {
        change: changeType,
        from: subscription.plan.code,
        to: targetPlan.code,
      },
    });

    const owner = await this.trialService.findOwner(
      subscription.organizationId,
    );
    if (owner) {
      await this.notificationService.create({
        userId: owner.id,
        organizationId: subscription.organizationId,
        type: NotificationTypeValue.PLAN_CHANGED,
        title: `Plan changed to ${targetPlan.name}`,
        body: `Your subscription plan has been updated to ${targetPlan.name}.`,
        data: { fromPlan: subscription.plan.code, toPlan: targetPlan.code },
        relatedEntityType: 'OrganizationSubscription',
        relatedEntityId: subscriptionId,
      });
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private priceFor(plan: any, interval: BillingIntervalValue): number {
    if (!plan) return 0;
    return interval === BillingIntervalValue.YEARLY
      ? Number(plan.priceYearly ?? 0)
      : Number(plan.priceMonthly ?? 0);
  }

  private endOfPeriod(from: Date, interval: BillingIntervalValue): Date {
    const end = new Date(from);
    if (interval === BillingIntervalValue.YEARLY) {
      end.setUTCFullYear(end.getUTCFullYear() + 1);
    } else {
      end.setUTCMonth(end.getUTCMonth() + 1);
    }
    return end;
  }

  private assertTenantAdmin(access: SubscriptionAccess) {
    if (access.isPlatformAdmin) return;
    if (access.isOwner || access.isAdmin) return;
    throw new ForbiddenException(
      'Only tenant owners and administrators can manage subscriptions.',
    );
  }
}
