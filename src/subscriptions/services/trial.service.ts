import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { NotificationTypeValue } from '../../notifications/enums/notification.enums';

export interface TrialInfo {
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialActive: boolean;
  trialExpired: boolean;
  trialRemainingDays: number;
}

const TRIAL_DAYS_DEFAULT = 14;

@Injectable()
export class TrialService {
  private readonly logger = new Logger(TrialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Computes trial metadata for a subscription. A subscription is on trial when
   * its status is TRIALING and its end date has not passed.
   */
  getTrialInfo(subscription: any): TrialInfo {
    const startedAt = subscription?.trialStartedAt ?? null;
    const endsAt = subscription?.trialEndsAt ?? null;

    if (!endsAt) {
      return {
        trialStartedAt: startedAt,
        trialEndsAt: null,
        trialActive: false,
        trialExpired: false,
        trialRemainingDays: 0,
      };
    }

    const now = new Date();
    const expired = now > new Date(endsAt);
    const active = subscription?.status === 'TRIALING' && !expired;
    const remainingMs = new Date(endsAt).getTime() - now.getTime();

    return {
      trialStartedAt: startedAt,
      trialEndsAt: endsAt,
      trialActive: active,
      trialExpired: expired,
      trialRemainingDays: Math.max(0, Math.ceil(remainingMs / 86_400_000)),
    };
  }

  /**
   * Starts the free trial for a brand-new organization: creates a TRIALING
   * subscription against the cheapest plan (defaults to FREE when it is the only
   * plan seeded) and links it as the current subscription. Notifies + emails the
   * owner and writes audit/notification records.
   */
  async startTrial(
    organizationId: string,
    ownerUserId?: string,
    ownerEmail?: string,
    ownerName?: string,
  ): Promise<any> {
    const existing = await (
      this.prisma as any
    ).organizationSubscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return existing;
    }

    const defaultPlan = await (this.prisma as any).subscriptionPlan.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (!defaultPlan) {
      throw new Error(
        'No active subscription plan exists to start a trial against.',
      );
    }

    const trialDays = defaultPlan.trialDays ?? TRIAL_DAYS_DEFAULT;
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 86_400_000);

    const subscription = await (
      this.prisma as any
    ).organizationSubscription.create({
      data: {
        organizationId,
        planId: defaultPlan.id,
        status: 'TRIALING',
        billingInterval: 'MONTHLY',
        trialStartedAt: now,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        renewsAt: trialEndsAt,
      },
    });

    await (this.prisma as any).organization.update({
      where: { id: organizationId },
      data: {
        currentSubscriptionId: subscription.id,
        trialEndsAt,
        status: 'TRIAL',
      },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: ownerUserId,
      actorEmail: ownerEmail,
      action: AUDIT_ACTIONS.SUBSCRIPTION_CREATED,
      entityType: 'OrganizationSubscription',
      entityId: subscription.id,
      metadata: {
        status: 'TRIALING',
        planCode: defaultPlan.code,
        trialDays,
        trialEndsAt: trialEndsAt.toISOString(),
      },
    });

    const owner = ownerUserId
      ? { id: ownerUserId, email: ownerEmail, firstName: ownerName }
      : await this.findOwner(organizationId);

    if (owner) {
      await this.notificationService.create({
        userId: owner.id,
        organizationId,
        type: NotificationTypeValue.TRIAL_STARTED,
        title: 'Your free trial has started',
        body: `You are on the ${defaultPlan.name} plan with a ${trialDays}-day free trial ending ${trialEndsAt.toISOString().slice(0, 10)}.`,
        data: {
          planCode: defaultPlan.code,
          trialEndsAt: trialEndsAt.toISOString(),
          trialDays,
        },
        relatedEntityType: 'OrganizationSubscription',
        relatedEntityId: subscription.id,
        email: {
          to: owner.email ?? ownerUserId ?? '',
          firstName: owner.firstName ?? '',
          subject: `Your ${defaultPlan.name} free trial has started`,
          html: `
            <h2 style="margin:0 0 8px;">Welcome to SupportFlow</h2>
            <p>Your <strong>${defaultPlan.name}</strong> free trial has started. You have <strong>${trialDays} days</strong> (until ${trialEndsAt.toISOString().slice(0, 10)}) to explore all included features.</p>
          `,
        },
      });
    }

