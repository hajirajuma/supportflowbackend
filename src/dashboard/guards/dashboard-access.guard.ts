import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardAccess } from '../types/dashboard-access.type';
import { DASHBOARD_ROLES_KEY } from '../decorators/dashboard-roles.decorator';
import { DashboardRole } from '../enums/dashboard.enums';

/**
 * Builds the tenant-scoped `DashboardAccess` from the authenticated JWT user
 * and enforces the logical role matrix declared via `@DashboardRoles(...)`.
 *
 *  - PLATFORM_ADMIN  -> `isPlatformAdmin` (global access)
 *  - TENANT_OWNER    -> organization owner/admin (tenant-scoped)
 *  - SUPPORT_AGENT   -> support agents (organization + assigned tickets)
 *  - CUSTOMER        -> customers (personal scope only)
 */
@Injectable()
export class DashboardAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

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

    const headerOrganizationId = request.headers?.['x-organization-id'] as
      string | undefined;

    const isPlatformAdmin = user.role === 'PLATFORM_ADMIN';
    const isTenantOwner = user.role === 'TENANT_OWNER';
    const isSupportAgent = user.role === 'SUPPORT_AGENT';
    const isCustomer = user.role === 'CUSTOMER';

    const access: DashboardAccess = {
      userId: user.id,
      organizationId: isPlatformAdmin
        ? (headerOrganizationId ?? null)
        : (user.organizationId ?? null),
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isPlatformAdmin,
      isOwner: isTenantOwner,
      isAdmin: isTenantOwner,
      isAgent: isSupportAgent,
      isCustomer,
      isViewer: isCustomer,
    };

    this.enforceRoles(context, access);

    request.dashboardAccess = access;

    return true;
  }

  private enforceRoles(
    context: ExecutionContext,
    access: DashboardAccess,
  ): void {
    const allowed = this.reflector.getAllAndOverride<DashboardRole[]>(
      DASHBOARD_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowed?.length) {
      return;
    }

    const permitted = allowed.some((role) => this.matches(role, access));

    if (!permitted) {
      throw new ForbiddenException(
        'You do not have permission to access this dashboard or report.',
      );
    }
  }

  private matches(role: DashboardRole, access: DashboardAccess): boolean {
    switch (role) {
      case DashboardRole.PLATFORM_ADMIN:
        return access.isPlatformAdmin;
      case DashboardRole.TENANT_OWNER:
        return access.isOwner || access.isAdmin;
      case DashboardRole.SUPPORT_AGENT:
        return access.isAgent;
      case DashboardRole.CUSTOMER:
        return access.isCustomer;
      default:
        return false;
    }
  }
}
