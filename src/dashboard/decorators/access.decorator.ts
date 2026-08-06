import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DashboardAccess } from '../types/dashboard-access.type';

export const Access = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DashboardAccess => {
    return ctx.switchToHttp().getRequest().dashboardAccess;
  },
);
