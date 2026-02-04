import { Logging, Log, Entry } from "@google-cloud/logging";

export interface LogEvent {
  timestamp: Date;
  message: string;
  severity?: string;
  labels?: Record<string, string>;
}

export interface CloudLoggingServiceConfig {
  projectId: string;
  keyFilename?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
}

export interface LogQueryOptions {
  /** Start time for log query */
  startTime?: Date;
  /** End time for log query */
  endTime?: Date;
  /** Maximum number of entries to return */
  limit?: number;
  /** Filter expression (in addition to resource filter) */
  filter?: string;
  /** Page token for pagination */
  pageToken?: string;
}

/**
 * Service for querying GCP Cloud Logging.
 * Provides methods for reading logs from Compute Engine instances and other resources.
 */
export class CloudLoggingService {
  private readonly logging: Logging;
  private readonly projectId: string;

  constructor(config: CloudLoggingServiceConfig) {
    const clientOptions: { projectId: string; keyFilename?: string; credentials?: { client_email: string; private_key: string } } = {
      projectId: config.projectId,
    };

    if (config.keyFilename) {
      clientOptions.keyFilename = config.keyFilename;
    } else if (config.credentials) {
      clientOptions.credentials = config.credentials;
    }

    this.logging = new Logging(clientOptions);
    this.projectId = config.projectId;
  }

  /**
   * Get logs for a specific Compute Engine instance.
   *
   * @param instanceName - VM instance name
   * @param zone - Zone where the instance is located
   * @param options - Query options
   * @returns Log events and optional page token
   */
  async getLogs(
    instanceName: string,
    zone: string,
    options?: LogQueryOptions
  ): Promise<{ events: LogEvent[]; nextPageToken?: string }> {
    const limit = Math.max(1, Math.min(options?.limit || 100, 10000));

    // Build filter for Compute Engine instance logs
    let filter = `resource.type="gce_instance" AND resource.labels.instance_id="${instanceName}"`;

    // Add time range
    if (options?.startTime) {
      filter += ` AND timestamp >= "${options.startTime.toISOString()}"`;
    }
    if (options?.endTime) {
      filter += ` AND timestamp <= "${options.endTime.toISOString()}"`;
    }

    // Add custom filter
    if (options?.filter) {
      filter += ` AND (${options.filter})`;
    }

    const [entries, , response] = await this.logging.getEntries({
      filter,
      pageSize: limit,
      pageToken: options?.pageToken,
      orderBy: "timestamp desc",
    });

    const events: LogEvent[] = entries.map((entry) => this.entryToLogEvent(entry));

    return {
      events,
      nextPageToken: response?.nextPageToken ?? undefined,
    };
  }

  /**
   * Query logs with a custom filter expression.
   *
   * @param filter - Cloud Logging filter expression
   * @param options - Query options (startTime, endTime, limit override the filter)
   * @returns Log events and optional page token
   */
  async queryLogs(
    filter: string,
    options?: Omit<LogQueryOptions, "filter">
  ): Promise<{ events: LogEvent[]; nextPageToken?: string }> {
    const limit = Math.max(1, Math.min(options?.limit || 100, 10000));

    let fullFilter = filter;

    // Add time range
    if (options?.startTime) {
      fullFilter += ` AND timestamp >= "${options.startTime.toISOString()}"`;
    }
    if (options?.endTime) {
      fullFilter += ` AND timestamp <= "${options.endTime.toISOString()}"`;
    }

    const [entries, , response] = await this.logging.getEntries({
      filter: fullFilter,
      pageSize: limit,
      pageToken: options?.pageToken,
      orderBy: "timestamp desc",
    });

    const events: LogEvent[] = entries.map((entry) => this.entryToLogEvent(entry));

    return {
      events,
      nextPageToken: response?.nextPageToken ?? undefined,
    };
  }

