import { Injectable } from '@nestjs/common';
import { TicketPriority } from '../enums/ticket.enums';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const FIRST_RESPONSE_SLA_MS: Record<TicketPriority, number> = {
  [TicketPriority.URGENT]: 4 * HOUR,
  [TicketPriority.HIGH]: 8 * HOUR,
  [TicketPriority.MEDIUM]: 24 * HOUR,
  [TicketPriority.LOW]: 72 * HOUR,
};

const RESOLUTION_SLA_MS: Record<TicketPriority, number> = {
  [TicketPriority.URGENT]: 24 * HOUR,
  [TicketPriority.HIGH]: 48 * HOUR,
  [TicketPriority.MEDIUM]: 7 * DAY,
  [TicketPriority.LOW]: 14 * DAY,
};

export interface SlaSnapshot {
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstResponseMet: boolean;
  resolutionMet: boolean;
  firstResponseOverdue: boolean;
  resolutionOverdue: boolean;
  firstResponseRemainingMs: number | null;
  resolutionRemainingMs: number | null;
  breached: boolean;
}

@Injectable()
export class SlaService {
  computeDeadlines(priority: TicketPriority) {
    const now = Date.now();
    return {
      firstResponseDueAt: new Date(now + FIRST_RESPONSE_SLA_MS[priority]),
      resolutionDueAt: new Date(now + RESOLUTION_SLA_MS[priority]),
    };
  }

  getSla(ticket: any): SlaSnapshot {
    const now = Date.now();
    const firstResponseDue = ticket.firstResponseDueAt
      ? new Date(ticket.firstResponseDueAt).getTime()
      : null;
    const resolutionDue = ticket.resolutionDueAt
      ? new Date(ticket.resolutionDueAt).getTime()
      : null;

    const firstResponseMet =
      !!ticket.firstRespondedAt &&
      firstResponseDue !== null &&
      new Date(ticket.firstRespondedAt).getTime() <= firstResponseDue;
    const resolutionMet =
      !!ticket.resolvedAt &&
      resolutionDue !== null &&
      new Date(ticket.resolvedAt).getTime() <= resolutionDue;

    const firstResponseOverdue =
      firstResponseDue !== null &&
      !ticket.firstRespondedAt &&
      now > firstResponseDue;
    const resolutionOverdue =
      resolutionDue !== null &&
      !ticket.resolvedAt &&
      !ticket.closedAt &&
      now > resolutionDue;

    const firstResponseRemainingMs =
      firstResponseDue !== null && !ticket.firstRespondedAt
        ? firstResponseDue - now
        : null;
    const resolutionRemainingMs =
      resolutionDue !== null && !ticket.resolvedAt && !ticket.closedAt
        ? resolutionDue - now
        : null;

    return {
      firstResponseDueAt: ticket.firstResponseDueAt ?? null,
      resolutionDueAt: ticket.resolutionDueAt ?? null,
      firstResponseMet,
      resolutionMet,
      firstResponseOverdue,
      resolutionOverdue,
      firstResponseRemainingMs,
      resolutionRemainingMs,
      breached: firstResponseOverdue || resolutionOverdue,
    };
  }
}
