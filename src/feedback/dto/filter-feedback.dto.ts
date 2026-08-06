import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  FEEDBACK_SORT_OPTIONS,
  FeedbackResponseStatus,
  FeedbackSort,
} from '../enums/feedback.enums';

export class FilterFeedbackDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by form id' })
  @IsOptional()
  @IsString()
  formId?: string;

  @ApiPropertyOptional({ enum: FeedbackResponseStatus })
  @IsOptional()
  @IsEnum(FeedbackResponseStatus)
  status?: FeedbackResponseStatus;

  @ApiPropertyOptional({ description: 'Filter by customer (submitter) id' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filter by agent id (ticket assignee)' })
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional({ description: 'Filter by ticket id' })
  @IsOptional()
  @IsString()
  ticketId?: string;

  @ApiPropertyOptional({
    description: 'Exact overall rating (1-5)',
    type: 'number',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ type: 'number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  ratingFrom?: number;

  @ApiPropertyOptional({ type: 'number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  ratingTo?: number;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Organization id (platform admins only)',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ enum: [...FEEDBACK_SORT_OPTIONS] })
  @IsOptional()
  @IsIn(FEEDBACK_SORT_OPTIONS)
  sort?: FeedbackSort;
}
