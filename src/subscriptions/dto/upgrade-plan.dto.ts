import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { BillingIntervalValue } from '../enums/subscription.enums';

export class UpgradePlanDto {
  @ApiProperty({ example: 'clxabc123' })
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @ApiPropertyOptional({
    enum: BillingIntervalValue,
    default: BillingIntervalValue.MONTHLY,
  })
  @IsOptional()
  @IsEnum(BillingIntervalValue)
  billingInterval?: BillingIntervalValue;

  @ApiPropertyOptional({
    example: 'https://app.supportflow.io/billing/success',
    description: 'Override the provider return URL after checkout.',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  returnUrl?: string;
}
