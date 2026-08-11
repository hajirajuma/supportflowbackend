import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardAccess } from '../types/dashboard-access.type';
import { AnalyticsFilterDto } from '../dto/analytics-filter.dto';
import { TrendGranularity } from '../enums/dashboard.enums';
import { ChartType, ReportCategory } from '../enums/dashboard.enums';
import {
  baseScopeWhere,
  resolveScope,
  ticketScopeWhere,
} from '../utils/scope.util';
import {
  buildBuckets,
  bucketKey,
  resolveRange,
} from '../utils/time-series.util';
import { KpiService } from './kpi.service';
import { RevenueService, toNumber } from './revenue.service';
import { ChartService } from './chart.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kpiService: KpiService,
    private readonly revenueService: RevenueService,
    private readonly chartService: ChartService,
  ) {}

  // --------------------------------------------------------------------------
  // Aggregate analytics (GET /analytics)
  // --------------------------------------------------------------------------

  async getAggregate(access: DashboardAccess, filter: AnalyticsFilterDto) {
    if (access.isCustomer) {
      throw new ForbiddenException(
        'Customers have a personal dashboard instead.',
      );
    }
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);

    const [
      tickets,
      feedback,
      payments,
      customers,
      usage,
      knowledgeBase,
      revenue,
      kpis,
      organizationAnalytics,
    ] = await Promise.all([
      this.getTickets(access, filter),
      this.getFeedback(access, filter),
      this.getPayments(access, filter),
      this.getCustomers(access, filter),
      this.getUsage(access, filter),
      this.getKnowledgeBase(access, filter),
      this.getRevenue(access, filter),
      this.kpiService.compute(access, filter),
      access.isPlatformAdmin
        ? this.getOrganizations(access, filter)
        : Promise.resolve(undefined),
    ]);

    return {
      dateRange: { from, to },
      scope: { organizationId: scope.organizationId ?? null },
      kpis,
      tickets,
      feedback,
      payments,
      customers,
      revenue,
      usage,
      knowledgeBase,
      organizations: organizationAnalytics,
    };
  }

  // --------------------------------------------------------------------------
  // Tickets
  // --------------------------------------------------------------------------

  async getTickets(access: DashboardAccess, filter: AnalyticsFilterDto) {
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);
    const where = ticketScopeWhere(scope, {
      createdAt: { gte: from, lte: to },
    });

    const statusWhere = (statuses: string[]) => ({
      ...where,
      status: { in: statuses },
    });

    const [
      total,
      open,
      inProgress,
      pending,
      resolved,
      closed,
      escalated,
      overdue,
      byStatus,
      byPriority,
      createdTrend,
      recent,
    ] = await Promise.all([
      (this.prisma as any).ticket.count({ where }),
      (this.prisma as any).ticket.count({
        where: statusWhere([
          'OPEN',
          'IN_PROGRESS',
          'WAITING_FOR_CUSTOMER',
          'ON_HOLD',
          'ESCALATED',
          'REOPENED',
        ]),
      }),
      (this.prisma as any).ticket.count({
        where: statusWhere(['IN_PROGRESS']),
      }),
      (this.prisma as any).ticket.count({
        where: statusWhere(['WAITING_FOR_CUSTOMER', 'ON_HOLD']),
      }),
      (this.prisma as any).ticket.count({ where: statusWhere(['RESOLVED']) }),
      (this.prisma as any).ticket.count({ where: statusWhere(['CLOSED']) }),
      (this.prisma as any).ticket.count({ where: statusWhere(['ESCALATED']) }),
      (this.prisma as any).ticket.count({
        where: {
          ...where,
          dueAt: { not: null, lt: new Date() },
          status: { notIn: ['RESOLVED', 'CLOSED'] },
        },
      }),
      (this.prisma as any).ticket.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      (this.prisma as any).ticket.groupBy({
        by: ['priority'],
        where,
        _count: { _all: true },
      }),
      this.ticketTrend(scope, filter),
      (this.prisma as any).ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
          dueAt: true,
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);

    return {
      summary: {
        total,
        open,
        inProgress,
        pending,
        resolved,
        closed,
        escalated,
        overdue,
        resolutionRate: total
          ? Math.round(((resolved + closed) / total) * 1000) / 10
          : 0,
      },
      byStatus,
      byPriority,
      trend: createdTrend,
      recent,
    };
  }

  private async ticketTrend(
    scope: {
      organizationId?: string;
      organizationIds?: string[];
      agentId?: string;
      customerId?: string;
    },
    filter: AnalyticsFilterDto,
  ) {
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);
    const granularity = filter.trend ?? TrendGranularity.MONTH;
    const buckets = buildBuckets(from, to, granularity);
    const tickets = await (this.prisma as any).ticket.findMany({
      where: ticketScopeWhere(scope, {
        createdAt: { gte: from, lte: to },
        ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
        ...(filter.priority ? { priority: filter.priority } : {}),
      }),
      select: { createdAt: true, status: true, priority: true },
    });

    const counts = new Map<string, number>();
    for (const bucket of buckets) counts.set(bucket.key, 0);
    for (const ticket of tickets) {
      const key = bucketKey(ticket.createdAt, granularity);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return buckets.map((bucket) => ({
      period: bucket.key,
      count: counts.get(bucket.key) ?? 0,
    }));
  }

  // --------------------------------------------------------------------------
  // Feedback
  // --------------------------------------------------------------------------

  async getFeedback(access: DashboardAccess, filter: AnalyticsFilterDto) {
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);
    const where: Record<string, unknown> = {
      ...baseScopeWhere(scope),
      submittedAt: { gte: from, lte: to },
      ...(filter.customerId ? { submittedById: filter.customerId } : {}),
    };
    if (filter.feedbackRating) {
      where.rating = filter.feedbackRating;
    }

    const responses = await (this.prisma as any).ticketFeedback.findMany({
      where,
      select: {
        id: true,
        rating: true,
        wouldRecommend: true,
        responseTime: true,
        resolutionTime: true,
        submittedAt: true,
        ticket: { select: { ticketNumber: true, subject: true } },
      },
    });

    const scores = responses
      .map((r: any) => this.feedbackRatingValue(r.rating))
      .filter((v: unknown): v is number => typeof v === 'number');
    const npsSignals = responses
      .map((r: any) => r.wouldRecommend)
      .filter((v: unknown): v is boolean => typeof v === 'boolean');

    const averageRating = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) /
        100
      : 0;
    const csat = scores.length
      ? Math.round((averageRating / 5) * 1000) / 10
      : 0;
    const promoters = npsSignals.filter(Boolean).length;
    const detractors = npsSignals.length - promoters;
    const nps = npsSignals.length
      ? Math.round(((promoters - detractors) / npsSignals.length) * 100)
      : null;

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const score of scores) {
      const key = Math.min(5, Math.max(1, Math.round(score)));
      ratingDistribution[key as 1] = (ratingDistribution[key as 1] ?? 0) + 1;
    }

    const granularity = filter.trend ?? TrendGranularity.MONTH;
    const byPeriod = new Map<string, { count: number; total: number }>();
    const buckets = buildBuckets(from, to, granularity);
    for (const bucket of buckets)
      byPeriod.set(bucket.key, { count: 0, total: 0 });
    for (const r of responses) {
      const key = bucketKey(r.submittedAt, granularity);
      const entry = byPeriod.get(key) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += this.feedbackRatingValue(r.rating);
      byPeriod.set(key, entry);
    }

    return {
      summary: {
        totalResponses: responses.length,
        totalRequests: responses.length,
        responseRate: 100,
        completionRate: 100,
        averageRating,
        csat,
        nps,
      },
      ratingDistribution,
      byForm: this.feedbackByTicket(responses),
      trend: buckets.map((bucket) => {
        const entry = byPeriod.get(bucket.key)!;
        return {
          period: bucket.key,
          count: entry.count,
          average: entry.count
            ? Math.round((entry.total / entry.count) * 100) / 100
            : 0,
        };
      }),
    };
  }

  private feedbackByTicket(responses: any[]) {
    const map = new Map<
      string,
      { ticketId: string; title: string; count: number; total: number }
    >();
    for (const r of responses) {
      const id =
        r.ticket?.ticketNumber ?? r.ticket?.subject ?? 'unknown-ticket';
      const entry = map.get(id) ?? {
        ticketId: id,
        title: r.ticket?.subject ?? 'Unknown ticket',
        count: 0,
        total: 0,
      };
      entry.count += 1;
      entry.total += this.feedbackRatingValue(r.rating);
      map.set(id, entry);
    }
    return Array.from(map.values()).map((e) => ({
      ticketId: e.ticketId,
      title: e.title,
      responses: e.count,
      averageRating: e.count ? Math.round((e.total / e.count) * 100) / 100 : 0,
    }));
  }

  // --------------------------------------------------------------------------
  // Payments
  // --------------------------------------------------------------------------

  async getPayments(access: DashboardAccess, filter: AnalyticsFilterDto) {
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);
    const where: Record<string, unknown> = {
      ...baseScopeWhere(scope),
      createdAt: { gte: from, lte: to },
    };

    const [total, successful, failed, byStatus, byProvider, revenue, recent, payments] =
      await Promise.all([
        (this.prisma as any).payment.count({ where }),
        (this.prisma as any).payment.count({
          where: { ...where, status: 'SUCCESSFUL' },
        }),
        (this.prisma as any).payment.count({
          where: { ...where, status: 'FAILED' },
        }),
        (this.prisma as any).payment.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        (this.prisma as any).payment.groupBy({
          by: ['provider'],
          where,
          _count: { _all: true },
        }),
        (this.prisma as any).payment.aggregate({
          where: { ...where, status: 'SUCCESSFUL' },
          _sum: { amount: true },
        }),
        (this.prisma as any).payment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            reference: true,
            amount: true,
            currency: true,
            status: true,
            provider: true,
            paidAt: true,
            createdAt: true,
            organization: { select: { id: true, name: true } },
          },
        }),
        (this.prisma as any).payment.findMany({
          where: { ...where, status: 'SUCCESSFUL' },
          select: { paidAt: true, amount: true },
        }),
      ]);

    const granularity = filter.trend ?? TrendGranularity.MONTH;
    const buckets = buildBuckets(from, to, granularity);
    const byPeriod = new Map<string, number>();
    for (const bucket of buckets) byPeriod.set(bucket.key, 0);
    for (const payment of payments) {
      const date = payment.paidAt ?? payment.createdAt;
      const key = bucketKey(date, granularity);
      byPeriod.set(key, (byPeriod.get(key) ?? 0) + toNumber(payment.amount));
    }

    return {
      summary: {
        total,
        successful,
        failed,
        successRate: total ? Math.round((successful / total) * 1000) / 10 : 0,
        totalRevenue: Math.round(toNumber(revenue._sum?.amount) * 100) / 100,
      },
      byStatus,
      byProvider,
      trend: buckets.map((bucket) => ({
        period: bucket.key,
        value: Math.round((byPeriod.get(bucket.key) ?? 0) * 100) / 100,
      })),
      recent,
    };
  }

  // --------------------------------------------------------------------------
  // Revenue
  // --------------------------------------------------------------------------

  async getRevenue(access: DashboardAccess, filter: AnalyticsFilterDto) {
    const scope = resolveScope(access, filter);

    const [
      mrr,
      monthlyRevenue,
      annualRevenue,
      totalRevenue,
      revenueByPlan,
      revenueTrend,
      subscriptionDistribution,
    ] = await Promise.all([
      this.revenueService.getMrr(access, filter),
      this.revenueService.getMonthlyRevenue(scope),
      this.revenueService.getAnnualRevenue(scope),
      this.revenueService.getTotalRevenue(scope),
      this.revenueService.getRevenueByPlan(scope),
      this.revenueService.getRevenueTrend(
        access,
        filter,
        filter.trend ?? TrendGranularity.MONTH,
      ),
      this.getSubscriptionDistribution(access, filter),
    ]);

    const arr = mrr * 12;

    return {
      summary: {
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(arr * 100) / 100,
        monthlyRevenue,
        annualRevenue,
        totalRevenue,
      },
      subscriptionDistribution,
      revenueByPlan,
      trend: revenueTrend,
    };
  }

  async getSubscriptionDistribution(
    access: DashboardAccess,
    filter: AnalyticsFilterDto,
  ) {
    const scope = resolveScope(access, filter);
    const [groups, plans, planCounts] = await Promise.all([
      (this.prisma as any).organizationSubscription.groupBy({
        by: ['status'],
        where: baseScopeWhere(scope),
        _count: { _all: true },
      }),
      (this.prisma as any).subscriptionPlan.findMany({
        select: { id: true, name: true, type: true },
      }),
      (this.prisma as any).organizationSubscription.groupBy({
        by: ['planId'],
        where: baseScopeWhere(scope),
        _count: { _all: true },
      }),
    ]);

    return {
      byStatus: groups,
      byPlan: plans.map((plan: any) => ({
        planId: plan.id,
        name: plan.name,
        planType: plan.type,
        count:
          planCounts.find((p: any) => p.planId === plan.id)?._count?._all ?? 0,
      })),
    };
  }

  // --------------------------------------------------------------------------
  // Customers
  // --------------------------------------------------------------------------

  async getCustomers(access: DashboardAccess, filter: AnalyticsFilterDto) {
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);
    const where: Record<string, unknown> = {
      ...baseScopeWhere(scope),
      role: 'CUSTOMER',
      createdAt: { gte: from, lte: to },
    };

    const [total, active, byStatus, growth, recent] = await Promise.all([
      (this.prisma as any).user.count({ where }),
      (this.prisma as any).user.count({
        where: { ...where, status: 'ACTIVE' },
      }),
      (this.prisma as any).user.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.customerGrowth(scope, filter),
      (this.prisma as any).user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      summary: { total, active },
      byStatus,
      trend: growth,
      recent,
    };
  }

  private async customerGrowth(
    scope: { organizationId?: string; organizationIds?: string[] },
    filter: AnalyticsFilterDto,
  ) {
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);
    const granularity = filter.trend ?? TrendGranularity.MONTH;
    const buckets = buildBuckets(from, to, granularity);
    const users = await (this.prisma as any).user.findMany({
      where: {
        ...baseScopeWhere(scope),
        role: 'CUSTOMER',
        createdAt: { gte: from, lte: to },
      },
      select: { createdAt: true },
    });
    const counts = new Map<string, number>();
    for (const bucket of buckets) counts.set(bucket.key, 0);
    for (const user of users) {
      const key = bucketKey(user.createdAt, granularity);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return buckets.map((bucket) => ({
      period: bucket.key,
      count: counts.get(bucket.key) ?? 0,
    }));
  }

  // --------------------------------------------------------------------------
  // Organizations (platform only)
  // --------------------------------------------------------------------------

  async getOrganizations(access: DashboardAccess, filter: AnalyticsFilterDto) {
    if (!access.isPlatformAdmin) {
      throw new ForbiddenException(
        'Organization analytics are platform-admin only.',
      );
    }
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);
    const where: Record<string, unknown> = {
      createdAt: { gte: from, lte: to },
      ...(filter.organizationId ? { id: filter.organizationId } : {}),
    };

    const [total, byStatus, growth, activeSubs, trialOrgs, recent] =
      await Promise.all([
        (this.prisma as any).organization.count({ where }),
        (this.prisma as any).organization.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.organizationGrowth(filter),
        (this.prisma as any).organizationSubscription.count({
          where: { status: { in: ['ACTIVE', 'PAST_DUE'] } },
        }),
        (this.prisma as any).organizationSubscription.count({
          where: { status: 'TRIALING' },
        }),
        (this.prisma as any).organization.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            createdAt: true,
            subscriptions: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: {
                status: true,
                plan: { select: { name: true, type: true } },
              },
            },
          },
        }),
      ]);

    return {
      summary: {
        total,
        paidOrganizations: activeSubs,
        trialOrganizations: trialOrgs,
      },
      byStatus,
      trend: growth,
      recent,
    };
  }

  private async organizationGrowth(filter: AnalyticsFilterDto) {
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);
    const granularity = filter.trend ?? TrendGranularity.MONTH;
    const buckets = buildBuckets(from, to, granularity);
    const orgs = await (this.prisma as any).organization.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    });
    const counts = new Map<string, number>();
    for (const bucket of buckets) counts.set(bucket.key, 0);
    for (const org of orgs) {
      const key = bucketKey(org.createdAt, granularity);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return buckets.map((bucket) => ({
      period: bucket.key,
      count: counts.get(bucket.key) ?? 0,
    }));
  }

  // --------------------------------------------------------------------------
  // Usage & storage
  // --------------------------------------------------------------------------

  async getUsage(access: DashboardAccess, filter: AnalyticsFilterDto) {
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);

    const usageWhere: Record<string, unknown> = {
      ...baseScopeWhere(scope),
      periodStart: { gte: from, lte: to },
    };

    const [usageGroups, storageAgg] = await Promise.all([
      (this.prisma as any).usageRecord.groupBy({
        by: ['metric'],
        where: usageWhere,
        _sum: { value: true },
      }),
      (this.prisma as any).fileUpload.aggregate({
        where: baseScopeWhere(scope),
        _sum: { fileSize: true },
      }),
    ]);

    const apiCalls = usageGroups
      .filter((g: any) => g.metric === 'API_CALL')
      .reduce((sum: number, g: any) => sum + (g._sum?.value ?? 0), 0);

    return {
      summary: {
        storageBytes: toNumber(storageAgg._sum?.fileSize),
        storageGb:
          Math.round((toNumber(storageAgg._sum?.fileSize) / 1e9) * 1000) / 1000,
        apiCalls,
      },
      byResourceType: usageGroups,
    };
  }

  // --------------------------------------------------------------------------
  // Knowledge base
  // --------------------------------------------------------------------------

  async getKnowledgeBase(access: DashboardAccess, filter: AnalyticsFilterDto) {
    const scope = resolveScope(access, filter);
    const where: Record<string, unknown> = baseScopeWhere(scope);

    const [articles, viewsAgg] = await Promise.all([
      (this.prisma as any).knowledgeArticle.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          views: true,
          helpfulCount: true,
          notHelpfulCount: true,
          createdAt: true,
        },
      }),
      (this.prisma as any).knowledgeArticle.aggregate({
        where,
        _sum: { views: true, helpfulCount: true, notHelpfulCount: true },
      }),
    ]);

    const granularity = filter.trend ?? TrendGranularity.MONTH;
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);
    const buckets = buildBuckets(from, to, granularity);
    const counts = new Map<string, number>();
    for (const bucket of buckets) counts.set(bucket.key, 0);
    for (const article of articles) {
      const key = bucketKey(article.createdAt, granularity);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const totalViews = articles.reduce(
      (sum, a: any) => sum + (a.views ?? 0),
      0,
    );
    const helpful = toNumber(viewsAgg._sum?.helpfulCount);
    const notHelpful = toNumber(viewsAgg._sum?.notHelpfulCount);

    return {
      summary: {
        totalArticles: articles.length,
        publishedArticles: articles.filter((a: any) => a.status === 'PUBLISHED')
          .length,
        totalViews,
        helpfulCount: helpful,
        notHelpfulCount: notHelpful,
        helpfulRate:
          helpful + notHelpful
            ? Math.round((helpful / (helpful + notHelpful)) * 1000) / 10
            : 0,
      },
      byStatus: this.countBy(articles, 'status'),
      trend: buckets.map((bucket) => ({
        period: bucket.key,
        count: counts.get(bucket.key) ?? 0,
      })),
      topArticles: articles
        .slice()
        .sort((a: any, b: any) => b.views - a.views)
        .slice(0, 10),
    };
  }

  // --------------------------------------------------------------------------
  // Agent performance
  // --------------------------------------------------------------------------

  async getAgentPerformance(
    access: DashboardAccess,
    filter: AnalyticsFilterDto,
  ) {
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);
    const agents = await (this.prisma as any).user.findMany({
      where: {
        ...baseScopeWhere(scope),
        role: 'SUPPORT_AGENT',
        status: 'ACTIVE',
        ...(scope.agentId ? { id: scope.agentId } : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const tickets = await (this.prisma as any).ticket.findMany({
      where: {
        ...ticketScopeWhere(scope),
        createdAt: { gte: from, lte: to },
      },
      select: {
        assignedToId: true,
        createdAt: true,
        resolvedAt: true,
        firstRespondedAt: true,
      },
    });

    const rows = agents.map((agent: any) => {
      const assigned = tickets.filter((t: any) => t.assignedToId === agent.id);
      const resolved = assigned.filter((t: any) => t.resolvedAt);
      const responded = assigned.filter((t: any) => t.firstRespondedAt);

      const avg = (list: any[], pick: (t: any) => Date | null) => {
        if (!list.length) return 0;
        const total = list.reduce((sum, t) => {
          const picked = pick(t);
          return (
            sum +
            ((picked ? picked.getTime() : 0) - new Date(t.createdAt).getTime())
          );
        }, 0);
        return Math.round((total / list.length / 60000) * 100) / 100;
      };

      return {
        agentId: agent.id,
        name: `${agent.firstName} ${agent.lastName}`.trim(),
        email: agent.email,
        assignedTickets: assigned.length,
        resolvedTickets: resolved.length,
        avgResolutionTimeMinutes: avg(resolved, (t) => t.resolvedAt),
        avgResponseTimeMinutes: avg(responded, (t) => t.firstRespondedAt),
      };
    });

    const totals = rows.length
      ? {
          totalResolved: rows.reduce((sum, r) => sum + r.resolvedTickets, 0),
          averagePerAgent: rows.length
            ? Math.round(
                (rows.reduce((sum, r) => sum + r.resolvedTickets, 0) /
                  rows.length) *
                  100,
              ) / 100
            : 0,
        }
      : { totalResolved: 0, averagePerAgent: 0 };

    return { summary: totals, agents: rows };
  }

  // --------------------------------------------------------------------------
  // Charts
  // --------------------------------------------------------------------------

  async getCharts(
    access: DashboardAccess,
    filter: AnalyticsFilterDto,
    types: ChartType[],
  ) {
    if (access.isCustomer) {
      throw new ForbiddenException(
        'Customers have a personal dashboard instead.',
      );
    }
    const scope = resolveScope(access, filter);
    const [tickets, feedback, revenueTrend, customers] = await Promise.all([
      this.ticketTrend(scope, filter),
      this.getFeedback(access, filter),
      this.revenueService.getRevenueTrend(
        access,
        filter,
        filter.trend ?? TrendGranularity.MONTH,
      ),
      this.customerGrowth(scope, filter),
    ]);

    const statusItems = await (this.prisma as any).ticket.groupBy({
      by: ['status'],
      where: ticketScopeWhere(scope),
      _count: { _all: true },
    });
    const priorityItems = await (this.prisma as any).ticket.groupBy({
      by: ['priority'],
      where: ticketScopeWhere(scope),
      _count: { _all: true },
    });

    const series = (items: any[], key: 'status' | 'priority') =>
      items.map((i: any) => ({
        label: String(i[key] ?? 'Unknown'),
        value: i._count?._all ?? 0,
      }));

    const charts = [
      ...this.chartService.compose(
        tickets.map((t) => ({ period: t.period, value: t.count })),
        series(statusItems, 'status'),
        types,
        'Tickets created',
      ),
      ...this.chartService.compose(
        revenueTrend,
        series(priorityItems, 'priority'),
        types,
        'Revenue',
      ),
      ...this.chartService.compose(
        customers.map((c) => ({ period: c.period, value: c.count })),
        [],
        types,
        'New customers',
      ),
    ];

    return {
      tickets: charts.slice(0, types.length),
      revenue: charts.slice(types.length, types.length * 2),
      customers: charts.slice(types.length * 2),
      feedbackTrend: feedback.trend,
    };
  }

  // --------------------------------------------------------------------------
  // Dataset provider (used by reports and exports)
  // --------------------------------------------------------------------------

  async getDataset(
    access: DashboardAccess,
    category: ReportCategory,
    filter: AnalyticsFilterDto,
  ) {
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter.dateFrom, filter.dateTo);

    switch (category) {
      case 'TICKETS': {
        const rows = await (this.prisma as any).ticket.findMany({
          where: ticketScopeWhere(scope, {
            createdAt: { gte: from, lte: to },
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.priority ? { priority: filter.priority } : {}),
            ...(filter.departmentId
              ? { departmentId: filter.departmentId }
              : {}),
            ...(filter.customerId ? { createdById: filter.customerId } : {}),
            ...(filter.agentId ? { assignedToId: filter.agentId } : {}),
          }),
          orderBy: { createdAt: 'desc' },
          select: {
            ticketNumber: true,
            subject: true,
            status: true,
            priority: true,
            source: true,
            createdAt: true,
            resolvedAt: true,
            closedAt: true,
            dueAt: true,
            firstRespondedAt: true,
            createdBy: {
              select: { firstName: true, lastName: true, email: true },
            },
            assignedTo: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        });
        return {
          category,
          rows: rows.map((r: any) => ({
            ticketNumber: r.ticketNumber,
            subject: r.subject,
            status: r.status,
            priority: r.priority,
            source: r.source,
            createdBy: this.fullName(r.createdBy),
            assignedTo: this.fullName(r.assignedTo),
            createdAt: r.createdAt,
            firstRespondedAt: r.firstRespondedAt,
            resolvedAt: r.resolvedAt,
            closedAt: r.closedAt,
            dueAt: r.dueAt,
          })),
          summary: await this.getTickets(access, filter),
        };
      }

      case 'FEEDBACK': {
        const where: Record<string, unknown> = {
          ...baseScopeWhere(scope),
          submittedAt: { gte: from, lte: to },
          ...(filter.feedbackRating
            ? { rating: filter.feedbackRating }
            : {}),
        };
        const responses = await (this.prisma as any).ticketFeedback.findMany({
          where,
          orderBy: { submittedAt: 'desc' },
          select: {
            rating: true,
            wouldRecommend: true,
            comment: true,
            submittedAt: true,
            ticket: { select: { ticketNumber: true, subject: true } },
          },
        });
        return {
          category,
          rows: responses.map((r: any) => ({
            customerName: r.ticket?.subject ?? 'Anonymous',
            customerEmail: null,
            form: r.ticket?.ticketNumber ?? '',
            overallScore: this.feedbackRatingValue(r.rating),
            npsScore:
              r.wouldRecommend === null ? null : r.wouldRecommend ? 100 : -100,
            comment: r.comment,
            submittedAt: r.submittedAt,
          })),
          summary: await this.getFeedback(access, filter),
        };
      }

      case 'PAYMENTS': {
        const payments = await (this.prisma as any).payment.findMany({
          where: {
            ...baseScopeWhere(scope),
            createdAt: { gte: from, lte: to },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            reference: true,
            amount: true,
            currency: true,
            status: true,
            provider: true,
            paidAt: true,
            createdAt: true,
            organization: { select: { name: true } },
          },
        });
        return {
          category,
          rows: payments.map((r: any) => ({
            reference: r.reference ?? r.id,
            organization: r.organization?.name ?? '',
            amount: toNumber(r.amount),
            currency: r.currency,
            status: r.status,
            provider: r.provider,
            paidAt: r.paidAt ?? r.createdAt,
          })),
          summary: await this.getPayments(access, filter),
        };
      }

      case 'REVENUE':
      case 'SUBSCRIPTIONS': {
        const subs = await (
          this.prisma as any
        ).organizationSubscription.findMany({
          where: baseScopeWhere(scope),
          select: {
            status: true,
            billingInterval: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            trialEndsAt: true,
            organization: { select: { name: true, id: true } },
            plan: {
              select: {
                name: true,
                type: true,
                priceMonthly: true,
                priceYearly: true,
              },
            },
          },
        });
        return {
          category,
          rows: subs.map((r: any) => ({
            organization: r.organization?.name ?? '',
            plan: r.plan?.name ?? '',
            planType: r.plan?.type ?? '',
            priceMonthly: toNumber(r.plan?.priceMonthly),
            priceYearly: toNumber(r.plan?.priceYearly),
            billingInterval: r.billingInterval,
            status: r.status,
            currentPeriodStart: r.currentPeriodStart,
            currentPeriodEnd: r.currentPeriodEnd,
            trialEndsAt: r.trialEndsAt,
          })),
          summary: await this.getRevenue(access, filter),
        };
      }

      case 'ORGANIZATIONS': {
        if (!access.isPlatformAdmin) {
          throw new ForbiddenException(
            'Organization reports are platform-admin only.',
          );
        }
        const orgs = await (this.prisma as any).organization.findMany({
          where: { createdAt: { gte: from, lte: to } },
          orderBy: { createdAt: 'desc' },
          select: {
            name: true,
            slug: true,
            status: true,
            billingEmail: true,
            createdAt: true,
            subscriptions: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { status: true, plan: { select: { name: true } } },
            },
          },
        });
        return {
          category,
          rows: orgs.map((r: any) => ({
            name: r.name,
            slug: r.slug,
            status: r.status,
            email: r.billingEmail,
            plan: r.subscriptions?.[0]?.plan?.name ?? 'None',
            subscriptionStatus: r.subscriptions?.[0]?.status ?? null,
            createdAt: r.createdAt,
          })),
          summary: await this.getOrganizations(access, filter),
        };
      }

      case 'SUPPORT_AGENTS': {
        const performance = await this.getAgentPerformance(access, filter);
        return {
          category,
          rows: performance.agents.map((a: any) => ({
            name: a.name,
            email: a.email,
            assignedTickets: a.assignedTickets,
            resolvedTickets: a.resolvedTickets,
            avgResolutionTimeMinutes: a.avgResolutionTimeMinutes,
            avgResponseTimeMinutes: a.avgResponseTimeMinutes,
          })),
          summary: performance,
        };
      }

      case 'CUSTOMERS': {
        const users = await (this.prisma as any).user.findMany({
          where: {
            ...baseScopeWhere(scope),
            role: 'CUSTOMER',
            createdAt: { gte: from, lte: to },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
          },
        });
        return {
          category,
          rows: users.map((r: any) => ({
            name: `${r.firstName} ${r.lastName}`.trim(),
            email: r.email,
            status: r.status,
            lastLoginAt: r.lastLoginAt,
            createdAt: r.createdAt,
          })),
          summary: await this.getCustomers(access, filter),
        };
      }

      case 'USAGE': {
        const usage = await this.getUsage(access, filter);
        return {
          category,
          rows: (usage.byResourceType as any[]).map((g: any) => ({
            resourceType: g.metric,
            quantity: g._sum?.value ?? 0,
          })),
          summary: usage,
        };
      }

      case 'KNOWLEDGE_BASE': {
        const kb = await this.getKnowledgeBase(access, filter);
        return {
          category,
          rows: (kb.topArticles as any[]).map((a: any) => ({
            title: a.title,
            slug: a.slug,
            status: a.status,
            views: a.views,
            helpful: a.helpfulCount,
            notHelpful: a.notHelpfulCount,
          })),
          summary: kb,
        };
      }

      default:
        throw new ForbiddenException(
          `Unsupported report category: ${category}`,
        );
    }
  }

  // --------------------------------------------------------------------------

  private countBy(rows: any[], key: string) {
    const map = new Map<string, number>();
    for (const row of rows) {
      const value = row[key] ?? 'UNKNOWN';
      map.set(value, (map.get(value) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, count]) => ({
      label,
      count,
    }));
  }

  private feedbackRatingValue(rating: unknown): number {
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

  private fullName(user: any): string {
    if (!user) return '';
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return fullName || user.email || '';
  }
}
