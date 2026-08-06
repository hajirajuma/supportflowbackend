import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateKnowledgeCategoryDto {
  @ApiProperty({ example: 'Billing' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Billing related guides and policies' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Parent category id' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
