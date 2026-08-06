import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export enum NotificationPreferenceType {
  TICKET_ASSIGNED = 'TICKET_ASSIGNED',
  TICKET_UPDATED = 'TICKET_UPDATED',
  TICKET_REPLIED = 'TICKET_REPLIED',
  TICKET_RESOLVED = 'TICKET_RESOLVED',
  TICKET_MENTIONED = 'TICKET_MENTIONED',
  FEEDBACK_REQUEST = 'FEEDBACK_REQUEST',
  INVITATION_RECEIVED = 'INVITATION_RECEIVED',
  SUBSCRIPTION_EXPIRING = 'SUBSCRIPTION_EXPIRING',
  SYSTEM = 'SYSTEM',
}

export enum NotificationPreferenceChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
}

export class NotificationPreferenceDto {
  @ApiProperty({
    enum: NotificationPreferenceType,
    example: NotificationPreferenceType.TICKET_REPLIED,
  })
  @IsEnum(NotificationPreferenceType)
  type!: NotificationPreferenceType;

  @ApiProperty({
    enum: NotificationPreferenceChannel,
    example: NotificationPreferenceChannel.EMAIL,
  })
  @IsEnum(NotificationPreferenceChannel)
  channel!: NotificationPreferenceChannel;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: 'en-US' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  darkMode?: boolean;

  @ApiPropertyOptional({ type: [NotificationPreferenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceDto)
  notificationPreferences?: NotificationPreferenceDto[];
}
