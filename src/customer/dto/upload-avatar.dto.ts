import { ApiProperty } from '@nestjs/swagger';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export class UploadAvatarDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Image file (png, jpeg, webp, gif) up to 5MB',
  })
  file!: UploadedFile;
}
