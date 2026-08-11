import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class InviteUserDto {
  @ApiProperty({ example: 'new.agent@supportflow.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'SUPPORT_AGENT',
    enum: ['SUPPORT_AGENT', 'CUSTOMER'],
  })
  // Normalize casing so the frontend may send either 'support_agent' or
  // 'SUPPORT_AGENT' without tripping IsEnum.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(['SUPPORT_AGENT', 'CUSTOMER'])
  role!: 'SUPPORT_AGENT' | 'CUSTOMER';

  @ApiProperty({ example: 'invitation note' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ example: 7, description: 'Validity period in days (1-30)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresIn?: number;
}
