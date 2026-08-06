import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ResendInvitationDto {
  @ApiProperty({ example: 'Please resend this invitation' })
  @IsOptional()
  @IsString()
  message?: string;
}
