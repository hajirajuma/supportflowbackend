import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { NotificationAccess } from '../enums/notification.enums';

/** Injects the resolved `NotificationAccess` attached by NotificationAccessGuard. */
export const Access = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): NotificationAccess => {
    const request = ctx.switchToHttp().getRequest();
    return request.notificationAccess as NotificationAccess;
  },
);
