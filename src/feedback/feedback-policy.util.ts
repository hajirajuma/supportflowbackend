import { ForbiddenException } from '@nestjs/common';
import { FeedbackAccess } from './types/feedback-access.type';

export function isStaff(access: FeedbackAccess): boolean {
  return (
    access.isAgent || access.isAdmin || access.isOwner || access.isPlatformAdmin
  );
}

export function assertIsStaff(access: FeedbackAccess): void {
  if (!isStaff(access)) {
    throw new ForbiddenException(
      'Only support agents or tenant owners can perform this action',
    );
  }
}

export function assertIsCustomer(access: FeedbackAccess): void {
  if (!access.isCustomer) {
    throw new ForbiddenException('This action is only available to customers');
  }
}
