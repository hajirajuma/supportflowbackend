import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  NotificationChannelValue,
  NotificationTypeValue,
} from '../enums/notification.enums';

export class NotificationPreferenceOverrideDto {
  @ApiProperty({ enum: NotificationTypeValue })
  @IsEnum(NotificationTypeValue)
  type!: NotificationTypeValue;

  @ApiProperty({ enum: NotificationChannelValue })
  @IsEnum(NotificationChannelValue)
  channel!: NotificationChannelValue;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class NotificationPreferencesDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enableEmail?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enableInApp?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enableRealtime?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enableTicketUpdates?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enableFeedbackNotifications?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  enableMarketingEmails?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enableSecurityAlerts?: boolean;

  @ApiPropertyOptional({ example: '22:00', description: '24h "HH:mm" format' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'quietHoursStart must be in HH:mm (24h) format',
  })
  quietHoursStart?: string;

  @ApiPropertyOptional({ example: '07:00', description: '24h "HH:mm" format' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'quietHoursEnd must be in HH:mm (24h) format',
  })
  quietHoursEnd?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 'Europe/London' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    type: [NotificationPreferenceOverrideDto],
    description: 'Granular per-type/per-channel overrides',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceOverrideDto)
  overrides?: NotificationPreferenceOverrideDto[];
}

export class NotificationSettingsView {
  @ApiProperty()
  @IsBoolean()
  enableEmail!: boolean;

  @ApiProperty()
  @IsBoolean()
  enableInApp!: boolean;

  @ApiProperty()
  @IsBoolean()
  enableRealtime!: boolean;

  @ApiProperty()
  @IsBoolean()
  enableTicketUpdates!: boolean;

  @ApiProperty()
  @IsBoolean()
  enableFeedbackNotifications!: boolean;

  @ApiProperty()
  @IsBoolean()
  enableMarketingEmails!: boolean;

  @ApiProperty()
  @IsBoolean()
  enableSecurityAlerts!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quietHoursStart?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quietHoursEnd?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  overrides?: Record<string, boolean> | null;
}
