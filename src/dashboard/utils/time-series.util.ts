import {
  format,
  startOfWeek,
  addDays,
  addMonths,
  startOfMonth,
} from 'date-fns';
import { TrendGranularity } from '../enums/dashboard.enums';

export interface TimeBucket {
  key: string;
  start: Date;
  end: Date;
}

/**
 * Builds a contiguous list of time buckets (with empty padding) so charts do
 * not skip periods without data.
 */
export function buildBuckets(
  from: Date,
  to: Date,
  granularity: TrendGranularity,
): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  const start = startOfBucket(from, granularity);
  const end = startOfBucket(to, granularity);

  let cursor = new Date(start);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 4000) {
    const bucketEnd = endOfBucket(cursor, granularity);
    buckets.push({
      key: bucketKey(cursor, granularity),
      start: new Date(cursor),
      end: bucketEnd,
    });
    cursor = nextBucket(cursor, granularity);
    guard += 1;
  }

  return buckets;
}

export function startOfBucket(date: Date, granularity: TrendGranularity): Date {
  if (granularity === 'day') {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (granularity === 'week') return startOfWeek(date, { weekStartsOn: 1 });
  if (granularity === 'year') {
    const d = new Date(date);
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return startOfMonth(date);
}

export function endOfBucket(date: Date, granularity: TrendGranularity): Date {
  const next = nextBucket(date, granularity);
  return new Date(next.getTime() - 1);
}

export function nextBucket(date: Date, granularity: TrendGranularity): Date {
  if (granularity === 'day') return addDays(date, 1);
  if (granularity === 'week') return addDays(date, 7);
  if (granularity === 'year')
    return addMonths(startOfBucket(date, TrendGranularity.MONTH), 12);
  return addMonths(date, 1);
}

export function bucketKey(date: Date, granularity: TrendGranularity): string {
  const d = startOfBucket(date, granularity);
  if (granularity === 'day') return format(d, 'yyyy-MM-dd');
  if (granularity === 'week') return format(d, 'yyyy-MM-dd');
  if (granularity === 'year') return format(d, 'yyyy');
  return format(d, 'yyyy-MM');
}

export function isInBucket(date: Date, bucket: TimeBucket): boolean {
  return (
    date.getTime() >= bucket.start.getTime() &&
    date.getTime() <= bucket.end.getTime()
  );
}

export function resolveRange(
  dateFrom?: string,
  dateTo?: string,
): { from: Date; to: Date } {
  const to = dateTo ? new Date(dateTo) : new Date();
  const from = dateFrom
    ? new Date(dateFrom)
    : new Date(to.getTime() - 1000 * 60 * 60 * 24 * 90);
  if (from.getTime() > to.getTime()) return { from: to, to };
  return { from, to };
}
