import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class InviteUserDto {
  @ApiProperty({ example: 'new.agent@supportflow.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'SUPPORT_AGENT',
    enum: ['TENANT_OWNER', 'SUPPORT_AGENT', 'CUSTOMER'],
  })
  @IsEnum(['TENANT_OWNER', 'SUPPORT_AGENT', 'CUSTOMER'])
  role!: 'TENANT_OWNER' | 'SUPPORT_AGENT' | 'CUSTOMER';

  @ApiProperty({ example: 'invitation note' })
  @IsOptional()
  @IsString()
  message?: string;
}
