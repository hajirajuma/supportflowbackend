import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { NotificationTypeValue } from '../../notifications/enums/notification.enums';
import { PaginationUtil } from '../../common/utils/pagination.util';

export interface GenerateInvoiceParams {
  organizationId: string;
  subscriptionId?: string | null;
  planId?: string | null;
  paymentId?: string | null;
  planName: string;
  description: string;
  amount: number;
  tax?: number;
  currency: string;
  paid: boolean;
  receiptReference?: string | null;
  period?: { start?: Date; end?: Date };
}

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Automatically generates an invoice for a payment. On success the invoice is
   * PAID and linked to the payment + receipt reference.
   */
  async generate(params: GenerateInvoiceParams): Promise<any> {
    const tax = params.tax ?? 0;
    const total = Number(params.amount) + tax;

    const invoiceNumber = this.nextInvoiceNumber();

    const items = [
      {
        description: params.description,
        amount: Number(params.amount),
        tax,
        total,
        currency: params.currency,
        periodStart: params.period?.start?.toISOString() ?? null,
        periodEnd: params.period?.end?.toISOString() ?? null,
      },
    ];

    const invoice = await (this.prisma as any).invoice.create({
      data: {
        invoiceNumber,
        organizationId: params.organizationId,
        subscriptionId: params.subscriptionId ?? null,
        planId: params.planId ?? null,
        paymentId: params.paymentId ?? null,
        items,
        amount: Number(params.amount),
        tax,
        total,
        currency: params.currency,
        status: params.paid ? 'PAID' : 'PENDING',
        dueDate: params.paid
          ? new Date()
          : new Date(Date.now() + 7 * 86_400_000),
        paidAt: params.paid ? new Date() : null,
        receiptReference: params.receiptReference ?? null,
      },
    });

    await this.auditLogService.record({
      organizationId: params.organizationId,
      action: AUDIT_ACTIONS.INVOICE_GENERATED,
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: {
        invoiceNumber,
        amount: total,
        currency: params.currency,
        status: invoice.status,
      },
    });

    await this.notifyOwner(invoice, params);

    return invoice;
  }

  async list(organizationId: string, page: number, limit: number) {
    const where = { organizationId };
    const [total, invoices] = await Promise.all([
      (this.prisma as any).invoice.count({ where }),
      (this.prisma as any).invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.getSkip(page, limit),
        take: limit,
        include: { plan: { select: { name: true, code: true } } },
      }),
    ]);

    return {
      data: invoices,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(organizationId: string, id: string, isPlatformAdmin = false) {
    const invoice = await (this.prisma as any).invoice.findUnique({
      where: { id },
      include: {
        plan: true,
        payment: true,
        organization: { select: { name: true, billingEmail: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (!isPlatformAdmin && invoice.organizationId !== organizationId) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  private async notifyOwner(invoice: any, params: GenerateInvoiceParams) {
    const owner = await (this.prisma as any).user.findFirst({
      where: {
        organizationId: params.organizationId,
        role: 'TENANT_OWNER',
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, firstName: true },
    });

    if (!owner) return;

    await this.notificationService.create({
      userId: owner.id,
      organizationId: params.organizationId,
      type: NotificationTypeValue.INVOICE_GENERATED,
      title: `Invoice ${invoice.invoiceNumber} generated`,
      body: `Invoice ${invoice.invoiceNumber} for ${params.currency} ${totalFixed(invoice.total)} (${invoice.status}).`,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        amount: totalFixed(invoice.total),
        currency: params.currency,
        status: invoice.status,
      },
      relatedEntityType: 'Invoice',
      relatedEntityId: invoice.id,
      email: {
        to: owner.email ?? '',
        firstName: owner.firstName ?? '',
        subject: `Invoice ${invoice.invoiceNumber} — ${params.planName}`,
        html: `
          <h2 style="margin:0 0 8px;">Invoice ${invoice.invoiceNumber}</h2>
          <p><strong>${params.planName}</strong> — ${params.currency} ${totalFixed(invoice.total)} (${invoice.status}).</p>
        `,
      },
    });
  }

  private nextInvoiceNumber(): string {
    const now = new Date();
    const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `INV-${ymd}-${suffix}`;
  }
}

function totalFixed(value: unknown): string {
  return Number(value ?? 0).toFixed(2);
}
