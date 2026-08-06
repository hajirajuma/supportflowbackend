export interface FeedbackAccess {
  userId: string;
  organizationId: string | null;
  role: string;
  email: string;
  isPlatformAdmin: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isCustomer: boolean;
}
