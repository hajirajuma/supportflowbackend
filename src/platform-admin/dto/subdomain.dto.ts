import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateSubdomainDto {
  @ApiProperty({ example: 'acme-support' })
  @IsString()
  value!: string;
}

export class ToggleSubdomainLockDto {
  @ApiProperty({ example: true })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;
}
