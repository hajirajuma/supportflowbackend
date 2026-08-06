import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Brevo } from '@getbrevo/brevo';
import { PrismaService } from '../../prisma/prisma.service';
import { BrevoEmailService } from '../../email/brevo.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { NotificationChannelValue } from '../enums/notification.enums';

export interface SendEmailParams {
  organizationId?: string | null;
  to: string;
  firstName: string;
  type: string;
  template?: string;
  subject?: string;
  html?: string;
  variables?: Record<string, unknown>;
  actorId?: string;
}

interface Branding {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  footerHtml: string;
}

@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brevoService: BrevoEmailService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Renders a template (or direct subject/html) and sends it through Brevo.
   * Audits EMAIL_SENT on success and EMAIL_FAILED on failure.
   */
  async sendByParams(params: SendEmailParams): Promise<boolean> {
    try {
      const branding = await this.resolveBranding(
        params.organizationId ?? null,
      );

      let subject = params.subject ?? '';
      let html = params.html ?? '';

      if (params.template) {
        const rendered = await this.renderTemplate(params);
        subject = rendered.subject;
        html = rendered.html;
      }

      if (!subject && !html) {
        throw new BadRequestException(
          'Provide a template or subject/html for the email',
        );
      }

      const bodyHtml = this.wrapWithBranding(html, branding, params.firstName);

      const payload: Brevo.SendTransacEmailRequest = {
        sender: { email: this.configService.getOrThrow<string>('brevo.from') },
        to: [{ email: params.to, name: params.firstName || undefined }],
        subject,
        htmlContent: bodyHtml,
      };

      await this.brevoService.sendTransactionalEmail(payload);

      await this.auditLogService.record({
        organizationId: params.organizationId ?? undefined,
        actorId: params.actorId,
        action: AUDIT_ACTIONS.EMAIL_SENT,
        entityType: 'Notification',
        metadata: {
          type: params.type,
          to: params.to,
          template: params.template ?? null,
        },
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Email delivery failed (${params.type}) -> ${params.to}: ${(error as Error).message}`,
      );
      try {
        await this.auditLogService.record({
          organizationId: params.organizationId ?? undefined,
          actorId: params.actorId,
          action: AUDIT_ACTIONS.EMAIL_FAILED,
          entityType: 'Notification',
          metadata: {
            type: params.type,
            to: params.to,
            template: params.template ?? null,
            error: (error as Error).message,
          },
        });
      } catch {
        // Audit must never mask the original failure.
      }
      return false;
    }
  }

  /**
   * Renders the matching template's subject and body against the provided
   * variables. Template resolution prefers the organization's own template
   * and falls back to the platform-wide one. Unknown placeholders are kept as
   * given so a missing variable never breaks an email.
   */
  async renderTemplate(
    params: SendEmailParams,
  ): Promise<{ subject: string; html: string }> {
    const where: any = {
      slug: params.template,
      enabled: true,
      status: 'ACTIVE',
      channel: NotificationChannelValue.EMAIL,
    };

    const template = params.organizationId
      ? ((await (this.prisma as any).notificationTemplate.findFirst({
          where: { ...where, organizationId: params.organizationId },
        })) ??
        (await (this.prisma as any).notificationTemplate.findFirst({
          where: { ...where, organizationId: null },
        })))
      : await (this.prisma as any).notificationTemplate.findFirst({
          where: { ...where, organizationId: null },
        });

    if (!template) {
      throw new BadRequestException(
        `No active email template found for slug "${params.template}"`,
      );
    }

    this.assertVariables(template, params.variables ?? {});

    const variables = {
      ...(params.variables ?? {}),
      firstName: params.firstName,
    };

    const subject = this.render(template.subject, variables);
    const html = this.render(template.body, variables);

    return { subject, html };
  }

  render(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = variables[key];
      return value === undefined || value === null ? '' : String(value);
    });
  }

  private assertVariables(template: any, variables: Record<string, unknown>) {
    const declared: string[] = template.variables ?? [];
    if (!declared.length) return;
    const missing = declared.filter(
      (v) => v !== 'firstName' && variables[v] === undefined,
    );
    if (missing.length) {
      throw new BadRequestException(
        `Template "${template.slug}" is missing required variable(s): ${missing.join(', ')}`,
      );
    }
  }

  private async resolveBranding(
    organizationId: string | null,
  ): Promise<Branding> {
    const fallback: Branding = {
      companyName: 'SupportFlow',
      logoUrl: null,
      primaryColor: '#3b82f6',
      footerHtml:
        '<p style="color:#6b7280;font-size:12px;margin-top:24px;">Sent by SupportFlow. This is a system-generated message.</p>',
    };

    if (!organizationId) return fallback;

    const org = await (this.prisma as any).organization.findUnique({
      where: { id: organizationId },
      select: { name: true, logo: true },
    });

    if (!org) return fallback;

    return {
      companyName: org.name || fallback.companyName,
      logoUrl: org.logo ?? null,
      primaryColor: fallback.primaryColor,
      footerHtml: fallback.footerHtml,
    };
  }

  private wrapWithBranding(
    bodyHtml: string,
    branding: Branding,
    _firstName: string,
  ): string {
    const logo = branding.logoUrl
      ? `<div style="text-align:center;margin-bottom:16px;"><img src="${branding.logoUrl}" alt="${branding.companyName}" style="max-height:48px;max-width:180px;"/></div>`
      : `<div style="text-align:center;margin-bottom:16px;color:${branding.primaryColor};font-weight:700;font-size:20px;">${branding.companyName}</div>`;

    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr><td style="padding:24px;border-bottom:3px solid ${branding.primaryColor};">${logo}</td></tr>
      <tr><td style="padding:24px;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
      <tr><td style="padding:16px 24px;background:#f9fafb;">${branding.footerHtml}</td></tr>
    </table>
  </td></tr>
</table>`;
  }
}
