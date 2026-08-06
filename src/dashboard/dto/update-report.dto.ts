import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateReportDto, ReportScheduleDto } from './create-report.dto';

/**
 * Update a saved report. All fields are optional; `null` schedule clears the
 * recurring delivery. Renaming, favorite toggling and filter changes are all
 * supported here.
 */
export class UpdateReportDto extends PartialType(CreateReportDto) {
  @ApiPropertyOptional({
    description: 'New report name',
    example: 'Weekly tickets overview (renamed)',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description: 'Replace report filters',
    example: { dateFrom: '2026-08-01T00:00:00.000Z' },
  })
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Set to null to clear the recurring schedule',
    type: ReportScheduleDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportScheduleDto)
  schedule?: ReportScheduleDto | null;

  @ApiPropertyOptional({
    description: 'Mark / unmark as favourite',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}
