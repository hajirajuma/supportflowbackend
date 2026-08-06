import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from './pagination.dto';
import { ReportCategory, REPORT_CATEGORIES } from '../enums/dashboard.enums';

/**
 * Search + pagination query for saved reports. Searches by name/description,
 * category, creator and creation range. All results remain tenant-scoped.
 */
export class ReportSearchDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Free-text search on report name or description',
    example: 'weekly',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by report category',
    enum: REPORT_CATEGORIES,
    example: ReportCategory.TICKETS,
  })
  @IsOptional()
  @IsIn(REPORT_CATEGORIES)
  category?: ReportCategory;

  @ApiPropertyOptional({
    description: 'Platform admin only: filter by creator user id',
    example: 'usr_001',
  })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'Created at or after this timestamp',
    example: '2026-08-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Created at or before this timestamp',
    example: '2026-08-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
