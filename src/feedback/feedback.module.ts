import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './services/feedback.service';
import { FeedbackFormService } from './services/feedback-form.service';
import { FeedbackResponseService } from './services/feedback-response.service';
import { FeedbackRequestService } from './services/feedback-request.service';
import { FeedbackRequestJobService } from './services/feedback-request-job.service';
import { FeedbackNotificationService } from './services/feedback-notification.service';
import { FeedbackAnalyticsService } from './services/feedback-analytics.service';
import { FeedbackDashboardService } from './services/feedback-dashboard.service';
import { FeedbackSearchService } from './services/feedback-search.service';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    AuditLogModule,
    EmailModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [FeedbackController],
  providers: [
    FeedbackService,
    FeedbackFormService,
    FeedbackResponseService,
    FeedbackRequestService,
    FeedbackRequestJobService,
    FeedbackNotificationService,
    FeedbackAnalyticsService,
    FeedbackDashboardService,
    FeedbackSearchService,
  ],
  exports: [FeedbackService, FeedbackRequestService],
})
export class FeedbackModule {}
