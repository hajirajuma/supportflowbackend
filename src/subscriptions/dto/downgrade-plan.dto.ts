import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { BillingIntervalValue } from '../enums/subscription.enums';

export class DowngradePlanDto {
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
    example: false,
    description:
      'When true the downgrade applies immediately; otherwise at period end.',
  })
  @IsOptional()
  @IsBoolean()
  immediately?: boolean;
}
