import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from '../notifications.gateway';

/**
 * Convenience facade over the WebSocket gateway. Emits the standardized
 * client events (notification.created / updated / read / deleted,
 * announcement.created, ticket.notification, feedback.notification) and keeps
 * live unread-count badges in sync.
 */
@Injectable()
export class RealtimeNotificationService {
  constructor(
    private readonly gateway: NotificationsGateway,
    private readonly prisma: PrismaService,
  ) {}

  emitToUser(userId: string, event: string, payload: unknown) {
    this.gateway.emitToUser(userId, event, payload);
  }

  emitToOrg(organizationId: string, event: string, payload: unknown) {
    this.gateway.emitToOrg(organizationId, event, payload);
  }

  emitToAll(event: string, payload: unknown) {
    this.gateway.emitToAll(event, payload);
  }

  pushNotificationCreated(userId: string, payload: unknown) {
    this.emitToUser(userId, 'notification.created', payload);
  }

  pushTicketNotification(userId: string, payload: unknown) {
    this.emitToUser(userId, 'ticket.notification', payload);
  }

  pushFeedbackNotification(userId: string, payload: unknown) {
    this.emitToUser(userId, 'feedback.notification', payload);
  }

  pushAnnouncementCreated(payload: unknown, organizationId?: string | null) {
    if (organizationId) {
      this.emitToOrg(organizationId, 'announcement.created', payload);
    } else {
      this.emitToAll('announcement.created', payload);
    }
  }

  async emitUnreadCount(userId: string, _organizationId?: string | null) {
    try {
      const where: any = { userId, isRead: false, isArchived: false };
      const count = await (this.prisma as any).notification.count({ where });
      this.emitToUser(userId, 'notification.unreadCount', { count });
    } catch {
      // Best-effort badge sync.
    }
  }
}
