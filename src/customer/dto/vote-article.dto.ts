import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class VoteArticleDto {
  @ApiProperty({
    example: true,
    description: 'Whether the article was helpful',
  })
  @IsBoolean()
  isHelpful!: boolean;
}
