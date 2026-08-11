import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AnnouncementService } from './announcement.service';
import { NotificationService } from './notification.service';

/**
 * Scheduled notification processing:
 *  - publishes announcements whose scheduledAt has arrived
 *  - expires announcements and notifications past their deadline
 *  - delivers scheduled in-app notifications that are now due
 */
@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly announcementService: AnnouncementService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'announcements-publish-due' })
  async handleAnnouncementSchedule() {
    try {
      const published = await this.announcementService.publishDue();
      const expired = await this.announcementService.expireDue();
      if (published > 0 || expired > 0) {
        this.logger.log(
          `Announcements: ${published} published, ${expired} expired`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Announcement schedule failed: ${(error as Error).message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'notifications-deliver-scheduled',
  })
  async handleScheduledNotifications() {
    try {
      const due = await this.prisma.notification.findMany({
        where: {
          deliveryStatus: 'PENDING',
          scheduledAt: { lte: new Date() },
          isArchived: false,
        },
        select: { id: true },
        take: 200,
      });

      for (const row of due) {
        await this.notificationService.deliverScheduledById(row.id);
      }

      if (due.length) {
        this.logger.log(`Delivered ${due.length} scheduled notifications`);
      }
    } catch (error) {
      this.logger.error(
        `Scheduled notification delivery failed: ${(error as Error).message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'notifications-expire' })
  async handleNotificationExpiry() {
    try {
      const result = await this.prisma.notification.updateMany({
        where: {
          expiresAt: { lt: new Date() },
          deliveryStatus: 'PENDING',
          isArchived: false,
        },
        data: {
          deliveryStatus: 'FAILED',
          errorMessage: 'expired before delivery',
        },
      });
      if (result.count) {
        this.logger.log(`Expired ${result.count} overdue notifications`);
      }
    } catch (error) {
      this.logger.error(
        `Notification expiry failed: ${(error as Error).message}`,
      );
    }
  }
}