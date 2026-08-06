import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateReplyDto {
  @ApiProperty({ example: 'Edited reply body' })
  @IsString()
  @IsNotEmpty()
  body!: string;
}
