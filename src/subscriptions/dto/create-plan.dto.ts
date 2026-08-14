import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PlanTypeValue } from '../enums/subscription.enums';

export class CreatePlanDto {
  @ApiProperty({ example: 'PRO' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_]+$/, {
    message:
      'code must contain only uppercase letters, numbers and underscores',
  })
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Pro' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    example: 'For growing teams that need advanced analytics.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: PlanTypeValue, default: PlanTypeValue.PRO })
  @IsOptional()
  @IsEnum(PlanTypeValue)
  planType?: PlanTypeValue;

  @ApiPropertyOptional({
    example: 49,
    description: 'Monthly price in the plan currency.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMonthly?: number;

  @ApiPropertyOptional({
    example: 490,
    description: 'Yearly price in the plan currency.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceYearly?: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    example: 14,
    description: 'Trial length in days for this plan.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxCustomers?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAgents?: number;

  @ApiPropertyOptional({ example: 2000, description: 'Max tickets per month.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxTicketsPerMonth?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxFeedbackForms?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAttachmentsPerTicket?: number;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxKnowledgeArticles?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxInvitations?: number;

  @ApiPropertyOptional({
    example: 5368709120,
    description: 'Storage limit in bytes.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  storageLimitBytes?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  apiRateLimitPerMinute?: number;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  apiMonthlyQuota?: number;

  @ApiPropertyOptional({
    example: { ticket_management: true, analytics: true, reports: true },
    description: 'Feature entitlement keys enabled for this plan.',
  })
  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;
}
