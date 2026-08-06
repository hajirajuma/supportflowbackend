import { APP_CONSTANTS } from '../constants/app.constants';

export class PaginationUtil {
  static normalizePage(page?: number): number {
    return Math.max(1, page ?? APP_CONSTANTS.DEFAULT_PAGE);
  }

  static normalizeLimit(limit?: number): number {
    return Math.min(
      APP_CONSTANTS.MAX_LIMIT,
      Math.max(1, limit ?? APP_CONSTANTS.DEFAULT_LIMIT),
    );
  }

  static getSkip(page: number, limit: number): number {
    return (page - 1) * limit;
  }
}
