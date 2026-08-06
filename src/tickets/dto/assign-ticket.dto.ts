import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AssignTicketDto {
  @ApiPropertyOptional({
    description:
      'Agent to assign. Omit to assign to yourself, or pass null to unassign.',
  })
  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @ApiPropertyOptional({ example: 'Please take a look at this' })
  @IsOptional()
  @IsString()
  message?: string;
}
