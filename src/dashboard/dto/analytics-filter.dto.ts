import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  TrendPeriod,
  TREND_PERIODS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  USAGE_RESOURCE_TYPES,
} from '../enums/dashboard.enums';

/**
 * Filter for the analytics engine. Applies date range, tenant, ticket,
 * customer, agent, department, priority, subscription plan and rating filters
 * to every aggregation/trend endpoint.
 */
export class AnalyticsFilterDto {
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
    description: 'Platform admin only: scope analytics to one organization',
    example: 'clyh123abc',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({
    description: 'Filter by ticket status',
    enum: TICKET_STATUSES,
  })
  @IsOptional()
  @IsIn(TICKET_STATUSES)
  status?: (typeof TICKET_STATUSES)[number];

  @ApiPropertyOptional({
    description: 'Filter by ticket priority',
    enum: TICKET_PRIORITIES,
  })
  @IsOptional()
  @IsIn(TICKET_PRIORITIES)
  priority?: (typeof TICKET_PRIORITIES)[number];

  @ApiPropertyOptional({
    description: 'Filter by department id',
    example: 'dept_001',
  })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by assigned support agent user id',
    example: 'usr_001',
  })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({
    description: 'Alias for assignedToId (staff analytics scoping)',
    example: 'usr_001',
  })
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer (ticket creator) user id',
    example: 'usr_002',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by subscription plan type (FREE | STARTER | PRO)',
    enum: ['FREE', 'STARTER', 'PRO'],
  })
  @IsOptional()
  @IsIn(['FREE', 'STARTER', 'PRO'])
  planType?: 'FREE' | 'STARTER' | 'PRO';

  @ApiPropertyOptional({
    description: 'Filter feedback by overall rating (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsIn([1, 2, 3, 4, 5])
  feedbackRating?: 1 | 2 | 3 | 4 | 5;

  @ApiPropertyOptional({
    description: 'Usage metric filter for the usage analytics endpoint',
    enum: USAGE_RESOURCE_TYPES,
  })
  @IsOptional()
  @IsIn(USAGE_RESOURCE_TYPES)
  resourceType?: (typeof USAGE_RESOURCE_TYPES)[number];

  @ApiPropertyOptional({
    description: 'Trend bucketing period for time-series outputs',
    enum: TREND_PERIODS,
    default: TrendPeriod.MONTH,
  })
  @IsOptional()
  @IsEnum(TrendPeriod)
  trend?: TrendPeriod;

  @ApiPropertyOptional({
    description: 'Group analytics by this dimension (e.g. status, plan)',
    example: 'status',
  })
  @IsOptional()
  @IsString()
  groupBy?: string;
}
