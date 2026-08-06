import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUrl } from 'class-validator';
import { BillingIntervalValue } from '../enums/subscription.enums';

export class ResumeSubscriptionDto {
  @ApiPropertyOptional({
    enum: BillingIntervalValue,
    default: BillingIntervalValue.MONTHLY,
  })
  @IsOptional()
  @IsEnum(BillingIntervalValue)
  billingInterval?: BillingIntervalValue;

  @ApiPropertyOptional({
    example: 'https://app.supportflow.io/billing/success',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  returnUrl?: string;
}
