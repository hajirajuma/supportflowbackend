import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FeedbackFormStatus,
  FeedbackQuestionType,
} from '../enums/feedback.enums';

export class CreateQuestionDto {
  @ApiProperty({ enum: FeedbackQuestionType })
  @IsEnum(FeedbackQuestionType)
  questionType!: FeedbackQuestionType;

  @ApiProperty({ example: 'Overall, how satisfied are you?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeholder?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    example: 'overall',
    description:
      'Stable analytics key for rating questions (overall, agent_professionalism, response_speed, resolution_quality, communication, recommend)',
  })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Options for MULTIPLE_CHOICE / CHECKBOX / DROPDOWN',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({
    example: { scale: '1-5', min: 1, max: 5 },
    description:
      'Validation rules: scale for RATING (1-5, 1-10, stars, emoji), min/max for NUMBER, regex for text',
  })
  @IsOptional()
  @IsObject()
  validation?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateFeedbackFormDto {
  @ApiProperty({ example: 'Post-resolution satisfaction survey' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'post-resolution-survey' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({
    enum: FeedbackFormStatus,
    default: FeedbackFormStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(FeedbackFormStatus)
  status?: FeedbackFormStatus;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowAnonymous?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  notifyByEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thankYouMessage?: string;

  @ApiPropertyOptional({ example: 'https://supportflow.app/thanks' })
  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @ApiPropertyOptional({ example: '2026-08-10T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Mark as the automatic post-resolution satisfaction survey',
  })
  @IsOptional()
  @IsBoolean()
  isSatisfactionSurvey?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Allow more than one response per ticket',
  })
  @IsOptional()
  @IsBoolean()
  allowMultipleResponses?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Require the customer to leave a comment',
  })
  @IsOptional()
  @IsBoolean()
  requireComment?: boolean;

  @ApiPropertyOptional({ description: 'Feedback category id' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ type: [CreateQuestionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions?: CreateQuestionDto[];
}
