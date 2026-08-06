import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FeedbackAccess } from '../types/feedback-access.type';

export const Access = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): FeedbackAccess => {
    return ctx.switchToHttp().getRequest().feedbackAccess;
  },
);
