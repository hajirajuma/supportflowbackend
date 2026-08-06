import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FeedbackRequestService } from './feedback-request.service';

/**
 * Drives the automatic feedback-request lifecycle regardless of customer
 * activity: marks overdue surveys as expired (with notification + audit) and
 * sends lazy reminders for unopened requests. Runs on a fixed schedule.
 */
@Injectable()
export class FeedbackRequestJobService {
  private readonly logger = new Logger(FeedbackRequestJobService.name);

  constructor(private readonly requestService: FeedbackRequestService) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'feedback-request-lifecycle' })
  async handleFeedbackRequestLifecycle() {
    try {
      const expired = await this.requestService.expireOverdue();
      const reminded = await this.requestService.sendReminders();
      if (expired > 0 || reminded > 0) {
        this.logger.log(
          `Feedback lifecycle: ${expired} expired, ${reminded} reminded`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Feedback lifecycle job failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
