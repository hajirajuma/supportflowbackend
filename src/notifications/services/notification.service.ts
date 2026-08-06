import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationUtil } from '../../common/utils/pagination.util';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import {
  NotificationAccess,
  NotificationChannelValue,
  NotificationPriorityValue,
  NotificationSort,
  defaultPriorityForType,
} from '../enums/notification.enums';
import { NotificationFilterDto } from '../dto/notification-filter.dto';
import { NotificationSearchDto } from '../dto/notification-search.dto';
import { RealtimeNotificationService } from './realtime-notification.service';
import { EmailNotificationService } from './email-notification.service';
import type { Request } from 'express';

export interface CreateNotificationParams {
  userId: string;
  organizationId: string | null;
  type: string;
  channel?: NotificationChannelValue;
  priority?: NotificationPriorityValue;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  relatedEntityType?: string;
  relatedEntityId?: string;
  scheduledAt?: Date;
  expiresAt?: Date;
  /** Optional email delivery (Brevo), gated by the user's preferences. */
  email?: {
    to: string;
    firstName?: string;
    variables?: Record<string, unknown>;
    template?: string;
    subject?: string;
    html?: string;
  };
  actorId?: string;
  actorEmail?: string;
  request?: Request;
}

export interface CreateNotificationManyParams {
  organizationId: string | null;
  type: string;
  channel?: NotificationChannelValue;
  priority?: NotificationPriorityValue;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  relatedEntityType?: string;
  relatedEntityId?: string;
  recipients: Array<{ userId: string; email?: string; firstName?: string }>;
  /** Per-recipient variables for template emails. */
  emailVariables?: (
    variables: Record<string, unknown>,
  ) => Record<string, unknown>;
  actorId?: string;
  actorEmail?: string;
  request?: Request;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly realtimeService: RealtimeNotificationService,
    private readonly emailService: EmailNotificationService,
  ) {}

  // --------------------------------------------------------------------------
  // Creation / broadcast
  // --------------------------------------------------------------------------

  /**
   * Creates a notification for one user, respecting their preferences, and
   * pushes it in real time. Optionally delivers an email through Brevo.
   */
  async create(params: CreateNotificationParams): Promise<any> {
    const settings = await this.loadSettings(
      params.userId,
      params.organizationId,
    );

    const type = params.type;
    const priority = params.priority ?? defaultPriorityForType(type);
    const channel = params.channel ?? NotificationChannelValue.IN_APP;

    const wantsInApp =
      channel === NotificationChannelValue.WEBSOCKET
        ? settings.enableRealtime
        : settings.enableInApp;
    const wantsEmail =
      channel === NotificationChannelValue.EMAIL || !!params.email
        ? settings.enableEmail && !this.isQuietHours(settings)
        : false;

    let notification: any = null;

    if (wantsInApp && !params.scheduledAt) {
      notification = await (this.prisma as any).notification.create({
        data: {
          userId: params.userId,
          organizationId: params.organizationId,
          type,
          channel: NotificationChannelValue.IN_APP,
          priority,
          title: params.title,
          body: params.body ?? null,
          data: params.data ?? undefined,
          relatedEntityType: params.relatedEntityType ?? null,
          relatedEntityId: params.relatedEntityId ?? null,
          deliveryStatus: 'DELIVERED',
          deliveredAt: new Date(),
          sentAt: new Date(),
        },
      });
    } else if (wantsInApp && params.scheduledAt) {
      notification = await (this.prisma as any).notification.create({
        data: {
          userId: params.userId,
          organizationId: params.organizationId,
          type,
          channel: NotificationChannelValue.IN_APP,
          priority,
          title: params.title,
          body: params.body ?? null,
          data: params.data ?? undefined,
          relatedEntityType: params.relatedEntityType ?? null,
          relatedEntityId: params.relatedEntityId ?? null,
          deliveryStatus: 'PENDING',
          scheduledAt: params.scheduledAt,
        },
      });
    }

    if (notification) {
      this.realtimeService.emitToUser(
        params.userId,
        'notification.created',
        this.serialize(notification),
      );
      await this.realtimeService.emitUnreadCount(
        params.userId,
        params.organizationId,
      );
    }

    if (wantsEmail && params.email) {
      try {
        await this.emailService.sendByParams({
          organizationId: params.organizationId,
          to: params.email.to,
          firstName: params.email.firstName ?? '',
          type,
          template: params.email.template,
          subject: params.email.subject,
          html: params.email.html,
          variables: params.email.variables ?? {},
        });
      } catch {
        // Email failures are logged via EMAIL_FAILED but never break the flow.
      }
    }

    if (params.actorId) {
      await this.auditLogService.record({
        organizationId: params.organizationId ?? undefined,
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        action: AUDIT_ACTIONS.NOTIFICATION_CREATED,
        entityType: 'Notification',
        entityId: notification?.id ?? null,
        metadata: { type, title: params.title, userId: params.userId },
        request: params.request,
      });
    }

    return notification;
  }

  /**
   * Creates notifications for many recipients in one batch and broadcasts a
   * real-time event to every recipient.
   */
  async createMany(params: CreateNotificationManyParams): Promise<number> {
    const type = params.type;
    const priority = params.priority ?? defaultPriorityForType(type);

    const settingsMap = await this.loadSettingsForMany(
      params.recipients.map((r) => r.userId),
      params.organizationId,
    );

    const rows: any[] = [];
    for (const recipient of params.recipients) {
      const settings =
        settingsMap.get(recipient.userId) ?? (await this.defaultSettings());
      const wantsInApp = settings.enableInApp;
      if (!wantsInApp) continue;

      rows.push({
        userId: recipient.userId,
        organizationId: params.organizationId,
        type,
        channel: NotificationChannelValue.IN_APP,
        priority,
        title: params.title,
        body: params.body ?? null,
        data: params.data ?? undefined,
        relatedEntityType: params.relatedEntityType ?? null,
        relatedEntityId: params.relatedEntityId ?? null,
        deliveryStatus: 'DELIVERED',
        deliveredAt: new Date(),
        sentAt: new Date(),
      });
    }

    if (rows.length) {
      await (this.prisma as any).notification.createMany({ data: rows });
    }

    for (const recipient of params.recipients) {
      this.realtimeService.emitToUser(
        recipient.userId,
        'notification.created',
        {
          type,
          priority,
          title: params.title,
          body: params.body ?? null,
          data: params.data ?? undefined,
        },
      );
      await this.realtimeService.emitUnreadCount(
        recipient.userId,
        params.organizationId,
      );
    }

    if (params.actorId) {
      await this.auditLogService.record({
        organizationId: params.organizationId ?? undefined,
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        action: AUDIT_ACTIONS.NOTIFICATION_CREATED,
        entityType: 'Notification',
        metadata: { type, title: params.title, recipients: rows.length },
        request: params.request,
      });
    }

    return rows.length;
  }

  // --------------------------------------------------------------------------
  // Read / list
  // --------------------------------------------------------------------------

  async list(access: NotificationAccess, filter: NotificationFilterDto) {
    this.assertAccess(access);
    const page = PaginationUtil.normalizePage(filter.page);
    const limit = PaginationUtil.normalizeLimit(filter.limit);

    const where: any = this.buildBaseWhere(access, filter);

    const orderBy = this.buildSort(filter.sort);

    const [items, total, unreadCount] = await Promise.all([
      (this.prisma as any).notification.findMany({
        where,
        orderBy,
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      (this.prisma as any).notification.count({ where }),
      (this.prisma as any).notification.count({
        where: {
          ...this.buildBaseWhere(access, filter),
          isRead: false,
          isArchived: false,
        },
      }),
    ]);

    return { items, total, page, limit, unreadCount };
  }

  async listUnread(access: NotificationAccess, filter: NotificationFilterDto) {
    return this.list(access, { ...filter, isRead: false, isArchived: false });
  }

  async getUnreadCount(access: NotificationAccess) {
    const where: any = this.buildBaseWhere(access, {});
    where.isRead = false;
    where.isArchived = false;
    const count = await (this.prisma as any).notification.count({ where });
    return { unreadCount: count };
  }

  async search(access: NotificationAccess, dto: NotificationSearchDto) {
    this.assertAccess(access);
    const page = PaginationUtil.normalizePage(dto.page);
    const limit = PaginationUtil.normalizeLimit(dto.limit);

    const where: any = this.buildBaseWhere(access, dto);

    if (dto.q) {
      const q = dto.q;
      const or: any[] = [
        { title: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
        { data: { path: ['ticketNumber'], string_contains: q } },
      ];
      if (access.isPlatformAdmin) {
        or.push({
          user: {
            is: {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        });
      }
      where.AND = [...(where.AND ?? []), { OR: or }];
    }

    const orderBy = this.buildSort(dto.sort);

    const [items, total] = await Promise.all([
      (this.prisma as any).notification.findMany({
        where,
        orderBy,
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      (this.prisma as any).notification.count({ where }),
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

  async getOne(access: NotificationAccess, notificationId: string) {
    const where: any = { id: notificationId };
    if (!access.isPlatformAdmin) {
      where.userId = access.userId;
      if (access.organizationId) where.organizationId = access.organizationId;
    }

    const notification = await (this.prisma as any).notification.findFirst({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------

  async markAsRead(
    access: NotificationAccess,
    notificationId: string,
    request: Request,
  ) {
    const notification = await this.findOwned(access, notificationId);

    const updated = await (this.prisma as any).notification.update({
      where: { id: notification.id },
      data: { isRead: true, readAt: new Date() },
    });

    await this.auditLogService.record({
      organizationId: notification.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.NOTIFICATION_READ,
      entityType: 'Notification',
      entityId: notification.id,
      request,
    });

    this.realtimeService.emitToUser(access.userId, 'notification.read', {
      id: notification.id,
      isRead: true,
    });
    await this.realtimeService.emitUnreadCount(
      access.userId,
      notification.organizationId,
    );

    return updated;
  }

  async markAllAsRead(access: NotificationAccess) {
    const where: any = { isRead: false };
    if (!access.isPlatformAdmin) {
      where.userId = access.userId;
      if (access.organizationId) where.organizationId = access.organizationId;
    }

    const result = await (this.prisma as any).notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });

    if (access.organizationId) {
      this.realtimeService.emitToUser(access.userId, 'notification.read', {
        all: true,
      });
      await this.realtimeService.emitUnreadCount(
        access.userId,
        access.organizationId,
      );
    }

    return { updatedCount: result.count };
  }

  async archive(
    access: NotificationAccess,
    notificationId: string,
    request: Request,
  ) {
    const notification = await this.findOwned(access, notificationId);

    const updated = await (this.prisma as any).notification.update({
      where: { id: notification.id },
      data: { isArchived: true, archivedAt: new Date() },
    });

    await this.auditLogService.record({
      organizationId: notification.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.NOTIFICATION_ARCHIVED,
      entityType: 'Notification',
      entityId: notification.id,
      request,
    });

    this.realtimeService.emitToUser(
      access.userId,
      'notification.updated',
      this.serialize(updated),
    );

    return updated;
  }

  async restore(
    access: NotificationAccess,
    notificationId: string,
    request: Request,
  ) {
    const notification = await this.findOwned(access, notificationId);

    const updated = await (this.prisma as any).notification.update({
      where: { id: notification.id },
      data: { isArchived: false, archivedAt: null },
    });

    await this.auditLogService.record({
      organizationId: notification.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.NOTIFICATION_RESTORED,
      entityType: 'Notification',
      entityId: notification.id,
      request,
    });

    this.realtimeService.emitToUser(
      access.userId,
      'notification.updated',
      this.serialize(updated),
    );

    return updated;
  }

  async remove(
    access: NotificationAccess,
    notificationId: string,
    request: Request,
  ) {
    const notification = await this.findOwned(access, notificationId);

    await (this.prisma as any).notification.delete({
      where: { id: notification.id },
    });

    await this.auditLogService.record({
      organizationId: notification.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.NOTIFICATION_DELETED,
      entityType: 'Notification',
      entityId: notification.id,
      request,
    });

    this.realtimeService.emitToUser(access.userId, 'notification.deleted', {
      id: notification.id,
    });
    await this.realtimeService.emitUnreadCount(
      access.userId,
      notification.organizationId,
    );

    return null;
  }

  /** Publishes a scheduled in-app notification that is now due. */
  async deliverScheduledById(notificationId: string) {
    const notification = await (this.prisma as any).notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) return null;
    if (notification.deliveryStatus !== 'PENDING' || !notification.scheduledAt)
      return notification;

    const updated = await (this.prisma as any).notification.update({
      where: { id: notificationId },
      data: {
        deliveryStatus: 'DELIVERED',
        sentAt: new Date(),
        deliveredAt: new Date(),
        scheduledAt: null,
      },
    });

    this.realtimeService.emitToUser(
      notification.userId,
      'notification.created',
      this.serialize(updated),
    );
    await this.realtimeService.emitUnreadCount(
      notification.userId,
      notification.organizationId,
    );

    return updated;
  }

  // --------------------------------------------------------------------------
  // Preferences
  // --------------------------------------------------------------------------

  async loadSettings(userId: string, organizationId: string | null) {
    const where: any = { userId };
    if (organizationId) where.organizationId = organizationId;

    const scoped = await (this.prisma as any).notificationSettings.findFirst({
      where,
    });
    const global = await (this.prisma as any).notificationSettings.findFirst({
      where: { userId, organizationId: null },
    });

    return this.mergeSettings(scoped ?? global);
  }

  private async loadSettingsForMany(
    userIds: string[],
    organizationId: string | null,
  ) {
    const map = new Map<string, any>();
    if (!userIds.length) return map;

    const [scoped, globals] = await Promise.all([
      (this.prisma as any).notificationSettings.findMany({
        where: { userId: { in: userIds }, organizationId },
      }),
      (this.prisma as any).notificationSettings.findMany({
        where: { userId: { in: userIds }, organizationId: null },
      }),
    ]);

    const globalByUser = new Map(globals.map((g: any) => [g.userId, g]));
    for (const userId of userIds) {
      const s = scoped.find((x: any) => x.userId === userId);
      map.set(userId, s ?? globalByUser.get(userId) ?? null);
    }
    return map;
  }

  private mergeSettings(settings: any) {
    if (settings) {
      return {
        enableEmail: settings.enableEmail,
        enableInApp: settings.enableInApp,
        enableRealtime: settings.enableRealtime,
        enableTicketUpdates: settings.enableTicketUpdates,
        enableFeedbackNotifications: settings.enableFeedbackNotifications,
        enableMarketingEmails: settings.enableMarketingEmails,
        enableSecurityAlerts: settings.enableSecurityAlerts,
        quietHoursStart: settings.quietHoursStart,
        quietHoursEnd: settings.quietHoursEnd,
        timezone: settings.timezone,
      };
    }
    return this.defaultSettings();
  }

  private defaultSettings() {
    return {
      enableEmail: true,
      enableInApp: true,
      enableRealtime: true,
      enableTicketUpdates: true,
      enableFeedbackNotifications: true,
      enableMarketingEmails: false,
      enableSecurityAlerts: true,
      quietHoursStart: null,
      quietHoursEnd: null,
      timezone: 'UTC',
    };
  }

  private isQuietHours(settings: any): boolean {
    if (!settings.quietHoursStart || !settings.quietHoursEnd) return false;
    const now = new Date();
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const start = this.toMinutes(settings.quietHoursStart);
    const end = this.toMinutes(settings.quietHoursEnd);
    if (start <= end) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
  }

  private toMinutes(value: string): number {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + (m ?? 0);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private buildBaseWhere(
    access: NotificationAccess,
    filter: NotificationFilterDto & { userId?: string },
  ) {
    const where: any = {};

    if (access.isPlatformAdmin) {
      if (filter.organizationId) where.organizationId = filter.organizationId;
      if (filter.userId) where.userId = filter.userId;
    } else {
      where.userId = access.userId;
      if (access.organizationId) where.organizationId = access.organizationId;
    }

    if (filter.type) where.type = filter.type;
    if (filter.channel) where.channel = filter.channel;
    if (filter.priority) where.priority = filter.priority;
    if (filter.isRead !== undefined) where.isRead = filter.isRead;
    if (filter.archivedOnly) where.isArchived = true;
    else if (filter.isArchived !== true) where.isArchived = false;

    if (filter.dateFrom || filter.dateTo) {
      const range: Record<string, Date> = {};
      if (filter.dateFrom) range.gte = new Date(filter.dateFrom);
      if (filter.dateTo) range.lte = new Date(filter.dateTo);
      where.createdAt = range;
    }

    return where;
  }

  private buildSort(sort?: NotificationSort) {
    switch (sort) {
      case NotificationSort.OLDEST:
        return { createdAt: 'asc' as const };
      case NotificationSort.PRIORITY:
        return [{ priority: 'desc' as const }, { createdAt: 'desc' as const }];
      case NotificationSort.UNREAD_FIRST:
        return [{ isRead: 'asc' as const }, { createdAt: 'desc' as const }];
      case NotificationSort.NEWEST:
      default:
        return { createdAt: 'desc' as const };
    }
  }

  private async findOwned(access: NotificationAccess, notificationId: string) {
    const where: any = { id: notificationId };
    if (!access.isPlatformAdmin) {
      where.userId = access.userId;
      if (access.organizationId) where.organizationId = access.organizationId;
    }

    const notification = await (this.prisma as any).notification.findFirst({
      where,
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  private assertAccess(access: NotificationAccess) {
    if (!access.isPlatformAdmin && !access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }
  }

  private serialize(notification: any) {
    return {
      id: notification.id,
      type: notification.type,
      channel: notification.channel,
      priority: notification.priority,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId,
      isRead: notification.isRead,
      isArchived: notification.isArchived,
      createdAt: notification.createdAt,
    };
  }
}
