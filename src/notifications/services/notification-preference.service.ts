import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationAccess } from '../enums/notification.enums';
import { NotificationPreferencesDto } from '../dto/notification-preferences.dto';
import type { Request } from 'express';

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(access: NotificationAccess) {
    const organizationId = access.organizationId;

    const where: any = { userId: access.userId };
    if (organizationId) where.organizationId = organizationId;

    const scoped = await (this.prisma as any).notificationSettings.findFirst({
      where,
    });
    const global = await (this.prisma as any).notificationSettings.findFirst({
      where: { userId: access.userId, organizationId: null },
    });

    const settings = scoped ?? global;

    const overrides = await (
      this.prisma as any
    ).notificationPreference.findMany({
      where: organizationId
        ? { userId: access.userId, organizationId }
        : { userId: access.userId },
    });

    const overrideMap: Record<string, boolean> = {};
    for (const o of overrides) {
      overrideMap[`${o.type}:${o.channel}`] = o.enabled;
    }

    return {
      enableEmail: settings?.enableEmail ?? true,
      enableInApp: settings?.enableInApp ?? true,
      enableRealtime: settings?.enableRealtime ?? true,
      enableTicketUpdates: settings?.enableTicketUpdates ?? true,
      enableFeedbackNotifications:
        settings?.enableFeedbackNotifications ?? true,
      enableMarketingEmails: settings?.enableMarketingEmails ?? false,
      enableSecurityAlerts: settings?.enableSecurityAlerts ?? true,
      quietHoursStart: settings?.quietHoursStart ?? null,
      quietHoursEnd: settings?.quietHoursEnd ?? null,
      language: settings?.language ?? 'en',
      timezone: settings?.timezone ?? 'UTC',
      overrides: overrideMap,
    };
  }

  async updatePreferences(
    access: NotificationAccess,
    dto: NotificationPreferencesDto,
    _request: Request,
  ) {
    const organizationId = access.organizationId;

    const where: any = { userId: access.userId };
    if (organizationId) where.organizationId = organizationId;

    const existing = await (this.prisma as any).notificationSettings.findFirst({
      where,
    });

    const data: Record<string, unknown> = {
      enableEmail: dto.enableEmail,
      enableInApp: dto.enableInApp,
      enableRealtime: dto.enableRealtime,
      enableTicketUpdates: dto.enableTicketUpdates,
      enableFeedbackNotifications: dto.enableFeedbackNotifications,
      enableMarketingEmails: dto.enableMarketingEmails,
      enableSecurityAlerts: dto.enableSecurityAlerts,
      quietHoursStart: dto.quietHoursStart ?? null,
      quietHoursEnd: dto.quietHoursEnd ?? null,
      language: dto.language,
      timezone: dto.timezone,
    };

    // Only persist fields the caller actually supplied.
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );

    if (existing) {
      await (this.prisma as any).notificationSettings.update({
        where: { id: existing.id },
        data: cleanData,
      });
    } else {
      await (this.prisma as any).notificationSettings.create({
        data: {
          userId: access.userId,
          organizationId: organizationId ?? null,
          ...cleanData,
        },
      });
    }

    if (dto.overrides?.length) {
      for (const override of dto.overrides) {
        await (this.prisma as any).notificationPreference.upsert({
          where: {
            userId_organizationId_type_channel: {
              userId: access.userId,
              organizationId: organizationId ?? null,
              type: override.type,
              channel: override.channel,
            },
          },
          create: {
            userId: access.userId,
            organizationId: organizationId ?? null,
            type: override.type,
            channel: override.channel,
            enabled: override.enabled,
          },
          update: { enabled: override.enabled },
        });
      }
    }

    return this.getPreferences(access);
  }
}
