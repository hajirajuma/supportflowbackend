import { ForbiddenException } from '@nestjs/common';
import {
  assertTicketAccess,
  assertIsStaff,
  isStaff,
} from './ticket-policy.util';
import { TicketAccess } from './types/ticket-access.type';

function makeAccess(overrides: Partial<TicketAccess> = {}): TicketAccess {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    role: 'SUPPORT_AGENT',
    email: 'agent@example.com',
    isPlatformAdmin: false,
    isOwner: false,
    isAdmin: false,
    isAgent: true,
    isCustomer: false,
    ...overrides,
  };
}

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    organizationId: 'org-1',
    createdById: 'user-1',
    deletedAt: null,
    ...overrides,
  };
}

describe('ticket-policy.util', () => {
  describe('isStaff', () => {
    it('returns true for agents, admins, owners and platform admins', () => {
      expect(isStaff(makeAccess({ isAgent: true }))).toBe(true);
      expect(isStaff(makeAccess({ isAdmin: true }))).toBe(true);
      expect(isStaff(makeAccess({ isOwner: true }))).toBe(true);
      expect(isStaff(makeAccess({ isPlatformAdmin: true }))).toBe(true);
    });

    it('returns false for customers', () => {
      expect(isStaff(makeAccess({ isCustomer: true, isAgent: false }))).toBe(
        false,
      );
    });
  });

  describe('assertIsStaff', () => {
    it('allows staff', () => {
      expect(() => assertIsStaff(makeAccess())).not.toThrow();
    });

    it('rejects customers', () => {
      expect(() =>
        assertIsStaff(makeAccess({ isCustomer: true, isAgent: false })),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertTicketAccess', () => {
    it('allows staff within the same organization', () => {
      expect(() =>
        assertTicketAccess(makeTicket(), makeAccess()),
      ).not.toThrow();
    });

    it('allows platform admins into any ticket', () => {
      expect(() =>
        assertTicketAccess(
          makeTicket({ organizationId: 'other-org' }),
          makeAccess({ isPlatformAdmin: true, organizationId: null }),
        ),
      ).not.toThrow();
    });

    it('rejects missing or soft-deleted tickets', () => {
      expect(() => assertTicketAccess(null, makeAccess())).toThrow(
        ForbiddenException,
      );
      expect(() =>
        assertTicketAccess(makeTicket({ deletedAt: new Date() }), makeAccess()),
      ).toThrow(ForbiddenException);
    });

    it('rejects cross-organization access', () => {
      expect(() =>
        assertTicketAccess(
          makeTicket({ organizationId: 'other-org' }),
          makeAccess(),
        ),
      ).toThrow(ForbiddenException);
    });

    it('lets customers access their own tickets', () => {
      expect(() =>
        assertTicketAccess(
          makeTicket({ createdById: 'user-1' }),
          makeAccess({ isCustomer: true, isAgent: false }),
        ),
      ).not.toThrow();
    });

    it('rejects customers accessing tickets they did not create', () => {
      expect(() =>
        assertTicketAccess(
          makeTicket({ createdById: 'someone-else' }),
          makeAccess({ isCustomer: true, isAgent: false }),
        ),
      ).toThrow(ForbiddenException);
    });
  });
});
