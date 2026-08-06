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
import { TicketAccess } from '../types/ticket-access.type';
import { isStaff } from '../ticket-policy.util';
import {
  TicketActivityService,
  TicketActivityTypeValue,
} from './ticket-activity.service';
import type { Request } from 'express';

@Injectable()
export class TicketWatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: TicketActivityService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async add(access: TicketAccess, ticket: any, request: Request) {
    if (!isStaff(access)) {
      throw new ForbiddenException('Only support agents can watch tickets');
    }
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const watcher = await (this.prisma as any).ticketWatcher.upsert({
      where: {
        ticketId_userId: { ticketId: ticket.id, userId: access.userId },
      },
      update: {},
      create: {
        organizationId: access.organizationId,
        ticketId: ticket.id,
        userId: access.userId,
      },
    });

    await this.activityService.create({
      organizationId: access.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.WATCHER_ADDED,
      title: `${access.email} started watching this ticket`,
    });

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'TicketWatcher',
      entityId: watcher.id,
      request,
    });

    return { watched: true, watcher };
  }

  async remove(
    access: TicketAccess,
    ticket: any,
    watcherId: string,
    request: Request,
  ) {
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const watcher = await (this.prisma as any).ticketWatcher.findFirst({
      where: {
        id: watcherId,
        ticketId: ticket.id,
        organizationId: access.organizationId,
      },
    });

    if (!watcher) {
      throw new NotFoundException('Watcher not found');
    }

    const canRemove = watcher.userId === access.userId || isStaff(access);
    if (!canRemove) {
      throw new ForbiddenException(
        'You do not have permission to remove this watcher',
      );
    }

    await (this.prisma as any).ticketWatcher.delete({
      where: { id: watcher.id },
    });

    await this.activityService.create({
      organizationId: access.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.WATCHER_REMOVED,
      title: `${access.email} stopped watching this ticket`,
    });

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'TicketWatcher',
      entityId: watcher.id,
      request,
    });

    return null;
  }
}
