import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TicketAccess } from '../types/ticket-access.type';

export const Access = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TicketAccess => {
    return ctx.switchToHttp().getRequest().ticketAccess;
  },
);
