import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BrevoEmailService } from '../../email/brevo.service';
import {
  AuditLogService,
  AUDIT_ACTIONS,
} from '../../audit-log/audit-log.service';
import { DashboardAccess } from '../types/dashboard-access.type';
import { ExportReportDto } from '../dto/export-report.dto';
import { AnalyticsService } from './analytics.service';
import { csvBuffer } from '../utils/csv.util';
import { excelBuffer } from '../utils/excel.util';
import { pdfBuffer, PdfSection } from '../utils/pdf.util';
import {
  DASHBOARD_AUDIT_ACTIONS,
  ReportCategory,
  ReportFormat,
} from '../enums/dashboard.enums';
import type { Request } from 'express';

export interface ExportResult {
  fileName: string;
  mimeType: string;
  extension: string;
  buffer: Buffer;
  base64: string;
  size: number;
  emailed: boolean;
}

const MIME_TYPES: Record<string, string> = {
  CSV: 'text/csv',
  EXCEL: 'application/vnd.ms-excel',
  PDF: 'application/pdf',
};

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly brevoEmailService: BrevoEmailService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  async export(
    access: DashboardAccess,
    dto: ExportReportDto,
    request: Request,
  ): Promise<ExportResult> {
    const dataset = await this.analyticsService.getDataset(
      access,
      dto.category,
      dto.filters ?? {},
    );

    const columns = dto.columns?.length
      ? dto.columns
      : Object.keys(dataset.rows[0] ?? {});
    const baseName = this.sanitize(
      dto.fileName ?? `${dto.category.toLowerCase()}-report`,
    );

    const pdfSections =
      dto.format === 'PDF'
        ? await this.buildPdfSections(access, dto, dataset.rows, columns)
        : undefined;

    const buffer = this.serialize(
      dto.format,
      baseName,
      dataset.rows,
      columns,
      pdfSections,
    );

    let emailed = false;
    if (dto.emailTo?.length) {
      await this.emailExport(
        dto.emailTo,
        baseName,
        dto.format,
        buffer,
        access,
        dataset.summary,
      );
      emailed = true;
    }

    await this.auditLogService.record({
      organizationId: access.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'REPORT_EXPORT',
      metadata: {
        reportAction: DASHBOARD_AUDIT_ACTIONS.ANALYTICS_EXPORTED,
        category: dto.category,
        format: dto.format,
        fileName: baseName,
        emailed,
      },
      request,
    });

    return {
      fileName: `${baseName}.${dto.format.toLowerCase()}`,
      mimeType: MIME_TYPES[dto.format],
      extension: dto.format.toLowerCase(),
      buffer,
      base64: buffer.toString('base64'),
      size: buffer.length,
      emailed,
    };
  }

  /** Re-exports an already saved report. */
  async exportSavedReport(
    access: DashboardAccess,
    reportId: string,
    format: ReportFormat,
    request: Request,
  ) {
    const report = await (this.prisma as any).savedReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found.');
    if (
      !access.isPlatformAdmin &&
      report.organizationId !== access.organizationId
    ) {
      throw new BadRequestException('You do not have access to this report.');
    }

    const filters = (report.filters ?? {}) as Record<string, unknown>;
    const category = (filters.category as string) ?? 'CUSTOM';

    const result = await this.export(
      access,
      {
        category: category as ReportCategory,
        format,
        filters: filters as never,
        fileName: report.name,
      },
      request,
    );

    await this.auditLogService.record({
      organizationId: access.organizationId ?? undefined,
      actorId: access.userId,
      actorEmail: access.email,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'REPORT',
      entityId: reportId,
      metadata: {
        reportAction: DASHBOARD_AUDIT_ACTIONS.REPORT_DOWNLOADED,
        name: report.name,
        format,
      },
      request,
    });

    return result;
  }

  // --------------------------------------------------------------------------

  private serialize(
    format: string,
    name: string,
    rows: Record<string, unknown>[],
    columns: string[],
    pdfSections?: PdfSection[],
  ): Buffer {
    switch (format) {
      case 'CSV':
        return csvBuffer(rows, columns);
      case 'EXCEL':
        return excelBuffer(name, rows, columns);
      case 'PDF':
        return pdfBuffer({
          title: name,
          subtitle: 'SupportFlow report export',
          generatedAt: new Date(),
          sections: pdfSections ?? [],
        });
      default:
        throw new BadRequestException(`Unsupported export format: ${format}`);
    }
  }

  private async buildPdfSections(
    access: DashboardAccess,
    dto: ExportReportDto,
    rows: Record<string, unknown>[],
    columns: string[],
  ): Promise<PdfSection[]> {
    const sections: PdfSection[] = [];

    if (rows.length) {
      const header = columns.join(' | ');
      const dataLines = rows
        .slice(0, 250)
        .map((row) => columns.map((c) => this.formatValue(row[c])).join(' | '));
      sections.push({ title: 'Data', lines: [header, ...dataLines] });
    }

    if (dto.charts?.length) {
      const charts = await this.analyticsService.getCharts(
        access,
        dto.filters ?? {},
        dto.charts as never[],
      );
      const lines: string[] = [];
      for (const chart of charts.tickets ?? []) {
        lines.push(`Tickets (${chart.type}): ${chart.labels.join(', ')}`);
        lines.push(`Values: ${chart.datasets[0]?.data.join(', ') ?? ''}`);
        lines.push('');
      }
      for (const chart of charts.revenue ?? []) {
        lines.push(`Revenue (${chart.type}): ${chart.labels.join(', ')}`);
        lines.push(`Values: ${chart.datasets[0]?.data.join(', ') ?? ''}`);
        lines.push('');
      }
      for (const chart of charts.customers ?? []) {
        lines.push(`Customers (${chart.type}): ${chart.labels.join(', ')}`);
        lines.push(`Values: ${chart.datasets[0]?.data.join(', ') ?? ''}`);
        lines.push('');
      }
      sections.push({ title: 'Charts', lines });
    }

    return sections;
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private async emailExport(
    to: string[],
    name: string,
    format: string,
    buffer: Buffer,
    access: DashboardAccess,
    summary: unknown,
  ) {
    const frontendUrl =
      this.configService.get<string>('frontend.url') ?? 'http://localhost:3000';
    const summaryLines = this.summaryText(summary);

    const payload: any = {
      sender: { email: this.configService.getOrThrow<string>('brevo.from') },
      to: to.map((email) => ({ email })),
      subject: `Your ${format} report: ${name}`,
      htmlContent: `
        <h2>Report export ready</h2>
        <p>Hello,</p>
        <p>Your <strong>${name}</strong> report (${format}) is attached.</p>
        <pre style="font-family: monospace; background:#f4f4f4; padding:12px; border-radius:6px;">${summaryLines}</pre>
        <p><a href="${frontendUrl}">Open your dashboard</a></p>`,
      attachment: [
        {
          content: buffer.toString('base64'),
          name: `${name}.${format.toLowerCase()}`,
        },
      ],
    };

    await this.brevoEmailService.sendTransactionalEmail(payload);
  }

  private summaryText(summary: unknown): string {
    try {
      return JSON.stringify(summary, null, 2)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    } catch {
      return '';
    }
  }

  private sanitize(name: string): string {
    return (
      name
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 60) || 'report'
    );
  }
}
