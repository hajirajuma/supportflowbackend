export enum FeedbackFormStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum FeedbackRequestStatus {
  PENDING = 'PENDING',
  OPENED = 'OPENED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

export enum FeedbackResponseStatus {
  SUBMITTED = 'SUBMITTED',
  EDITED = 'EDITED',
}

export enum FeedbackQuestionType {
  SHORT_TEXT = 'SHORT_TEXT',
  LONG_TEXT = 'LONG_TEXT',
  EMAIL = 'EMAIL',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  CHECKBOX = 'CHECKBOX',
  DROPDOWN = 'DROPDOWN',
  RATING = 'RATING',
  YES_NO = 'YES_NO',
  PHONE = 'PHONE',
  FILE_UPLOAD = 'FILE_UPLOAD',
}

export enum FeedbackSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  HIGHEST_RATING = 'highest',
  LOWEST_RATING = 'lowest',
}

export const FEEDBACK_SORT_OPTIONS = [
  FeedbackSort.NEWEST,
  FeedbackSort.OLDEST,
  FeedbackSort.HIGHEST_RATING,
  FeedbackSort.LOWEST_RATING,
] as const;

export type FeedbackTrend = 'day' | 'week' | 'month' | 'year';

export const FEEDBACK_TREND_OPTIONS = ['day', 'week', 'month', 'year'] as const;

/**
 * Structured rating metric keys. Questions carrying one of these keys are
 * denormalized onto the response `ratings` payload for analytics.
 */
export const RATING_METRIC_KEYS = [
  'overall',
  'agent_professionalism',
  'response_speed',
  'resolution_quality',
  'communication',
  'recommend',
] as const;

/** Overall rating at or below this value triggers a negative-feedback alert. */
export const NEGATIVE_RATING_THRESHOLD = 2;

/** Default validity window for an outbound feedback request. */
export const FEEDBACK_REQUEST_VALID_DAYS = 7;

/** Lazy reminder threshold for unopened feedback requests. */
export const FEEDBACK_REMINDER_AFTER_DAYS = 3;
