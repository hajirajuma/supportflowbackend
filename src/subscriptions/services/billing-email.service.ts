import { Injectable } from '@nestjs/common';
import { EmailNotificationService } from '../../notifications/services/email-notification.service';

interface EmailRecipient {
  organizationId?: string | null;
  to: string;
  firstName: string;
  actorId?: string;
}

interface PlanInfo {
  name: string;
  code: string;
  amount: number;
  currency: string;
  interval: 'MONTHLY' | 'YEARLY';
}

/**
 * Builds and sends subscription/billing emails through the shared, brandable
 * EmailNotificationService (which routes through Brevo + EMAIL_SENT audit).
 */
@Injectable()
export class BillingEmailService {
  constructor(private readonly emailService: EmailNotificationService) {}

  async paymentReceipt(
    recipient: EmailRecipient,
    plan: PlanInfo,
    payment: {
      reference: string;
      receiptNumber?: string | null;
      paidAt?: Date | null;
    },
  ) {
    return this.emailService.sendByParams({
      organizationId: recipient.organizationId,
      to: recipient.to,
      firstName: recipient.firstName,
      actorId: recipient.actorId,
      type: 'payment_receipt',
      subject: `Payment receipt — ${plan.name} (${plan.currency} ${plan.amount})`,
      html: `
        <h2 style="color:#111827;margin:0 0 8px;">Payment received</h2>
        <p>Thank you! Your payment has been processed successfully.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td style="padding:8px 0;color:#6b7280;">Plan</td><td style="padding:8px 0;text-align:right;font-weight:600;">${plan.name}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Amount</td><td style="padding:8px 0;text-align:right;font-weight:600;">${plan.currency} ${plan.amount}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Billing period</td><td style="padding:8px 0;text-align:right;">${plan.interval === 'MONTHLY' ? 'Monthly' : 'Yearly'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Reference</td><td style="padding:8px 0;text-align:right;">${payment.reference}</td></tr>
          ${payment.receiptNumber ? `<tr><td style="padding:8px 0;color:#6b7280;">Receipt No.</td><td style="padding:8px 0;text-align:right;">${payment.receiptNumber}</td></tr>` : ''}
        </table>
      `,
    });
  }

  async invoiceEmail(
    recipient: EmailRecipient,
    plan: PlanInfo,
    invoice: {
      invoiceNumber: string;
      tax: number;
      total: number;
      status: string;
      receiptReference?: string | null;
    },
  ) {
    return this.emailService.sendByParams({
      organizationId: recipient.organizationId,
      to: recipient.to,
      firstName: recipient.firstName,
      actorId: recipient.actorId,
      type: 'invoice',
      subject: `Invoice ${invoice.invoiceNumber} — ${plan.name}`,
      html: `
        <h2 style="color:#111827;margin:0 0 8px;">Invoice ${invoice.invoiceNumber}</h2>
        <p>Please find the invoice for your recent subscription activity below.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td style="padding:8px 0;color:#6b7280;">Plan</td><td style="padding:8px 0;text-align:right;font-weight:600;">${plan.name}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Subtotal</td><td style="padding:8px 0;text-align:right;">${plan.currency} ${plan.amount}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Tax</td><td style="padding:8px 0;text-align:right;">${plan.currency} ${invoice.tax}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Total</td><td style="padding:8px 0;text-align:right;font-weight:700;">${plan.currency} ${invoice.total}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Status</td><td style="padding:8px 0;text-align:right;">${invoice.status}</td></tr>
          ${invoice.receiptReference ? `<tr><td style="padding:8px 0;color:#6b7280;">Receipt ref.</td><td style="padding:8px 0;text-align:right;">${invoice.receiptReference}</td></tr>` : ''}
        </table>
      `,
    });
  }

