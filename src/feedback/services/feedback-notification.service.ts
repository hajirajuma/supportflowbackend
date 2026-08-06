import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BrevoEmailService } from '../../email/brevo.service';
import { RealtimeNotificationService } from '../../notifications/services/realtime-notification.service';

export enum FeedbackNotificationType {
  FEEDBACK_REQUEST = 'FEEDBACK_REQUEST',
  FEEDBACK_REMINDER = 'FEEDBACK_REMINDER',
  FEEDBACK_EXPIRED = 'FEEDBACK_EXPIRED',
  FEEDBACK_SUBMITTED = 'FEEDBACK_SUBMITTED',
  NEGATIVE_FEEDBACK = 'NEGATIVE_FEEDBACK',
}

export interface NotifyOptions {
  excludeUserId?: string;
}

@Injectable()
export class FeedbackNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: BrevoEmailService,
    private readonly realtimeService: RealtimeNotificationService,
  ) {}

  async notifyRequestAvailable(params: {
    organizationId: string;
    userId: string;
    email: string;
    firstName: string;
    ticketNumber: string;
    ticketSubject: string;
    formTitle: string;
    surveyUrl: string;
  }) {
    const notification = await (this.prisma as any).notification.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId,
        type: 'FEEDBACK_REQUEST',
        channel: 'IN_APP',
        title: `Tell us about ticket #${params.ticketNumber}`,
        body: `We would love your feedback on "${params.ticketSubject}".`,
        data: {
          ticketNumber: params.ticketNumber,
          surveyUrl: params.surveyUrl,
        },
        relatedEntityType: 'FeedbackRequest',
        relatedEntityId: params.ticketNumber,
        deliveryStatus: 'PENDING',
      },
    });

    this.realtimeService.pushFeedbackNotification(params.userId, notification);
    await this.realtimeService.emitUnreadCount(
      params.userId,
      params.organizationId,
    );

    try {
      await this.emailService.sendFeedbackRequestEmail(
        params.email,
        params.firstName,
        '',
        params.ticketNumber,
        params.formTitle,
        params.surveyUrl,
      );
    } catch {
      // Email failures must never break the ticket workflow.
    }

    return notification;
  }

  async notifyReminder(params: {
    organizationId: string;
    userId: string;
    email: string;
    firstName: string;
    ticketNumber: string;
    surveyUrl: string;
  }) {
    const notification = await (this.prisma as any).notification.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId,
        type: 'FEEDBACK_REQUEST',
        channel: 'IN_APP',
        title: `Reminder: feedback on ticket #${params.ticketNumber}`,
        body: 'Your survey is still open — we would love to hear from you.',
        data: {
          ticketNumber: params.ticketNumber,
          surveyUrl: params.surveyUrl,
        },
        relatedEntityType: 'FeedbackRequest',
        relatedEntityId: params.ticketNumber,
        deliveryStatus: 'PENDING',
      },
    });

    this.realtimeService.pushFeedbackNotification(params.userId, notification);
    await this.realtimeService.emitUnreadCount(
      params.userId,
      params.organizationId,
    );

    try {
      await this.emailService.sendFeedbackReminderEmail(
        params.email,
        params.firstName,
        params.ticketNumber,
        params.surveyUrl,
      );
    } catch {
      // Best-effort email.
    }

    return notification;
  }

  async notifyExpired(params: {
    organizationId: string;
    userId: string;
    ticketNumber: string;
  }) {
    const notification = await (this.prisma as any).notification.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId,
        type: 'FEEDBACK_EXPIRED',
        channel: 'IN_APP',
        title: `Feedback window closed for ticket #${params.ticketNumber}`,
        body: 'The survey for this ticket has expired.',
        relatedEntityType: 'FeedbackRequest',
        relatedEntityId: params.ticketNumber,
        deliveryStatus: 'PENDING',
      },
    });

    this.realtimeService.pushFeedbackNotification(params.userId, notification);
    await this.realtimeService.emitUnreadCount(
      params.userId,
      params.organizationId,
    );

    return notification;
  }

  async notifyFeedbackSubmitted(params: {
    organizationId: string;
    ticketNumber: string;
    customerName: string;
    ratingLabel: string;
    publicComment: string | null;
    overallScore: number | null;
    responseId: string;
  }) {
    const staff = await (this.prisma as any).user.findMany({
      where: {
        organizationId: params.organizationId,
        status: 'ACTIVE',
        role: { in: ['TENANT_OWNER', 'SUPPORT_AGENT'] },
      },
      select: { id: true, email: true, firstName: true, role: true },
    });

    const type = 'FEEDBACK_SUBMITTED';
    const title = `New feedback on ticket #${params.ticketNumber}`;
    const body =
      params.publicComment ||
      `Rated ${params.ratingLabel} on ticket #${params.ticketNumber}`;

    if (staff.length) {
      await (this.prisma as any).notification.createMany({
        data: staff.map((u: any) => ({
          userId: u.id,
          organizationId: params.organizationId,
          type,
          channel: 'IN_APP',
          title,
          body,
          data: {
            responseId: params.responseId,
            ticketNumber: params.ticketNumber,
          },
          relatedEntityType: 'FeedbackResponse',
          relatedEntityId: params.responseId,
          deliveryStatus: 'PENDING',
        })),
      });
    }

    for (const u of staff) {
      this.realtimeService.pushFeedbackNotification(u.id, {
        type,
        title,
        body,
        data: {
          responseId: params.responseId,
          ticketNumber: params.ticketNumber,
        },
      });
      await this.realtimeService.emitUnreadCount(u.id, params.organizationId);
    }

    if (params.overallScore !== null && params.overallScore <= 2) {
      const owners = staff.filter((u: any) => u.role === 'TENANT_OWNER');
      if (owners.length) {
        await (this.prisma as any).notification.createMany({
          data: owners.map((u: any) => ({
            userId: u.id,
            organizationId: params.organizationId,
            type: 'NEGATIVE_FEEDBACK',
            channel: 'IN_APP',
            title: `Low rating on ticket #${params.ticketNumber}`,
            body: `A customer rated their experience ${params.ratingLabel}. Please review the ticket.`,
            data: {
              responseId: params.responseId,
              ticketNumber: params.ticketNumber,
            },
            relatedEntityType: 'FeedbackResponse',
            relatedEntityId: params.responseId,
            deliveryStatus: 'PENDING',
          })),
        });
        for (const owner of owners) {
          this.realtimeService.pushFeedbackNotification(owner.id, {
            type: 'NEGATIVE_FEEDBACK',
            title: `Low rating on ticket #${params.ticketNumber}`,
            body: `A customer rated their experience ${params.ratingLabel}. Please review the ticket.`,
          });
          await this.realtimeService.emitUnreadCount(
            owner.id,
            params.organizationId,
          );
        }
      }
      for (const owner of owners) {
        try {
          await this.emailService.sendNegativeFeedbackEmail(
            owner.email,
            owner.firstName,
            '',
            params.ticketNumber,
            params.ratingLabel,
            params.publicComment ?? '',
          );
        } catch {
          // Best-effort email.
        }
      }
    }

    return true;
  }
}
