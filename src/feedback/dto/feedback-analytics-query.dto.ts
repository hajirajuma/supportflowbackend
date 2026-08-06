import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { FEEDBACK_TREND_OPTIONS } from '../enums/feedback.enums';
import type { FeedbackTrend } from '../enums/feedback.enums';

export class FeedbackAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Restrict to a single form' })
  @IsOptional()
  @IsString()
  formId?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: [...FEEDBACK_TREND_OPTIONS], default: 'month' })
  @IsOptional()
  @IsIn(FEEDBACK_TREND_OPTIONS)
  trend?: FeedbackTrend;

  @ApiPropertyOptional({
    description: 'Organization id (platform admins only)',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

export class FeedbackDashboardQueryDto {
  @ApiPropertyOptional({ description: 'Restrict to a single form' })
  @IsOptional()
  @IsString()
  formId?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Organization id (platform admins only)',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;
}
