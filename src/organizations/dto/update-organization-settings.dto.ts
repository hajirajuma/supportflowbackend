import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateOrganizationSettingsDto {
  @ApiProperty({ example: 'SupportFlow Portal' })
  @IsOptional()
  @IsString()
  portalTitle?: string;

  @ApiProperty({ example: 'support@supportflow.com' })
  @IsOptional()
  @IsString()
  supportEmail?: string;

  @ApiProperty({ example: '+1 555 0100' })
  @IsOptional()
  @IsString()
  supportPhone?: string;

  @ApiProperty({ example: 'en-US' })
  @IsOptional()
  @IsString()
  defaultLanguage?: string;

  @ApiProperty({ example: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: true })
  @IsOptional()
  @IsBoolean()
  customerPortalEnabled?: boolean;

  @ApiProperty({ example: true })
  @IsOptional()
  @IsBoolean()
  feedbackEnabled?: boolean;

  @ApiProperty({ example: true })
  @IsOptional()
  @IsBoolean()
  knowledgeBaseEnabled?: boolean;

  @ApiProperty({ example: '#3B82F6' })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiProperty({ example: '#6366F1' })
  @IsOptional()
  @IsString()
  secondaryColor?: string;
}
