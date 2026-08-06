import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class KnowledgeBaseSearchDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'reset password' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter articles by category id' })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
