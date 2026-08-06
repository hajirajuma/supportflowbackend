export class DateUtil {
  static now(): Date {
    return new Date();
  }

  static isExpired(date: Date | string): boolean {
    return new Date(date).getTime() <= Date.now();
  }

  static addDays(date: Date, days: number): Date {
    const clone = new Date(date);
    clone.setDate(clone.getDate() + days);
    return clone;
  }
}
