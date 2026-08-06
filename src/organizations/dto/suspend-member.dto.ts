import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class SuspendMemberDto {
  @ApiProperty({
    example: 'SUSPENDED',
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'],
  })
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'])
  @IsNotEmpty()
  status!: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING';
}
