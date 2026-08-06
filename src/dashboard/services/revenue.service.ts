import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveScope,
  baseScopeWhere,
  ResolvedScope,
  ScopeableFilter,
} from '../utils/scope.util';
import {
  buildBuckets,
  resolveRange,
  bucketKey,
} from '../utils/time-series.util';
import { TrendGranularity } from '../enums/dashboard.enums';
import { DashboardAccess } from '../types/dashboard-access.type';

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value) || 0;
}

@Injectable()
export class RevenueService {
  constructor(private readonly prisma: PrismaService) {}

  async getMrr(
    access: DashboardAccess,
    filter?: ScopeableFilter,
  ): Promise<number> {
    const scope = resolveScope(access, filter);
    const subs = await (this.prisma as any).organizationSubscription.findMany({
      where: {
        ...baseScopeWhere(scope),
        status: { in: ['ACTIVE', 'PAST_DUE'] },
      },
      select: {
        billingInterval: true,
        plan: { select: { priceMonthly: true, priceYearly: true } },
      },
    });

    let mrr = 0;
    for (const sub of subs) {
      if (sub.billingInterval === 'YEARLY') {
        mrr += toNumber(sub.plan?.priceYearly) / 12;
      } else {
        mrr += toNumber(sub.plan?.priceMonthly);
      }
    }
    return Math.round(mrr * 100) / 100;
  }

  async getArr(
    access: DashboardAccess,
    filter?: ScopeableFilter,
  ): Promise<number> {
    return (await this.getMrr(access, filter)) * 12;
  }

  /** Sum of successful payments in the given month (1-12) of the given year. */
  async getMonthlyRevenue(
    scope: ResolvedScope,
    year?: number,
    month?: number,
  ): Promise<number> {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const agg = await (this.prisma as any).payment.aggregate({
      where: {
        ...baseScopeWhere(scope),
        status: 'SUCCESSFUL',
        paidAt: { gte: from, lte: to },
      },
      _sum: { amount: true },
    });
    return toNumber(agg._sum?.amount);
  }

  /** Sum of successful payments in the given calendar year. */
  async getAnnualRevenue(scope: ResolvedScope, year?: number): Promise<number> {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const from = new Date(Date.UTC(y, 0, 1));
    const to = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));

    const agg = await (this.prisma as any).payment.aggregate({
      where: {
        ...baseScopeWhere(scope),
        status: 'SUCCESSFUL',
        paidAt: { gte: from, lte: to },
      },
      _sum: { amount: true },
    });
    return toNumber(agg._sum?.amount);
  }

  /** All-time successful revenue. */
  async getTotalRevenue(scope: ResolvedScope): Promise<number> {
    const agg = await (this.prisma as any).payment.aggregate({
      where: { ...baseScopeWhere(scope), status: 'SUCCESSFUL' },
      _sum: { amount: true },
    });
    return toNumber(agg._sum?.amount);
  }

  async getRevenueTrend(
    access: DashboardAccess,
    filter?: ScopeableFilter,
    granularity: TrendGranularity = TrendGranularity.MONTH,
  ): Promise<{ period: string; value: number }[]> {
    const scope = resolveScope(access, filter);
    const { from, to } = resolveRange(filter?.dateFrom, filter?.dateTo);
    const buckets = buildBuckets(from, to, granularity);

    const payments = await (this.prisma as any).payment.findMany({
      where: {
        ...baseScopeWhere(scope),
        status: 'SUCCESSFUL',
        paidAt: { gte: from, lte: to },
      },
      select: { paidAt: true, amount: true },
    });

    const totals = new Map<string, number>();
    for (const bucket of buckets) totals.set(bucket.key, 0);
    for (const payment of payments) {
      const key = bucketKey(payment.paidAt, granularity);
      totals.set(key, (totals.get(key) ?? 0) + toNumber(payment.amount));
    }

    return buckets.map((bucket) => ({
      period: bucket.key,
      value: Math.round((totals.get(bucket.key) ?? 0) * 100) / 100,
    }));
  }

  async getRevenueByPlan(
    scope: ResolvedScope,
  ): Promise<{ label: string; value: number }[]> {
    const payments = await (this.prisma as any).payment.findMany({
      where: { ...baseScopeWhere(scope), status: 'SUCCESSFUL' },
      select: {
        amount: true,
        plan: { select: { name: true } },
      },
    });

    const totals = new Map<string, number>();
    for (const payment of payments) {
      const label = payment.plan?.name ?? 'Unknown';
      totals.set(label, (totals.get(label) ?? 0) + toNumber(payment.amount));
    }
    return Array.from(totals.entries()).map(([label, value]) => ({
      label,
      value: Math.round(value * 100) / 100,
    }));
  }

  async getPaymentStats(scope: ResolvedScope, from?: Date, to?: Date) {
    const where: Record<string, unknown> = baseScopeWhere(scope);
    where.status = 'SUCCESSFUL';
    if (from || to)
      where.paidAt = { gte: from ?? undefined, lte: to ?? undefined };

    const [count, agg] = await Promise.all([
      (this.prisma as any).payment.count({ where }),
      (this.prisma as any).payment.aggregate({
        where,
        _sum: { amount: true },
        _avg: { amount: true },
      }),
    ]);

    return {
      totalPayments: count,
      totalRevenue: Math.round(toNumber(agg._sum?.amount) * 100) / 100,
      averagePayment: count
        ? Math.round((toNumber(agg._avg?.amount) / count) * 100) / 100
        : 0,
    };
  }
}
