import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiProperty({ example: 'SupportFlow' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'We build support software' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'https://supportflow.com' })
  @IsOptional()
  @IsString()
  @IsUrl()
  website?: string;

  @ApiProperty({ example: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({ example: 'support@supportflow.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiProperty({ example: '+1 555 123 4567' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiProperty({ example: '123 Market Street' })
  @IsOptional()
  @IsString()
  address?: string;

  // Backwards-compatible aliases used by other clients.
  @ApiProperty({ example: 'support@supportflow.com' })
  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @ApiProperty({ example: '+1 555 123 4567' })
  @IsOptional()
  @IsString()
  supportPhone?: string;
}
