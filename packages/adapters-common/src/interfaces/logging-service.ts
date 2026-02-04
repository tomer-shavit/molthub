import type { LogQueryOptions, LogQueryResult } from "../types/logging";

/**
 * Interface for cloud logging services.
 * Implemented by AWS CloudWatchLogsService and Azure LogAnalyticsService.
 */
export interface ILoggingService {
  /**
   * Get logs for a resource.
   * @param resourceId - The resource identifier (log group name for AWS, container group name for Azure)
   * @param options - Query options (limit, time range, pagination)
   */
  getLogs(
    resourceId: string,
    options?: LogQueryOptions
  ): Promise<LogQueryResult>;

  /**
   * Get a console link to view logs in the cloud provider's UI.
   * @param resourceId - The resource identifier
   */
  getConsoleLink(resourceId: string): string;
}
