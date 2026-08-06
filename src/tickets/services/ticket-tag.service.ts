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
import { AssignTagDto } from '../dto/assign-tag.dto';
import {
  TicketActivityService,
  TicketActivityTypeValue,
} from './ticket-activity.service';
import type { Request } from 'express';

@Injectable()
export class TicketTagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: TicketActivityService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async add(
    access: TicketAccess,
    ticket: any,
    dto: AssignTagDto,
    request: Request,
  ) {
    if (!isStaff(access)) {
      throw new ForbiddenException('Only support agents can manage tags');
    }
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    let tag;

    if (dto.tagId) {
      tag = await (this.prisma as any).tag.findFirst({
        where: { id: dto.tagId, organizationId: access.organizationId },
      });
      if (!tag) {
        throw new NotFoundException('Tag not found');
      }
    } else if (dto.name) {
      tag = await (this.prisma as any).tag.upsert({
        where: {
          organizationId_name: {
            organizationId: access.organizationId,
            name: dto.name,
          },
        },
        update: {},
        create: {
          organizationId: access.organizationId,
          name: dto.name,
          color: dto.color ?? '#64748b',
        },
      });
    } else {
      throw new ForbiddenException('Provide a tagId or a tag name');
    }

    const ticketTag = await (this.prisma as any).ticketTag.upsert({
      where: { ticketId_tagId: { ticketId: ticket.id, tagId: tag.id } },
      update: {},
      create: {
        organizationId: access.organizationId,
        ticketId: ticket.id,
        tagId: tag.id,
      },
    });

    await this.activityService.create({
      organizationId: access.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.TAG_ADDED,
      title: `Tag "${tag.name}" added`,
      metadata: { tagId: tag.id, tagName: tag.name },
    });

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'TicketTag',
      entityId: ticketTag.id,
      metadata: { tagId: tag.id, tagName: tag.name },
      request,
    });

    return tag;
  }

  async remove(
    access: TicketAccess,
    ticket: any,
    tagId: string,
    request: Request,
  ) {
    if (!isStaff(access)) {
      throw new ForbiddenException('Only support agents can manage tags');
    }
    if (!access.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const ticketTag = await (this.prisma as any).ticketTag.findFirst({
      where: {
        tagId,
        ticketId: ticket.id,
        organizationId: access.organizationId,
      },
      include: { tag: true },
    });

    if (!ticketTag) {
      throw new NotFoundException('Tag not found on this ticket');
    }

    await (this.prisma as any).ticketTag.delete({
      where: { id: ticketTag.id },
    });

    await this.activityService.create({
      organizationId: access.organizationId,
      ticketId: ticket.id,
      actorId: access.userId,
      activityType: TicketActivityTypeValue.TAG_REMOVED,
      title: `Tag "${ticketTag.tag.name}" removed`,
      metadata: { tagId, tagName: ticketTag.tag.name },
    });

    await this.auditLogService.record({
      organizationId: access.organizationId,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'TicketTag',
      entityId: ticketTag.id,
      request,
    });

    return null;
  }
}
