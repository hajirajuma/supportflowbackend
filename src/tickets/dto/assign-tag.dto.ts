import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AssignTagDto {
  @ApiPropertyOptional({ description: 'Existing tag id to assign' })
  @IsOptional()
  @IsString()
  tagId?: string;

  @ApiPropertyOptional({
    example: 'billing',
    description: 'Tag name (created if missing)',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '#ef4444' })
  @IsOptional()
  @IsString()
  color?: string;
}
