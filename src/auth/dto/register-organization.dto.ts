import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterOrganizationDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @IsNotEmpty()
  organizationName!: string;

  @ApiProperty({ example: 'acme' })
  @IsOptional()
  @IsString()
  subdomain?: string;

  @ApiProperty({ example: 'https://acme.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({ example: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: 'en-US' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiProperty({ example: 'Platform' })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({ example: 'Administrator' })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}
