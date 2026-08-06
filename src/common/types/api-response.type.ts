export type ApiResponse<T = unknown> = {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
};

export type PaginatedApiResponse<T = unknown> = ApiResponse<T[]> & {
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};
