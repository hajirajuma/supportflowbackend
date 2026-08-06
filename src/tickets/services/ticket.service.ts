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
import { TicketAccess } from '../types/ticket-access.type';
import { assertTicketAccess, isStaff } from '../ticket-policy.util';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { UpdateTicketDto } from '../dto/update-ticket.dto';
import { UpdateStatusDto } from '../dto/update-status.dto';
import { UpdatePriorityDto } from '../dto/update-priority.dto';
import {
  ALLOWED_TICKET_STATUS_TRANSITIONS,
  TicketPriority,
  TicketStatus,
} from '../enums/ticket.enums';
import { SlaService } from './sla.service';
import {
  TicketActivityService,
  TicketActivityTypeValue,
} from './ticket-activity.service';
import {
  TicketNotificationService,
  TicketNotificationType,
} from './ticket-notification.service';
import { FeedbackRequestService } from '../../feedback/services/feedback-request.service';
import { FeatureGateService } from '../../subscriptions/services/feature-gate.service';
import type { Request } from 'express';

@Injectable()
export class TicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slaService: SlaService,
    private readonly activityService: TicketActivityService,
    private readonly notificationService: TicketNotificationService,
    private readonly auditLogService: AuditLogService,
    private readonly feedbackRequestService: FeedbackRequestService,
    private readonly featureGateService: FeatureGateService,
  ) {}

  async create(access: TicketAccess, dto: CreateTicketDto, request: Request) {
    if (!access.organizationId) {
      throw new ForbiddenException(
        'Organization context is required to create a ticket',
      );
    }

    // Enforce the organization's plan: feature entitlement + ticket limit.
    await this.featureGateService.assertCanCreateTicket(access.organizationId);

    let createdById = access.userId;
    if (dto.customerId && isStaff(access)) {
      const customer = await (this.prisma as any).user.findFirst({
        where: { id: dto.customerId, organizationId: access.organizationId },
      });
      if (!customer) {
        throw new BadRequestException(
          'Customer not found in this organization',
        );
      }
      createdById = customer.id;
    }

    const priority = dto.priority ?? TicketPriority.MEDIUM;
    const sla = this.slaService.computeDeadlines(priority);
    const ticketNumber = await this.generateTicketNumber(access.organizationId);

    const ticket = await (this.prisma as any).ticket.create({
      data: {
        organizationId: access.organizationId,
        ticketNumber,
        subject: dto.subject,
        description: dto.description,
        status: TicketStatus.OPEN,
        priority,
        source: 'PORTAL',
        categoryId: dto.categoryId ?? null,
        departmentId: dto.departmentId ?? null,
        createdById,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        firstResponseDueAt: sla.firstResponseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
      },
    });

    if (dto.tagIds?.length) {
      await this.syncTags(access, ticket.id, dto.tagIds);
    }

    await this.activityService.create({
      organizationId: access.organizationId,
      ticketId: ticket.id,
      actorId: createdById,
      activityType: TicketActivityTypeValue.CREATED,
      title: `Ticket ${ticketNumber} created`,
      metadata: { subject: dto.subject },
    });

    await this.notificationService.notifyStaff(
      access.organizationId,
      TicketNotificationType.TICKET_UPDATED,
      `New ticket ${ticketNumber}`,
      dto.subject,
      { ticketId: ticket.id, ticketNumber },
      'Ticket',
      ticket.id,
      { excludeUserId: access.userId },
    );

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: { ticketNumber },
      request,
    });

    return this.getOne(access, ticket.id);
  }

  async getOne(access: TicketAccess, ticketId: string) {
    const ticket = await (this.prisma as any).ticket.findUnique({
      where: { id: ticketId },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        category: {
          select: { id: true, name: true, color: true, description: true },
        },
        department: { select: { id: true, name: true, description: true } },
        ticketTags: {
          select: { tag: { select: { id: true, name: true, color: true } } },
        },
        watchers: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
        attachments: {
          where: { replyId: null },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            fileSize: true,
            publicUrl: true,
            isEvidence: true,
            uploadedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            createdAt: true,
          },
        },
      },
    });

    assertTicketAccess(ticket, access);

    const [sla, activities] = await Promise.all([
      Promise.resolve(this.slaService.getSla(ticket)),
      this.activityService.listForTicket(ticket.id, access),
    ]);

    return {
      ...ticket,
      sla,
      activities,
      tags: ticket.ticketTags.map((tt: any) => tt.tag),
      attachments: ticket.attachments,
    };
  }

  async update(
    access: TicketAccess,
    ticketId: string,
    dto: UpdateTicketDto,
    request: Request,
  ) {
    const ticket = await this.getAccessibleTicket(access, ticketId);

    if (access.isCustomer) {
      assertTicketAccess(ticket, access);
    } else if (!isStaff(access)) {
      throw new ForbiddenException(
        'You do not have permission to update this ticket',
      );
    }

    const data: Record<string, unknown> = {};
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.description !== undefined) data.description = dto.description;

    if (isStaff(access)) {
      if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
      if (dto.departmentId !== undefined) data.departmentId = dto.departmentId;
      if (dto.dueAt !== undefined)
        data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    }

    data.lastActivityAt = new Date();

    await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data,
    });

    if (dto.tagIds && isStaff(access)) {
      await this.syncTags(access, ticket.id, dto.tagIds);
    }

    await this.activityService.create({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.UPDATED,
      title: 'Ticket updated',
      metadata: { updatedFields: Object.keys(dto) },
    });

    await this.auditLogService.record({
      organizationId: ticket.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: { updatedFields: Object.keys(dto) },
      request,
    });

    return this.getOne(access, ticket.id);
  }

  async remove(access: TicketAccess, ticketId: string, request: Request) {
    if (!isStaff(access)) {
      throw new ForbiddenException('Only support agents can delete tickets');
    }

    const ticket = await this.getAccessibleTicket(access, ticketId);

    await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data: { deletedAt: new Date() },
    });

    await this.activityService.create({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.TICKET_DELETED,
      title: 'Ticket deleted',
    });

    await this.auditLogService.record({
      organizationId: ticket.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'Ticket',
      entityId: ticket.id,
      request,
    });

    return null;
  }

  async changeStatus(
    access: TicketAccess,
    ticketId: string,
    dto: UpdateStatusDto,
    request: Request,
  ) {
    assertIsStaffForAction(access);
    const ticket = await this.getAccessibleTicket(access, ticketId);

    if (dto.status === ticket.status) {
      throw new BadRequestException(`Ticket is already ${dto.status}`);
    }

    const allowed =
      ALLOWED_TICKET_STATUS_TRANSITIONS[ticket.status as TicketStatus] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition from ${ticket.status} to ${dto.status}`,
      );
    }

    const data: Record<string, unknown> = {
      status: dto.status,
      lastActivityAt: new Date(),
    };

    if (dto.status === TicketStatus.RESOLVED) {
      data.resolvedAt = ticket.resolvedAt ?? new Date();
    }
    if (dto.status === TicketStatus.CLOSED) {
      data.closedAt = ticket.closedAt ?? new Date();
    }
    if (dto.status === TicketStatus.REOPENED) {
      data.resolvedAt = null;
      data.closedAt = null;
    }

    const updated = await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data,
    });

    await this.activityService.create({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.STATUS_CHANGED,
      title: `Status changed to ${dto.status}`,
      message: dto.message,
      metadata: { from: ticket.status, to: dto.status },
    });

    const isResolution =
      dto.status === TicketStatus.RESOLVED ||
      dto.status === TicketStatus.CLOSED;

    await this.notificationService.notifyUser(
      ticket.createdById,
      ticket.organizationId,
      isResolution
        ? TicketNotificationType.TICKET_RESOLVED
        : TicketNotificationType.TICKET_UPDATED,
      `Ticket ${ticket.ticketNumber} is now ${dto.status}`,
      dto.message,
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: dto.status,
      },
      'Ticket',
      ticket.id,
    );
    await this.notificationService.notifyWatchers(
      ticket.id,
      ticket.organizationId,
      isResolution
        ? TicketNotificationType.TICKET_RESOLVED
        : TicketNotificationType.TICKET_UPDATED,
      `Ticket ${ticket.ticketNumber} is now ${dto.status}`,
      dto.message,
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: dto.status,
      },
      'Ticket',
      ticket.id,
      { excludeUserId: access.userId },
    );

    await this.auditLogService.record({
      organizationId: ticket.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: {
        action: 'STATUS_CHANGED',
        from: ticket.status,
        to: dto.status,
      },
      request,
    });

    await this.triggerFeedbackRequestOnResolution(updated, dto.status);

    return updated;
  }

  async changePriority(
    access: TicketAccess,
    ticketId: string,
    dto: UpdatePriorityDto,
    request: Request,
  ) {
    assertIsStaffForAction(access);
    const ticket = await this.getAccessibleTicket(access, ticketId);

    if (dto.priority === ticket.priority) {
      throw new BadRequestException(`Priority is already ${dto.priority}`);
    }

    const updated = await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data: { priority: dto.priority, lastActivityAt: new Date() },
    });

    await this.activityService.create({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.PRIORITY_CHANGED,
      title: `Priority changed to ${dto.priority}`,
      metadata: { from: ticket.priority, to: dto.priority },
    });

    await this.auditLogService.record({
      organizationId: ticket.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: {
        action: 'PRIORITY_CHANGED',
        from: ticket.priority,
        to: dto.priority,
      },
      request,
    });

    return updated;
  }

  async close(access: TicketAccess, ticketId: string, request: Request) {
    assertIsStaffForAction(access);
    const ticket = await this.getAccessibleTicket(access, ticketId);

    const updated = await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.CLOSED,
        closedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    await this.activityService.create({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.STATUS_CHANGED,
      title: 'Ticket closed',
      metadata: { from: ticket.status, to: TicketStatus.CLOSED },
    });

    await this.notificationService.notifyUser(
      ticket.createdById,
      ticket.organizationId,
      TicketNotificationType.TICKET_RESOLVED,
      `Ticket ${ticket.ticketNumber} has been closed`,
      ticket.subject.slice(0, 200),
      { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
      'Ticket',
      ticket.id,
    );

    await this.auditLogService.record({
      organizationId: ticket.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: { action: 'CLOSE' },
      request,
    });

    await this.triggerFeedbackRequestOnResolution(updated, TicketStatus.CLOSED);

    return updated;
  }

  async reopen(access: TicketAccess, ticketId: string, request: Request) {
    assertIsStaffForAction(access);
    const ticket = await this.getAccessibleTicket(access, ticketId);

    const updated = await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.REOPENED,
        resolvedAt: null,
        closedAt: null,
        lastActivityAt: new Date(),
      },
    });

    await this.activityService.create({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.STATUS_CHANGED,
      title: 'Ticket reopened',
      metadata: { from: ticket.status, to: TicketStatus.REOPENED },
    });

    await this.notificationService.notifyUser(
      ticket.createdById,
      ticket.organizationId,
      TicketNotificationType.TICKET_UPDATED,
      `Ticket ${ticket.ticketNumber} has been reopened`,
      ticket.subject.slice(0, 200),
      { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
      'Ticket',
      ticket.id,
    );

    await this.auditLogService.record({
      organizationId: ticket.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: { action: 'REOPEN' },
      request,
    });

    return updated;
  }

  /**
   * Loads a ticket and enforces view access. Used by sub-resource services
   * (replies, attachments, watchers, tags, assignment).
   */
  async getAccessibleTicket(access: TicketAccess, ticketId: string) {
    const ticket = await (this.prisma as any).ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || ticket.deletedAt) {
      throw new NotFoundException('Ticket not found');
    }

    assertTicketAccess(ticket, access);

    return ticket;
  }

  /**
   * Resolves the ticket that owns a reply and enforces access on it.
   */
  async getTicketForReply(access: TicketAccess, replyId: string) {
    const reply = await (this.prisma as any).ticketReply.findFirst({
      where: access.organizationId
        ? { id: replyId, organizationId: access.organizationId }
        : { id: replyId },
      select: { ticketId: true },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    return this.getAccessibleTicket(access, reply.ticketId);
  }

  /**
   * Resolves the ticket that owns an attachment and enforces access on it.
   */
  async getTicketForAttachment(access: TicketAccess, attachmentId: string) {
    const attachment = await (this.prisma as any).ticketAttachment.findFirst({
      where: access.organizationId
        ? { id: attachmentId, organizationId: access.organizationId }
        : { id: attachmentId },
      select: { ticketId: true },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return this.getAccessibleTicket(access, attachment.ticketId);
  }

  private async syncTags(
    access: TicketAccess,
    ticketId: string,
    tagIds: string[],
  ) {
    const orgId = access.organizationId!;
    const tags = await (this.prisma as any).tag.findMany({
      where: { id: { in: tagIds }, organizationId: orgId },
      select: { id: true },
    });

    const validIds = tags.map((t: any) => t.id);

    await (this.prisma as any).ticketTag.deleteMany({
      where: { ticketId },
    });

    if (validIds.length) {
      await (this.prisma as any).ticketTag.createMany({
        data: validIds.map((tagId: string) => ({
          organizationId: orgId,
          ticketId,
          tagId,
        })),
      });
    }
  }

  private async generateTicketNumber(organizationId: string): Promise<string> {
    const count = await (this.prisma as any).ticket.count({
      where: { organizationId },
    });

    let seq = count + 1;
    let ticketNumber = `SF-${seq}`;

    let existing = await (this.prisma as any).ticket.findUnique({
      where: {
        organizationId_ticketNumber: { organizationId, ticketNumber },
      },
    });

    while (existing) {
      seq += 1;
      ticketNumber = `SF-${seq}`;
      existing = await (this.prisma as any).ticket.findUnique({
        where: {
          organizationId_ticketNumber: { organizationId, ticketNumber },
        },
      });
    }

    return ticketNumber;
  }

  /**
   * Generates the automatic post-resolution feedback request. Best-effort:
   * failures here must never break the ticket status transition.
   */
  private async triggerFeedbackRequestOnResolution(
    ticket: any,
    status: TicketStatus,
  ) {
    if (status !== TicketStatus.RESOLVED && status !== TicketStatus.CLOSED) {
      return;
    }
    try {
      await this.feedbackRequestService.generateForTicket(ticket);
    } catch {
      // Swallow feedback-generation errors so ticket workflows stay resilient.
    }
  }
}

function assertIsStaffForAction(access: TicketAccess) {
  if (!isStaff(access)) {
    throw new ForbiddenException(
      'Only support agents or tenant owners can perform this action',
    );
  }
}
