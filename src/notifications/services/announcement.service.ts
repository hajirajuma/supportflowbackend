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
import {
  AnnouncementAudienceValue,
  AnnouncementStatusValue,
  NotificationAccess,
  NotificationPriorityValue,
  isTenantAdmin,
} from '../enums/notification.enums';
import { NotificationService } from './notification.service';
import { RealtimeNotificationService } from './realtime-notification.service';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from '../dto/announcement.dto';
import type { Request } from 'express';

const AUDIENCE_ROLE_MAP: Record<AnnouncementAudienceValue, string[]> = {
  [AnnouncementAudienceValue.ALL]: [
    'TENANT_OWNER',
    'SUPPORT_AGENT',
    'CUSTOMER',
  ],
  [AnnouncementAudienceValue.ORGANIZATION_OWNERS]: ['TENANT_OWNER'],
  [AnnouncementAudienceValue.ORGANIZATION_ADMINS]: ['TENANT_OWNER'],
  [AnnouncementAudienceValue.AGENTS]: ['SUPPORT_AGENT'],
  [AnnouncementAudienceValue.CUSTOMERS]: ['CUSTOMER'],
};

@Injectable()
export class AnnouncementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly realtimeService: RealtimeNotificationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    access: NotificationAccess,
    dto: CreateAnnouncementDto,
    request: Request,
  ) {
    this.assertBroadcastPermission(access);

    const isGlobal = access.isPlatformAdmin;
    const organizationId = isGlobal ? null : access.organizationId;

    if (!isGlobal && !organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const status = dto.scheduledAt
      ? AnnouncementStatusValue.SCHEDULED
      : AnnouncementStatusValue.PUBLISHED;

    const announcement = await (this.prisma as any).announcement.create({
      data: {
        organizationId,
        createdById: access.userId,
        title: dto.title,
        body: dto.body,
        type: dto.type ?? 'ANNOUNCEMENT',
        priority: dto.priority ?? NotificationPriorityValue.MEDIUM,
        audience: dto.audience ?? AnnouncementAudienceValue.ALL,
        status,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        publishedAt:
          status === AnnouncementStatusValue.PUBLISHED ? new Date() : null,
        audienceTarget: dto.audienceTarget ?? undefined,
      },
    });

    if (status === AnnouncementStatusValue.PUBLISHED) {
      await this.publish(access, announcement.id, request);
    }

    return announcement;
  }

  async publish(
    access: NotificationAccess,
    announcementId: string,
    request?: Request,
  ) {
    const announcement = await this.findOwned(access, announcementId);

    if (announcement.status === AnnouncementStatusValue.PUBLISHED) {
      return announcement;
    }
    if (announcement.status === AnnouncementStatusValue.EXPIRED) {
      throw new BadRequestException(
        'Expired announcements cannot be published',
      );
    }
    if (announcement.status === AnnouncementStatusValue.CANCELLED) {
      throw new BadRequestException(
        'Cancelled announcements cannot be published',
      );
    }

    const published = await (this.prisma as any).announcement.update({
      where: { id: announcement.id },
      data: {
        status: AnnouncementStatusValue.PUBLISHED,
        publishedAt: new Date(),
        scheduledAt: null,
      },
    });

    const recipients = await this.resolveAudience(access, published);
    if (recipients.length) {
      await this.notificationService.createMany({
        organizationId: published.organizationId ?? null,
        type: published.type ?? 'ANNOUNCEMENT',
        priority: published.priority ?? NotificationPriorityValue.MEDIUM,
        title: published.title,
        body: published.body,
        relatedEntityType: 'Announcement',
        relatedEntityId: published.id,
        recipients,
        actorId: access.userId,
        actorEmail: access.email,
        request,
      });
    }

    this.realtimeService.pushAnnouncementCreated(
      {
        id: published.id,
        title: published.title,
        body: published.body,
        priority: published.priority,
        organizationId: published.organizationId,
      },
      published.organizationId,
    );

    await this.auditLogService.record({
      organizationId: published.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.ANNOUNCEMENT_PUBLISHED,
      entityType: 'Announcement',
      entityId: published.id,
      metadata: { recipients: recipients.length, title: published.title },
      request,
    });

    await this.auditLogService.record({
      organizationId: published.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.BROADCAST_SENT,
      entityType: 'Announcement',
      entityId: published.id,
      metadata: { recipients: recipients.length },
      request,
    });

    return published;
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
      throw new ForbiddenException('Organization context is required');
    }

    const [items, total] = await Promise.all([
      (this.prisma as any).announcement.findMany({
        where,
        orderBy: [{ status: 'asc' as const }, { createdAt: 'desc' as const }],
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      (this.prisma as any).announcement.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getOne(access: NotificationAccess, announcementId: string) {
    const announcement = await this.findOwned(access, announcementId);
    return announcement;
  }

  async update(
    access: NotificationAccess,
    announcementId: string,
    dto: UpdateAnnouncementDto,
    request: Request,
  ) {
    const announcement = await this.findOwned(access, announcementId);

    if (
      announcement.status === AnnouncementStatusValue.PUBLISHED &&
      dto.status !== AnnouncementStatusValue.EXPIRED &&
      dto.status !== AnnouncementStatusValue.CANCELLED
    ) {
      throw new BadRequestException(
        'Published announcements can only be expired or cancelled',
      );
    }

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.audience !== undefined) data.audience = dto.audience;

    if (dto.scheduledAt !== undefined) {
      data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
      if (
        dto.scheduledAt &&
        announcement.status === AnnouncementStatusValue.DRAFT
      ) {
        data.status = AnnouncementStatusValue.SCHEDULED;
      }
    }
    if (dto.expiresAt !== undefined)
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (dto.status === AnnouncementStatusValue.PUBLISHED) {
      data.status = AnnouncementStatusValue.PUBLISHED;
      data.publishedAt = new Date();
      data.scheduledAt = null;
    } else if (dto.status === AnnouncementStatusValue.CANCELLED) {
      data.status = AnnouncementStatusValue.CANCELLED;
    } else if (dto.status === AnnouncementStatusValue.EXPIRED) {
      data.status = AnnouncementStatusValue.EXPIRED;
    }

    const updated = await (this.prisma as any).announcement.update({
      where: { id: announcement.id },
      data,
    });

    if (dto.status === AnnouncementStatusValue.PUBLISHED) {
      await this.publish(access, announcement.id, request);
    }

    await this.auditLogService.record({
      organizationId: announcement.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Announcement',
      entityId: announcement.id,
      metadata: { updatedFields: Object.keys(dto) },
      request,
    });

    return updated;
  }

  async remove(
    access: NotificationAccess,
    announcementId: string,
    request: Request,
  ) {
    const announcement = await this.findOwned(access, announcementId);

    await (this.prisma as any).announcement.delete({
      where: { id: announcement.id },
    });

    await this.auditLogService.record({
      organizationId: announcement.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'Announcement',
      entityId: announcement.id,
      request,
    });

    return null;
  }

  /** Expires announcements past their `expiresAt` (cron-driven). */
  async expireDue(): Promise<number> {
    const result = await (this.prisma as any).announcement.updateMany({
      where: {
        status: AnnouncementStatusValue.PUBLISHED,
        expiresAt: { lt: new Date() },
      },
      data: { status: AnnouncementStatusValue.EXPIRED },
    });
    return result.count;
  }

  /** Publishes announcements whose `scheduledAt` is due (cron-driven). */
  async publishDue(): Promise<number> {
    const due = await (this.prisma as any).announcement.findMany({
      where: {
        status: AnnouncementStatusValue.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      take: 50,
    });

    let count = 0;
    for (const announcement of due) {
      const access: NotificationAccess = {
        userId: announcement.createdById ?? 'system',
        organizationId: announcement.organizationId,
        role: announcement.organizationId ? 'TENANT_OWNER' : 'PLATFORM_ADMIN',
        email: '',
        isPlatformAdmin: announcement.organizationId === null,
        isOwner: !!announcement.organizationId,
        isAdmin: announcement.organizationId === null,
        isAgent: false,
        isCustomer: false,
      };
      try {
        await this.publish(access, announcement.id, undefined);
        count += 1;
      } catch {
        // Leave failed announcements for the next sweep.
      }
    }

    return count;
  }

  // --------------------------------------------------------------------------

  private async resolveAudience(access: NotificationAccess, announcement: any) {
    const roles = AUDIENCE_ROLE_MAP[
      announcement.audience as AnnouncementAudienceValue
    ] ?? ['TENANT_OWNER', 'SUPPORT_AGENT', 'CUSTOMER'];

    const where: any = { status: 'ACTIVE', role: { in: roles } };
    if (announcement.organizationId) {
      where.organizationId = announcement.organizationId;
    } else {
      const target = (announcement.audienceTarget ?? {}) as {
        organizationIds?: string[];
      };
      if (target.organizationIds?.length) {
        where.organizationId = { in: target.organizationIds };
      }
    }

    const users = await (this.prisma as any).user.findMany({
      where,
      select: { id: true, email: true, firstName: true },
      take: 5000,
    });

    return users.map((u: any) => ({
      userId: u.id,
      email: u.email,
      firstName: u.firstName ?? '',
    }));
  }

  private async findOwned(access: NotificationAccess, announcementId: string) {
    const where: any = { id: announcementId };
    if (!access.isPlatformAdmin) {
      where.organizationId = access.organizationId;
    }
    const announcement = await (this.prisma as any).announcement.findFirst({
      where,
    });
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }
    return announcement;
  }

  private assertBroadcastPermission(access: NotificationAccess) {
    if (!access.isPlatformAdmin && !isTenantAdmin(access)) {
      throw new ForbiddenException(
        'Only platform admins or tenant owners/admins can create announcements',
      );
    }
    if (!access.isPlatformAdmin && !access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }
  }
}
