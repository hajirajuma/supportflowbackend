import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePlatformSettingDto {
  @ApiProperty({ example: 'app.name' })
  @IsString()
  key!: string;

  @ApiProperty({ example: 'SupportFlow' })
  value!: any;

  @ApiProperty({ example: 'Application name' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: false })
  @IsOptional()
  @IsBoolean()
  isEncrypted?: boolean;
}
