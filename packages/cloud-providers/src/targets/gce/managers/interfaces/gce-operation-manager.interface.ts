/**
 * GCE Operation Manager Interface
 *
 * Provides abstraction for waiting on GCE async operations.
 * Enables dependency injection for testing and modularity.
 */

import type { OperationScope, WaitOptions } from "../gce-operation-manager";

/**
 * Interface for managing GCE operation polling.
 */
export interface IGceOperationManager {
  /**
   * Wait for a GCE operation to complete.
   *
   * @param operation - The operation object returned from a GCE API call
   * @param scope - The scope of the operation (global, zone, or region)
   * @param options - Wait options (timeout, polling interval, description)
   */
  waitForOperation(
    operation: unknown,
    scope: OperationScope,
    options?: WaitOptions
  ): Promise<void>;
}
