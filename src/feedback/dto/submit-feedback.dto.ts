import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Multipart submission payload. `answers` is a JSON-encoded array of
 * `{ questionId, value }` entries; `files` carries optional supporting
 * attachments (images, PDFs, documents).
 */
export class SubmitFeedbackDto {
  @ApiPropertyOptional({
    description: 'Feedback request id (from the emailed survey link)',
  })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional({
    description: 'Form id (alternative to requestId for direct submissions)',
  })
  @IsOptional()
  @IsString()
  formId?: string;

  @ApiPropertyOptional({
    description: 'Ticket id (alternative to requestId for direct submissions)',
  })
  @IsOptional()
  @IsString()
  ticketId?: string;

  @ApiPropertyOptional({ example: 'The agent was very helpful, thank you!' })
  @IsOptional()
  @IsString()
  publicComment?: string;

  @ApiPropertyOptional({
    description: 'Private comment only visible to staff',
  })
  @IsOptional()
  @IsString()
  privateComment?: string;

  @ApiProperty({
    example:
      '[{"questionId":"q_1","value":5},{"questionId":"q_2","value":"yes"}]',
    description: 'JSON-encoded array of question answers',
  })
  @IsString()
  answers!: string;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Optional supporting attachments (up to 10)',
  })
  files?: UploadedFile[];
}
