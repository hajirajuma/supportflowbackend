import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedbackAccess } from '../types/feedback-access.type';
import { FeedbackAnalyticsQueryDto } from '../dto/feedback-analytics-query.dto';
import { FeedbackTrend } from '../enums/feedback.enums';
import { format, startOfWeek } from 'date-fns';

interface Scope {
  organizationId?: string;
}

@Injectable()
export class FeedbackAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(access: FeedbackAccess, query: FeedbackAnalyticsQueryDto) {
    if (!access.isPlatformAdmin && !access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const scope: Scope = {};
    if (access.isPlatformAdmin) {
      if (query.organizationId) scope.organizationId = query.organizationId;
    } else {
      scope.organizationId = access.organizationId!;
    }

    const where = this.buildWhere(scope, query);
    const trend = query.trend ?? 'month';

    const responses = await (this.prisma as any).feedbackResponse.findMany({
      where,
      select: {
        id: true,
        formId: true,
        organizationId: true,
        overallScore: true,
        npsScore: true,
        ratings: true,
        submittedAt: true,
        form: { select: { title: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    const requestWhere: any = {};
    if (scope.organizationId)
      requestWhere.organizationId = scope.organizationId;
    if (query.formId) requestWhere.formId = query.formId;
    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.gte = new Date(query.dateFrom);
      if (query.dateTo) range.lte = new Date(query.dateTo);
      requestWhere.createdAt = range;
    }

    const [totalRequests, completedRequests] = await Promise.all([
      (this.prisma as any).feedbackRequest.count({ where: requestWhere }),
      (this.prisma as any).feedbackRequest.count({
        where: { ...requestWhere, status: 'COMPLETED' },
      }),
    ]);

    const totalResponses = responses.length;

    const ratings = responses
      .map((r: any) => r.overallScore)
      .filter((v: unknown): v is number => typeof v === 'number');

    const averageRating = this.avg(ratings);
    const cSat =
      averageRating === null ? 0 : Math.round((averageRating / 5) * 100);
    const nps = this.computeNps(
      responses
        .map((r: any) => r.npsScore)
        .filter((v: unknown): v is number => typeof v === 'number'),
    );

    const metricAverage = (key: string) =>
      this.avg(
        responses
          .map((r: any) =>
            r.ratings && typeof r.ratings[key] === 'number'
              ? r.ratings[key]
              : null,
          )
          .filter((v: unknown): v is number => typeof v === 'number'),
      );

    const ratingDistribution = this.ratingDistribution(ratings);
    const mostCommonRatings = this.mostCommonRatings(ratingDistribution);
    const trends = this.buildTrends(responses, trend);
    const surveyComparison = this.buildSurveyComparison(responses);
    const organizationComparison = access.isPlatformAdmin
      ? this.buildOrganizationComparison(responses)
      : undefined;

    return {
      summary: {
        totalResponses,
        totalRequests,
        responseRate: totalRequests
          ? Math.round((totalResponses / totalRequests) * 1000) / 10
          : 0,
        completionRate: totalRequests
          ? Math.round((completedRequests / totalRequests) * 1000) / 10
          : 0,
        averageRating,
        cSat,
        nps,
        averageResolutionSatisfaction: metricAverage('resolution_quality'),
        averageAgentRating: metricAverage('agent_professionalism'),
        averageResponseSpeed: metricAverage('response_speed'),
        averageCommunication: metricAverage('communication'),
      },
      ratingDistribution,
      mostCommonRatings,
      trends,
      surveyComparison,
      organizationComparison,
    };
  }

  // --------------------------------------------------------------------------

  private buildWhere(scope: Scope, query: FeedbackAnalyticsQueryDto) {
    const where: any = {};
    if (scope.organizationId) where.organizationId = scope.organizationId;
    if (query.formId) where.formId = query.formId;
    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.gte = new Date(query.dateFrom);
      if (query.dateTo) range.lte = new Date(query.dateTo);
      where.submittedAt = range;
    }
    return where;
  }

  private avg(values: number[]): number | null {
    if (!values.length) return null;
    return (
      Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) /
      100
    );
  }

  private computeNps(scores: number[]): number | null {
    if (!scores.length) return null;
    const promoters = scores.filter((s) => s >= 9).length;
    const detractors = scores.filter((s) => s <= 6).length;
    return Math.round(((promoters - detractors) / scores.length) * 100);
  }

  private ratingDistribution(scores: number[]): Record<number, number> {
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const score of scores) {
      const key = Math.min(5, Math.max(1, Math.round(score)));
      dist[key] = (dist[key] ?? 0) + 1;
    }
    return dist;
  }

  private mostCommonRatings(dist: Record<number, number>) {
    return Object.entries(dist)
      .map(([rating, count]) => ({ rating: Number(rating), count }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  private buildTrends(responses: any[], trend: FeedbackTrend) {
    const buckets = new Map<string, { count: number; total: number }>();

    for (const response of responses) {
      const date = new Date(response.submittedAt);
      let key: string;
      if (trend === 'day') key = format(date, 'yyyy-MM-dd');
      else if (trend === 'week') key = format(startOfWeek(date), 'yyyy-MM-dd');
      else if (trend === 'year') key = format(date, 'yyyy');
      else key = format(date, 'yyyy-MM');

      const bucket = buckets.get(key) ?? { count: 0, total: 0 };
      bucket.count += 1;
      if (typeof response.overallScore === 'number')
        bucket.total += response.overallScore;
      buckets.set(key, bucket);
    }

    return Array.from(buckets.entries())
      .map(([period, bucket]) => ({
        period,
        count: bucket.count,
        average: bucket.count
          ? Math.round((bucket.total / bucket.count) * 100) / 100
          : 0,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private buildSurveyComparison(responses: any[]) {
    const byForm = new Map<
      string,
      { id: string; title: string; count: number; total: number; nps: number[] }
    >();

    for (const response of responses) {
      const key = response.formId;
      const entry: {
        id: string;
        title: string;
        count: number;
        total: number;
        nps: number[];
      } = byForm.get(key) ?? {
        id: key,
        title: response.form?.title ?? 'Unknown survey',
        count: 0,
        total: 0,
        nps: [],
      };
      entry.count += 1;
      if (typeof response.overallScore === 'number')
        entry.total += response.overallScore;
      if (typeof response.npsScore === 'number')
        entry.nps.push(response.npsScore);
      byForm.set(key, entry);
    }

    return Array.from(byForm.values()).map((entry) => ({
      formId: entry.id,
      title: entry.title,
      responses: entry.count,
      averageRating: entry.count
        ? Math.round((entry.total / entry.count) * 100) / 100
        : 0,
      nps: this.computeNps(entry.nps),
    }));
  }

  private buildOrganizationComparison(responses: any[]) {
    const byOrg = new Map<
      string,
      { id: string; name: string; count: number; total: number; nps: number[] }
    >();

    for (const response of responses) {
      const key = response.organizationId;
      const entry: {
        id: string;
        name: string;
        count: number;
        total: number;
        nps: number[];
      } = byOrg.get(key) ?? {
        id: key,
        name: response.organization?.name ?? 'Unknown organization',
        count: 0,
        total: 0,
        nps: [],
      };
      entry.count += 1;
      if (typeof response.overallScore === 'number')
        entry.total += response.overallScore;
      if (typeof response.npsScore === 'number')
        entry.nps.push(response.npsScore);
      byOrg.set(key, entry);
    }

    return Array.from(byOrg.values()).map((entry) => ({
      organizationId: entry.id,
      name: entry.name,
      responses: entry.count,
      averageRating: entry.count
        ? Math.round((entry.total / entry.count) * 100) / 100
        : 0,
      nps: this.computeNps(entry.nps),
    }));
  }
}
