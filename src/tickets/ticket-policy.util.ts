import { ForbiddenException } from '@nestjs/common';
import { TicketAccess } from './types/ticket-access.type';

export function isStaff(access: TicketAccess): boolean {
  return (
    access.isAgent || access.isAdmin || access.isOwner || access.isPlatformAdmin
  );
}

/**
 * Verifies that the current user may interact with the given ticket.
 * - Platform admins can access every ticket.
 * - Staff (agent/admin/owner) can access tickets inside their organization.
 * - Customers can only access tickets they created.
 */
export function assertTicketAccess(ticket: any, access: TicketAccess): void {
  if (!ticket || ticket.deletedAt) {
    throw new ForbiddenException('Ticket not found');
  }

  if (access.isPlatformAdmin) {
    return;
  }

  if (
    access.organizationId &&
    ticket.organizationId !== access.organizationId
  ) {
    throw new ForbiddenException('You do not have access to this ticket');
  }

  if (access.isCustomer && ticket.createdById !== access.userId) {
    throw new ForbiddenException('You do not have access to this ticket');
  }
}

export function assertIsStaff(access: TicketAccess): void {
  if (!isStaff(access)) {
    throw new ForbiddenException(
      'Only support agents or tenant owners can perform this action',
    );
  }
}
