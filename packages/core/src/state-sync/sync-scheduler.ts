/**
 * Sync Scheduler
 *
 * Manages periodic backup operations for multiple bot instances.
 * Configurable interval (default 5 minutes), with per-instance tracking.
 */
import type { StateSyncBackend, SyncOptions, SyncResult } from "./interface";

export interface ScheduledInstance {
  instanceId: string;
  localPath: string;
  encrypt: boolean;
  encryptionKey?: string;
  lastSyncedAt?: string;
}

export interface SyncSchedulerOptions {
  /** Interval in seconds between backups (default: 300 = 5 minutes) */
  intervalSeconds?: number;
  /** Callback invoked after each sync completes */
  onSyncComplete?: (result: SyncResult) => void;
  /** Callback invoked on scheduler errors */
  onError?: (error: Error, instanceId: string) => void;
}

export class SyncScheduler {
  private readonly intervalMs: number;
  private readonly instances = new Map<string, ScheduledInstance>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly onSyncComplete?: (result: SyncResult) => void;
  private readonly onError?: (error: Error, instanceId: string) => void;

  constructor(
    private readonly backend: StateSyncBackend,
    options: SyncSchedulerOptions = {},
  ) {
    this.intervalMs = (options.intervalSeconds ?? 300) * 1000;
    this.onSyncComplete = options.onSyncComplete;
    this.onError = options.onError;
  }

  /**
   * Register an instance for scheduled backups.
   */
  addInstance(instance: ScheduledInstance): void {
    this.instances.set(instance.instanceId, instance);
  }

  /**
   * Remove an instance from scheduled backups.
   */
  removeInstance(instanceId: string): void {
    this.instances.delete(instanceId);
  }

  /**
   * Get all registered instance IDs.
   */
  getRegisteredInstances(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Check if an instance is registered.
   */
  hasInstance(instanceId: string): boolean {
    return this.instances.has(instanceId);
  }

  /**
   * Start the periodic backup scheduler.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.runBackupCycle();
    }, this.intervalMs);
  }

  /**
   * Stop the periodic backup scheduler.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Whether the scheduler is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the configured interval in milliseconds.
   */
  getIntervalMs(): number {
    return this.intervalMs;
  }

  /**
   * Run a single backup cycle for all registered instances.
   * Can be called manually for on-demand backup.
   */
  async runBackupCycle(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const [instanceId, instance] of this.instances) {
      try {
        const options: SyncOptions = {
          instanceId: instance.instanceId,
          localPath: instance.localPath,
          encrypt: instance.encrypt,
          encryptionKey: instance.encryptionKey,
          force: false,
        };

        const result = await this.backend.backup(options);

        // Update lastSyncedAt on success
        if (result.status === "success") {
          instance.lastSyncedAt = result.timestamp;
        }

        results.push(result);
        this.onSyncComplete?.(result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.onError?.(error, instanceId);
        results.push({
          status: "error",
          direction: "backup",
          backendType: this.backend.type,
          instanceId,
          timestamp: new Date().toISOString(),
          message: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Run restore for a single instance.
   */
  async restoreInstance(instanceId: string): Promise<SyncResult> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return {
        status: "error",
        direction: "restore",
        backendType: this.backend.type,
        instanceId,
        timestamp: new Date().toISOString(),
        message: `Instance ${instanceId} is not registered with the scheduler`,
      };
    }

    const options: SyncOptions = {
      instanceId: instance.instanceId,
      localPath: instance.localPath,
      encrypt: instance.encrypt,
      encryptionKey: instance.encryptionKey,
      force: true, // Manual restore always forces
    };

    const result = await this.backend.restore(options);

    if (result.status === "success") {
      instance.lastSyncedAt = result.timestamp;
    }

    return result;
  }
}
