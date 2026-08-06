import { ForbiddenException } from '@nestjs/common';
import type { DashboardAccess } from '../types/dashboard-access.type';

export interface ResolvedScope {
  organizationId?: string;
  organizationIds?: string[];
  agentId?: string;
  customerId?: string;
}

export interface ScopeableFilter {
  organizationId?: string;
  organizationIds?: string[];
  agentId?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Central multi-tenant scope resolver. Platform admins may scope across any
 * organization (or the whole platform); every other role is hard-locked to
 * their own organization. Support agents may only view their own assigned
 * ticket scope unless they are an owner/admin of the organization.
 */
export function resolveScope(
  access: DashboardAccess,
  filter?: ScopeableFilter,
  opts?: { allowAgentScope?: boolean },
): ResolvedScope {
  const scope: ResolvedScope = {};

  if (access.isPlatformAdmin) {
    if (filter?.organizationIds?.length) {
      scope.organizationIds = filter.organizationIds;
    } else if (filter?.organizationId) {
      scope.organizationId = filter.organizationId;
    }
    scope.agentId = filter?.agentId;
    scope.customerId = filter?.customerId;
    return scope;
  }

  if (!access.organizationId) {
    throw new ForbiddenException(
      'Organization context is required for analytics.',
    );
  }

  scope.organizationId = access.organizationId;

  if (filter?.agentId) {
    const canScopeAgent =
      access.isOwner ||
      access.isAdmin ||
      (opts?.allowAgentScope &&
        access.isAgent &&
        filter.agentId === access.userId);
    if (!canScopeAgent) {
      throw new ForbiddenException('You cannot view another agent analytics.');
    }
    scope.agentId = filter.agentId;
  }

  if (filter?.customerId) {
    const canScopeCustomer = access.isOwner || access.isAdmin || access.isAgent;
    if (!canScopeCustomer) {
      throw new ForbiddenException(
        'You cannot view another customer analytics.',
      );
    }
    scope.customerId = filter.customerId;
  }

  return scope;
}

/** Builds the Prisma `where` clause for tenant-isolated ticket queries. */
export function ticketScopeWhere(
  scope: ResolvedScope,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const where: Record<string, unknown> = { ...extra };
  if (scope.organizationIds?.length) {
    where.organizationId = { in: scope.organizationIds };
  } else if (scope.organizationId) {
    where.organizationId = scope.organizationId;
  }
  if (scope.agentId) where.assignedToId = scope.agentId;
  if (scope.customerId) where.createdById = scope.customerId;
  return where;
}

export function baseScopeWhere(
  scope: ResolvedScope,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const where: Record<string, unknown> = { ...extra };
  if (scope.organizationIds?.length) {
    where.organizationId = { in: scope.organizationIds };
  } else if (scope.organizationId) {
    where.organizationId = scope.organizationId;
  }
  return where;
}
