import { SetMetadata } from '@nestjs/common';
import { DashboardRole } from '../enums/dashboard.enums';

export const DASHBOARD_ROLES_KEY = 'dashboardRoles';

/**
 * Restricts a dashboard/analytics/reporting route to a set of logical roles.
 * Enforced by `DashboardAccessGuard` using the resolved `DashboardAccess`.
 */
export const DashboardRoles = (...roles: DashboardRole[]) =>
  SetMetadata(DASHBOARD_ROLES_KEY, roles);
