import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  ReportCategory,
  ReportFormat,
  REPORT_FORMATS,
} from '../enums/dashboard.enums';

/**
 * Request body for `POST /reports/export`. Describes which report to build and
 * in which format. Returns the file bytes directly (CSV / Excel / PDF).
 */
export class ExportReportDto {
  @ApiProperty({
    description: 'Report category to export',
    enum: ReportCategory,
    example: ReportCategory.TICKETS,
  })
  @IsEnum(ReportCategory)
  category: ReportCategory;

  @ApiProperty({
    description: 'Export format',
    enum: REPORT_FORMATS,
    example: ReportFormat.CSV,
  })
  @IsEnum(ReportFormat)
  format: ReportFormat;

  @ApiPropertyOptional({
    description: 'Report filters (mirror of AnalyticsFilterDto + date range)',
    example: {
      dateFrom: '2026-07-01T00:00:00.000Z',
      dateTo: '2026-07-31T23:59:59.999Z',
      status: 'RESOLVED',
      organizationId: 'clyh123abc',
    },
  })
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Optional column subset (defaults to all columns)',
    example: ['ticketNumber', 'subject', 'status', 'priority', 'createdAt'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[];

  @ApiPropertyOptional({
    description: 'Optional custom file name without extension',
    example: 'weekly-tickets',
  })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({
    description: 'Optional recipients to email the export to',
    example: ['ops@example.com', 'ceo@example.com'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailTo?: string[];

  @ApiPropertyOptional({
    description: 'Optional chart types to include in PDF exports',
    example: ['line', 'pie'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  charts?: string[];
}
