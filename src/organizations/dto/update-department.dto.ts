import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDepartmentDto {
  @ApiProperty({ example: 'Engineering' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Department name must be at least 2 characters' })
  name?: string;

  @ApiProperty({ example: 'Handles product engineering' })
  @IsOptional()
  @IsString()
  description?: string;
}
