import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationUtil } from '../../common/utils/pagination.util';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { NotificationFilterDto } from '../dto/notification-filter.dto';
import type { Request } from 'express';

@Injectable()
export class CustomerNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listNotifications(
    userId: string,
    organizationId: string,
    filter: NotificationFilterDto,
  ) {
    const page = PaginationUtil.normalizePage(filter.page);
    const limit = PaginationUtil.normalizeLimit(filter.limit);

    const where: any = {
      userId,
      organizationId,
    };

    if (filter.type) where.type = filter.type;
    if (filter.channel) where.channel = filter.channel;
    if (filter.isRead !== undefined) where.isRead = filter.isRead;

    const sortOrder = filter.sort === 'createdAt:asc' ? 'asc' : 'desc';

    const [items, total, unreadCount] = await Promise.all([
      (this.prisma as any).notification.findMany({
        where,
        orderBy: { createdAt: sortOrder },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        select: {
          id: true,
          type: true,
          channel: true,
          title: true,
          body: true,
          data: true,
          relatedEntityType: true,
          relatedEntityId: true,
          isRead: true,
          readAt: true,
          createdAt: true,
        },
      }),
      (this.prisma as any).notification.count({ where }),
      (this.prisma as any).notification.count({
        where: { userId, organizationId, isRead: false },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      unreadCount,
    };
  }

  async markAsRead(
    userId: string,
    organizationId: string,
    notificationId: string,
    request: Request,
  ) {
    const notification = await this.findOwnedNotification(
      userId,
      organizationId,
      notificationId,
    );

    const updated = await (this.prisma as any).notification.update({
      where: { id: notification.id },
      data: { isRead: true, readAt: new Date() },
      select: {
        id: true,
        type: true,
        channel: true,
        title: true,
        body: true,
        data: true,
        relatedEntityType: true,
        relatedEntityId: true,
        isRead: true,
        readAt: true,
        createdAt: true,
      },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: userId,
      action: AUDIT_ACTIONS.NOTIFICATION_READ,
      entityType: 'Notification',
      entityId: notification.id,
      request,
    });

    return updated;
  }

  async markAllAsRead(userId: string, organizationId: string) {
    const result = await (this.prisma as any).notification.updateMany({
      where: { userId, organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { updatedCount: result.count };
  }

  async deleteNotification(
    userId: string,
    organizationId: string,
    notificationId: string,
    request: Request,
  ) {
    const notification = await this.findOwnedNotification(
      userId,
      organizationId,
      notificationId,
    );

    await (this.prisma as any).notification.delete({
      where: { id: notification.id },
    });

    await this.auditLogService.record({
      organizationId,
      actorId: userId,
      action: AUDIT_ACTIONS.NOTIFICATION_DELETED,
      entityType: 'Notification',
      entityId: notification.id,
      request,
    });

    return null;
  }

  private async findOwnedNotification(
    userId: string,
    organizationId: string,
    notificationId: string,
  ) {
    const notification = await (this.prisma as any).notification.findFirst({
      where: { id: notificationId, userId, organizationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }
}