  /**
   * Get logs for a Clawster OpenClaw instance.
   * Queries logs with Clawster-specific labels.
   *
   * @param workspace - Workspace name
   * @param instanceName - Instance name
   * @param options - Query options
   * @returns Log events and optional page token
   */
  async getInstanceLogs(
    workspace: string,
    instanceName: string,
    options?: LogQueryOptions
  ): Promise<{ events: LogEvent[]; nextPageToken?: string }> {
    const filter = `labels.workspace="${workspace}" AND labels.instance="${instanceName}"`;
    return this.queryLogs(filter, options);
  }

  /**
   * Write a log entry.
   *
   * @param logName - Log name
   * @param message - Log message
   * @param severity - Log severity (DEFAULT, DEBUG, INFO, NOTICE, WARNING, ERROR, CRITICAL, ALERT, EMERGENCY)
   * @param labels - Optional labels
   */
  async writeLog(
    logName: string,
    message: string,
    severity: string = "INFO",
    labels?: Record<string, string>
  ): Promise<void> {
    const log = this.logging.log(logName);

    const entry = log.entry(
      {
        resource: {
          type: "global",
        },
        severity,
        labels,
      },
      message
    );

    await log.write(entry);
  }

  /**
   * Get a link to the Cloud Logging console for a specific instance.
   *
   * @param instanceName - VM instance name
   * @param zone - Zone where the instance is located
   * @returns URL to Cloud Console logs viewer
   */
  getConsoleLink(instanceName: string, zone: string): string {
    const filter = encodeURIComponent(
      `resource.type="gce_instance" resource.labels.instance_id="${instanceName}"`
    );
    return `https://console.cloud.google.com/logs/query;query=${filter}?project=${this.projectId}`;
  }

  /**
   * Get a link to Cloud Console logs with a custom filter.
   *
   * @param filter - Cloud Logging filter expression
   * @returns URL to Cloud Console logs viewer
   */
  getConsoleQueryLink(filter: string): string {
    const encodedFilter = encodeURIComponent(filter);
    return `https://console.cloud.google.com/logs/query;query=${encodedFilter}?project=${this.projectId}`;
  }

  /**
   * Stream logs in real-time using tail.
   * Note: This returns an async iterator that yields log entries as they arrive.
   *
   * @param filter - Cloud Logging filter expression
   * @returns Async iterator of log events
   */
  async *tailLogs(filter: string): AsyncGenerator<LogEvent> {
    const log = this.logging.log("_Default");

    // Use getEntries with autoPaginate to simulate tailing
    // Note: For true real-time streaming, consider using Pub/Sub sinks
    let lastTimestamp = new Date();

    while (true) {
      const fullFilter = `${filter} AND timestamp > "${lastTimestamp.toISOString()}"`;

      const [entries] = await this.logging.getEntries({
        filter: fullFilter,
        pageSize: 100,
        orderBy: "timestamp asc",
      });

      for (const entry of entries) {
        const event = this.entryToLogEvent(entry);
        lastTimestamp = event.timestamp;
        yield event;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Delete logs matching a filter.
   * Use with caution - this permanently deletes log data.
   *
   * @param logName - Log name to delete entries from
   */
  async deleteLog(logName: string): Promise<void> {
    const log = this.logging.log(logName);
    await log.delete();
  }

  /**
   * Convert a Cloud Logging entry to our LogEvent format.
   */
  private entryToLogEvent(entry: Entry): LogEvent {
    const metadata = entry.metadata;
    const data = entry.data;

    let message: string;
    if (typeof data === "string") {
      message = data;
    } else if (data && typeof data === "object") {
      message = (data as { message?: string }).message || JSON.stringify(data);
    } else {
      message = String(data ?? "");
    }

    let timestamp: Date;
    if (metadata?.timestamp) {
      timestamp = new Date(metadata.timestamp as string);
    } else if (metadata?.receiveTimestamp) {
      timestamp = new Date(metadata.receiveTimestamp as string);
    } else {
      timestamp = new Date();
    }

    return {
      timestamp,
      message,
      severity: metadata?.severity as string | undefined,
      labels: metadata?.labels as Record<string, string> | undefined,
    };
  }
}
