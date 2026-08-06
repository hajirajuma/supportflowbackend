import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Enforces that a route has an organization context. The `x-organization-id`
 * header is honored ONLY for platform admins (their accounts are org-less and
 * need an explicit target); every other user's tenant must come from the JWT,
 * so cross-tenant requests can never be smuggled via headers.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.userId) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const isPlatformAdmin = user.role === 'PLATFORM_ADMIN';
    const organizationId = isPlatformAdmin
      ? (request.headers['x-organization-id'] as string | undefined)
      : user.organizationId;

    if (!organizationId) {
      throw new UnauthorizedException(
        'Organization context is required for this route.',
      );
    }

    return true;
  }
}
