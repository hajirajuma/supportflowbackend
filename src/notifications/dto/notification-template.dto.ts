import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  NotificationChannelValue,
  NotificationTemplateStatusValue,
  NotificationTypeValue,
} from '../enums/notification.enums';

export class CreateNotificationTemplateDto {
  @ApiProperty({ example: 'Ticket resolved' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'ticket-resolved' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: NotificationTypeValue })
  @IsEnum(NotificationTypeValue)
  type!: NotificationTypeValue;

  @ApiPropertyOptional({
    enum: NotificationChannelValue,
    default: NotificationChannelValue.EMAIL,
  })
  @IsOptional()
  @IsEnum(NotificationChannelValue)
  channel?: NotificationChannelValue;

  @ApiProperty({ example: 'Ticket #{{ticketNumber}} has been resolved' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({
    example: 'Hello {{firstName}}, ticket #{{ticketNumber}} is resolved.',
  })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['firstName', 'ticketNumber'],
    description: 'Variable placeholders the template may use',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({
    enum: NotificationTemplateStatusValue,
    default: NotificationTemplateStatusValue.ACTIVE,
  })
  @IsOptional()
  @IsEnum(NotificationTemplateStatusValue)
  status?: NotificationTemplateStatusValue;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateNotificationTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: NotificationTypeValue })
  @IsOptional()
  @IsEnum(NotificationTypeValue)
  type?: NotificationTypeValue;

  @ApiPropertyOptional({ enum: NotificationChannelValue })
  @IsOptional()
  @IsEnum(NotificationChannelValue)
  channel?: NotificationChannelValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({ enum: NotificationTemplateStatusValue })
  @IsOptional()
  @IsEnum(NotificationTemplateStatusValue)
  status?: NotificationTemplateStatusValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
