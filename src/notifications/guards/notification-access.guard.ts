import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationAccess } from '../enums/notification.enums';

/**
 * Resolves the authenticated user into a `NotificationAccess` object that is
 * attached to the request. Tenant isolation is enforced downstream by every
 * service using `access.organizationId`.
 */
@Injectable()
export class NotificationAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const jwtUser = request.user;

    if (!jwtUser?.userId) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const user = await (this.prisma as any).user.findUnique({
      where: { id: jwtUser.userId },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active.');
    }

    // Role flags map the real UserRole enum values. The `x-organization-id`
    // header is honored ONLY for platform admins (their org-less accounts need
    // a target tenant); every other user's tenant scope comes from the JWT.
    const isPlatformAdmin = user.role === 'PLATFORM_ADMIN';
    const isTenantOwner = user.role === 'TENANT_OWNER';
    const isSupportAgent = user.role === 'SUPPORT_AGENT';
    const isCustomer = user.role === 'CUSTOMER';

    const headerOrganizationId = request.headers?.['x-organization-id'] as
      string | undefined;

    const access: NotificationAccess = {
      userId: user.id,
      organizationId: isPlatformAdmin
        ? (headerOrganizationId ?? null)
        : (user.organizationId ?? null),
      role: user.role,
      email: user.email,
      isPlatformAdmin,
      isOwner: isTenantOwner,
      isAdmin: isTenantOwner,
      isAgent: isSupportAgent,
      isCustomer,
    };

    request.notificationAccess = access;

    return true;
  }
}
