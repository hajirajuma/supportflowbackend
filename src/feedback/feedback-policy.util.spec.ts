import { ForbiddenException } from '@nestjs/common';
import {
  assertIsStaff,
  assertIsCustomer,
  isStaff,
} from './feedback-policy.util';
import { FeedbackAccess } from './types/feedback-access.type';

function makeAccess(overrides: Partial<FeedbackAccess> = {}): FeedbackAccess {
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

describe('feedback-policy.util', () => {
  describe('isStaff', () => {
    it('recognizes every staff role', () => {
      expect(isStaff(makeAccess({ isAgent: true }))).toBe(true);
      expect(isStaff(makeAccess({ isAdmin: true }))).toBe(true);
      expect(isStaff(makeAccess({ isOwner: true }))).toBe(true);
      expect(isStaff(makeAccess({ isPlatformAdmin: true }))).toBe(true);
    });

    it('rejects customers', () => {
      expect(isStaff(makeAccess({ isCustomer: true, isAgent: false }))).toBe(
        false,
      );
    });
  });

  describe('assertIsStaff', () => {
    it('throws for customers', () => {
      expect(() =>
        assertIsStaff(makeAccess({ isCustomer: true, isAgent: false })),
      ).toThrow(ForbiddenException);
    });

    it('passes for agents', () => {
      expect(() => assertIsStaff(makeAccess())).not.toThrow();
    });
  });

  describe('assertIsCustomer', () => {
    it('throws for staff', () => {
      expect(() => assertIsCustomer(makeAccess())).toThrow(ForbiddenException);
    });

    it('passes for customers', () => {
      expect(() =>
        assertIsCustomer(makeAccess({ isCustomer: true, isAgent: false })),
      ).not.toThrow();
    });
  });
});
