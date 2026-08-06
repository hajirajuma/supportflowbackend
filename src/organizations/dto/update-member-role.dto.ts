import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateMemberRoleDto {
  @ApiProperty({
    example: 'SUPPORT_AGENT',
    enum: ['TENANT_OWNER', 'SUPPORT_AGENT', 'CUSTOMER'],
  })
  @IsEnum(['TENANT_OWNER', 'SUPPORT_AGENT', 'CUSTOMER'])
  role!: 'TENANT_OWNER' | 'SUPPORT_AGENT' | 'CUSTOMER';

  @ApiProperty({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}
