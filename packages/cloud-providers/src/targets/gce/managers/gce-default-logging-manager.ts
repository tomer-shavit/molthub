/**
 * GCE Default Logging Manager
 *
 * Default implementation using direct @google-cloud/logging SDK.
 * Used for backward compatibility when no adapter is injected.
 */

import { Logging } from "@google-cloud/logging";
import type { IGceLoggingManager, GceLogQueryOptions } from "./interfaces";
import type { GceLogCallback } from "../types";

/**
 * Configuration for the default logging manager.
 */
export interface GceDefaultLoggingManagerConfig {
  /** GCP project ID */
  projectId: string;
  /** Path to service account key file (optional) */
  keyFilePath?: string;
  /** Log callback function */
  log?: GceLogCallback;
}

/**
 * Default logging manager implementation using direct GCP SDK.
 *
 * This is used internally by GceTarget when no external CloudLoggingService
 * is provided via dependency injection. It provides backward compatibility
 * with existing deployments.
 */
export class GceDefaultLoggingManager implements IGceLoggingManager {
  private readonly logging: Logging;
  private readonly projectId: string;
  private readonly log: GceLogCallback;

  constructor(config: GceDefaultLoggingManagerConfig) {
    const clientOptions = config.keyFilePath
      ? { keyFilename: config.keyFilePath }
      : {};

    this.logging = new Logging({
      projectId: config.projectId,
      ...clientOptions,
    });
    this.projectId = config.projectId;
    this.log = config.log ?? (() => {});
  }

  async getLogs(
    instanceName: string,
    zone: string,
    options?: GceLogQueryOptions
  ): Promise<string[]> {
    try {
      const log = this.logging.log("compute.googleapis.com%2Fstartup-script");

      const filter = [
        `resource.type="gce_instance"`,
        `resource.labels.instance_id="${instanceName}"`,
        `resource.labels.zone="${zone}"`,
      ];

      if (options?.since) {
        filter.push(`timestamp>="${options.since.toISOString()}"`);
      }

      const [entries] = await log.getEntries({
        filter: filter.join(" AND "),
        orderBy: "timestamp desc",
        pageSize: options?.lines ?? 100,
      });

      let lines = entries.map((entry) => {
        const data = entry.data as { message?: string; textPayload?: string } | string;
        if (typeof data === "string") return data;
        return data?.message ?? data?.textPayload ?? JSON.stringify(data);
      });

      // Apply filter if provided
      if (options?.filter) {
        try {
          const pattern = new RegExp(options.filter, "i");
          lines = lines.filter((line) => pattern.test(line));
        } catch {
          // If regex fails, fall back to literal match
          const literal = options.filter.toLowerCase();
          lines = lines.filter((line) => line.toLowerCase().includes(literal));
        }
      }

      return lines.reverse(); // Return in chronological order
    } catch {
      return [];
    }
  }

  getConsoleLink(instanceName: string, zone: string): string {
    const filter = encodeURIComponent(
      `resource.type="gce_instance" resource.labels.instance_id="${instanceName}"`
    );
    return `https://console.cloud.google.com/logs/query;query=${filter}?project=${this.projectId}`;
  }
}
