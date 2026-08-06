import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { TrendPeriod, TREND_PERIODS } from '../enums/dashboard.enums';

/**
 * Filter for dashboard widgets. `organizationId` is only honoured for
 * platform admins — tenants are always pinned to their own organization by
 * the access layer.
 */
export class DashboardFilterDto {
  @ApiPropertyOptional({
    description: 'Filter records created at or after this timestamp',
    example: '2026-08-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter records created at or before this timestamp',
    example: '2026-08-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description:
      'Platform admin only: scope analytics to a single organization',
    example: 'clyh123abc',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({
    description: 'Trend bucketing period used by time-series widgets',
    enum: TREND_PERIODS,
    default: TrendPeriod.MONTH,
  })
  @IsOptional()
  @IsEnum(TrendPeriod)
  trend?: TrendPeriod;

  @ApiPropertyOptional({
    description: 'Scope analytics to a single support agent (staff only)',
    example: 'usr_001',
  })
  @IsOptional()
  @IsString()
  agentId?: string;
}
