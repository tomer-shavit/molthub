/**
 * Represents a single log event.
 */
export interface LogEvent {
  timestamp: Date;
  message: string;
}

/**
 * Options for querying logs.
 */
export interface LogQueryOptions {
  /** Maximum number of events to return */
  limit?: number;
  /** Start time for the query */
  startTime?: Date;
  /** End time for the query */
  endTime?: Date;
  /** Pagination token (AWS) */
  nextToken?: string;
}

/**
 * Result of a log query.
 */
export interface LogQueryResult {
  events: LogEvent[];
  /** Pagination token for next page (AWS) */
  nextToken?: string;
}
