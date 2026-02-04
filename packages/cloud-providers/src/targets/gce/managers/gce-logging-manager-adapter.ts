/**
 * GCE Logging Manager Adapter
 *
 * Wraps @clawster/adapters-gcp CloudLoggingService to implement
 * the IGceLoggingManager interface. Use this when you want to inject
 * the adapters-gcp service instead of using direct SDK imports.
 */

import type { IGceLoggingManager, GceLogQueryOptions } from "./interfaces";

/**
 * Interface for the CloudLoggingService from @clawster/adapters-gcp.
 * We define this here to avoid a hard dependency on the package.
 */
export interface ICloudLoggingService {
  getLogs(
    instanceName: string,
    zone: string,
    options?: {
      startTime?: Date;
      endTime?: Date;
      limit?: number;
      filter?: string;
    }
  ): Promise<{ events: Array<{ message: string }>; nextPageToken?: string }>;
  getConsoleLink(instanceName: string, zone: string): string;
}

/**
 * Adapter that wraps @clawster/adapters-gcp CloudLoggingService.
 *
 * This allows the GceTarget to use the adapters-gcp package for log
 * retrieval instead of direct @google-cloud/logging SDK imports.
 *
 * @example
 * ```typescript
 * import { CloudLoggingService } from "@clawster/adapters-gcp";
 *
 * const loggingService = new CloudLoggingService({ projectId: "my-project" });
 * const adapter = new GceLoggingManagerAdapter(loggingService);
 *
 * const target = new GceTarget({
 *   config: gceConfig,
 *   managers: {
 *     ...otherManagers,
 *     loggingManager: adapter,
 *   },
 * });
 * ```
 */
export class GceLoggingManagerAdapter implements IGceLoggingManager {
  constructor(private readonly loggingService: ICloudLoggingService) {}

  async getLogs(
    instanceName: string,
    zone: string,
    options?: GceLogQueryOptions
  ): Promise<string[]> {
    const result = await this.loggingService.getLogs(instanceName, zone, {
      startTime: options?.since,
      limit: options?.lines ?? 100,
    });

    let lines = result.events.map((event) => event.message);

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
  }

  getConsoleLink(instanceName: string, zone: string): string {
    return this.loggingService.getConsoleLink(instanceName, zone);
  }
}
