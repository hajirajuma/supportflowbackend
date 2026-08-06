import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  AnnouncementAudienceValue,
  AnnouncementStatusValue,
  NotificationPriorityValue,
  NotificationTypeValue,
} from '../enums/notification.enums';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Scheduled maintenance on August 10' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    example:
      'The platform will be briefly unavailable on 10 Aug 02:00-03:00 UTC.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({
    enum: NotificationTypeValue,
    default: NotificationTypeValue.ANNOUNCEMENT,
  })
  @IsOptional()
  @IsEnum(NotificationTypeValue)
  type?: NotificationTypeValue;

  @ApiPropertyOptional({
    enum: NotificationPriorityValue,
    default: NotificationPriorityValue.MEDIUM,
  })
  @IsOptional()
  @IsEnum(NotificationPriorityValue)
  priority?: NotificationPriorityValue;

  @ApiPropertyOptional({
    enum: AnnouncementAudienceValue,
    default: AnnouncementAudienceValue.ALL,
  })
  @IsOptional()
  @IsEnum(AnnouncementAudienceValue)
  audience?: AnnouncementAudienceValue;

  @ApiPropertyOptional({
    example: '2026-08-09T08:00:00.000Z',
    description:
      'When the announcement should be published. Omitting publishes immediately.',
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ example: '2026-08-20T23:59:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description:
      'Audience target refinements (platform admins): { roles?: string[]; organizationIds?: string[] }',
  })
  @IsOptional()
  @IsObject()
  audienceTarget?: Record<string, unknown>;
}

export class UpdateAnnouncementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional({ enum: NotificationTypeValue })
  @IsOptional()
  @IsEnum(NotificationTypeValue)
  type?: NotificationTypeValue;

  @ApiPropertyOptional({ enum: NotificationPriorityValue })
  @IsOptional()
  @IsEnum(NotificationPriorityValue)
  priority?: NotificationPriorityValue;

  @ApiPropertyOptional({ enum: AnnouncementAudienceValue })
  @IsOptional()
  @IsEnum(AnnouncementAudienceValue)
  audience?: AnnouncementAudienceValue;

  @ApiPropertyOptional({ enum: AnnouncementStatusValue })
  @IsOptional()
  @IsEnum(AnnouncementStatusValue)
  status?: AnnouncementStatusValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
