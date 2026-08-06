import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { FeedbackAccess } from '../types/feedback-access.type';
import { SearchFeedbackDto } from '../dto/search-feedback.dto';
import { FeedbackSort } from '../enums/feedback.enums';

@Injectable()
export class FeedbackSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(access: FeedbackAccess, dto: SearchFeedbackDto) {
    const page = PaginationUtil.normalizePage(dto.page);
    const limit = PaginationUtil.normalizeLimit(dto.limit);

    if (!access.isPlatformAdmin && !access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const where: any = this.buildWhere(access, dto);

    const orderBy = this.buildSort(dto.sort);

    const [items, total] = await Promise.all([
      (this.prisma as any).feedbackResponse.findMany({
        where,
        orderBy,
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: {
          form: { select: { id: true, title: true } },
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              subject: true,
              status: true,
              assignedTo: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          submittedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
            },
          },
          request: { select: { id: true, status: true } },
        },
      }),
      (this.prisma as any).feedbackResponse.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  private buildWhere(access: FeedbackAccess, dto: SearchFeedbackDto) {
    const where: any = {};

    if (access.isPlatformAdmin) {
      if (dto.organizationId) where.organizationId = dto.organizationId;
    } else {
      where.organizationId = access.organizationId;
    }

    if (dto.formId) where.formId = dto.formId;
    if (dto.status) where.status = dto.status;
    if (dto.customerId) where.submittedById = dto.customerId;
    if (dto.ticketId) where.ticketId = dto.ticketId;
    if (dto.agentId) {
      where.ticket = { is: { assignedToId: dto.agentId } };
    }

    const ratingFilters: Record<string, unknown>[] = [];
    if (dto.rating !== undefined)
      ratingFilters.push({ overallScore: dto.rating });
    if (dto.ratingFrom !== undefined)
      ratingFilters.push({ overallScore: { gte: dto.ratingFrom } });
    if (dto.ratingTo !== undefined)
      ratingFilters.push({ overallScore: { lte: dto.ratingTo } });
    if (ratingFilters.length) where.AND = ratingFilters;

    if (dto.dateFrom || dto.dateTo) {
      const range: Record<string, Date> = {};
      if (dto.dateFrom) range.gte = new Date(dto.dateFrom);
      if (dto.dateTo) range.lte = new Date(dto.dateTo);
      where.submittedAt = range;
    }

    if (dto.search) {
      const q = dto.search;
      const searchOr: any[] = [
        {
          ticket: {
            is: { ticketNumber: { contains: q, mode: 'insensitive' } },
          },
        },
        { ticket: { is: { subject: { contains: q, mode: 'insensitive' } } } },
        {
          submittedBy: {
            is: {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
        {
          ticket: {
            is: {
              assignedTo: {
                is: {
                  OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        },
        { form: { is: { title: { contains: q, mode: 'insensitive' } } } },
        { publicComment: { contains: q, mode: 'insensitive' } },
        { privateComment: { contains: q, mode: 'insensitive' } },
        { customerEmail: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
      ];

      if (access.isPlatformAdmin) {
        searchOr.push({
          organization: { is: { name: { contains: q, mode: 'insensitive' } } },
        });
      }

      where.AND = [...(where.AND ?? []), { OR: searchOr }];
    }

    return where;
  }

  private buildSort(sort?: FeedbackSort) {
    switch (sort) {
      case FeedbackSort.OLDEST:
        return { submittedAt: 'asc' as const };
      case FeedbackSort.HIGHEST_RATING:
        return { overallScore: 'desc' as const };
      case FeedbackSort.LOWEST_RATING:
        return { overallScore: 'asc' as const };
      case FeedbackSort.NEWEST:
      default:
        return { submittedAt: 'desc' as const };
    }
  }
}
