/**
 * Small statistics helpers shared across the analytics engine.
 * All durations are handled in hours unless stated otherwise.
 */

export interface DurationMetric {
  /** Mean value in hours, rounded to 2 decimals, or null when no samples. */
  average: number | null;
  /** Median value in hours, or null when no samples. */
  median: number | null;
  /** Min value in hours, or null when no samples. */
  min: number | null;
  /** Max value in hours, or null when no samples. */
  max: number | null;
  /** Number of samples used. */
  sampleCount: number;
}

export class StatsUtil {
  static average(values: number[]): number | null {
    if (!values.length) return null;
    return (
      Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) /
      100
    );
  }

  static sum(values: number[]): number {
    return values.reduce((a, b) => a + b, 0);
  }

  static median(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const value =
      sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    return Math.round(value * 100) / 100;
  }

  /** Percentage, rounded to 2 decimals. Safe against zero denominators. */
  static percentage(part: number, whole: number): number {
    if (!whole) return 0;
    return Math.round((part / whole) * 10000) / 100;
  }

  /** 0..1 ratio, rounded to 3 decimals. Safe against zero denominators. */
  static ratio(part: number, whole: number): number {
    if (!whole) return 0;
    return Math.round((part / whole) * 1000) / 1000;
  }

  /** Growth rate between two periods (%), null when there is no base. */
  static growthRate(current: number, previous: number): number | null {
    if (!previous) return current > 0 ? 100 : null;
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }

  /** Builds a DurationMetric from an array of hours. */
  static durations(values: number[]): DurationMetric {
    const clean = values.filter((v) => Number.isFinite(v) && v >= 0);
    return {
      average: this.average(clean),
      median: this.median(clean),
      min: clean.length ? Math.min(...clean) : null,
      max: clean.length ? Math.max(...clean) : null,
      sampleCount: clean.length,
    };
  }

  /** Hours between two dates (absolute), or null. */
  static hoursBetween(
    a?: Date | string | null,
    b?: Date | string | null,
  ): number | null {
    if (!a || !b) return null;
    const start = new Date(a).getTime();
    const end = new Date(b).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return Math.abs(end - start) / 3_600_000;
  }

  /** UTC date-only key (yyyy-MM-dd) for bucket grouping. */
  static dayKey(date: Date | string): string {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
  }

  /** UTC month key (yyyy-MM) for bucket grouping. */
  static monthKey(date: Date | string): string {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /** UTC year key (yyyy). */
  static yearKey(date: Date | string): string {
    return String(new Date(date).getUTCFullYear());
  }

  /** Returns `[start, end]` (inclusive end) bounds for a date filter. */
  static dateRange(
    dateFrom?: string,
    dateTo?: string,
    defaultMonths = 12,
  ): { start: Date; end: Date } {
    const now = new Date();
    const end = dateTo ? new Date(dateTo) : now;
    if (!dateFrom) {
      const start = new Date(end);
      start.setUTCMonth(start.getUTCMonth() - defaultMonths);
      return { start, end };
    }
    return { start: new Date(dateFrom), end };
  }

  /** Human readable duration given hours. */
  static formatHours(hours: number | null): string | null {
    if (hours === null || hours === undefined) return null;
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
    const days = Math.round((hours / 24) * 10) / 10;
    return `${days}d`;
  }
}

export const nowIso = (): string => new Date().toISOString();
