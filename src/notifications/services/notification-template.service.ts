import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { NotificationAccess, isStaff } from '../enums/notification.enums';
import {
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from '../dto/notification-template.dto';
import type { Request } from 'express';

@Injectable()
export class NotificationTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    access: NotificationAccess,
    dto: CreateNotificationTemplateDto,
    request: Request,
  ) {
    if (!isStaff(access)) {
      throw new ForbiddenException(
        'Only staff can create notification templates',
      );
    }
    if (!access.isPlatformAdmin && !access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    await this.assertSlugAvailable(access, dto.slug);

    const template = await (this.prisma as any).notificationTemplate.create({
      data: {
        organizationId: access.isPlatformAdmin ? null : access.organizationId,
        createdById: access.userId,
        name: dto.name,
        slug: dto.slug,
        description: dto.description ?? null,
        type: dto.type,
        channel: dto.channel ?? 'EMAIL',
        subject: dto.subject,
        body: dto.body,
        variables: dto.variables ?? [],
        status: dto.status ?? 'ACTIVE',
        enabled: dto.enabled ?? true,
      },
    });

    await this.auditLogService.record({
      organizationId: access.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'NotificationTemplate',
      entityId: template.id,
      metadata: { slug: template.slug },
      request,
    });

    return template;
  }

  async update(
    access: NotificationAccess,
    templateId: string,
    dto: UpdateNotificationTemplateDto,
    request: Request,
  ) {
    if (!isStaff(access)) {
      throw new ForbiddenException(
        'Only staff can update notification templates',
      );
    }

    const template = await this.findOwned(access, templateId);

    if (dto.slug && dto.slug !== template.slug) {
      await this.assertSlugAvailable(access, dto.slug, templateId);
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.channel !== undefined) data.channel = dto.channel;
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.variables !== undefined) data.variables = dto.variables;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;

    const updated = await (this.prisma as any).notificationTemplate.update({
      where: { id: template.id },
      data,
    });

    await this.auditLogService.record({
      organizationId: access.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'NotificationTemplate',
      entityId: updated.id,
      metadata: { updatedFields: Object.keys(dto) },
      request,
    });

    return updated;
  }

  async remove(
    access: NotificationAccess,
    templateId: string,
    request: Request,
  ) {
    if (!isStaff(access)) {
      throw new ForbiddenException(
        'Only staff can delete notification templates',
      );
    }

    const template = await this.findOwned(access, templateId);

    await (this.prisma as any).notificationTemplate.delete({
      where: { id: template.id },
    });

    await this.auditLogService.record({
      organizationId: access.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'NotificationTemplate',
      entityId: template.id,
      request,
    });

    return null;
  }

  async list(access: NotificationAccess, pagination: PaginationQueryDto) {
    const page = PaginationUtil.normalizePage(pagination.page);
    const limit = PaginationUtil.normalizeLimit(pagination.limit);

    const where: any = {};
    if (access.isPlatformAdmin) {
      where.organizationId = null;
    } else if (access.organizationId) {
      where.organizationId = access.organizationId;
    } else {
      where.organizationId = null;
    }

    const [items, total] = await Promise.all([
      (this.prisma as any).notificationTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
      }),
      (this.prisma as any).notificationTemplate.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getOne(access: NotificationAccess, templateId: string) {
    const where: any = { id: templateId };
    if (!access.isPlatformAdmin) {
      where.organizationId = access.organizationId ?? null;
    }
    const template = await (this.prisma as any).notificationTemplate.findFirst({
      where,
    });
    if (!template) {
      throw new NotFoundException('Notification template not found');
    }
    return template;
  }

  private async findOwned(access: NotificationAccess, templateId: string) {
    const where: any = { id: templateId };
    if (!access.isPlatformAdmin) {
      where.organizationId = access.organizationId ?? null;
    }
    const template = await (this.prisma as any).notificationTemplate.findFirst({
      where,
    });
    if (!template) {
      throw new NotFoundException('Notification template not found');
    }
    return template;
  }

  private async assertSlugAvailable(
    access: NotificationAccess,
    slug: string,
    excludeId?: string,
  ) {
    const existing = await (this.prisma as any).notificationTemplate.findFirst({
      where: {
        slug,
        organizationId: access.isPlatformAdmin ? null : access.organizationId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        `A template with slug "${slug}" already exists`,
      );
    }
  }
}
