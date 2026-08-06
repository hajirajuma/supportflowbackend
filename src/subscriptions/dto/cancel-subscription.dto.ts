import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelSubscriptionDto {
  @ApiPropertyOptional({ example: 'Switching to another platform.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'When true the subscription stays active until the end of the current period.',
  })
  @IsOptional()
  @IsBoolean()
  atPeriodEnd?: boolean;
}