  async trialReminder(
    recipient: EmailRecipient,
    daysLeft: number,
    planName: string,
  ) {
    return this.emailService.sendByParams({
      organizationId: recipient.organizationId,
      to: recipient.to,
      firstName: recipient.firstName,
      actorId: recipient.actorId,
      type: 'trial_reminder',
      subject: `Your ${planName} free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      html: `
        <h2 style="color:#111827;margin:0 0 8px;">Trial ending soon</h2>
        <p>Your <strong>${planName}</strong> free trial expires in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>. Upgrade to keep your workspace active without interruption.</p>
      `,
    });
  }

  async trialExpiration(recipient: EmailRecipient, planName: string) {
    return this.emailService.sendByParams({
      organizationId: recipient.organizationId,
      to: recipient.to,
      firstName: recipient.firstName,
      actorId: recipient.actorId,
      type: 'trial_expiration',
      subject: `Your ${planName} free trial has ended`,
      html: `
        <h2 style="color:#111827;margin:0 0 8px;">Your trial has ended</h2>
        <p>Your <strong>${planName}</strong> free trial has expired. Your workspace is now limited to the free tier — upgrade to restore full access.</p>
      `,
    });
  }

  async subscriptionActivated(recipient: EmailRecipient, plan: PlanInfo) {
    return this.emailService.sendByParams({
      organizationId: recipient.organizationId,
      to: recipient.to,
      firstName: recipient.firstName,
      actorId: recipient.actorId,
      type: 'subscription_activated',
      subject: `Your ${plan.name} subscription is active`,
      html: `
        <h2 style="color:#111827;margin:0 0 8px;">Subscription activated</h2>
        <p>Your <strong>${plan.name}</strong> subscription (${plan.interval === 'MONTHLY' ? 'monthly' : 'yearly'}) is now active. All included features are unlocked.</p>
      `,
    });
  }

  async subscriptionRenewed(recipient: EmailRecipient, plan: PlanInfo) {
    return this.emailService.sendByParams({
      organizationId: recipient.organizationId,
      to: recipient.to,
      firstName: recipient.firstName,
      actorId: recipient.actorId,
      type: 'subscription_renewal',
      subject: `Your ${plan.name} subscription has been renewed`,
      html: `
        <h2 style="color:#111827;margin:0 0 8px;">Subscription renewed</h2>
        <p>Your <strong>${plan.name}</strong> subscription has been renewed for another ${plan.interval === 'MONTHLY' ? 'month' : 'year'}. Thank you for staying with us.</p>
      `,
    });
  }

  async paymentFailure(
    recipient: EmailRecipient,
    planName: string,
    reason: string,
  ) {
    return this.emailService.sendByParams({
      organizationId: recipient.organizationId,
      to: recipient.to,
      firstName: recipient.firstName,
      actorId: recipient.actorId,
      type: 'payment_failure',
      subject: `Payment failed — ${planName}`,
      html: `
        <h2 style="color:#111827;margin:0 0 8px;">Payment failed</h2>
        <p>We couldn't process your payment for <strong>${planName}</strong>.</p>
        <p style="color:#b91c1c;">${reason || 'Please check your payment details and try again.'}</p>
        <p>Your subscription remains active until the end of the current period.</p>
      `,
    });
  }

  async subscriptionCancelled(
    recipient: EmailRecipient,
    planName: string,
    endsAt?: Date | null,
  ) {
    const endText = endsAt
      ? ` Your access continues until <strong>${endsAt.toISOString().slice(0, 10)}</strong>.`
      : '';
    return this.emailService.sendByParams({
      organizationId: recipient.organizationId,
      to: recipient.to,
      firstName: recipient.firstName,
      actorId: recipient.actorId,
      type: 'subscription_cancelled',
      subject: `Your ${planName} subscription has been cancelled`,
      html: `
        <h2 style="color:#111827;margin:0 0 8px;">Subscription cancelled</h2>
        <p>Your <strong>${planName}</strong> subscription has been cancelled.${endText} We're sorry to see you go.</p>
      `,
    });
  }

  async usageLimitWarning(
    recipient: EmailRecipient,
    resource: string,
    current: number,
    limit: number,
  ) {
    return this.emailService.sendByParams({
      organizationId: recipient.organizationId,
      to: recipient.to,
      firstName: recipient.firstName,
      actorId: recipient.actorId,
      type: 'usage_limit_warning',
      subject: `Usage limit reached: ${resource}`,
      html: `
        <h2 style="color:#111827;margin:0 0 8px;">Usage limit reached</h2>
        <p>Your workspace has reached <strong>${current}/${limit}</strong> for <strong>${resource}</strong>. Consider upgrading your plan to keep building.</p>
      `,
    });
  }
}
