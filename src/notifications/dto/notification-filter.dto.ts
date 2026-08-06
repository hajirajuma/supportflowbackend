import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  NOTIFICATION_SORT_OPTIONS,
  NotificationChannelValue,
  NotificationPriorityValue,
  NotificationSort,
  NotificationTypeValue,
} from '../enums/notification.enums';

export class NotificationFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: NotificationTypeValue })
  @IsOptional()
  @IsEnum(NotificationTypeValue)
  type?: NotificationTypeValue;

  @ApiPropertyOptional({ enum: NotificationChannelValue })
  @IsOptional()
  @IsEnum(NotificationChannelValue)
  channel?: NotificationChannelValue;

  @ApiPropertyOptional({ enum: NotificationPriorityValue })
  @IsOptional()
  @IsEnum(NotificationPriorityValue)
  priority?: NotificationPriorityValue;

  @ApiPropertyOptional({
    description: 'Filter read (true) or unread (false) notifications',
  })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({ description: 'Include archived notifications' })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional({
    description: 'Only show archived (true) or active (false) notifications',
  })
  @IsOptional()
  @IsBoolean()
  archivedOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Organization id (platform admins only)',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    enum: [...NOTIFICATION_SORT_OPTIONS],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(NOTIFICATION_SORT_OPTIONS)
  sort?: NotificationSort;
}
