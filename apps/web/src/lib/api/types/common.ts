/**
 * Common types shared across all domain API clients.
 */

/**
 * Standard paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

/**
 * Common pagination filter parameters.
 */
export interface PaginationFilters {
  page?: number;
  limit?: number;
}

/**
 * Common date range filter parameters.
 */
export interface DateRangeFilters {
  from?: string;
  to?: string;
}

/**
 * Bot instance reference used in many domain types.
 */
export interface BotInstanceRef {
  id: string;
  name: string;
  status?: string;
  health?: string;
  fleetId?: string;
}

/**
 * Fleet reference used in many domain types.
 */
export interface FleetRef {
  id: string;
  name: string;
  environment?: string;
}
