export enum NotificationTypeValue {
  INVITATION_RECEIVED = 'INVITATION_RECEIVED',
  INVITATION_SENT = 'INVITATION_SENT',
  INVITATION_ACCEPTED = 'INVITATION_ACCEPTED',
  USER_REGISTERED = 'USER_REGISTERED',
  USER_LOGGED_IN = 'USER_LOGGED_IN',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  LOGIN_ALERT = 'LOGIN_ALERT',
  SECURITY_ALERT = 'SECURITY_ALERT',
  TICKET_CREATED = 'TICKET_CREATED',
  TICKET_ASSIGNED = 'TICKET_ASSIGNED',
  TICKET_REASSIGNED = 'TICKET_REASSIGNED',
  TICKET_UPDATED = 'TICKET_UPDATED',
  TICKET_REPLIED = 'TICKET_REPLIED',
  TICKET_MENTIONED = 'TICKET_MENTIONED',
  TICKET_RESOLVED = 'TICKET_RESOLVED',
  TICKET_CLOSED = 'TICKET_CLOSED',
  TICKET_REOPENED = 'TICKET_REOPENED',
  SLA_WARNING = 'SLA_WARNING',
  SLA_BREACHED = 'SLA_BREACHED',
  FEEDBACK_REQUEST = 'FEEDBACK_REQUEST',
  FEEDBACK_REMINDER = 'FEEDBACK_REMINDER',
  FEEDBACK_SUBMITTED = 'FEEDBACK_SUBMITTED',
  NEGATIVE_FEEDBACK = 'NEGATIVE_FEEDBACK',
  FEEDBACK_EXPIRED = 'FEEDBACK_EXPIRED',
  ORGANIZATION_UPDATED = 'ORGANIZATION_UPDATED',
  SUBSCRIPTION_EXPIRING = 'SUBSCRIPTION_EXPIRING',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  TRIAL_STARTED = 'TRIAL_STARTED',
  TRIAL_ENDING = 'TRIAL_ENDING',
  TRIAL_EXPIRED = 'TRIAL_EXPIRED',
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_SUCCESSFUL = 'PAYMENT_SUCCESSFUL',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  SUBSCRIPTION_ACTIVATED = 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_RENEWED = 'SUBSCRIPTION_RENEWED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
  USAGE_LIMIT_REACHED = 'USAGE_LIMIT_REACHED',
  STORAGE_ALMOST_FULL = 'STORAGE_ALMOST_FULL',
  UPGRADE_AVAILABLE = 'UPGRADE_AVAILABLE',
  INVOICE_GENERATED = 'INVOICE_GENERATED',
  PLAN_CHANGED = 'PLAN_CHANGED',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  SYSTEM_MAINTENANCE = 'SYSTEM_MAINTENANCE',
  SYSTEM = 'SYSTEM',
}

export enum NotificationChannelValue {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  WEBSOCKET = 'WEBSOCKET',
  SMS = 'SMS',
}

export enum NotificationPriorityValue {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum NotificationSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  PRIORITY = 'priority',
  UNREAD_FIRST = 'unread',
}

export const NOTIFICATION_SORT_OPTIONS = [
  NotificationSort.NEWEST,
  NotificationSort.OLDEST,
  NotificationSort.PRIORITY,
  NotificationSort.UNREAD_FIRST,
] as const;

