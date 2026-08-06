import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ReportCategory,
  ReportFormat,
  REPORT_FORMATS,
  ReportScheduleFrequency,
  REPORT_SCHEDULE_FREQUENCIES,
} from '../enums/dashboard.enums';

export class ReportScheduleDto {
  @ApiProperty({
    description: 'Delivery frequency',
    enum: REPORT_SCHEDULE_FREQUENCIES,
    example: ReportScheduleFrequency.WEEKLY,
  })
  @IsEnum(ReportScheduleFrequency)
  frequency: ReportScheduleFrequency;

  @ApiPropertyOptional({
    description: 'Day of week (0=Sunday..6=Saturday) for weekly reports',
    example: 1,
    minimum: 0,
    maximum: 6,
  })
  @IsOptional()
  @IsIn([0, 1, 2, 3, 4, 5, 6])
  dayOfWeek?: number;

  @ApiPropertyOptional({
    description: 'Day of month (1-28) for monthly reports',
    example: 1,
    minimum: 1,
    maximum: 28,
  })
  @IsOptional()
  @IsIn([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, 26, 27, 28,
  ])
  dayOfMonth?: number;

  @ApiPropertyOptional({
    description: 'Delivery hour (UTC 0-23)',
    example: 7,
    default: 7,
    minimum: 0,
    maximum: 23,
  })
  @IsOptional()
  @IsIn([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23,
  ])
  hour?: number;

  @ApiPropertyOptional({
    description: 'Export format attached to the email',
    enum: REPORT_FORMATS,
    default: ReportFormat.CSV,
  })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;

  @ApiPropertyOptional({
    description: 'Comma separated email recipients (defaults to the creator)',
    example: 'ops@example.com,ceo@example.com',
  })
  @IsOptional()
  @IsString()
  recipients?: string;
}

export class CreateReportDto {
  @ApiProperty({
    description: 'Report name',
    example: 'Weekly tickets overview',
    minLength: 2,
    maxLength: 120,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description: 'Report description',
    example: 'Volume, throughput and SLA adherence for the last 7 days',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Report category',
    enum: ReportCategory,
    example: ReportCategory.TICKETS,
  })
  @IsEnum(ReportCategory)
  category: ReportCategory;

  @ApiPropertyOptional({
    description: 'Report filters (mirror of AnalyticsFilterDto + date range)',
    example: {
      dateFrom: '2026-07-01T00:00:00.000Z',
      dateTo: '2026-07-31T23:59:59.999Z',
      status: 'RESOLVED',
    },
  })
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Columns to include in exports',
    example: ['ticketNumber', 'subject', 'status', 'customer', 'createdAt'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[];

  @ApiPropertyOptional({
    description: 'Optional recurring delivery schedule',
    type: ReportScheduleDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportScheduleDto)
  schedule?: ReportScheduleDto | null;
}
