import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReassignTicketDto {
  @ApiProperty({ description: 'New assignee (agent) id' })
  @IsString()
  @IsNotEmpty()
  assigneeId!: string;

  @ApiPropertyOptional({ example: 'Handing this over to the Billing team' })
  @IsOptional()
  @IsString()
  message?: string;
}
