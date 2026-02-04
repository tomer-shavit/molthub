/**
 * GCE Logging Manager Interface
 *
 * Provides abstraction for Cloud Logging operations.
 * Enables dependency injection for testing and allows using
 * either direct GCP SDK or @clawster/adapters-gcp services.
 */

/**
 * Options for log queries.
 */
export interface GceLogQueryOptions {
  /** Start time for log query */
  since?: Date;
  /** Maximum number of entries to return */
  lines?: number;
  /** Filter pattern (regex or literal) */
  filter?: string;
}

/**
 * Interface for querying GCP Cloud Logging.
 */
export interface IGceLoggingManager {
  /**
   * Get logs for a Compute Engine instance.
   *
   * @param instanceName - VM instance name
   * @param zone - Zone where the instance is located
   * @param options - Query options
   * @returns Array of log lines
   */
  getLogs(instanceName: string, zone: string, options?: GceLogQueryOptions): Promise<string[]>;

  /**
   * Get a link to the Cloud Logging console for a specific instance.
   *
   * @param instanceName - VM instance name
   * @param zone - Zone where the instance is located
   * @returns URL to Cloud Console logs viewer
   */
  getConsoleLink(instanceName: string, zone: string): string;
}
