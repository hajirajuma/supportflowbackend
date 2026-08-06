import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionAccess } from '../enums/subscription.enums';

/**
 * Resolves the authenticated user into a `SubscriptionAccess` object attached to
 * the request. Business rules (platform admin manages plans, tenant owner/admin
 * manage their own subscription, agents read-only, customers none) are enforced
 * downstream in every service using `access`.
 */
@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
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

    const access: SubscriptionAccess = {
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

    request.subscriptionAccess = access;

    return true;
  }
}