export enum NotificationTemplateStatusValue {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum AnnouncementStatusValue {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  PUBLISHED = 'PUBLISHED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum AnnouncementAudienceValue {
  ALL = 'ALL',
  ORGANIZATION_OWNERS = 'ORGANIZATION_OWNERS',
  ORGANIZATION_ADMINS = 'ORGANIZATION_ADMINS',
  AGENTS = 'AGENTS',
  CUSTOMERS = 'CUSTOMERS',
}

export const ANNOUNCEMENT_AUDIENCE_OPTIONS = [
  AnnouncementAudienceValue.ALL,
  AnnouncementAudienceValue.ORGANIZATION_OWNERS,
  AnnouncementAudienceValue.ORGANIZATION_ADMINS,
  AnnouncementAudienceValue.AGENTS,
  AnnouncementAudienceValue.CUSTOMERS,
] as const;

export const ALL_NOTIFICATION_TYPES = Object.values(
  NotificationTypeValue,
) as string[];

export interface NotificationAccess {
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

export function isStaff(access: NotificationAccess): boolean {
  return access.isOwner || access.isAdmin || access.isAgent;
}

export function isTenantAdmin(access: NotificationAccess): boolean {
  return access.isOwner || access.isAdmin;
}

export const NOTIFICATION_TYPES_META: Record<
  string,
  { label: string; priority: NotificationPriorityValue }
> = {
  [NotificationTypeValue.INVITATION_RECEIVED]: {
    label: 'Invitation received',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.INVITATION_SENT]: {
    label: 'Invitation sent',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.INVITATION_ACCEPTED]: {
    label: 'Invitation accepted',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.USER_REGISTERED]: {
    label: 'New user registered',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.USER_LOGGED_IN]: {
    label: 'Account login',
    priority: NotificationPriorityValue.LOW,
  },
  [NotificationTypeValue.PASSWORD_CHANGED]: {
    label: 'Password changed',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.EMAIL_VERIFIED]: {
    label: 'Email verified',
    priority: NotificationPriorityValue.LOW,
  },
  [NotificationTypeValue.LOGIN_ALERT]: {
    label: 'Login alert',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.SECURITY_ALERT]: {
    label: 'Security alert',
    priority: NotificationPriorityValue.URGENT,
  },
  [NotificationTypeValue.TICKET_CREATED]: {
    label: 'Ticket created',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.TICKET_ASSIGNED]: {
    label: 'Ticket assigned',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.TICKET_REASSIGNED]: {
    label: 'Ticket reassigned',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.TICKET_UPDATED]: {
    label: 'Ticket updated',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.TICKET_REPLIED]: {
    label: 'Ticket replied',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.TICKET_MENTIONED]: {
    label: 'You were mentioned',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.TICKET_RESOLVED]: {
    label: 'Ticket resolved',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.TICKET_CLOSED]: {
    label: 'Ticket closed',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.TICKET_REOPENED]: {
    label: 'Ticket reopened',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.SLA_WARNING]: {
    label: 'SLA warning',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.SLA_BREACHED]: {
    label: 'SLA breached',
    priority: NotificationPriorityValue.URGENT,
  },
  [NotificationTypeValue.FEEDBACK_REQUEST]: {
    label: 'Feedback request',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.FEEDBACK_REMINDER]: {
    label: 'Feedback reminder',
    priority: NotificationPriorityValue.LOW,
  },
  [NotificationTypeValue.FEEDBACK_SUBMITTED]: {
    label: 'Feedback received',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.NEGATIVE_FEEDBACK]: {
    label: 'Negative feedback',
    priority: NotificationPriorityValue.URGENT,
  },
  [NotificationTypeValue.FEEDBACK_EXPIRED]: {
    label: 'Feedback expired',
    priority: NotificationPriorityValue.LOW,
  },
  [NotificationTypeValue.ORGANIZATION_UPDATED]: {
    label: 'Organization updated',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.SUBSCRIPTION_EXPIRING]: {
    label: 'Subscription expiring',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.SUBSCRIPTION_EXPIRED]: {
    label: 'Subscription expired',
    priority: NotificationPriorityValue.URGENT,
  },
  [NotificationTypeValue.TRIAL_STARTED]: {
    label: 'Trial started',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.TRIAL_ENDING]: {
    label: 'Trial ending soon',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.TRIAL_EXPIRED]: {
    label: 'Trial expired',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.PAYMENT_INITIATED]: {
    label: 'Payment initiated',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.PAYMENT_SUCCESSFUL]: {
    label: 'Payment successful',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.PAYMENT_FAILED]: {
    label: 'Payment failed',
    priority: NotificationPriorityValue.URGENT,
  },
  [NotificationTypeValue.SUBSCRIPTION_ACTIVATED]: {
    label: 'Subscription activated',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.SUBSCRIPTION_RENEWED]: {
    label: 'Subscription renewed',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.SUBSCRIPTION_CANCELLED]: {
    label: 'Subscription cancelled',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.USAGE_LIMIT_REACHED]: {
    label: 'Usage limit reached',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.STORAGE_ALMOST_FULL]: {
    label: 'Storage almost full',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.UPGRADE_AVAILABLE]: {
    label: 'Upgrade available',
    priority: NotificationPriorityValue.LOW,
  },
  [NotificationTypeValue.INVOICE_GENERATED]: {
    label: 'Invoice generated',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.PLAN_CHANGED]: {
    label: 'Plan changed',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.ANNOUNCEMENT]: {
    label: 'Announcement',
    priority: NotificationPriorityValue.MEDIUM,
  },
  [NotificationTypeValue.SYSTEM_MAINTENANCE]: {
    label: 'System maintenance',
    priority: NotificationPriorityValue.HIGH,
  },
  [NotificationTypeValue.SYSTEM]: {
    label: 'System notification',
    priority: NotificationPriorityValue.MEDIUM,
  },
};

export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_TYPES_META);
export const NOTIFICATION_PRIORITY_OPTIONS = [
  NotificationPriorityValue.LOW,
  NotificationPriorityValue.MEDIUM,
  NotificationPriorityValue.HIGH,
  NotificationPriorityValue.URGENT,
] as const;

export function defaultPriorityForType(
  type: string,
): NotificationPriorityValue {
  return (
    NOTIFICATION_TYPES_META[type]?.priority ?? NotificationPriorityValue.MEDIUM
  );
}

export function notificationTypeLabel(type: string): string {
  return NOTIFICATION_TYPES_META[type]?.label ?? type;
}
