import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateFeedbackDto {
  @ApiPropertyOptional({
    example: '[{"questionId":"q_1","value":4}]',
    description: 'JSON-encoded array of question answers (full replacement)',
  })
  @IsOptional()
  @IsString()
  answers?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publicComment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  privateComment?: string;
}
