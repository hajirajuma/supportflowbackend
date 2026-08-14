import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const SORT_ORDER = ['asc', 'desc'] as const;

export class PlatformAdminQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'support' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Restrict results to one organization' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter organizations by subscription plan code (e.g. PRO)',
  })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ example: 'desc', enum: SORT_ORDER })
  @IsOptional()
  @IsIn(SORT_ORDER)
  sortOrder?: (typeof SORT_ORDER)[number];

  @ApiPropertyOptional({ example: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;
}
