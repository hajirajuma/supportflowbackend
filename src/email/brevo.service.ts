import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Brevo, BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class BrevoEmailService {
  private readonly client: BrevoClient;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('brevo.apiKey');
    this.client = new BrevoClient({
      apiKey,
    });
  }

  async sendVerificationEmail(
    to: string,
    firstName: string,
    verificationUrl: string,
  ) {
    const payload: Brevo.SendTransacEmailRequest = {
      sender: { email: this.configService.getOrThrow<string>('brevo.from') },
      to: [{ email: to, name: firstName }],
      subject: 'Verify your email address',
      htmlContent: `<p>Hello ${firstName},</p><p>Please verify your account by visiting <a href="${verificationUrl}">${verificationUrl}</a>.</p>`,
    };

    return this.client.transactionalEmails.sendTransacEmail(payload);
  }

  async sendPasswordResetEmail(
    to: string,
    firstName: string,
    resetUrl: string,
  ) {
    const payload: Brevo.SendTransacEmailRequest = {
      sender: { email: this.configService.getOrThrow<string>('brevo.from') },
      to: [{ email: to, name: firstName }],
      subject: 'Reset your password',
      htmlContent: `<p>Hello ${firstName},</p><p>Reset your password by visiting <a href="${resetUrl}">${resetUrl}</a>.</p>`,
    };

    return this.client.transactionalEmails.sendTransacEmail(payload);
  }

  async sendInvitationEmail(
    to: string,
    firstName: string,
    invitationUrl: string,
  ) {
    const payload: Brevo.SendTransacEmailRequest = {
      sender: { email: this.configService.getOrThrow<string>('brevo.from') },
      to: [{ email: to, name: firstName }],
      subject: 'You have been invited',
      htmlContent: `<p>Hello ${firstName},</p><p>You have been invited to join the platform: <a href="${invitationUrl}">${invitationUrl}</a>.</p>`,
    };

    return this.client.transactionalEmails.sendTransacEmail(payload);
  }

  async sendTicketNotificationEmail(
    to: string,
    firstName: string,
    ticketNumber: string,
    message: string,
  ) {
    const payload: Brevo.SendTransacEmailRequest = {
      sender: { email: this.configService.getOrThrow<string>('brevo.from') },
      to: [{ email: to, name: firstName }],
      subject: `Ticket update: #${ticketNumber}`,
      htmlContent: `<p>Hello ${firstName},</p><p>${message}</p>`,
    };

    return this.client.transactionalEmails.sendTransacEmail(payload);
  }

  async sendFeedbackRequestEmail(
    to: string,
    firstName: string,
    orgName: string,
    ticketNumber: string,
    formTitle: string,
    surveyUrl: string,
  ) {
    const payload: Brevo.SendTransacEmailRequest = {
      sender: { email: this.configService.getOrThrow<string>('brevo.from') },
      to: [{ email: to, name: firstName }],
      subject: `How did we do? Share your feedback on ticket #${ticketNumber}`,
      htmlContent: `<p>Hello ${firstName},</p><p>We would love to hear about your experience with ${orgName} on ticket <strong>#${ticketNumber}</strong>.</p><p>Please take a moment to complete the <strong>${formTitle}</strong> survey:</p><p><a href="${surveyUrl}">Complete your survey</a></p><p>This link is valid for a limited time.</p>`,
    };

    return this.client.transactionalEmails.sendTransacEmail(payload);
  }

  async sendFeedbackReminderEmail(
    to: string,
    firstName: string,
    ticketNumber: string,
    surveyUrl: string,
  ) {
    const payload: Brevo.SendTransacEmailRequest = {
      sender: { email: this.configService.getOrThrow<string>('brevo.from') },
      to: [{ email: to, name: firstName }],
      subject: `Reminder: share your feedback on ticket #${ticketNumber}`,
      htmlContent: `<p>Hello ${firstName},</p><p>We noticed you have not submitted your feedback for ticket <strong>#${ticketNumber}</strong> yet.</p><p><a href="${surveyUrl}">Complete your survey now</a></p>`,
    };

    return this.client.transactionalEmails.sendTransacEmail(payload);
  }

  async sendFeedbackSubmittedEmail(
    to: string,
    recipientName: string,
    orgName: string,
    ticketNumber: string,
    rating: string,
    comment: string,
  ) {
    const payload: Brevo.SendTransacEmailRequest = {
      sender: { email: this.configService.getOrThrow<string>('brevo.from') },
      to: [{ email: to, name: recipientName }],
      subject: `New feedback on ticket #${ticketNumber}`,
      htmlContent: `<p>Hello ${recipientName},</p><p>${orgName} received new feedback on ticket <strong>#${ticketNumber}</strong>.</p><p>Rating: <strong>${rating}</strong></p>${comment ? `<p>Comment: ${comment}</p>` : ''}`,
    };

    return this.client.transactionalEmails.sendTransacEmail(payload);
  }

  async sendNegativeFeedbackEmail(
    to: string,
    recipientName: string,
    orgName: string,
    ticketNumber: string,
    rating: string,
    comment: string,
  ) {
    const payload: Brevo.SendTransacEmailRequest = {
      sender: { email: this.configService.getOrThrow<string>('brevo.from') },
      to: [{ email: to, name: recipientName }],
      subject: `[Action needed] Low rating on ticket #${ticketNumber}`,
      htmlContent: `<p>Hello ${recipientName},</p><p>A customer rated their experience on ticket <strong>#${ticketNumber}</strong> as <strong>${rating}</strong>.</p>${comment ? `<p>Comment: ${comment}</p>` : ''}<p>Please review the ticket and reach out to the customer.</p>`,
    };

    return this.client.transactionalEmails.sendTransacEmail(payload);
  }

  /** Generic transactional email for the notification engine. */
  async sendTransactionalEmail(payload: Brevo.SendTransacEmailRequest) {
    return this.client.transactionalEmails.sendTransacEmail(payload);
  }

  /**
   * Connectivity probe used by the health check. Verifies the API key by
   * reading the account; throws when unreachable or unauthorized.
   */
  async ping(): Promise<void> {
    await this.client.account.getAccount();
  }
}
