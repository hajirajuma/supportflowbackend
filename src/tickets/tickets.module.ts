import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TicketsController } from './tickets.controller';
import { TicketService } from './services/ticket.service';
import { SlaService } from './services/sla.service';
import { TicketActivityService } from './services/ticket-activity.service';
import { TicketNotificationService } from './services/ticket-notification.service';
import { TicketReplyService } from './services/ticket-reply.service';
import { TicketAttachmentService } from './services/ticket-attachment.service';
import { TicketWatcherService } from './services/ticket-watcher.service';
import { TicketTagService } from './services/ticket-tag.service';
import { TicketAssignmentService } from './services/ticket-assignment.service';
import { TicketSearchService } from './services/ticket-search.service';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    AuditLogModule,
    FeedbackModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [TicketsController],
  providers: [
    TicketService,
    SlaService,
    TicketActivityService,
    TicketNotificationService,
    TicketReplyService,
    TicketAttachmentService,
    TicketWatcherService,
    TicketTagService,
    TicketAssignmentService,
    TicketSearchService,
  ],
  exports: [TicketService],
})
export class TicketsModule {}
