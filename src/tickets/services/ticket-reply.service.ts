import {
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
import { TicketAccess } from '../types/ticket-access.type';
import { isStaff } from '../ticket-policy.util';
import { TicketReplyType } from '../enums/ticket.enums';
import { CreateReplyDto } from '../dto/create-reply.dto';
import { UpdateReplyDto } from '../dto/update-reply.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  TicketActivityService,
  TicketActivityTypeValue,
} from './ticket-activity.service';
import {
  TicketNotificationService,
  TicketNotificationType,
} from './ticket-notification.service';
import type { Request } from 'express';

@Injectable()
export class TicketReplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: TicketActivityService,
    private readonly notificationService: TicketNotificationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    access: TicketAccess,
    ticket: any,
    dto: CreateReplyDto,
    request: Request,
  ) {
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const isInternal = isStaff(access) && dto.isInternal === true;

    const replyType: TicketReplyType = access.isCustomer
      ? TicketReplyType.CUSTOMER
      : isInternal
        ? TicketReplyType.INTERNAL_NOTE
        : TicketReplyType.AGENT;

    let mentionIds: string[] = [];
    if (dto.mentions?.length) {
      if (!isStaff(access)) {
        throw new ForbiddenException('Only support agents can mention users');
      }
      const mentionedUsers = await (this.prisma as any).user.findMany({
        where: {
          id: { in: dto.mentions },
          organizationId: access.organizationId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      mentionIds = mentionedUsers.map((u: any) => u.id);
    }

    const reply = await (this.prisma as any).ticketReply.create({
      data: {
        organizationId: access.organizationId,
        ticketId: ticket.id,
        authorId: access.userId,
        body: dto.body,
        replyType,
        isInternal,
        mentions: mentionIds.length ? mentionIds : undefined,
      },
    });

    const updateData: any = { lastActivityAt: new Date() };
    if (!access.isCustomer && !ticket.firstRespondedAt) {
      updateData.firstRespondedAt = new Date();
    }

    await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data: updateData,
    });

    const activityType = access.isCustomer
      ? TicketActivityTypeValue.CUSTOMER_REPLY
      : isInternal
        ? TicketActivityTypeValue.NOTE_ADDED
        : TicketActivityTypeValue.REPLY_ADDED;

    await this.activityService.create({
      organizationId: access.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType,
      title: access.isCustomer
        ? 'Customer replied'
        : isInternal
          ? 'Internal note added'
          : 'Reply added',
      metadata: { replyId: reply.id },
    });

    const related = { relatedEntityType: 'Ticket', relatedEntityId: ticket.id };
    const data = {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      replyId: reply.id,
    };

    if (access.isCustomer) {
      const recipients: string[] = [];
      if (ticket.assignedToId) recipients.push(ticket.assignedToId);
      await this.notificationService.notifyStaff(
        access.organizationId,
        TicketNotificationType.TICKET_REPLIED,
        `New reply on ${ticket.ticketNumber}`,
        dto.body.slice(0, 200),
        data,
        related.relatedEntityType,
        related.relatedEntityId,
        { excludeUserId: access.userId },
      );
      if (recipients.length) {
        await this.notificationService.notifyUsers(
          recipients,
          access.organizationId,
          TicketNotificationType.TICKET_REPLIED,
          `Customer replied to ${ticket.ticketNumber}`,
          dto.body.slice(0, 200),
          data,
          related.relatedEntityType,
          related.relatedEntityId,
        );
      }
      await this.notificationService.notifyWatchers(
        ticket.id,
        access.organizationId,
        TicketNotificationType.TICKET_REPLIED,
        `Customer replied to ${ticket.ticketNumber}`,
        dto.body.slice(0, 200),
        data,
        related.relatedEntityType,
        related.relatedEntityId,
        { excludeUserId: access.userId },
      );
    } else {
      await this.notificationService.notifyUser(
        ticket.createdById,
        access.organizationId,
        TicketNotificationType.TICKET_REPLIED,
        `Reply on your ticket ${ticket.ticketNumber}`,
        dto.body.slice(0, 200),
        data,
        related.relatedEntityType,
        related.relatedEntityId,
      );
      if (!isInternal) {
        await this.notificationService.notifyWatchers(
          ticket.id,
          access.organizationId,
          TicketNotificationType.TICKET_REPLIED,
          `Reply added to ${ticket.ticketNumber}`,
          dto.body.slice(0, 200),
          data,
          related.relatedEntityType,
          related.relatedEntityId,
          { excludeUserId: access.userId },
        );
      }
      if (mentionIds.length) {
        await this.notificationService.notifyUsers(
          mentionIds,
          access.organizationId,
          TicketNotificationType.TICKET_MENTIONED,
          `You were mentioned on ${ticket.ticketNumber}`,
          dto.body.slice(0, 200),
          data,
          related.relatedEntityType,
          related.relatedEntityId,
        );
      }
    }

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'TicketReply',
      entityId: reply.id,
      metadata: { ticketId: ticket.id, isInternal },
      request,
    });

    return reply;
  }

  async list(
    access: TicketAccess,
    ticket: any,
    pagination: PaginationQueryDto,
  ) {
    const page = PaginationUtil.normalizePage(pagination.page);
    const limit = PaginationUtil.normalizeLimit(pagination.limit);

    const where: any = {
      ticketId: ticket.id,
      organizationId: access.organizationId,
    };

    if (access.isCustomer) {
      where.isInternal = false;
      where.replyType = { not: TicketReplyType.INTERNAL_NOTE };
    }

    const [items, total] = await Promise.all([
      (this.prisma as any).ticketReply.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              email: true,
            },
          },
          attachments: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              fileSize: true,
              publicUrl: true,
              isEvidence: true,
            },
          },
        },
      }),
      (this.prisma as any).ticketReply.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async update(
    access: TicketAccess,
    ticket: any,
    replyId: string,
    dto: UpdateReplyDto,
    request: Request,
  ) {
    const reply = await this.findOwnedReply(access, ticket, replyId);

    const canEdit = reply.authorId === access.userId || isStaff(access);
    if (!canEdit) {
      throw new ForbiddenException(
        'You do not have permission to edit this reply',
      );
    }

    const updated = await (this.prisma as any).ticketReply.update({
      where: { id: reply.id },
      data: { body: dto.body, editedAt: new Date() },
    });

    await this.activityService.create({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.REPLY_UPDATED,
      title: 'Reply updated',
      metadata: { replyId: reply.id },
    });

    await this.auditLogService.record({
      organizationId: ticket.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'TicketReply',
      entityId: reply.id,
      request,
    });

    return updated;
  }

  async remove(
    access: TicketAccess,
    ticket: any,
    replyId: string,
    request: Request,
  ) {
    const reply = await this.findOwnedReply(access, ticket, replyId);

    const canDelete = reply.authorId === access.userId || isStaff(access);
    if (!canDelete) {
      throw new ForbiddenException(
        'You do not have permission to delete this reply',
      );
    }

    await (this.prisma as any).ticketReply.delete({ where: { id: reply.id } });

    await this.activityService.create({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.REPLY_DELETED,
      title: 'Reply deleted',
      metadata: { replyId: reply.id },
    });

    await this.auditLogService.record({
      organizationId: ticket.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'TicketReply',
      entityId: reply.id,
      request,
    });

    return null;
  }

  private async findOwnedReply(
    access: TicketAccess,
    ticket: any,
    replyId: string,
  ) {
    const reply = await (this.prisma as any).ticketReply.findFirst({
      where: {
        id: replyId,
        ticketId: ticket.id,
        organizationId: access.organizationId,
      },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    return reply;
  }
}
