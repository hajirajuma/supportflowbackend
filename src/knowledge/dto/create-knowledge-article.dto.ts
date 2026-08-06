import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ArrayUnique,
} from 'class-validator';

const ARTICLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const ARTICLE_VISIBILITY = ['PUBLIC', 'PRIVATE', 'INTERNAL'] as const;

export class CreateKnowledgeArticleDto {
  @ApiProperty({ example: 'How to reset your password' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 'Step by step guide...' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ example: 'A quick guide to password recovery' })
  @IsOptional()
  @IsString()
  excerpt?: string;

  @ApiPropertyOptional({ example: 'how-to-reset-your-password' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ description: 'Category id for the article' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ARTICLE_STATUSES })
  @IsOptional()
  @IsIn(ARTICLE_STATUSES)
  status?: (typeof ARTICLE_STATUSES)[number];

  @ApiPropertyOptional({ enum: ARTICLE_VISIBILITY })
  @IsOptional()
  @IsIn(ARTICLE_VISIBILITY)
  visibility?: (typeof ARTICLE_VISIBILITY)[number];

  @ApiPropertyOptional({ type: [String], description: 'Tag names' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Related article ids' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  relatedArticleIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'File upload ids' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];

  @ApiPropertyOptional({ example: 'SEO title' })
  @IsOptional()
  @IsString()
  seoTitle?: string;

  @ApiPropertyOptional({ example: 'SEO description' })
  @IsOptional()
  @IsString()
  seoDescription?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata stored with the article',
  })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
