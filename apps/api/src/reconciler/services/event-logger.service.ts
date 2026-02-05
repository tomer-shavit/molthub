import { Injectable, Logger } from "@nestjs/common";

/**
 * EventLoggerService — responsible for logging reconciliation events.
 *
 * Single Responsibility: Log events for audit trail and debugging.
 *
 * This service provides a centralized place for event logging,
 * which can be extended to write to external audit systems,
 * emit events to message queues, or integrate with observability tools.
 */
@Injectable()
export class EventLoggerService {
  private readonly logger = new Logger(EventLoggerService.name);

  /**
   * Log a reconciliation event.
   *
   * @param instanceId - The bot instance ID
   * @param eventType - Type of event (e.g., RECONCILE_START, RECONCILE_SUCCESS)
   * @param message - Human-readable message
   * @param metadata - Optional additional context
   */
  async logEvent(
    instanceId: string,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const logMessage = metadata
      ? `[${instanceId}] ${eventType}: ${message} ${JSON.stringify(metadata)}`
      : `[${instanceId}] ${eventType}: ${message}`;

    this.logger.debug(logMessage);

    // Future: Write to audit table, emit to message queue, etc.
  }

  /**
   * Log an error event.
   *
   * @param instanceId - The bot instance ID
   * @param eventType - Type of event
   * @param error - The error that occurred
   */
  async logError(
    instanceId: string,
    eventType: string,
    error: Error | string,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : error;
    this.logger.error(`[${instanceId}] ${eventType}: ${message}`);
  }
}
