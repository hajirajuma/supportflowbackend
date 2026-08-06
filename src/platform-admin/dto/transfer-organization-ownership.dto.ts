import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TransferOrganizationOwnershipDto {
  @ApiProperty({ example: 'cuid-user-id' })
  @IsUUID()
  userId!: string;
}
