import {
  BaseResponse,
  PaginatedResponse,
} from '../interfaces/base-response.interface';

export class BaseResponseUtil {
  static success<T>(data: T, message = 'Success'): BaseResponse<T> {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  static error<T = null>(
    message: string,
    data: T = null as T,
  ): BaseResponse<T> {
    return {
      success: false,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  static paginated<T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
    message = 'Success',
  ): PaginatedResponse<T> {
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}
