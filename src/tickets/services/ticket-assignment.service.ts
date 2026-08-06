import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { TicketAccess } from '../types/ticket-access.type';
import { isStaff } from '../ticket-policy.util';
import { AssignTicketDto } from '../dto/assign-ticket.dto';
import { ReassignTicketDto } from '../dto/reassign-ticket.dto';
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
export class TicketAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: TicketActivityService,
    private readonly notificationService: TicketNotificationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async assign(
    access: TicketAccess,
    ticket: any,
    dto: AssignTicketDto,
    request: Request,
  ) {
    if (!isStaff(access)) {
      throw new ForbiddenException('Only support agents can assign tickets');
    }
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const assigneeId =
      dto.assigneeId === null ? null : (dto.assigneeId ?? access.userId);

    if (assigneeId === null) {
      return this.unassign(access, ticket, request);
    }

    const assignee = await this.validateAssignee(
      access.organizationId,
      assigneeId,
    );

    const isReassign =
      !!ticket.assignedToId && ticket.assignedToId !== assigneeId;
    const wasAssignedToSelf = ticket.assignedToId === access.userId;

    const updated = await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data: { assignedToId: assignee.id, lastActivityAt: new Date() },
    });

    await this.activityService.create({
      organizationId: access.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: isReassign
        ? TicketActivityTypeValue.REASSIGNED
        : TicketActivityTypeValue.ASSIGNED,
      title: isReassign
        ? `Ticket reassigned to ${assignee.firstName} ${assignee.lastName}`
        : `Ticket assigned to ${assignee.firstName} ${assignee.lastName}`,
      metadata: { from: ticket.assignedToId ?? null, to: assignee.id },
    });

    if (!wasAssignedToSelf) {
      await this.notificationService.notifyUser(
        assignee.id,
        access.organizationId,
        TicketNotificationType.TICKET_ASSIGNED,
        `Ticket ${ticket.ticketNumber} assigned to you`,
        ticket.subject.slice(0, 200),
        { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
        'Ticket',
        ticket.id,
      );
    }

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: {
        action: isReassign ? 'REASSIGNED' : 'ASSIGNED',
        from: ticket.assignedToId ?? null,
        to: assignee.id,
      },
      request,
    });

    return updated;
  }

  async reassign(
    access: TicketAccess,
    ticket: any,
    dto: ReassignTicketDto,
    request: Request,
  ) {
    if (!isStaff(access)) {
      throw new ForbiddenException('Only support agents can reassign tickets');
    }
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const assignee = await this.validateAssignee(
      access.organizationId,
      dto.assigneeId,
    );

    const updated = await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data: { assignedToId: assignee.id, lastActivityAt: new Date() },
    });

    await this.activityService.create({
      organizationId: access.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.REASSIGNED,
      title: `Ticket reassigned to ${assignee.firstName} ${assignee.lastName}`,
      metadata: { from: ticket.assignedToId ?? null, to: assignee.id },
    });

    if (assignee.id !== access.userId) {
      await this.notificationService.notifyUser(
        assignee.id,
        access.organizationId,
        TicketNotificationType.TICKET_ASSIGNED,
        `Ticket ${ticket.ticketNumber} assigned to you`,
        ticket.subject.slice(0, 200),
        { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
        'Ticket',
        ticket.id,
      );
    }

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: {
        action: 'REASSIGNED',
        from: ticket.assignedToId ?? null,
        to: assignee.id,
      },
      request,
    });

    return updated;
  }

  private async unassign(access: TicketAccess, ticket: any, request: Request) {
    const updated = await (this.prisma as any).ticket.update({
      where: { id: ticket.id },
      data: { assignedToId: null, lastActivityAt: new Date() },
    });

    await this.activityService.create({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.UNASSIGNED,
      title: 'Ticket unassigned',
      metadata: { from: ticket.assignedToId ?? null },
    });

    await this.auditLogService.record({
      organizationId: ticket.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: { action: 'UNASSIGNED' },
      request,
    });

    return updated;
  }

  private async validateAssignee(organizationId: string, userId: string) {
    const assignee = await (this.prisma as any).user.findFirst({
      where: {
        id: userId,
        organizationId,
        status: 'ACTIVE',
        role: { in: ['TENANT_OWNER', 'SUPPORT_AGENT'] },
      },
    });

    if (!assignee) {
      throw new BadRequestException(
        'Assignee must be an active agent or owner in this organization',
      );
    }

    return assignee;
  }
}
