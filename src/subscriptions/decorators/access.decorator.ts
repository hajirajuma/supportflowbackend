import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SubscriptionAccess } from '../enums/subscription.enums';

/** Injects the resolved `SubscriptionAccess` attached by SubscriptionAccessGuard. */
export const Access = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SubscriptionAccess => {
    const request = ctx.switchToHttp().getRequest();
    return request.subscriptionAccess as SubscriptionAccess;
  },
);
