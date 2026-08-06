import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsageTrackingService } from './usage-tracking.service';
import {
  FeatureKey,
  USAGE_LIMIT_KEYS,
  UsageResourceTypeValue,
} from '../enums/subscription.enums';

export interface PlanEntitlements {
  planId: string | null;
  planCode: string;
  planName: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
}

/**
 * Reusable gate that resolves an organization's plan entitlements and enforces
 * feature flags + hard usage limits. Tickets, Feedback, Knowledge Base, and
 * other modules inject this service instead of hardcoding plan logic.
 */
@Injectable()
export class FeatureGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageTrackingService: UsageTrackingService,
  ) {}

  /**
   * Resolves the currently entitled plan for an organization. Falls back to the
   * FREE plan when no subscription exists (fresh tenants are always entitled to
   * FREE features during onboarding).
   */
  async getPlan(organizationId: string): Promise<PlanEntitlements> {
    const subscription = await (
      this.prisma as any
    ).organizationSubscription.findFirst({
      where: {
        organizationId,
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (subscription?.plan) {
      return this.toEntitlements(subscription.plan);
    }

    const freePlan = await (this.prisma as any).subscriptionPlan.findUnique({
      where: { code: 'FREE' },
    });

    if (!freePlan) {
      // Degrade gracefully: allow everything rather than bricking the tenant.
      return {
        planId: null,
        planCode: 'FREE',
        planName: 'Free',
        features: {},
        limits: {
          maxUsers: Number.MAX_SAFE_INTEGER,
          maxCustomers: Number.MAX_SAFE_INTEGER,
          maxAgents: Number.MAX_SAFE_INTEGER,
          maxTicketsPerMonth: Number.MAX_SAFE_INTEGER,
          maxFeedbackForms: Number.MAX_SAFE_INTEGER,
          maxAttachmentsPerTicket: Number.MAX_SAFE_INTEGER,
          maxKnowledgeArticles: Number.MAX_SAFE_INTEGER,
          maxInvitations: Number.MAX_SAFE_INTEGER,
          storageLimitBytes: Number.MAX_SAFE_INTEGER,
          apiMonthlyQuota: Number.MAX_SAFE_INTEGER,
        },
      };
    }

    return this.toEntitlements(freePlan);
  }

  private toEntitlements(plan: any): PlanEntitlements {
    const limits: Record<string, number> = {
      maxUsers: plan.maxUsers ?? 0,
      maxCustomers: plan.maxCustomers ?? 0,
      maxAgents: plan.maxAgents ?? 0,
      maxTicketsPerMonth: plan.maxTicketsPerMonth ?? 0,
      maxFeedbackForms: plan.maxFeedbackForms ?? 0,
      maxAttachmentsPerTicket: plan.maxAttachmentsPerTicket ?? 0,
      maxKnowledgeArticles: plan.maxKnowledgeArticles ?? 0,
      maxInvitations: plan.maxInvitations ?? 0,
      storageLimitBytes: Number(plan.storageLimitBytes ?? 0),
      apiMonthlyQuota: plan.apiMonthlyQuota ?? 0,
    };

    const features =
      typeof plan.features === 'object' && plan.features !== null
        ? (plan.features as Record<string, boolean>)
        : {};

    return {
      planId: plan.id,
      planCode: plan.code,
      planName: plan.name,
      features,
      limits,
    };
  }

  /** Whether a feature key is enabled for the organization. */
  async isFeatureEnabled(
    organizationId: string,
    featureKey: FeatureKey,
  ): Promise<boolean> {
    const plan = await this.getPlan(organizationId);
    return plan.features[featureKey] === true;
  }

  /** Throws ForbiddenException when the feature is not entitled. */
  async assertFeatureEnabled(
    organizationId: string,
    featureKey: FeatureKey,
  ): Promise<void> {
    const plan = await this.getPlan(organizationId);
    if (plan.features[featureKey] !== true) {
      throw new ForbiddenException(
        `Your current plan (${plan.planName}) does not include "${featureKey}". Please upgrade to enable this feature.`,
      );
    }
  }

  /**
   * Enforces a hard usage limit before a resource is created. Throws a
   * meaningful validation error when the organization is at (or would exceed)
   * its plan limit.
   */
  async assertUnderLimit(
    organizationId: string,
    resourceType: UsageResourceTypeValue,
    additional: number = 1,
    limitKey?: keyof typeof USAGE_LIMIT_KEYS,
  ): Promise<void> {
    const plan = await this.getPlan(organizationId);
    const key = limitKey ?? this.limitKeyForResource(resourceType);
    const limit = plan.limits[key] ?? 0;

    if (limit === 0) {
      // 0 means "not allowed" for every plan except unbounded graceful fallback.
      throw new ForbiddenException(
        `Your current plan (${plan.planName}) does not allow ${this.humanize(key)}. Please upgrade.`,
      );
    }

    const current = await this.usageTrackingService.getCount(
      organizationId,
      resourceType,
    );

    if (current + additional > limit) {
      throw new ForbiddenException(
        `Usage limit reached for ${this.humanize(key)} (${current}/${limit}). Please upgrade your plan or reduce usage.`,
      );
    }
  }

  /** Storage-specific check (bytes available vs bytes about to be stored). */
  async assertStorageAvailable(
    organizationId: string,
    additionalBytes: number,
  ): Promise<void> {
    const plan = await this.getPlan(organizationId);
    const limit = plan.limits[USAGE_LIMIT_KEYS.storageLimitBytes] ?? 0;
    const used = await this.usageTrackingService.getStorageUsed(organizationId);

    if (used + additionalBytes > limit) {
      throw new ForbiddenException(
        `Storage limit exceeded (${this.formatBytes(used)}/${this.formatBytes(limit)}). Please upgrade your plan or free up space.`,
      );
    }
  }

  /** Convenience guards used by the tickets/feedback modules. */
  async assertCanCreateTicket(organizationId: string): Promise<void> {
    await this.assertFeatureEnabled(organizationId, 'ticket_management');
    await this.assertUnderLimit(
      organizationId,
      UsageResourceTypeValue.TICKET,
      1,
      'maxTicketsPerMonth',
    );
  }

  async assertCanCreateAgent(organizationId: string): Promise<void> {
    await this.assertUnderLimit(
      organizationId,
      UsageResourceTypeValue.AGENT,
      1,
      'maxAgents',
    );
  }

  async assertCanCreateCustomer(organizationId: string): Promise<void> {
    await this.assertUnderLimit(
      organizationId,
      UsageResourceTypeValue.CUSTOMER,
      1,
      'maxCustomers',
    );
  }

  private limitKeyForResource(
    resourceType: UsageResourceTypeValue,
  ): keyof typeof USAGE_LIMIT_KEYS {
    switch (resourceType) {
      case UsageResourceTypeValue.SEAT:
      case UsageResourceTypeValue.AGENT:
        return 'maxAgents';
      case UsageResourceTypeValue.CUSTOMER:
        return 'maxCustomers';
      case UsageResourceTypeValue.TICKET:
        return 'maxTicketsPerMonth';
      case UsageResourceTypeValue.FEEDBACK_FORM:
        return 'maxFeedbackForms';
      case UsageResourceTypeValue.ATTACHMENT:
        return 'maxAttachmentsPerTicket';
      case UsageResourceTypeValue.KNOWLEDGE_ARTICLE:
        return 'maxKnowledgeArticles';
      case UsageResourceTypeValue.INVITATION:
        return 'maxInvitations';
      case UsageResourceTypeValue.STORAGE_BYTES:
        return 'storageLimitBytes';
      case UsageResourceTypeValue.API_CALL:
        return 'apiMonthlyQuota';
      default:
        return 'maxUsers';
    }
  }

  private humanize(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .trim()
      .toLowerCase();
  }

  private formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }
}
