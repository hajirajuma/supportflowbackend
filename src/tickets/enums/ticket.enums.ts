export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_FOR_CUSTOMER = 'WAITING_FOR_CUSTOMER',
  ON_HOLD = 'ON_HOLD',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TicketSource {
  PORTAL = 'PORTAL',
  EMAIL = 'EMAIL',
  API = 'API',
  PHONE = 'PHONE',
  CHAT = 'CHAT',
}

export enum TicketReplyType {
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT',
  INTERNAL_NOTE = 'INTERNAL_NOTE',
}

export const ALLOWED_TICKET_STATUS_TRANSITIONS: Record<
  TicketStatus,
  TicketStatus[]
> = {
  [TicketStatus.OPEN]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_CUSTOMER,
    TicketStatus.ON_HOLD,
    TicketStatus.ESCALATED,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.OPEN,
    TicketStatus.WAITING_FOR_CUSTOMER,
    TicketStatus.ON_HOLD,
    TicketStatus.ESCALATED,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.WAITING_FOR_CUSTOMER]: [
    TicketStatus.OPEN,
    TicketStatus.IN_PROGRESS,
    TicketStatus.ON_HOLD,
    TicketStatus.ESCALATED,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.ON_HOLD]: [
    TicketStatus.OPEN,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_CUSTOMER,
    TicketStatus.ESCALATED,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.ESCALATED]: [
    TicketStatus.OPEN,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_CUSTOMER,
    TicketStatus.ON_HOLD,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.RESOLVED]: [
    TicketStatus.OPEN,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_CUSTOMER,
    TicketStatus.ON_HOLD,
    TicketStatus.ESCALATED,
    TicketStatus.CLOSED,
    TicketStatus.REOPENED,
  ],
  [TicketStatus.CLOSED]: [
    TicketStatus.OPEN,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_CUSTOMER,
    TicketStatus.ON_HOLD,
    TicketStatus.ESCALATED,
    TicketStatus.REOPENED,
  ],
  [TicketStatus.REOPENED]: [
    TicketStatus.OPEN,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_CUSTOMER,
    TicketStatus.ON_HOLD,
    TicketStatus.ESCALATED,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
};