    return subscription;
  }

  findOwner(organizationId: string) {
    return (this.prisma as any).user.findFirst({
      where: {
        organizationId,
        role: 'TENANT_OWNER',
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, firstName: true },
    });
  }

  /**
   * Automatically switches expired trials to EXPIRED and downgrades the
   * organization to the FREE tier. Runs hourly.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireDueTrials(): Promise<void> {
    const now = new Date();
    const due = await (this.prisma as any).organizationSubscription.findMany({
      where: {
        status: 'TRIALING',
        trialEndsAt: { lt: now },
      },
      include: { plan: true, organization: { include: { users: true } } },
    });

    for (const subscription of due) {
      const freePlan = await (this.prisma as any).subscriptionPlan.findUnique({
        where: { code: 'FREE' },
      });

      await (this.prisma as any).organizationSubscription.update({
        where: { id: subscription.id },
        data: {
          status: freePlan ? 'ACTIVE' : 'EXPIRED',
          planId: freePlan?.id ?? subscription.planId,
          trialEndsAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
        },
      });

      await (this.prisma as any).organization.update({
        where: { id: subscription.organizationId },
        data: { status: 'ACTIVE', trialEndsAt: null },
      });

      await this.auditLogService.record({
        organizationId: subscription.organizationId,
        action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
        entityType: 'OrganizationSubscription',
        entityId: subscription.id,
        metadata: { from: 'TRIALING', to: freePlan ? 'ACTIVE' : 'EXPIRED' },
      });

      const owner = await this.findOwner(subscription.organizationId);
      if (owner) {
        await this.notificationService.create({
          userId: owner.id,
          organizationId: subscription.organizationId,
          type: NotificationTypeValue.TRIAL_EXPIRED,
          title: 'Your free trial has ended',
          body: freePlan
            ? 'Your trial has ended. You are now on the FREE plan — upgrade to unlock more features.'
            : 'Your trial has ended and your subscription has expired.',
          data: { planCode: freePlan?.code ?? null },
          relatedEntityType: 'OrganizationSubscription',
          relatedEntityId: subscription.id,
          email: {
            to: owner.email ?? '',
            firstName: owner.firstName ?? '',
            subject: 'Your free trial has ended',
            html: `<p>Your free trial has ended. ${freePlan ? 'You are now on the FREE plan — upgrade to unlock more features.' : 'Your subscription has expired.'}</p>`,
          },
        });
      }

      this.logger.log(
        `Trial expired for organization ${subscription.organizationId} -> ${freePlan ? 'ACTIVE(FREE)' : 'EXPIRED'}`,
      );
    }
  }

  /**
   * Reminds owners when their trial ends within 3 days. Runs daily at 09:00 UTC.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendTrialReminders(): Promise<void> {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 86_400_000);

    const ending = await (this.prisma as any).organizationSubscription.findMany(
      {
        where: {
          status: 'TRIALING',
          trialEndsAt: { gte: now, lte: in3Days },
        },
        include: { plan: true },
      },
    );

    for (const subscription of ending) {
      const trial = this.getTrialInfo(subscription);
      if (trial.trialRemainingDays <= 0) continue;

      const owner = await this.findOwner(subscription.organizationId);
      if (!owner) continue;

      await this.notificationService.create({
        userId: owner.id,
        organizationId: subscription.organizationId,
        type: NotificationTypeValue.TRIAL_ENDING,
        title: `Your trial ends in ${trial.trialRemainingDays} day${trial.trialRemainingDays === 1 ? '' : 's'}`,
        body: `Upgrade your ${subscription.plan.name} plan before your trial expires to avoid service interruption.`,
        data: { trialRemainingDays: trial.trialRemainingDays },
        relatedEntityType: 'OrganizationSubscription',
        relatedEntityId: subscription.id,
        email: {
          to: owner.email ?? '',
          firstName: owner.firstName ?? '',
          subject: `Your ${subscription.plan.name} trial ends in ${trial.trialRemainingDays} days`,
          html: `<p>Your <strong>${subscription.plan.name}</strong> trial ends in <strong>${trial.trialRemainingDays} day${trial.trialRemainingDays === 1 ? '' : 's'}</strong>. Upgrade now to avoid interruption.</p>`,
        },
      });
    }
  }
}
