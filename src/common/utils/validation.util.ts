export class ValidationUtil {
  static isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  static isNonEmpty(value?: string | null): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
