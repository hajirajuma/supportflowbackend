import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsController } from './subscriptions.controller';
import { PaymentsController } from './payments.controller';
import { SubscriptionAccessGuard } from './guards/subscription-access.guard';
import { PayChanguService } from './services/paychangu.service';
import { PayChanguProvider } from './providers/paychangu.provider';
import { PaymentProviderFactory } from './providers/payment-provider.factory';
import { PlanService } from './services/plan.service';
import { TrialService } from './services/trial.service';
import { SubscriptionService } from './services/subscription.service';
import { PaymentService } from './services/payment.service';
import { WebhookService } from './services/webhook.service';
import { InvoiceService } from './services/invoice.service';
import { UsageTrackingService } from './services/usage-tracking.service';
import { FeatureGateService } from './services/feature-gate.service';
import { BillingEmailService } from './services/billing-email.service';

@Module({
  imports: [PrismaModule, AuditLogModule, NotificationsModule],
  controllers: [SubscriptionsController, PaymentsController],
  providers: [
    SubscriptionAccessGuard,
    PayChanguService,
    PayChanguProvider,
    PaymentProviderFactory,
    PlanService,
    TrialService,
    SubscriptionService,
    PaymentService,
    WebhookService,
    InvoiceService,
    UsageTrackingService,
    FeatureGateService,
    BillingEmailService,
  ],
  exports: [
    FeatureGateService,
    UsageTrackingService,
    PlanService,
    SubscriptionService,
    PaymentService,
    InvoiceService,
  ],
})
export class SubscriptionsModule {}
