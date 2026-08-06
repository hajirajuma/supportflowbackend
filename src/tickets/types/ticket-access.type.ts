export interface TicketAccess {
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

export interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  source: string;
  categoryId: string | null;
  departmentId: string | null;
  createdById: string;
  assignedToId: string | null;
  dueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  lastActivityAt: Date | null;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}
