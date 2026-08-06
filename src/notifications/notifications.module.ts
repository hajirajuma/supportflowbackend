import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationAccessGuard } from './guards/notification-access.guard';
import { NotificationService } from './services/notification.service';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationTemplateService } from './services/notification-template.service';
import { AnnouncementService } from './services/announcement.service';
import { EmailNotificationService } from './services/email-notification.service';
import { RealtimeNotificationService } from './services/realtime-notification.service';
import { NotificationSchedulerService } from './services/notification-scheduler.service';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    AuditLogModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn') ?? '15m',
        } as any,
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsGateway,
    NotificationAccessGuard,
    NotificationService,
    NotificationPreferenceService,
    NotificationTemplateService,
    AnnouncementService,
    EmailNotificationService,
    RealtimeNotificationService,
    NotificationSchedulerService,
  ],
  exports: [
    NotificationService,
    RealtimeNotificationService,
    EmailNotificationService,
    NotificationTemplateService,
  ],
})
export class NotificationsModule {}
