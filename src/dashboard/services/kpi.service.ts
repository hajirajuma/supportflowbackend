import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardAccess } from '../types/dashboard-access.type';
import { ScopeableFilter } from '../utils/scope.util';
import {
  resolveScope,
  baseScopeWhere,
  ticketScopeWhere,
} from '../utils/scope.util';
import { resolveRange } from '../utils/time-series.util';
import { RevenueService } from './revenue.service';

export interface KpiResult {
  averageResolutionTimeMinutes: number;
  averageFirstResponseTimeMinutes: number;
  ticketResolutionRate: number;
  customerSatisfactionScore: number;
  netPromoterScore: number | null;
  agentProductivity: number;
  organizationGrowthRate: number | null;
  monthlyRevenue: number;
  annualRevenue: number;
  retentionRate: number | null;
}

@Injectable()
export class KpiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revenueService: RevenueService,
  ) {}

  async compute(
    access: DashboardAccess,
    filter?: ScopeableFilter,
  ): Promise<KpiResult> {
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter?.dateFrom, filter?.dateTo);

    const [
      resolutionTime,
      firstResponseTime,
      resolutionRate,
      csat,
      nps,
      productivity,
      orgGrowth,
      retention,
      monthlyRevenue,
      annualRevenue,
    ] = await Promise.all([
      this.avgResolutionTime(scope, from, to),
      this.avgFirstResponseTime(scope, from, to),
      this.ticketResolutionRate(scope, from, to),
      this.csat(scope, from, to),
      this.nps(scope, from, to),
      this.agentProductivity(scope, from, to),
      this.organizationGrowthRate(scope, from, to),
      this.retentionRate(scope),
      this.revenueService.getMonthlyRevenue(scope),
      this.revenueService.getAnnualRevenue(scope),
    ]);

    return {
      averageResolutionTimeMinutes: resolutionTime,
      averageFirstResponseTimeMinutes: firstResponseTime,
      ticketResolutionRate: resolutionRate,
      customerSatisfactionScore: csat,
      netPromoterScore: nps,
      agentProductivity: productivity,
      organizationGrowthRate: orgGrowth,
      monthlyRevenue,
      annualRevenue,
      retentionRate: retention,
    };
  }

  private async avgResolutionTime(
    scope: {
      organizationId?: string;
      organizationIds?: string[];
      agentId?: string;
      customerId?: string;
    },
    from: Date,
    to: Date,
  ): Promise<number> {
    const tickets = await (this.prisma as any).ticket.findMany({
      where: {
        ...ticketScopeWhere(scope),
        resolvedAt: { not: null },
        createdAt: { gte: from, lte: to },
      },
      select: { createdAt: true, resolvedAt: true },
    });

    if (!tickets.length) return 0;
    const total = tickets.reduce(
      (sum, t: any) =>
        sum +
        (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()),
      0,
    );
    return Math.round((total / tickets.length / 60000) * 100) / 100;
  }

  private async avgFirstResponseTime(
    scope: {
      organizationId?: string;
      organizationIds?: string[];
      agentId?: string;
      customerId?: string;
    },
    from: Date,
    to: Date,
  ): Promise<number> {
    const tickets = await (this.prisma as any).ticket.findMany({
      where: {
        ...ticketScopeWhere(scope),
        firstResponseAt: { not: null },
        createdAt: { gte: from, lte: to },
      },
      select: { createdAt: true, firstResponseAt: true },
    });

    if (!tickets.length) return 0;
    const total = tickets.reduce(
      (sum, t: any) =>
        sum +
        (new Date(t.firstResponseAt).getTime() -
          new Date(t.createdAt).getTime()),
      0,
    );
    return Math.round((total / tickets.length / 60000) * 100) / 100;
  }

  private async ticketResolutionRate(
    scope: {
      organizationId?: string;
      organizationIds?: string[];
      agentId?: string;
      customerId?: string;
    },
    from: Date,
    to: Date,
  ): Promise<number> {
    const [total, resolved] = await Promise.all([
      (this.prisma as any).ticket.count({
        where: {
          ...ticketScopeWhere(scope),
          createdAt: { gte: from, lte: to },
        },
      }),
      (this.prisma as any).ticket.count({
        where: {
          ...ticketScopeWhere(scope),
          createdAt: { gte: from, lte: to },
          status: { in: ['RESOLVED', 'CLOSED'] },
        },
      }),
    ]);
    return total ? Math.round((resolved / total) * 1000) / 10 : 0;
  }

  private async csat(
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
    return Math.round((avg / 5) * 1000) / 10;
  }

  private async nps(
    scope: { organizationId?: string; organizationIds?: string[] },
    from: Date,
    to: Date,
  ): Promise<number | null> {
    const responses = await (this.prisma as any).ticketFeedback.findMany({
      where: {
        ...baseScopeWhere(scope),
        wouldRecommend: { not: null },
        submittedAt: { gte: from, lte: to },
      },
      select: { wouldRecommend: true },
    });
    if (!responses.length) return null;
    const promoters = responses.filter(
      (r: any) => r.wouldRecommend === true,
    ).length;
    const detractors = responses.filter(
      (r: any) => r.wouldRecommend === false,
    ).length;
    return Math.round(((promoters - detractors) / responses.length) * 100);
  }

  private async agentProductivity(
    scope: { organizationId?: string; organizationIds?: string[] },
    from: Date,
    to: Date,
  ): Promise<number> {
    const [resolvedTickets, agents] = await Promise.all([
      (this.prisma as any).ticket.count({
        where: {
          ...ticketScopeWhere(scope),
          resolvedAt: { gte: from, lte: to },
        },
      }),
      (this.prisma as any).user.count({
        where: {
          ...baseScopeWhere(scope),
          role: 'SUPPORT_AGENT',
          status: 'ACTIVE',
        },
      }),
    ]);
    return agents ? Math.round((resolvedTickets / agents) * 100) / 100 : 0;
  }

  private async organizationGrowthRate(
    scope: { organizationId?: string; organizationIds?: string[] },
    from: Date,
    to: Date,
  ): Promise<number | null> {
    if (scope.organizationId || scope.organizationIds?.length) return null;
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const prevTo = new Date(from.getTime() - 1);

    const [current, previous] = await Promise.all([
      (this.prisma as any).organization.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      (this.prisma as any).organization.count({
        where: { createdAt: { gte: prevFrom, lte: prevTo } },
      }),
    ]);

    if (!previous) return current ? null : 0;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  private async retentionRate(scope: {
    organizationId?: string;
    organizationIds?: string[];
  }): Promise<number | null> {
    const where: Record<string, unknown> = baseScopeWhere(scope);
    const [total, retained] = await Promise.all([
      (this.prisma as any).organizationSubscription.count({ where }),
      (this.prisma as any).organizationSubscription.count({
        where: {
          ...where,
          status: { in: ['ACTIVE', 'PAST_DUE'] },
          cancelAtPeriodEnd: false,
        },
      }),
    ]);
    return total ? Math.round((retained / total) * 1000) / 10 : null;
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
