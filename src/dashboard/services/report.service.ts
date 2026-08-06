import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardAccess } from '../types/dashboard-access.type';
import { CreateReportDto } from '../dto/create-report.dto';
import { UpdateReportDto } from '../dto/update-report.dto';
import { PaginationDto } from '../dto/pagination.dto';
import { AnalyticsFilterDto } from '../dto/analytics-filter.dto';
import { ReportCategory } from '../enums/dashboard.enums';
import {
  REPORT_CATEGORY_TO_TYPE,
  DASHBOARD_AUDIT_ACTIONS,
} from '../enums/dashboard.enums';
import { AnalyticsService } from './analytics.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { baseScopeWhere, resolveScope } from '../utils/scope.util';
import type { Request } from 'express';

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    access: DashboardAccess,
    dto: CreateReportDto,
    request: Request,
  ) {
    if (access.isCustomer) {
      throw new ForbiddenException('Customers cannot create reports.');
    }
    const scope = resolveScope(access, dto.filters);

    const report = await (this.prisma as any).savedReport.create({
      data: {
        organizationId: access.isPlatformAdmin
          ? (scope.organizationId ?? null)
          : (access.organizationId ?? null),
        createdById: access.userId,
        name: dto.name,
        description: dto.description ?? null,
        type: REPORT_CATEGORY_TO_TYPE[dto.category],
        filters: { category: dto.category, ...(dto.filters ?? {}) },
        columns: dto.columns ?? [],
        schedule: dto.schedule ?? null,
      },
    });

    await this.auditLogService.record({
      organizationId: access.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'REPORT',
      entityId: report.id,
      metadata: {
        reportAction: DASHBOARD_AUDIT_ACTIONS.REPORT_GENERATED,
        name: report.name,
      },
      request,
    });

    return this.decorate(report);
  }

  async list(access: DashboardAccess, pagination: PaginationDto) {
    if (access.isCustomer) {
      throw new ForbiddenException('Customers do not have report access.');
    }
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (!access.isPlatformAdmin) {
      where.organizationId = access.organizationId ?? null;
    }
    if (pagination.search) {
      where.OR = [
        { name: { contains: pagination.search, mode: 'insensitive' } },
        { description: { contains: pagination.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Record<string, string> = {
      [pagination.sortBy ?? 'createdAt']: pagination.sortOrder ?? 'desc',
    };

    const [items, total] = await Promise.all([
      (this.prisma as any).savedReport.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      (this.prisma as any).savedReport.count({ where }),
    ]);

    return {
      items: items.map((r: any) => this.decorate(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOne(access: DashboardAccess, id: string) {
    const report = await this.findAccessible(access, id);
    return this.decorate(report);
  }

  async update(
    access: DashboardAccess,
    id: string,
    dto: UpdateReportDto,
    request: Request,
  ) {
    const report = await this.findAccessible(access, id);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) {
      data.type = REPORT_CATEGORY_TO_TYPE[dto.category];
      const filters =
        typeof report.filters === 'object' && report.filters
          ? { ...report.filters }
          : {};
      data.filters = { ...filters, category: dto.category };
    }
    if (dto.filters !== undefined) {
      const category =
        (dto.filters as { category?: string }).category ??
        (typeof report.filters === 'object' && report.filters
          ? (report.filters as { category?: string }).category
          : 'CUSTOM');
      data.filters = { ...dto.filters, category };
    }
    if (dto.columns !== undefined) data.columns = dto.columns;
    if (dto.schedule !== undefined) data.schedule = dto.schedule;

    const updated = await (this.prisma as any).savedReport.update({
      where: { id },
      data,
    });

    await this.auditLogService.record({
      organizationId: access.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'REPORT',
      entityId: updated.id,
      metadata: { name: updated.name },
      request,
    });

    return this.decorate(updated);
  }

  async remove(access: DashboardAccess, id: string, request: Request) {
    const report = await this.findAccessible(access, id);
    await (this.prisma as any).savedReport.delete({ where: { id } });

    await this.auditLogService.record({
      organizationId: access.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'REPORT',
      entityId: report.id,
      metadata: {
        reportAction: DASHBOARD_AUDIT_ACTIONS.REPORT_DELETED,
        name: report.name,
      },
      request,
    });

    return { id: report.id, deleted: true };
  }

  /** Runs a saved report and returns the generated dataset. */
  async run(access: DashboardAccess, id: string) {
    const report = await this.findAccessible(access, id);
    return this.runFromConfig(access, {
      category: this.categoryOf(report),
      filters: (report.filters ?? {}) as AnalyticsFilterDto,
      columns: report.columns ?? [],
    });
  }

  /** Runs a report from an explicit config (used by exports & schedules). */
  async runFromConfig(
    access: DashboardAccess,
    config: {
      category: string;
      filters?: AnalyticsFilterDto;
      columns?: string[];
    },
  ) {
    const category = config.category as ReportCategory;
    const dataset = await this.analyticsService.getDataset(
      access,
      category,
      config.filters ?? {},
    );
    return {
      name: category.toLowerCase(),
      category,
      generatedAt: new Date(),
      columns: config.columns?.length ? config.columns : undefined,
      rows: dataset.rows,
      summary: dataset.summary,
    };
  }

  /**
   * Search across reports and the entities they reference (tickets, customers,
   * agents, payments, subscriptions, organizations). Tenant isolation applies.
   */
  async search(
    access: DashboardAccess,
    query: string,
    entity?: string,
    pagination: PaginationDto = {},
  ) {
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 10));
    const skip = (page - 1) * limit;

    const scope = resolveScope(access, {});
    const where = baseScopeWhere(scope);

    const entityResults: Record<string, unknown> = {};

    if (query) {
      switch (entity) {
        case 'organization': {
          const orgs = await (this.prisma as any).organization.findMany({
            where: {
              ...(access.isPlatformAdmin ? {} : { id: scope.organizationId }),
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { slug: { contains: query, mode: 'insensitive' } },
              ],
            },
            take: limit,
            select: { id: true, name: true, slug: true, status: true },
          });
          entityResults.organizations = orgs;
          break;
        }
        case 'ticket': {
          const tickets = await (this.prisma as any).ticket.findMany({
            where: {
              ...where,
              OR: [
                { ticketNumber: { contains: query, mode: 'insensitive' } },
                { subject: { contains: query, mode: 'insensitive' } },
              ],
            },
            take: limit,
            select: {
              id: true,
              ticketNumber: true,
              subject: true,
              status: true,
              priority: true,
              createdAt: true,
            },
          });
          entityResults.tickets = tickets;
          break;
        }
        case 'customer':
        case 'agent': {
          const role = entity === 'agent' ? 'SUPPORT_AGENT' : 'CUSTOMER';
          const users = await (this.prisma as any).user.findMany({
            where: {
              ...where,
              role,
              OR: [
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
              ],
            },
            take: limit,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              status: true,
            },
          });
          entityResults[entity === 'agent' ? 'agents' : 'customers'] = users;
          break;
        }
        case 'payment': {
          const payments = await (this.prisma as any).payment.findMany({
            where: {
              ...where,
              OR: [
                { reference: { contains: query, mode: 'insensitive' } },
                { receiptNumber: { contains: query, mode: 'insensitive' } },
              ],
            },
            take: limit,
            select: {
              id: true,
              reference: true,
              amount: true,
              currency: true,
              status: true,
              paidAt: true,
            },
          });
          entityResults.payments = payments;
          break;
        }
        case 'subscription': {
          const subs = await (
            this.prisma as any
          ).organizationSubscription.findMany({
            where: {
              ...where,
              OR: [
                {
                  organization: {
                    name: { contains: query, mode: 'insensitive' },
                  },
                },
                { plan: { name: { contains: query, mode: 'insensitive' } } },
              ],
            },
            take: limit,
            select: {
              id: true,
              status: true,
              billingInterval: true,
              organization: { select: { name: true } },
              plan: { select: { name: true } },
            },
          });
          entityResults.subscriptions = subs;
          break;
        }
        default: {
          // Full entity sweep for the platform admin.
          const [tickets, customers, agents, payments] = await Promise.all([
            (this.prisma as any).ticket.findMany({
              where: {
                ...where,
                OR: [
                  { ticketNumber: { contains: query, mode: 'insensitive' } },
                  { subject: { contains: query, mode: 'insensitive' } },
                ],
              },
              take: 5,
              select: {
                id: true,
                ticketNumber: true,
                subject: true,
                status: true,
              },
            }),
            (this.prisma as any).user.findMany({
              where: {
                ...where,
                role: 'CUSTOMER',
                OR: [
                  { firstName: { contains: query, mode: 'insensitive' } },
                  { lastName: { contains: query, mode: 'insensitive' } },
                  { email: { contains: query, mode: 'insensitive' } },
                ],
              },
              take: 5,
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            }),
            (this.prisma as any).user.findMany({
              where: {
                ...where,
                role: 'SUPPORT_AGENT',
                OR: [
                  { firstName: { contains: query, mode: 'insensitive' } },
                  { lastName: { contains: query, mode: 'insensitive' } },
                  { email: { contains: query, mode: 'insensitive' } },
                ],
              },
              take: 5,
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            }),
            (this.prisma as any).payment.findMany({
              where: {
                ...where,
                OR: [{ reference: { contains: query, mode: 'insensitive' } }],
              },
              take: 5,
              select: { id: true, reference: true, amount: true, status: true },
            }),
          ]);
          entityResults.tickets = tickets;
          entityResults.customers = customers;
          entityResults.agents = agents;
          entityResults.payments = payments;
          break;
        }
      }
    }

    const reportWhere: Record<string, unknown> = {};
    if (!access.isPlatformAdmin)
      reportWhere.organizationId = access.organizationId ?? null;
    if (query) {
      reportWhere.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [reports, total] = await Promise.all([
      (this.prisma as any).savedReport.findMany({
        where: reportWhere,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      (this.prisma as any).savedReport.count({ where: reportWhere }),
    ]);

    return {
      query,
      entity,
      entities: entityResults,
      reports: { items: reports.map((r: any) => this.decorate(r)), total },
      pagination: { page, limit },
    };
  }

  // --------------------------------------------------------------------------

  private async findAccessible(access: DashboardAccess, id: string) {
    const report = await (this.prisma as any).savedReport.findUnique({
      where: { id },
    });
    if (!report) throw new NotFoundException('Report not found.');

    if (
      !access.isPlatformAdmin &&
      report.organizationId !== access.organizationId
    ) {
      throw new ForbiddenException('You do not have access to this report.');
    }
    return report;
  }

  private categoryOf(report: any): string {
    if (report.filters && typeof report.filters === 'object') {
      const category = (report.filters as { category?: string }).category;
      if (category) return category;
    }
    return 'CUSTOM';
  }

  private decorate(report: any) {
    let schedule: unknown = null;
    if (report.schedule) {
      try {
        schedule = JSON.parse(report.schedule);
      } catch {
        schedule = report.schedule;
      }
    }
    return {
      id: report.id,
      name: report.name,
      description: report.description,
      category: this.categoryOf(report),
      type: report.type,
      filters: report.filters,
      columns: report.columns,
      schedule,
      createdById: report.createdById,
      organizationId: report.organizationId,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }
}
