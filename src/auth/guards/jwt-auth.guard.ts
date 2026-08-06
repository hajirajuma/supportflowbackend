import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { RequestContextService } from '../../request-context/request-context.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    // Explicit @Inject: subclasses of the passport AuthGuard mixin can lose
    // design:paramtypes, which would leave these dependencies undefined.
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RequestContextService)
    private readonly requestContextService: RequestContextService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const activated = await super.canActivate(context);
    if (!activated) {
      return false;
    }

    // The tenant middleware creates the AsyncLocalStorage snapshot before
    // guards run, so it is still live here. Populate it with the JWT user so
    // RequestContextService.getCurrentUserId()/getCurrentRole() work reliably
    // for authenticated routes. The snapshot is request-scoped, so mutation is
    // safe. The user's own organization always wins over the subdomain-resolved
    // tenant (prevents cross-tenant context poisoning via Host headers).
    const request = context.switchToHttp().getRequest();
    const current = this.requestContextService.getCurrent();
    if (current && request.user) {
      current.userId = request.user.userId;
      current.organizationId =
        request.user.organizationId ?? current.organizationId;
      current.role = request.user.role;
    }

    return true;
  }
}
