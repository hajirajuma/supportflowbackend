import { ApiProperty } from '@nestjs/swagger';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export class UploadLogoDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Image file (png, jpeg, webp) up to 2MB',
  })
  file!: UploadedFile;
}
