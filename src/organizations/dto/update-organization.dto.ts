import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiProperty({ example: 'SupportFlow' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'https://supportflow.com' })
  @IsOptional()
  @IsString()
  @IsUrl()
  website?: string;

  @ApiProperty({ example: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: 'en-US' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiProperty({ example: '123 Market Street' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'support@supportflow.com' })
  @IsOptional()
  @IsString()
  supportEmail?: string;

  @ApiProperty({ example: '+1 555 123 4567' })
  @IsOptional()
  @IsString()
  supportPhone?: string;
}
