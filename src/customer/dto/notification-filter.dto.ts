import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum NotificationTypeFilter {
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

export enum NotificationChannelFilter {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
}

export class NotificationFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: NotificationTypeFilter })
  @IsOptional()
  @IsEnum(NotificationTypeFilter)
  type?: NotificationTypeFilter;

  @ApiPropertyOptional({ enum: NotificationChannelFilter })
  @IsOptional()
  @IsEnum(NotificationChannelFilter)
  channel?: NotificationChannelFilter;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({ example: 'createdAt:desc' })
  @IsOptional()
  @IsString()
  sort?: string;
}
