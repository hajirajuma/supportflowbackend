import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class KnowledgeArticleCommentDto {
  @ApiProperty({ example: 'This was really helpful, thank you!' })
  @IsString()
  @MinLength(1)
  comment!: string;
}
