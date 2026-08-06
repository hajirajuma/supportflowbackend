import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DashboardAccess } from '../types/dashboard-access.type';

/** Injects the `DashboardAccess` resolved by `DashboardAccessGuard`. */
export const DashboardContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DashboardAccess => {
    return ctx.switchToHttp().getRequest().dashboardAccess;
  },
);
