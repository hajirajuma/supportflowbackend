import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({
    example: 'tx_abc123',
    description: 'The PayChangu transaction reference returned after checkout.',
  })
  @IsString()
  reference!: string;

  @ApiPropertyOptional({
    example: 'https://app.supportflow.io/billing/success',
    description:
      'Optional success URL to append query params to after verification.',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  redirectUrl?: string;
}
