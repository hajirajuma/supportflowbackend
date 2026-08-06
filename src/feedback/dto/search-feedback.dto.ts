import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { FilterFeedbackDto } from './filter-feedback.dto';

export class SearchFeedbackDto extends FilterFeedbackDto {
  @ApiPropertyOptional({
    example: 'SF-1042 john@example.com',
    description:
      'Free-text search across ticket number/subject, customer, agent, organization, survey title and comments',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
