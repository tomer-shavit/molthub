/**
 * GCE Operation Manager
 *
 * Consolidates operation waiting logic for global, zone, and region operations.
 * Provides a unified interface for waiting on GCE async operations.
 */

import {
  GlobalOperationsClient,
  ZoneOperationsClient,
  RegionOperationsClient,
} from "@google-cloud/compute";
import type { GceLogCallback } from "../types";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes

export type OperationScope = "global" | "zone" | "region";

export interface WaitOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Polling interval in milliseconds */
  pollIntervalMs?: number;
  /** Human-readable description for logging */
  description?: string;
}

interface OperationResult {
  status?: unknown;
  progress?: number | null;
  error?: { errors?: Array<{ message?: string | null }> | null } | null;
}

/**
 * Manages GCE operation polling for global, zone, and region scopes.
 */
export class GceOperationManager {
  constructor(
    private readonly globalOpsClient: GlobalOperationsClient,
    private readonly zoneOpsClient: ZoneOperationsClient,
    private readonly regionOpsClient: RegionOperationsClient,
    private readonly project: string,
    private readonly zone: string,
    private readonly region: string,
    private readonly log: GceLogCallback
  ) {}

  /**
   * Wait for a GCE operation to complete.
   *
   * @param operation - The operation object returned from a GCE API call
   * @param scope - The scope of the operation (global, zone, or region)
   * @param options - Wait options
   */
  async waitForOperation(
    operation: unknown,
    scope: OperationScope,
    options: WaitOptions = {}
  ): Promise<void> {
    const op = operation as { name?: string };
    if (!op?.name) return;

    const operationName = op.name.split("/").pop() ?? op.name;
    const {
      timeoutMs = DEFAULT_TIMEOUT_MS,
      pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
      description = operationName,
    } = options;

    let lastStatus = "";
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const result = await this.getOperationStatus(operationName, scope);

      const status = String(result.status ?? "UNKNOWN");
      const progress = result.progress ?? 0;

      // Log status changes
      if (status !== lastStatus) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        this.log(
          `  [${description}] ${status}${progress > 0 ? ` (${progress}%)` : ""} - ${elapsed}s elapsed`,
          "stdout"
        );
        lastStatus = status;
      }

      if (status === "DONE") {
        if (result.error?.errors?.length) {
          const errorMsg = result.error.errors[0]?.message ?? "Operation failed";
          this.log(`  [${description}] FAILED: ${errorMsg}`, "stderr");
          throw new Error(errorMsg);
        }
        return;
      }

      await this.sleep(pollIntervalMs);
    }

    this.log(`  [${description}] TIMEOUT after ${timeoutMs / 1000}s`, "stderr");
    throw new Error(`Operation timed out: ${operationName}`);
  }

  private async getOperationStatus(
    operationName: string,
    scope: OperationScope
  ): Promise<OperationResult> {
    switch (scope) {
      case "global": {
        const [result] = await this.globalOpsClient.get({
          project: this.project,
          operation: operationName,
        });
        return result as OperationResult;
      }
      case "zone": {
        const [result] = await this.zoneOpsClient.get({
          project: this.project,
          zone: this.zone,
          operation: operationName,
        });
        return result as OperationResult;
      }
      case "region": {
        const [result] = await this.regionOpsClient.get({
          project: this.project,
          region: this.region,
          operation: operationName,
        });
        return result as OperationResult;
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
