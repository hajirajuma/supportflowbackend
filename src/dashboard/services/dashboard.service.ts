import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardAccess } from '../types/dashboard-access.type';
import { DashboardFilterDto } from '../dto/dashboard-filter.dto';
import { AnalyticsService } from './analytics.service';
import { KpiService } from './kpi.service';
import { RevenueService, toNumber } from './revenue.service';
import { baseScopeWhere, resolveScope } from '../utils/scope.util';
import { resolveRange } from '../utils/time-series.util';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly kpiService: KpiService,
    private readonly revenueService: RevenueService,
  ) {}

  /** Routes to the correct role dashboard. */
  async getDashboard(access: DashboardAccess, filter: DashboardFilterDto) {
    if (access.isPlatformAdmin)
      return this.getPlatformDashboard(access, filter);
    if (access.isOwner || access.isAdmin)
      return this.getTenantDashboard(access, filter);
    if (access.isAgent) return this.getSupportAgentDashboard(access, filter);
    if (access.isCustomer) return this.getCustomerDashboard(access, filter);
    throw new ForbiddenException('Unsupported role.');
  }

  async getPlatformDashboard(
    access: DashboardAccess,
    filter: DashboardFilterDto,
  ) {
    if (!access.isPlatformAdmin) {
      throw new ForbiddenException(
        'Platform dashboard is reserved for platform admins.',
      );
    }
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);

    const [
      totalOrganizations,
      activeOrganizations,
      inactiveOrganizations,
      trialOrganizations,
      paidOrganizations,
      totalUsers,
      totalCustomers,
      totalAgents,
      ticketSummary,
      revenue,
      subscriptionDistribution,
      storage,
      usage,
      recentOrganizations,
      recentPayments,
      recentFeedback,
      recentTickets,
      kpis,
    ] = await Promise.all([
      (this.prisma as any).organization.count(),
      (this.prisma as any).organization.count({ where: { status: 'ACTIVE' } }),
      (this.prisma as any).organization.count({
        where: { status: { in: ['SUSPENDED', 'CLOSED'] } },
      }),
      (this.prisma as any).organizationSubscription.count({
        where: { status: 'TRIAL' },
      }),
      (this.prisma as any).organizationSubscription.count({
        where: { status: { in: ['ACTIVE', 'PAST_DUE'] } },
      }),
      (this.prisma as any).user.count(),
      (this.prisma as any).user.count({ where: { role: 'CUSTOMER' } }),
      (this.prisma as any).user.count({
        where: {
          role: { in: ['SUPPORT_AGENT', 'TENANT_OWNER'] },
          status: 'ACTIVE',
        },
      }),
      this.analyticsService.getTickets(access, filter),
      this.revenueService.getMrr(access, filter),
      this.analyticsService.getSubscriptionDistribution(access, filter),
      (this.prisma as any).fileUpload.aggregate({ _sum: { fileSize: true } }),
      this.analyticsService.getUsage(access, filter),
      (this.prisma as any).organization.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
        },
      }),
      (this.prisma as any).payment.findMany({
        where: { status: 'SUCCESSFUL' },
        orderBy: { paidAt: 'desc' },
        take: 8,
        select: {
          id: true,
          reference: true,
          amount: true,
          currency: true,
          paidAt: true,
          organization: { select: { name: true } },
        },
      }),
      (this.prisma as any).ticketFeedback.findMany({
        where: { submittedAt: { gte: from, lte: to } },
        orderBy: { submittedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          rating: true,
          wouldRecommend: true,
          comment: true,
          submittedAt: true,
          organization: { select: { name: true } },
        },
      }),
      (this.prisma as any).ticket.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
          organization: { select: { name: true } },
        },
      }),
      this.kpiService.compute(access, filter),
    ]);

    const growth = await this.analyticsService.getOrganizations(access, filter);

    return {
      role: 'PLATFORM_ADMIN',
      dateRange: { from, to },
      overview: {
        organizations: {
          total: totalOrganizations,
          active: activeOrganizations,
          inactive: inactiveOrganizations,
          trial: trialOrganizations,
          paid: paidOrganizations,
        },
        users: {
          total: totalUsers,
          customers: totalCustomers,
          supportAgents: totalAgents,
        },
        tickets: {
          total: ticketSummary.summary.total,
          open: ticketSummary.summary.open,
          resolved: ticketSummary.summary.resolved,
          closed: ticketSummary.summary.closed,
          pending: ticketSummary.summary.pending,
          overdue: ticketSummary.summary.overdue,
        },
      },
      kpis: {
        averageResolutionTimeMinutes: kpis.averageResolutionTimeMinutes,
        averageFirstResponseTimeMinutes: kpis.averageFirstResponseTimeMinutes,
        customerSatisfaction: kpis.customerSatisfactionScore,
        averageRating: await this.averageFeedbackRating(scope, from, to),
        nps: kpis.netPromoterScore,
      },
      revenue: {
        mrr: revenue,
        arr: Math.round(revenue * 12 * 100) / 100,
        monthlyRevenue: await this.revenueService.getMonthlyRevenue(scope),
        annualRevenue: await this.revenueService.getAnnualRevenue(scope),
      },
      subscriptionDistribution,
      storage: {
        bytes: toNumber(storage._sum?.fileSize),
        gb: Math.round((toNumber(storage._sum?.fileSize) / 1e9) * 1000) / 1000,
      },
      apiUsage: usage.summary.apiCalls,
      platformGrowth: growth,
      systemHealth: await this.systemHealth(),
      recent: {
        organizations: recentOrganizations,
        payments: recentPayments,
        feedback: recentFeedback,
        tickets: recentTickets,
      },
    };
  }

  async getTenantDashboard(
    access: DashboardAccess,
    filter: DashboardFilterDto,
  ) {
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required.');
    }
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);

    const [
      tickets,
      feedback,
      customers,
      agents,
      storage,
      subscription,
      recentActivities,
      recentPayments,
      kpis,
    ] = await Promise.all([
      this.analyticsService.getTickets(access, filter),
      this.analyticsService.getFeedback(access, filter),
      (this.prisma as any).user.count({
        where: { ...baseScopeWhere(scope), role: 'CUSTOMER', status: 'ACTIVE' },
      }),
      (this.prisma as any).user.count({
        where: { ...baseScopeWhere(scope), role: 'AGENT', status: 'ACTIVE' },
      }),
      (this.prisma as any).fileUpload.aggregate({
        where: baseScopeWhere(scope),
        _sum: { fileSize: true },
      }),
      this.getSubscriptionContext(access),
      this.recentActivities(scope),
      (this.prisma as any).payment.findMany({
        where: { ...baseScopeWhere(scope), status: 'SUCCESSFUL' },
        orderBy: { paidAt: 'desc' },
        take: 8,
        select: {
          id: true,
          reference: true,
          amount: true,
          currency: true,
          paidAt: true,
          status: true,
        },
      }),
      this.kpiService.compute(access, filter),
    ]);

    return {
      role: 'TENANT_OWNER',
      dateRange: { from, to },
      organizationId: scope.organizationId,
      overview: {
        customers: customers,
        supportAgents: agents,
        tickets: {
          open: tickets.summary.open,
          resolved: tickets.summary.resolved,
          closed: tickets.summary.closed,
          overdue: tickets.summary.overdue,
          pending: tickets.summary.pending,
        },
      },
      kpis: {
        averageResolutionTimeMinutes: kpis.averageResolutionTimeMinutes,
        averageFirstResponseTimeMinutes: kpis.averageFirstResponseTimeMinutes,
        customerSatisfaction: kpis.customerSatisfactionScore,
        nps: kpis.netPromoterScore,
        averageRating: feedback.summary.averageRating,
      },
      feedbackTrends: feedback.trend,
      ticketTrends: tickets.trend,
      supportPerformance: await this.analyticsService.getAgentPerformance(
        access,
        filter,
      ),
      storage: {
        bytes: toNumber(storage._sum?.fileSize),
        gb: Math.round((toNumber(storage._sum?.fileSize) / 1e9) * 1000) / 1000,
      },
      subscription: subscription?.subscription,
      planUsage: subscription?.planUsage,
      remainingLimits: subscription?.remainingLimits,
      recent: {
        activities: recentActivities,
        payments: recentPayments,
      },
    };
  }

  async getSupportAgentDashboard(
    access: DashboardAccess,
    filter: DashboardFilterDto,
  ) {
    const agentId = access.userId;
    const agentFilter: DashboardFilterDto = { ...filter, agentId };

    const [tickets, performance, ratings, recentReplies, recentActivities] =
      await Promise.all([
        this.analyticsService.getTickets(access, agentFilter),
        this.analyticsService.getAgentPerformance(access, agentFilter),
        this.agentRatings(access, agentId),
        this.recentReplies(access, agentId),
        this.agentActivities(access, agentId),
      ]);

    return {
      role: 'SUPPORT_AGENT',
      dateRange: resolveRange(filter.dateFrom, filter.dateTo),
      overview: {
        assignedTickets: tickets.summary.total,
        openTickets: tickets.summary.open,
        resolvedTickets: tickets.summary.resolved,
        overdueTickets: tickets.summary.overdue,
      },
      kpis: {
        averageResolutionTimeMinutes:
          performance.agents[0]?.avgResolutionTimeMinutes ?? 0,
        averageResponseTimeMinutes:
          performance.agents[0]?.avgResponseTimeMinutes ?? 0,
        customerRatings: ratings,
      },
      performance: performance.agents[0],
      recent: {
        replies: recentReplies,
        activities: recentActivities,
      },
    };
  }

  async getCustomerDashboard(
    access: DashboardAccess,
    filter: DashboardFilterDto,
  ) {
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);

    const ticketWhere: Record<string, unknown> = {
      createdById: access.userId,
      createdAt: { gte: from, lte: to },
    };

    const [
      myTickets,
      openTickets,
      resolvedTickets,
      pendingFeedback,
      submittedFeedback,
      recentNotifications,
      organizationContact,
      recentTickets,
    ] = await Promise.all([
      (this.prisma as any).ticket.count({ where: ticketWhere }),
      (this.prisma as any).ticket.count({
        where: {
          ...ticketWhere,
          status: {
            in: [
              'OPEN',
              'IN_PROGRESS',
              'WAITING_FOR_CUSTOMER',
              'ON_HOLD',
              'ESCALATED',
              'REOPENED',
            ],
          },
        },
      }),
      (this.prisma as any).ticket.count({
        where: { ...ticketWhere, status: { in: ['RESOLVED', 'CLOSED'] } },
      }),
      (this.prisma as any).ticket.count({
        where: {
          createdById: access.userId,
          feedbackRequestedAt: { not: null },
          feedbackSubmittedAt: null,
        },
      }),
      (this.prisma as any).ticketFeedback.count({
        where: { submittedById: access.userId },
      }),
      (this.prisma as any).notification.findMany({
        where: { userId: access.userId, isArchived: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          isRead: true,
          createdAt: true,
        },
      }),
      this.organizationContact(access),
      (this.prisma as any).ticket.findMany({
        where: ticketWhere,
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      role: 'CUSTOMER',
      dateRange: { from, to },
      overview: {
        myTickets,
        openTickets,
        resolvedTickets,
        pendingFeedback,
        submittedFeedback,
      },
      recent: {
        tickets: recentTickets,
        notifications: recentNotifications,
      },
      organizationContact,
    };
  }

  // --------------------------------------------------------------------------

  private async averageFeedbackRating(
    scope: { organizationId?: string; organizationIds?: string[] },
    from: Date,
    to: Date,
  ): Promise<number> {
    const responses = await (this.prisma as any).ticketFeedback.findMany({
      where: {
        ...baseScopeWhere(scope),
        rating: { not: null },
        submittedAt: { gte: from, lte: to },
      },
      select: { rating: true },
    });
    if (!responses.length) return 0;
    const avg =
      responses.reduce(
        (sum: number, r: any) => sum + this.ratingToNumber(r.rating),
        0,
      ) / responses.length;
    return Math.round(avg * 100) / 100;
  }

  private async getSubscriptionContext(access: DashboardAccess) {
    if (!access.organizationId) return null;
    const subscription = await (
      this.prisma as any
    ).organizationSubscription.findUnique({
      where: { organizationId: access.organizationId },
      select: {
        id: true,
        status: true,
        billingInterval: true,
        seats: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        renewsAt: true,
        plan: {
          select: {
            name: true,
            planType: true,
            priceMonthly: true,
            priceYearly: true,
            currency: true,
            maxUsers: true,
            maxCustomers: true,
            maxAgents: true,
            maxTicketsPerMonth: true,
            maxKnowledgeArticles: true,
            maxInvitations: true,
            storageLimitBytes: true,
            apiMonthlyQuota: true,
            apiRateLimitPerMinute: true,
          },
        },
      },
    });

    if (!subscription) return null;

    const where: Record<string, unknown> = {
      organizationId: access.organizationId,
    };
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      users,
      customers,
      agents,
      ticketsThisMonth,
      knowledgeArticles,
      invitations,
      storageAgg,
      apiCalls,
    ] = await Promise.all([
      (this.prisma as any).user.count({ where }),
      (this.prisma as any).user.count({
        where: { ...where, role: 'CUSTOMER' },
      }),
      (this.prisma as any).user.count({ where: { ...where, role: 'AGENT' } }),
      (this.prisma as any).ticket.count({
        where: { ...where, createdAt: { gte: periodStart } },
      }),
      (this.prisma as any).knowledgeArticle.count({ where }),
      (this.prisma as any).invitation.count({
        where: { ...where, status: 'PENDING' },
      }),
      (this.prisma as any).fileUpload.aggregate({
        where,
        _sum: { fileSize: true },
      }),
      (this.prisma as any).usageRecord.aggregate({
        where: { ...where, metric: 'API_CALL' },
        _sum: { value: true },
      }),
    ]);

    const plan = subscription.plan ?? {};
    const used = {
      users,
      customers,
      agents,
      ticketsThisMonth,
      knowledgeArticles,
      pendingInvitations: invitations,
      storageBytes: toNumber(storageAgg._sum?.fileSize),
      apiCalls: toNumber(apiCalls._sum?.value),
    };

    const limits = {
      maxUsers: plan.maxUsers ?? 0,
      maxCustomers: plan.maxCustomers ?? 0,
      maxAgents: plan.maxAgents ?? 0,
      maxTicketsPerMonth: plan.maxTicketsPerMonth ?? 0,
      maxKnowledgeArticles: plan.maxKnowledgeArticles ?? 0,
      maxInvitations: plan.maxInvitations ?? 0,
      storageLimitBytes: plan.storageLimitBytes ?? 0,
      apiMonthlyQuota: plan.apiMonthlyQuota ?? 0,
    };

    const remaining = {
      users: Math.max(0, limits.maxUsers - used.users),
      customers: Math.max(0, limits.maxCustomers - used.customers),
      agents: Math.max(0, limits.maxAgents - used.agents),
      ticketsThisMonth: Math.max(
        0,
        limits.maxTicketsPerMonth - used.ticketsThisMonth,
      ),
      knowledgeArticles: Math.max(
        0,
        limits.maxKnowledgeArticles - used.knowledgeArticles,
      ),
      invitations: Math.max(0, limits.maxInvitations - used.pendingInvitations),
      storageBytes: Math.max(
        0,
        toNumber(limits.storageLimitBytes) - used.storageBytes,
      ),
      apiCalls: Math.max(0, limits.apiMonthlyQuota - used.apiCalls),
    };

    return {
      subscription,
      planUsage: used,
      remainingLimits: remaining,
    };
  }

  private async recentActivities(scope: {
    organizationId?: string;
    organizationIds?: string[];
  }) {
    return (this.prisma as any).auditLog.findMany({
      where: baseScopeWhere(scope),
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorEmail: true,
        actorName: true,
        createdAt: true,
      },
    });
  }

  private async agentActivities(access: DashboardAccess, agentId: string) {
    return (this.prisma as any).auditLog.findMany({
      where: { actorId: agentId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorEmail: true,
        actorName: true,
        createdAt: true,
      },
    });
  }

  private async recentReplies(access: DashboardAccess, agentId: string) {
    return (this.prisma as any).ticketReply.findMany({
      where: { authorId: agentId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        body: true,
        replyType: true,
        isInternal: true,
        createdAt: true,
        ticket: { select: { ticketNumber: true, subject: true } },
      },
    });
  }

  private async agentRatings(access: DashboardAccess, agentId: string) {
    // Feedback is per-ticket; average the rating of the tickets handled
    // by this agent through their linked ticket feedback.
    const responses = await (this.prisma as any).ticketFeedback.findMany({
      where: {
        ticket: {
          assignedToId: agentId,
          ...(access.organizationId
            ? { organizationId: access.organizationId }
            : {}),
        },
      },
      select: { rating: true },
    });
    if (!responses.length) return { count: 0, average: 0 };

    const scores = responses
      .map((r: any) => this.ratingToNumber(r.rating))
      .filter((v: unknown): v is number => typeof v === 'number');
    if (!scores.length) return { count: responses.length, average: 0 };

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { count: scores.length, average: Math.round(avg * 100) / 100 };
  }

  private async organizationContact(access: DashboardAccess) {
    if (!access.organizationId) return null;
    const organization = await (this.prisma as any).organization.findUnique({
      where: { id: access.organizationId },
      select: {
        id: true,
        name: true,
        logo: true,
        email: true,
        phone: true,
        website: true,
        settings: {
          select: {
            supportEmail: true,
            supportPhone: true,
          },
        },
      },
    });
    return {
      organizationId: organization?.id,
      name: organization?.name,
      logoUrl: organization?.logo,
      supportEmail: organization?.settings?.supportEmail ?? organization?.email,
      supportPhone: organization?.settings?.supportPhone ?? organization?.phone,
      supportAddress: null,
      website: organization?.website,
    };
  }

  private async systemHealth() {
    const [organizations, tickets, feedbackRequests, payments, failedPayments] =
      await Promise.all([
        (this.prisma as any).organization.count(),
        (this.prisma as any).ticket.count(),
        (this.prisma as any).ticket.count({
          where: {
            feedbackRequestedAt: { not: null },
            feedbackSubmittedAt: null,
          },
        }),
        (this.prisma as any).payment.count({ where: { status: 'SUCCESSFUL' } }),
        (this.prisma as any).payment.count({ where: { status: 'FAILED' } }),
      ]);

    const paymentFailureRate =
      payments + failedPayments
        ? Math.round((failedPayments / (payments + failedPayments)) * 1000) / 10
        : 0;

    const status =
      paymentFailureRate < 5 && tickets >= 0 ? 'OPERATIONAL' : 'DEGRADED';

    return {
      status,
      paymentFailureRate,
      pendingFeedbackRequests: feedbackRequests,
      activeOrganizations: organizations,
      totalTickets: tickets,
      checkedAt: new Date(),
    };
  }

  private ratingToNumber(rating: unknown): number {
    const map: Record<string, number> = {
      VERY_UNSATISFIED: 1,
      UNSATISFIED: 2,
      NEUTRAL: 3,
      SATISFIED: 4,
      VERY_SATISFIED: 5,
    };
    if (typeof rating === 'number') return rating;
    if (typeof rating === 'string') {
      const normalized = rating.toUpperCase();
      if (map[normalized]) return map[normalized];
      const parsed = Number(rating);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return 0;
  }
}
