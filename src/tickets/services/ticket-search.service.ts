import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { TicketAccess } from '../types/ticket-access.type';
import { TicketFilterDto } from '../dto/ticket-filter.dto';
import { SearchTicketDto } from '../dto/search-ticket.dto';

@Injectable()
export class TicketSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(access: TicketAccess, dto: SearchTicketDto) {
    const page = PaginationUtil.normalizePage(dto.page);
    const limit = PaginationUtil.normalizeLimit(dto.limit);

    const where: any = {
      deletedAt: null,
      ...this.buildScopedOrgFilter(access),
    };

    if (access.isCustomer) {
      where.createdById = access.userId;
    }

    if (dto.search) {
      where.AND = [
        {
          OR: [
            { ticketNumber: { contains: dto.search, mode: 'insensitive' } },
            { subject: { contains: dto.search, mode: 'insensitive' } },
            { description: { contains: dto.search, mode: 'insensitive' } },
            {
              createdBy: {
                is: {
                  OR: [
                    {
                      firstName: { contains: dto.search, mode: 'insensitive' },
                    },
                    { lastName: { contains: dto.search, mode: 'insensitive' } },
                    { email: { contains: dto.search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        },
      ];
    }

    const filters = this.buildFilters(dto);
    if (filters.length) {
      where.AND = [...(where.AND ?? []), ...filters];
    }

    const orderBy = this.buildSort(dto.sort);

    const [items, total] = await Promise.all([
      (this.prisma as any).ticket.findMany({
        where,
        orderBy,
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          description: true,
          status: true,
          priority: true,
          source: true,
          dueAt: true,
          firstRespondedAt: true,
          resolvedAt: true,
          closedAt: true,
          lastActivityAt: true,
          createdAt: true,
          updatedAt: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
            },
          },
          category: { select: { id: true, name: true, color: true } },
          department: { select: { id: true, name: true } },
          ticketTags: {
            select: { tag: { select: { id: true, name: true, color: true } } },
          },
        },
      }),
      (this.prisma as any).ticket.count({ where }),
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

  private buildScopedOrgFilter(access: TicketAccess): Record<string, unknown> {
    if (access.isPlatformAdmin) {
      return {};
    }
    return { organizationId: access.organizationId };
  }

  private buildFilters(dto: TicketFilterDto): Record<string, unknown>[] {
    const filters: Record<string, unknown>[] = [];

    if (dto.status) filters.push({ status: dto.status });
    if (dto.priority) filters.push({ priority: dto.priority });
    if (dto.source) filters.push({ source: dto.source });
    if (dto.categoryId) filters.push({ categoryId: dto.categoryId });
    if (dto.departmentId) filters.push({ departmentId: dto.departmentId });
    if (dto.assignedToId) filters.push({ assignedToId: dto.assignedToId });
    if (dto.customerId) filters.push({ createdById: dto.customerId });
    if (dto.tagId) {
      filters.push({ ticketTags: { some: { tagId: dto.tagId } } });
    }
    if (dto.dateFrom || dto.dateTo) {
      filters.push({ createdAt: this.dateRange(dto.dateFrom, dto.dateTo) });
    }
    if (dto.updatedFrom || dto.updatedTo) {
      filters.push({
        updatedAt: this.dateRange(dto.updatedFrom, dto.updatedTo),
      });
    }
    if (dto.resolvedFrom || dto.resolvedTo) {
      filters.push({
        resolvedAt: this.dateRange(dto.resolvedFrom, dto.resolvedTo),
      });
    }

    return filters;
  }

  private dateRange(from?: string, to?: string): Record<string, Date> {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    return range;
  }

  private buildSort(sort?: string) {
    switch (sort) {
      case 'oldest':
        return { createdAt: 'asc' };
      case 'priority':
        return [{ priority: 'asc' }, { createdAt: 'desc' }];
      case 'status':
        return [{ status: 'asc' }, { createdAt: 'desc' }];
      case 'customer':
        return [{ createdBy: { firstName: 'asc' } }, { createdAt: 'desc' }];
      case 'updated':
        return { updatedAt: 'desc' };
      case 'newest':
      default:
        return { createdAt: 'desc' };
    }
  }
}
