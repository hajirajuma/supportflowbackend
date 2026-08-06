import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const ARTICLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const ARTICLE_VISIBILITY = ['PUBLIC', 'PRIVATE', 'INTERNAL'] as const;
const SORT_FIELDS = [
  'publishedAt',
  'createdAt',
  'updatedAt',
  'views',
  'likes',
] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

export class KnowledgeArticleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'password' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ARTICLE_STATUSES })
  @IsOptional()
  @IsIn(ARTICLE_STATUSES)
  status?: (typeof ARTICLE_STATUSES)[number];

  @ApiPropertyOptional({ enum: ARTICLE_VISIBILITY })
  @IsOptional()
  @IsIn(ARTICLE_VISIBILITY)
  visibility?: (typeof ARTICLE_VISIBILITY)[number];

  @ApiPropertyOptional({ description: 'Filter by tag name' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ enum: SORT_FIELDS })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: (typeof SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: SORT_ORDERS })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: (typeof SORT_ORDERS)[number];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeArchived?: boolean;
}
