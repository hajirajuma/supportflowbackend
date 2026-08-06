import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { NotificationFilterDto } from './notification-filter.dto';

export class NotificationSearchDto extends NotificationFilterDto {
  @ApiPropertyOptional({
    example: 'ticket SF-1042',
    description:
      'Free-text search across title, body, and payload data (platform admins can also search by user)',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by recipient user id (platform admins only)',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}
