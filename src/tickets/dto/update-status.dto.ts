import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TicketStatus } from '../enums/ticket.enums';

export class UpdateStatusDto {
  @ApiProperty({ enum: TicketStatus })
  @IsEnum(TicketStatus)
  status!: TicketStatus;

  @ApiPropertyOptional({ example: 'Waiting on more details from the customer' })
  @IsOptional()
  @IsString()
  message?: string;
}
