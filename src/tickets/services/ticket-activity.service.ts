import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketAccess } from '../types/ticket-access.type';

export enum TicketActivityTypeValue {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  PRIORITY_CHANGED = 'PRIORITY_CHANGED',
  ASSIGNED = 'ASSIGNED',
  UNASSIGNED = 'UNASSIGNED',
  REASSIGNED = 'REASSIGNED',
  REPLY_ADDED = 'REPLY_ADDED',
  NOTE_ADDED = 'NOTE_ADDED',
  ATTACHMENT_ADDED = 'ATTACHMENT_ADDED',
  TAG_ADDED = 'TAG_ADDED',
  TAG_REMOVED = 'TAG_REMOVED',
  WATCHER_ADDED = 'WATCHER_ADDED',
  WATCHER_REMOVED = 'WATCHER_REMOVED',
  CUSTOMER_REPLY = 'CUSTOMER_REPLY',
  REPLY_UPDATED = 'REPLY_UPDATED',
  REPLY_DELETED = 'REPLY_DELETED',
  ATTACHMENT_DELETED = 'ATTACHMENT_DELETED',
  TICKET_DELETED = 'TICKET_DELETED',
}

export interface CreateActivityParams {
  organizationId: string;
  ticketId: string;
  actorId?: string;
  activityType: TicketActivityTypeValue;
  title?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class TicketActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateActivityParams) {
    return (this.prisma as any).ticketActivity.create({
      data: {
        organizationId: params.organizationId,
        ticketId: params.ticketId,
        actorId: params.actorId ?? null,
        activityType: params.activityType,
        title: params.title ?? null,
        message: params.message ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  }

  async listForTicket(ticketId: string, access: TicketAccess) {
    const where: any = { ticketId };

    if (!access.isPlatformAdmin) {
      where.organizationId = access.organizationId;
    }

    if (access.isCustomer) {
      where.OR = [
        { activityType: { notIn: ['NOTE_ADDED'] } },
        { activityType: null },
      ];
    }

    return (this.prisma as any).ticketActivity.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        actor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
    });
  }
}
