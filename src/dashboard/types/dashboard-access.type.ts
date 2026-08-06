/**
 * Access context for dashboard / analytics / reporting routes.
 *
 * Resolved from the authenticated JWT user in `DashboardAccessGuard` and
 * attached to the request. Every data query in this module is scoped through
 * this object — never through client-supplied tenant identifiers alone — which
 * guarantees strict multi-tenant isolation.
 */
export interface DashboardAccess {
  userId: string;
  organizationId: string | null;
  role: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  isPlatformAdmin: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isCustomer: boolean;
  isViewer?: boolean;
}

export interface ChartDataset {
  label: string;
  data: number[];
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'area' | 'donut' | 'trend';
  labels: string[];
  datasets: ChartDataset[];
}

/** Whether the user belongs to the support staff of an organization. */
export function isStaff(access: DashboardAccess): boolean {
  return access.isOwner || access.isAdmin || access.isAgent;
}

/** Whether the user can administer an organization (owner or admin). */
export function isTenantAdmin(access: DashboardAccess): boolean {
  return access.isOwner || access.isAdmin;
}

/**
 * Resolve the effective organization scope for a query.
 *
 *  - Platform admins may scope to any organization (via `organizationId`),
 *    or leave it undefined to mean "the entire platform".
 *  - Everyone else is hard-pinned to their own organization.
 */
export function resolveOrgScope(
  access: DashboardAccess,
  requestedOrganizationId?: string,
): string | null {
  if (access.isPlatformAdmin) {
    return requestedOrganizationId ?? null;
  }
  return access.organizationId;
}
