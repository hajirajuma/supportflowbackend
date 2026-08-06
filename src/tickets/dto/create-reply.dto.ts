import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateReplyDto {
  @ApiProperty({ example: 'Thanks, I will try the suggested steps.' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({
    description: 'Create an internal note. Only allowed for staff.',
  })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'User ids to mention (staff only)',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  mentions?: string[];
}
