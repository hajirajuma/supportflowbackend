import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class CreatePlatformOrganizationDto {
  @ApiProperty({ example: 'Acme Support' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'acme-support' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ example: 'support.acme.com' })
  @IsOptional()
  @IsString()
  subdomain?: string;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'en-US' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ example: 'hello@acme.com' })
  @IsOptional()
  @IsString()
  supportEmail?: string;

  @ApiPropertyOptional({ example: '+1 555 100 200' })
  @IsOptional()
  @IsString()
  supportPhone?: string;

  @ApiPropertyOptional({ example: 'Acme logo url' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsString()
  status?: string;
}
