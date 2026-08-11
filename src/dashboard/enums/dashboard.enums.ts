export enum DashboardRole {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  TENANT_OWNER = 'TENANT_OWNER',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
  CUSTOMER = 'CUSTOMER',
}

export enum ReportCategory {
  TICKETS = 'TICKETS',
  FEEDBACK = 'FEEDBACK',
  ORGANIZATIONS = 'ORGANIZATIONS',
  SUBSCRIPTIONS = 'SUBSCRIPTIONS',
  PAYMENTS = 'PAYMENTS',
  REVENUE = 'REVENUE',
  SUPPORT_AGENTS = 'SUPPORT_AGENTS',
  CUSTOMERS = 'CUSTOMERS',
  USAGE = 'USAGE',
  KNOWLEDGE_BASE = 'KNOWLEDGE_BASE',
  CUSTOM = 'CUSTOM',
}

export const REPORT_CATEGORIES = Object.values(
  ReportCategory,
) as ReportCategory[];

/**
 * Older code paths used `DashboardReportType` as the public name, so we keep
 * the alias for compatibility while standardizing on `ReportCategory`.
 */
export const DashboardReportType = ReportCategory;

export enum ReportFormat {
  CSV = 'CSV',
  EXCEL = 'EXCEL',
  PDF = 'PDF',
}

export const REPORT_FORMATS = Object.values(ReportFormat) as ReportFormat[];

export enum ReportScheduleFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export const REPORT_SCHEDULE_FREQUENCIES = Object.values(
  ReportScheduleFrequency,
) as ReportScheduleFrequency[];

export enum TrendGranularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export const TREND_PERIODS = Object.values(
  TrendGranularity,
) as TrendGranularity[];

export const TrendPeriod = TrendGranularity;
export type TrendPeriod = TrendGranularity;

export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
  PIE = 'pie',
  AREA = 'area',
  DONUT = 'donut',
  TREND = 'trend',
}

export const DASHBOARD_CHART_TYPES = Object.values(ChartType) as ChartType[];

export const REPORT_CATEGORY_TO_TYPE: Record<ReportCategory, string> = {
  [ReportCategory.TICKETS]: 'TICKETS',
  [ReportCategory.FEEDBACK]: 'FEEDBACK',
  [ReportCategory.ORGANIZATIONS]: 'ORGANIZATIONS',
  [ReportCategory.SUBSCRIPTIONS]: 'SUBSCRIPTIONS',
  [ReportCategory.PAYMENTS]: 'PAYMENTS',
  [ReportCategory.REVENUE]: 'REVENUE',
  [ReportCategory.SUPPORT_AGENTS]: 'SUPPORT_AGENTS',
  [ReportCategory.CUSTOMERS]: 'CUSTOMERS',
  [ReportCategory.USAGE]: 'USAGE',
  [ReportCategory.KNOWLEDGE_BASE]: 'KNOWLEDGE_BASE',
  [ReportCategory.CUSTOM]: 'CUSTOM',
};

export const SAVED_REPORT_TYPE_MAP: Record<ReportCategory, string> =
  REPORT_CATEGORY_TO_TYPE;

export enum ReportExportFormat {
  CSV = 'CSV',
  EXCEL = 'EXCEL',
  PDF = 'PDF',
}

export const REPORT_EXPORT_FORMAT_OPTIONS = Object.values(
  ReportExportFormat,
) as string[];

export const DASHBOARD_REALTIME_EVENTS = {
  TICKET_CREATED: 'dashboard.ticketCreated',
  TICKET_CLOSED: 'dashboard.ticketClosed',
  FEEDBACK_SUBMITTED: 'dashboard.feedbackSubmitted',
  PAYMENT_COMPLETED: 'dashboard.paymentCompleted',
  ORGANIZATION_CREATED: 'dashboard.organizationCreated',
  CUSTOMER_CREATED: 'dashboard.customerCreated',
  WIDGET_UPDATE: 'dashboard.widgetUpdate',
  REPORT_GENERATED: 'dashboard.reportGenerated',
  REPORT_EXPORTED: 'dashboard.reportExported',
} as const;

export const DASHBOARD_AUDIT_ACTIONS = {
  REPORT_GENERATED: 'CREATE',
  REPORT_DOWNLOADED: 'EXPORT_DATA',
  REPORT_DELETED: 'DELETE',
  DASHBOARD_VIEWED: 'VIEW',
  ANALYTICS_EXPORTED: 'EXPORT_DATA',
} as const;

export const TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'ON_HOLD',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
] as const;

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export const USAGE_RESOURCE_TYPES = [
  'API_CALL',
  'STORAGE',
  'EMAIL',
  'WEBHOOK',
] as const;

export const SUBSCRIPTION_STATUS_OPTIONS = [
  'PENDING',
  'TRIALING',
  'ACTIVE',
  'PENDING_PAYMENT',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED',
] as const;

export const PAYMENT_STATUS_OPTIONS = [
  'PENDING',
  'INITIATED',
  'SUCCESSFUL',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'EXPIRED',
] as const;

export type DashboardTrend = TrendGranularity;

export type DashboardAccessRole = DashboardRole;
