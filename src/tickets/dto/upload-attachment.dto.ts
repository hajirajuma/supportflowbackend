import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export class UploadAttachmentDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Files to upload (up to 10, max 25MB each)',
  })
  files!: UploadedFile[];

  @ApiPropertyOptional({
    description: 'Mark the upload as customer evidence',
    example: true,
  })
  isEvidence?: string;
}
