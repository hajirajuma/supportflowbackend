import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({ example: 'owner@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
