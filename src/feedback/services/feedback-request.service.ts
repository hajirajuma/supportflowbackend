import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { FeedbackAccess } from '../types/feedback-access.type';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FeedbackNotificationService } from './feedback-notification.service';
import {
  FEEDBACK_REMINDER_AFTER_DAYS,
  FEEDBACK_REQUEST_VALID_DAYS,
  FeedbackRequestStatus,
} from '../enums/feedback.enums';
import type { Request } from 'express';

const REMINDER_MS = FEEDBACK_REMINDER_AFTER_DAYS * 24 * 60 * 60 * 1000;

@Injectable()
export class FeedbackRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: FeedbackNotificationService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generates a feedback request for a resolved/closed ticket and notifies the
   * customer by email + in-app notification. Silently no-ops when the
   * organization has no configured satisfaction survey.
   */
  async generateForTicket(ticket: any) {
    const organizationId = ticket.organizationId;
    if (!organizationId) return null;

    const form = await this.resolveSatisfactionForm(organizationId);
    if (!form) return null;

    const existing = await (this.prisma as any).feedbackRequest.findFirst({
      where: {
        ticketId: ticket.id,
        formId: form.id,
        status: { in: ['PENDING', 'OPENED'] },
      },
    });
    if (existing) return existing;

    const completed = await (this.prisma as any).feedbackRequest.findFirst({
      where: { ticketId: ticket.id, formId: form.id, status: 'COMPLETED' },
    });
    if (completed && !form.allowMultipleResponses) return null;

    const customer = await (this.prisma as any).user.findUnique({
      where: { id: ticket.createdById },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!customer) return null;

    const now = Date.now();
    const validMs = FEEDBACK_REQUEST_VALID_DAYS * 24 * 60 * 60 * 1000;
    const formExpiry = form.expiresAt
      ? new Date(form.expiresAt).getTime()
      : null;
    const expiresAt = formExpiry
      ? new Date(Math.min(now + validMs, formExpiry))
      : new Date(now + validMs);

    const token = randomBytes(32).toString('hex');

    const requestRow = await (this.prisma as any).feedbackRequest.create({
      data: {
        organizationId,
        formId: form.id,
        ticketId: ticket.id,
        submittedById: customer.id,
        token,
        status: FeedbackRequestStatus.PENDING,
        email: customer.email,
        sentAt: new Date(),
        expiresAt,
      },
    });

    const surveyUrl = this.buildSurveyUrl(requestRow.id, token);

    await this.notificationService.notifyRequestAvailable({
      organizationId,
      userId: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      ticketNumber: ticket.ticketNumber,
      ticketSubject: ticket.subject,
      formTitle: form.title,
      surveyUrl,
    });

    await this.auditLogService.record({
      organizationId,
      actorId: customer.id,
      actorEmail: customer.email,
      action: AUDIT_ACTIONS.FEEDBACK_REQUEST_CREATED,
      entityType: 'FeedbackRequest',
      entityId: requestRow.id,
      metadata: {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        formId: form.id,
      },
    });

    return requestRow;
  }

  private async resolveSatisfactionForm(organizationId: string) {
    const settings = await (this.prisma as any).organizationSettings.findUnique(
      {
        where: { organizationId },
        select: { defaultFeedbackFormId: true },
      },
    );

    if (settings?.defaultFeedbackFormId) {
      const defaultForm = await (this.prisma as any).feedbackForm.findFirst({
        where: {
          id: settings.defaultFeedbackFormId,
          organizationId,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (defaultForm) return defaultForm;
    }

    return (this.prisma as any).feedbackForm.findFirst({
      where: {
        organizationId,
        isSatisfactionSurvey: true,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listPending(access: FeedbackAccess, pagination: PaginationQueryDto) {
    const page = PaginationUtil.normalizePage(pagination.page);
    const limit = PaginationUtil.normalizeLimit(pagination.limit);

    await this.expireOverdue({ userId: access.userId });
    await this.sendReminders({ userId: access.userId });

    const where: any = {
      submittedById: access.userId,
      status: {
        in: [FeedbackRequestStatus.PENDING, FeedbackRequestStatus.OPENED],
      },
    };
    if (access.organizationId) where.organizationId = access.organizationId;

    const [items, total] = await Promise.all([
      (this.prisma as any).feedbackRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: {
          form: {
            select: {
              id: true,
              title: true,
              description: true,
              welcomeMessage: true,
              thankYouMessage: true,
            },
          },
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              subject: true,
              status: true,
            },
          },
        },
      }),
      (this.prisma as any).feedbackRequest.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findForSubmission(access: FeedbackAccess, requestId: string) {
    const requestRow = await (this.prisma as any).feedbackRequest.findFirst({
      where: access.organizationId
        ? { id: requestId, organizationId: access.organizationId }
        : { id: requestId },
      include: {
        form: {
          include: {
            questions: { orderBy: { sortOrder: 'asc' } },
          },
        },
        ticket: true,
      },
    });

    if (!requestRow) return null;

    if (requestRow.submittedById !== access.userId) {
      return { error: 'forbidden' as const, request: requestRow };
    }

    if (requestRow.status === FeedbackRequestStatus.COMPLETED) {
      return { error: 'already_submitted' as const, request: requestRow };
    }

    if (
      requestRow.status === FeedbackRequestStatus.EXPIRED ||
      (requestRow.expiresAt &&
        new Date(requestRow.expiresAt).getTime() < Date.now())
    ) {
      if (requestRow.status !== FeedbackRequestStatus.EXPIRED) {
        await this.markExpiredAndNotify(requestRow);
      }
      return { error: 'expired' as const, request: requestRow };
    }

    const ticket = requestRow.ticket;
    if (!this.isTicketResolvable(ticket)) {
      return { error: 'ticket_not_resolved' as const, request: requestRow };
    }

    if (requestRow.status === FeedbackRequestStatus.PENDING) {
      await (this.prisma as any).feedbackRequest.update({
        where: { id: requestRow.id },
        data: { status: FeedbackRequestStatus.OPENED, openedAt: new Date() },
      });
      requestRow.status = FeedbackRequestStatus.OPENED;
    }

    return { error: null, request: requestRow };
  }

  async markCompleted(requestId: string, submittedAt: Date) {
    return (this.prisma as any).feedbackRequest.update({
      where: { id: requestId },
      data: { status: FeedbackRequestStatus.COMPLETED, submittedAt },
    });
  }

  /**
   * Bulk-expires overdue feedback requests. Optional `userId` scope lets the
   * cron job sweep the whole platform while the lazy per-customer path only
   * touches a single user. Each transition notifies the customer and records
   * the FEEDBACK_EXPIRED audit action exactly once.
   */
  async expireOverdue(scope?: { userId?: string }) {
    const now = new Date();
    const where: any = {
      status: {
        in: [FeedbackRequestStatus.PENDING, FeedbackRequestStatus.OPENED],
      },
      expiresAt: { lt: now },
    };
    if (scope?.userId) where.submittedById = scope.userId;

    const stale = await (this.prisma as any).feedbackRequest.findMany({
      where,
      include: { ticket: { select: { ticketNumber: true } } },
      take: 200,
    });

    for (const requestRow of stale) {
      await this.markExpiredAndNotify(requestRow);
    }

    return stale.length;
  }

  /**
   * Sends reminder emails/in-app notifications for unopened requests older
   * than the reminder threshold. Optional `userId` scope for the lazy path.
   */
  async sendReminders(scope?: { userId?: string }) {
    const now = new Date();
    const where: any = {
      status: FeedbackRequestStatus.PENDING,
      reminderSentAt: null,
      sentAt: { lt: new Date(now.getTime() - REMINDER_MS) },
      expiresAt: { gt: now },
    };
    if (scope?.userId) where.submittedById = scope.userId;

    const stale = await (this.prisma as any).feedbackRequest.findMany({
      where,
      include: {
        ticket: { select: { ticketNumber: true } },
        submittedBy: { select: { firstName: true, email: true } },
      },
      take: 50,
    });

    for (const requestRow of stale) {
      const surveyUrl = this.buildSurveyUrl(requestRow.id, requestRow.token);
      await this.notificationService.notifyReminder({
        organizationId: requestRow.organizationId,
        userId: requestRow.submittedById,
        email: requestRow.submittedBy?.email ?? requestRow.email ?? '',
        firstName: requestRow.submittedBy?.firstName ?? '',
        ticketNumber: requestRow.ticket?.ticketNumber ?? '',
        surveyUrl,
      });
      await (this.prisma as any).feedbackRequest.update({
        where: { id: requestRow.id },
        data: { reminderSentAt: now },
      });
    }

    return stale.length;
  }

  private isTicketResolvable(ticket: any): boolean {
    if (!ticket) return false;
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') return true;
    return Boolean(ticket.resolvedAt || ticket.closedAt);
  }

  private async markExpiredAndNotify(requestRow: any) {
    await (this.prisma as any).feedbackRequest.update({
      where: { id: requestRow.id },
      data: { status: FeedbackRequestStatus.EXPIRED },
    });

    await this.notificationService.notifyExpired({
      organizationId: requestRow.organizationId,
      userId: requestRow.submittedById,
      ticketNumber: requestRow.ticket?.ticketNumber ?? '',
    });

    await this.auditLogService.record({
      organizationId: requestRow.organizationId,
      actorId: requestRow.submittedById,
      actorEmail: requestRow.email ?? '',
      action: AUDIT_ACTIONS.FEEDBACK_EXPIRED,
      entityType: 'FeedbackRequest',
      entityId: requestRow.id,
      metadata: { ticketNumber: requestRow.ticket?.ticketNumber ?? null },
    });
  }

  buildSurveyUrl(requestId: string, token: string): string {
    const base =
      this.configService.get<string>('frontend.url') ?? 'http://localhost:3000';
    return `${base}/feedback/${requestId}?token=${token}`;
  }
}
