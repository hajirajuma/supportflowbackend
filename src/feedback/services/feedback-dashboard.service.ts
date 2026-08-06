import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedbackAccess } from '../types/feedback-access.type';
import { FeedbackDashboardQueryDto } from '../dto/feedback-analytics-query.dto';

@Injectable()
export class FeedbackDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(access: FeedbackAccess, query: FeedbackDashboardQueryDto) {
    if (!access.isPlatformAdmin && !access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const where: any = {};
    if (access.isPlatformAdmin) {
      if (query.organizationId) where.organizationId = query.organizationId;
    } else {
      where.organizationId = access.organizationId;
    }
    if (query.formId) where.formId = query.formId;

    const responseWhere = { ...where };
    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.gte = new Date(query.dateFrom);
      if (query.dateTo) range.lte = new Date(query.dateTo);
      responseWhere.submittedAt = range;
    }

    const requestWhere: any = { ...where };
    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.gte = new Date(query.dateFrom);
      if (query.dateTo) range.lte = new Date(query.dateTo);
      requestWhere.createdAt = range;
    }

    const [responses, totalRequests, pendingRequests, recentFeedback] =
      await Promise.all([
        (this.prisma as any).feedbackResponse.findMany({
          where: responseWhere,
          select: { overallScore: true, npsScore: true },
        }),
        (this.prisma as any).feedbackRequest.count({ where: requestWhere }),
        (this.prisma as any).feedbackRequest.count({
          where: {
            ...requestWhere,
            status: { in: ['PENDING', 'OPENED'] },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        }),
        (this.prisma as any).feedbackResponse.findMany({
          where: responseWhere,
          orderBy: { submittedAt: 'desc' },
          take: 5,
          include: {
            form: { select: { id: true, title: true } },
            ticket: { select: { id: true, ticketNumber: true, subject: true } },
            submittedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        }),
      ]);

    const completed = responses.length;
    const scores = responses
      .map((r: any) => r.overallScore)
      .filter((v: unknown): v is number => typeof v === 'number');

    const averageRating = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) /
        100
      : 0;

    const npsScores = responses
      .map((r: any) => r.npsScore)
      .filter((v: unknown): v is number => typeof v === 'number');
    const nps = npsScores.length
      ? Math.round(
          ((npsScores.filter((s) => s >= 9).length -
            npsScores.filter((s) => s <= 6).length) /
            npsScores.length) *
            100,
        )
      : 0;

    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const score of scores) {
      const key = Math.min(5, Math.max(1, Math.round(score)));
      ratingDistribution[key] = (ratingDistribution[key] ?? 0) + 1;
    }

    return {
      averageRating,
      cSat: averageRating ? Math.round((averageRating / 5) * 100) : 0,
      nps,
      pending: pendingRequests,
      completed,
      responsePercentage: totalRequests
        ? Math.round((completed / totalRequests) * 1000) / 10
        : 0,
      ratingDistribution,
      recentFeedback: recentFeedback.map((r: any) => ({
        id: r.id,
        ticketNumber: r.ticket?.ticketNumber ?? null,
        customerName: r.submittedBy
          ? `${r.submittedBy.firstName} ${r.submittedBy.lastName}`.trim()
          : null,
        overallScore: r.overallScore,
        publicComment: r.publicComment,
        submittedAt: r.submittedAt,
        surveyTitle: r.form?.title ?? null,
      })),
    };
  }
}
