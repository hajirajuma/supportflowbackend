import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';

export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  ROLE_CHANGE: 'ROLE_CHANGE',
  INVITATION_SENT: 'INVITATION_SENT',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  SUBSCRIPTION_CHANGE: 'SUBSCRIPTION_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  TICKET_UPDATE: 'TICKET_UPDATE',
  ORGANIZATION_UPDATE: 'ORGANIZATION_UPDATE',
  API_KEY_CREATED: 'API_KEY_CREATED',
  API_KEY_REVOKED: 'API_KEY_REVOKED',
  PROFILE_UPDATE: 'PROFILE_UPDATE',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  AVATAR_UPDATE: 'AVATAR_UPDATE',
  NOTIFICATION_READ: 'NOTIFICATION_READ',
  NOTIFICATION_DELETED: 'NOTIFICATION_DELETED',
  NOTIFICATION_ARCHIVED: 'NOTIFICATION_ARCHIVED',
  NOTIFICATION_RESTORED: 'NOTIFICATION_RESTORED',
  NOTIFICATION_CREATED: 'NOTIFICATION_CREATED',
  EMAIL_SENT: 'EMAIL_SENT',
  EMAIL_FAILED: 'EMAIL_FAILED',
  BROADCAST_SENT: 'BROADCAST_SENT',
  ANNOUNCEMENT_PUBLISHED: 'ANNOUNCEMENT_PUBLISHED',
  FEEDBACK_REQUEST_CREATED: 'FEEDBACK_REQUEST_CREATED',
  FEEDBACK_SUBMITTED: 'FEEDBACK_SUBMITTED',
  FEEDBACK_UPDATED: 'FEEDBACK_UPDATED',
  FEEDBACK_EXPIRED: 'FEEDBACK_EXPIRED',
  FEEDBACK_VIEWED: 'FEEDBACK_VIEWED',
  PLAN_CREATED: 'PLAN_CREATED',
  PLAN_UPDATED: 'PLAN_UPDATED',
  SUBSCRIPTION_CREATED: 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_CHANGED: 'SUBSCRIPTION_CHANGED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',
  INVOICE_GENERATED: 'INVOICE_GENERATED',
  USAGE_LIMIT_REACHED: 'USAGE_LIMIT_REACHED',
} as const;

export type AuditActionValue =
  (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditLogRecordParams {
  organizationId?: string;
  actorId?: string;
  actorEmail?: string;
  actorName?: string;
  action: AuditActionValue;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  request?: Request;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: AuditLogRecordParams): Promise<void> {
    const ipAddress =
      params.request?.ip ??
      (params.request?.headers?.['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim();
    const userAgent = params.request?.headers?.['user-agent'];

    await (this.prisma as any).auditLog.create({
      data: {
        organizationId: params.organizationId ?? null,
        actorId: params.actorId ?? null,
        actorEmail: params.actorEmail ?? null,
        actorName: params.actorName ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  }
}
