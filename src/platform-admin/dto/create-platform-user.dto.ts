import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePlatformUserDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: 'jane@acme.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: 'Support123!' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ example: 'CUSTOMER' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ example: 'cuid-org-id' })
  @IsOptional()
  @IsString()
  organizationId?: string;
}
