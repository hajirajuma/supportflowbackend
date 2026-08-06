import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { TicketFilterDto } from './ticket-filter.dto';

export class SearchTicketDto extends TicketFilterDto {
  @ApiPropertyOptional({ example: 'SF-1042 login issue' })
  @IsOptional()
  @IsString()
  search?: string;
}
