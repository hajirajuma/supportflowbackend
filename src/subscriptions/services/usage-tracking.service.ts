import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsageResourceTypeValue } from '../enums/subscription.enums';

/**
 * Meters per-tenant consumption. Hard limits are enforced by counting real
 * records (FeatureGateService), while metered resources (API calls, tickets per
 * period, storage) are persisted in UsageRecord for soft-limit warnings.
 */
@Injectable()
export class UsageTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  currentPeriodKey(date: Date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private resolvePeriodWindow(period: string = this.currentPeriodKey()) {
    const [yearText, monthText] = period.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));

    return { periodStart, periodEnd };
  }

  private async resolveSubscriptionId(organizationId: string) {
    const subscription = await (
      this.prisma as any
    ).organizationSubscription.findUnique({
      where: { organizationId },
      select: { id: true },
    });

    return subscription?.id ?? null;
  }

  /** Upserts a metered quantity for the current billing period. */
  async track(
    organizationId: string,
    resourceType: UsageResourceTypeValue,
    quantity: number = 1,
    period: string = this.currentPeriodKey(),
  ): Promise<void> {
    const subscriptionId = await this.resolveSubscriptionId(organizationId);
    if (!subscriptionId) {
      return;
    }

    const { periodStart, periodEnd } = this.resolvePeriodWindow(period);
    await (this.prisma as any).usageRecord.upsert({
      where: {
        organizationId_metric_periodStart: {
          organizationId,
          metric: resourceType,
          periodStart,
        },
      },
      create: {
        organizationId,
        subscriptionId,
        metric: resourceType,
        value: quantity,
        periodStart,
        periodEnd,
      },
      update: {
        value: { increment: quantity },
        periodEnd,
      },
    });
  }

  /** Metered quantity for a given resource + period (0 when absent). */
  async getMetered(
    organizationId: string,
    resourceType: UsageResourceTypeValue,
    period: string = this.currentPeriodKey(),
  ): Promise<number> {
    const { periodStart } = this.resolvePeriodWindow(period);
    const record = await (this.prisma as any).usageRecord.findUnique({
      where: {
        organizationId_metric_periodStart: {
          organizationId,
          metric: resourceType,
          periodStart,
        },
      },
      select: { value: true },
    });
    return record?.value ?? 0;
  }

  /**
   * Computes the CURRENT (snapshot) consumption of every tracked resource for
   * an organization by counting live records in the database.
   */
  async getCurrentUsage(
    organizationId: string,
  ): Promise<Record<string, number>> {
    const [
      users,
      customers,
      agents,
      tickets,
      ticketsThisMonth,
      feedbackForms,
      attachments,
      knowledgeArticles,
      feedbackResponses,
      pendingInvitations,
      apiCallsThisMonth,
      storageBytes,
    ] = await Promise.all([
      (this.prisma as any).user.count({
        where: { organizationId, status: 'ACTIVE' },
      }),
      (this.prisma as any).user.count({
        where: { organizationId, role: 'CUSTOMER' },
      }),
      (this.prisma as any).user.count({
        where: {
          organizationId,
          role: { in: ['PLATFORM_ADMIN', 'TENANT_OWNER', 'SUPPORT_AGENT'] },
        },
      }),
      (this.prisma as any).ticket.count({
        where: { organizationId, deletedAt: null },
      }),
      (this.prisma as any).ticket.count({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: new Date(new Date().setUTCDate(1)) },
        },
      }),
      (this.prisma as any).feedbackForm.count({
        where: { organizationId },
      }),
      (this.prisma as any).ticketAttachment.count({
        where: { organizationId },
      }),
      (this.prisma as any).knowledgeArticle.count({
        where: { organizationId, status: { not: 'ARCHIVED' } },
      }),
      (this.prisma as any).feedbackResponse.count({
        where: { organizationId },
      }),
      (this.prisma as any).invitation.count({
        where: { organizationId, status: 'PENDING' },
      }),
      this.getMetered(organizationId, UsageResourceTypeValue.API_CALL),
      this.getStorageUsed(organizationId),
    ]);

    return {
      users,
      customers,
      agents,
      tickets,
      ticketsThisMonth,
      feedbackForms,
      attachments,
      knowledgeArticles,
      feedbackResponses,
      pendingInvitations,
      apiCallsThisMonth,
      storageBytes,
    };
  }

  /** Sum of FileUpload.fileSize for an organization (bytes). */
  async getStorageUsed(organizationId: string): Promise<number> {
    const aggregate = await (this.prisma as any).fileUpload.aggregate({
      where: { organizationId },
      _sum: { fileSize: true },
    });
    const bytes = aggregate?._sum?.fileSize;
    return bytes ? Number(bytes) : 0;
  }

  /**
   * Current count for a single resource. Used by FeatureGateService for
   * hard-limit enforcement.
   */
  async getCount(
    organizationId: string,
    resourceType: UsageResourceTypeValue,
  ): Promise<number> {
    const usage = await this.getCurrentUsage(organizationId);
    switch (resourceType) {
      case UsageResourceTypeValue.SEAT:
      case UsageResourceTypeValue.AGENT:
        return usage.agents;
      case UsageResourceTypeValue.CUSTOMER:
        return usage.customers;
      case UsageResourceTypeValue.TICKET:
        return usage.ticketsThisMonth;
      case UsageResourceTypeValue.ATTACHMENT:
        return usage.attachments;
      case UsageResourceTypeValue.KNOWLEDGE_ARTICLE:
        return usage.knowledgeArticles;
      case UsageResourceTypeValue.FEEDBACK_FORM:
        return usage.feedbackForms;
      case UsageResourceTypeValue.INVITATION:
        return usage.pendingInvitations;
      case UsageResourceTypeValue.STORAGE_BYTES:
        return usage.storageBytes;
      case UsageResourceTypeValue.API_CALL:
      case UsageResourceTypeValue.EMAIL:
        return usage.apiCallsThisMonth;
      default:
        return 0;
    }
  }
}
