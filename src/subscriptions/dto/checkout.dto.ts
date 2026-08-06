import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import {
  BillingIntervalValue,
  PaymentProviderValue,
} from '../enums/subscription.enums';

export class CheckoutDto {
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
    enum: PaymentProviderValue,
    default: PaymentProviderValue.PAYCHANGU,
    description:
      'Gateway to use. PayChangu is the only registered provider today.',
  })
  @IsOptional()
  @IsEnum(PaymentProviderValue)
  provider?: PaymentProviderValue;

  @ApiPropertyOptional({
    example: 'https://app.supportflow.io/billing/success',
    description: 'URL to redirect the customer to after payment (result).',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  returnUrl?: string;

  @ApiPropertyOptional({
    example: 'https://api.supportflow.io/payments/webhook',
    description: 'URL the gateway calls with the payment webhook.',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  callbackUrl?: string;
}
