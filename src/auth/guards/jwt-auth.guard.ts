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

    // The bootstrap middleware (main.ts) creates the AsyncLocalStorage
    // snapshot before guards run, so it is still live here. Populate it with
    // the authenticated user so RequestContextService.getCurrentUserId() /
    // getCurrentOrganizationId() work reliably for authenticated routes. The
    // organizationId comes from JwtStrategy, which re-reads it from the user's
    // database record — the JWT claim can never smuggle another tenant.
    const request = context.switchToHttp().getRequest();
    const current = this.requestContextService.getCurrent();
    if (current && request.user) {
      current.userId = request.user.userId;
      current.organizationId = request.user.organizationId;
      current.role = request.user.role;
    }

    return true;
  }
}
