export enum PlanTypeValue {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export enum BillingIntervalValue {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export enum SubscriptionStatusValue {
  PENDING = 'PENDING',
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAST_DUE = 'PAST_DUE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum PaymentProviderValue {
  PAYCHANGU = 'PAYCHANGU',
  STRIPE = 'STRIPE',
  FLUTTERWAVE = 'FLUTTERWAVE',
}

export enum PaymentStatusValue {
  PENDING = 'PENDING',
  INITIATED = 'INITIATED',
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
}

export enum InvoiceStatusValue {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  VOID = 'VOID',
  CANCELLED = 'CANCELLED',
}

export enum UsageResourceTypeValue {
  TICKET = 'TICKET',
  FEEDBACK_FORM = 'FEEDBACK_FORM',
  STORAGE_BYTES = 'STORAGE_BYTES',
  API_CALL = 'API_CALL',
  EMAIL = 'EMAIL',
  SEAT = 'SEAT',
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT',
  KNOWLEDGE_ARTICLE = 'KNOWLEDGE_ARTICLE',
  ATTACHMENT = 'ATTACHMENT',
  INVITATION = 'INVITATION',
}

/** Entitlement keys exposed by FeatureGateService. */
export const FEATURE_KEYS = {
  TICKET_MANAGEMENT: 'ticket_management',
  KNOWLEDGE_BASE: 'knowledge_base',
  FEEDBACK: 'feedback',
  CUSTOMER_PORTAL: 'customer_portal',
  CUSTOM_BRANDING: 'custom_branding',
  CUSTOM_DOMAIN: 'custom_domain',
  DEPARTMENTS: 'departments',
  API_ACCESS: 'api_access',
  ANALYTICS: 'analytics',
  AUDIT_LOGS: 'audit_logs',
  REPORTS: 'reports',
  ANNOUNCEMENTS: 'announcements',
  PRIORITY_SUPPORT: 'priority_support',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

/** Usage limits surfaced by UsageTrackingService / plan metadata. */
export const USAGE_LIMIT_KEYS = {
  maxUsers: 'maxUsers',
  maxCustomers: 'maxCustomers',
  maxAgents: 'maxAgents',
  maxTicketsPerMonth: 'maxTicketsPerMonth',
  maxFeedbackForms: 'maxFeedbackForms',
  maxAttachmentsPerTicket: 'maxAttachmentsPerTicket',
  maxKnowledgeArticles: 'maxKnowledgeArticles',
  maxInvitations: 'maxInvitations',
  storageLimitBytes: 'storageLimitBytes',
  apiMonthlyQuota: 'apiMonthlyQuota',
} as const;

export interface SubscriptionAccess {
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

export function isTenantAdmin(access: SubscriptionAccess): boolean {
  return access.isOwner || access.isAdmin;
}
