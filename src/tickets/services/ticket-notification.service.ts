import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeNotificationService } from '../../notifications/services/realtime-notification.service';

export enum TicketNotificationType {
  TICKET_ASSIGNED = 'TICKET_ASSIGNED',
  TICKET_UPDATED = 'TICKET_UPDATED',
  TICKET_REPLIED = 'TICKET_REPLIED',
  TICKET_RESOLVED = 'TICKET_RESOLVED',
  TICKET_MENTIONED = 'TICKET_MENTIONED',
}

export interface NotifyOptions {
  excludeUserId?: string;
}

@Injectable()
export class TicketNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeNotificationService,
  ) {}

  async notifyUser(
    userId: string,
    organizationId: string,
    type: TicketNotificationType,
    title: string,
    body?: string,
    data?: Record<string, unknown>,
    relatedEntityType?: string,
    relatedEntityId?: string,
  ) {
    const notification = await (this.prisma as any).notification.create({
      data: {
        userId,
        organizationId,
        type,
        channel: 'IN_APP',
        title,
        body: body ?? null,
        data: data ?? undefined,
        relatedEntityType: relatedEntityType ?? null,
        relatedEntityId: relatedEntityId ?? null,
        deliveryStatus: 'DELIVERED',
        deliveredAt: new Date(),
        sentAt: new Date(),
      },
    });

    this.realtimeService.pushTicketNotification(userId, notification);
    await this.realtimeService.emitUnreadCount(userId, organizationId);

    return notification;
  }

  async notifyStaff(
    organizationId: string,
    type: TicketNotificationType,
    title: string,
    body?: string,
    data?: Record<string, unknown>,
    relatedEntityType?: string,
    relatedEntityId?: string,
    options?: NotifyOptions,
  ) {
    const staff = await (this.prisma as any).user.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        role: { in: ['TENANT_OWNER', 'SUPPORT_AGENT'] },
      },
      select: { id: true },
    });

    const recipients = staff
      .map((u: any) => u.id)
      .filter((id: string) => id !== options?.excludeUserId);

    if (recipients.length === 0) return;

    await (this.prisma as any).notification.createMany({
      data: recipients.map((userId: string) => ({
        userId,
        organizationId,
        type,
        channel: 'IN_APP',
        title,
        body: body ?? null,
        data: data ?? undefined,
        relatedEntityType: relatedEntityType ?? null,
        relatedEntityId: relatedEntityId ?? null,
        deliveryStatus: 'DELIVERED',
        deliveredAt: new Date(),
        sentAt: new Date(),
      })),
    });

    await this.emitBatch(recipients, organizationId, type, title, body, data);
  }

  async notifyWatchers(
    ticketId: string,
    organizationId: string,
    type: TicketNotificationType,
    title: string,
    body?: string,
    data?: Record<string, unknown>,
    relatedEntityType?: string,
    relatedEntityId?: string,
    options?: NotifyOptions,
  ) {
    const watchers = await (this.prisma as any).ticketWatcher.findMany({
      where: { ticketId },
      select: { userId: true },
    });

    const recipients = watchers
      .map((w: any) => w.userId)
      .filter((id: string) => id !== options?.excludeUserId);

    if (recipients.length === 0) return;

    await (this.prisma as any).notification.createMany({
      data: recipients.map((userId: string) => ({
        userId,
        organizationId,
        type,
        channel: 'IN_APP',
        title,
        body: body ?? null,
        data: data ?? undefined,
        relatedEntityType: relatedEntityType ?? null,
        relatedEntityId: relatedEntityId ?? null,
        deliveryStatus: 'DELIVERED',
        deliveredAt: new Date(),
        sentAt: new Date(),
      })),
    });

    await this.emitBatch(recipients, organizationId, type, title, body, data);
  }

  async notifyUsers(
    userIds: string[],
    organizationId: string,
    type: TicketNotificationType,
    title: string,
    body?: string,
    data?: Record<string, unknown>,
    relatedEntityType?: string,
    relatedEntityId?: string,
  ) {
    const recipients = [...new Set(userIds)].filter(Boolean);
    if (recipients.length === 0) return;

    await (this.prisma as any).notification.createMany({
      data: recipients.map((userId: string) => ({
        userId,
        organizationId,
        type,
        channel: 'IN_APP',
        title,
        body: body ?? null,
        data: data ?? undefined,
        relatedEntityType: relatedEntityType ?? null,
        relatedEntityId: relatedEntityId ?? null,
        deliveryStatus: 'DELIVERED',
        deliveredAt: new Date(),
        sentAt: new Date(),
      })),
    });

    await this.emitBatch(recipients, organizationId, type, title, body, data);
  }

  private async emitBatch(
    recipients: string[],
    organizationId: string,
    type: TicketNotificationType,
    title: string,
    body?: string,
    data?: Record<string, unknown>,
  ) {
    const payload = { type, title, body: body ?? null, data: data ?? null };
    for (const userId of recipients) {
      this.realtimeService.pushTicketNotification(userId, payload);
      await this.realtimeService.emitUnreadCount(userId, organizationId);
    }
  }
}
