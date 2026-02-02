import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type StateSyncBackend,
  type SyncResult,
  type StateSyncConfig,
  StateSyncConfigSchema,
  LocalStateSyncBackend,
  SyncScheduler,
  type ScheduledInstance,
} from "@clawster/core";

@Injectable()
export class StateSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StateSyncService.name);
  private backend: StateSyncBackend | null = null;
  private scheduler: SyncScheduler | null = null;
  private config: StateSyncConfig | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.initializeFromEnv();
  }

  onModuleDestroy(): void {
    this.stopScheduler();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  private initializeFromEnv(): void {
    const enabled = this.configService.get<string>("STATE_SYNC_ENABLED");
    if (enabled !== "true") {
      this.logger.log("State sync is disabled (STATE_SYNC_ENABLED != true)");
      return;
    }

    const backendType = this.configService.get<string>("STATE_SYNC_BACKEND") ?? "local";
    const intervalSeconds = parseInt(
      this.configService.get<string>("STATE_SYNC_INTERVAL_SECONDS") ?? "300",
      10,
    );
    const encrypt = this.configService.get<string>("STATE_SYNC_ENCRYPT") === "true";
    const encryptionKey = this.configService.get<string>("STATE_SYNC_ENCRYPTION_KEY");

    try {
      const rawConfig = this.buildConfigFromEnv(backendType, intervalSeconds, encrypt, encryptionKey);
      this.config = StateSyncConfigSchema.parse(rawConfig);
      this.backend = this.createBackend(this.config);
      this.scheduler = new SyncScheduler(this.backend, {
        intervalSeconds: this.config.intervalSeconds,
        onSyncComplete: (result) => {
          if (result.status === "error") {
            this.logger.error(
              `Backup failed for ${result.instanceId}: ${result.message}`,
            );
          } else if (result.status === "success") {
            this.logger.log(
              `Backup succeeded for ${result.instanceId} (${result.bytesTransferred} bytes, ${result.durationMs}ms)`,
            );
          }
        },
        onError: (error, instanceId) => {
          this.logger.error(
            `Scheduler error for ${instanceId}: ${error.message}`,
          );
        },
      });

      this.logger.log(
        `State sync initialized: backend=${backendType}, interval=${intervalSeconds}s, encrypt=${encrypt}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize state sync: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private buildConfigFromEnv(
    backendType: string,
    intervalSeconds: number,
    encrypt: boolean,
    encryptionKey?: string,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      enabled: true,
      intervalSeconds,
      encrypt,
      encryptionKey,
    };

    switch (backendType) {
      case "s3":
        base.backend = {
          type: "s3",
          bucket: this.configService.get<string>("STATE_SYNC_S3_BUCKET") ?? "",
          region: this.configService.get<string>("STATE_SYNC_S3_REGION") ?? "us-east-1",
          prefix: this.configService.get<string>("STATE_SYNC_S3_PREFIX") ?? "clawster/state/",
          accessKeyId: this.configService.get<string>("STATE_SYNC_S3_ACCESS_KEY_ID"),
          secretAccessKey: this.configService.get<string>("STATE_SYNC_S3_SECRET_ACCESS_KEY"),
          endpoint: this.configService.get<string>("STATE_SYNC_S3_ENDPOINT"),
        };
        break;
      case "r2":
        base.backend = {
          type: "r2",
          bucket: this.configService.get<string>("STATE_SYNC_R2_BUCKET") ?? "",
          accountId: this.configService.get<string>("STATE_SYNC_R2_ACCOUNT_ID") ?? "",
          prefix: this.configService.get<string>("STATE_SYNC_R2_PREFIX") ?? "clawster/state/",
          accessKeyId: this.configService.get<string>("STATE_SYNC_R2_ACCESS_KEY_ID") ?? "",
          secretAccessKey: this.configService.get<string>("STATE_SYNC_R2_SECRET_ACCESS_KEY") ?? "",
        };
        break;
      case "azure-blob":
        base.backend = {
          type: "azure-blob",
          connectionString: this.configService.get<string>("STATE_SYNC_AZURE_CONNECTION_STRING") ?? "",
          containerName: this.configService.get<string>("STATE_SYNC_AZURE_CONTAINER") ?? "clawster-state",
          prefix: this.configService.get<string>("STATE_SYNC_AZURE_PREFIX") ?? "state/",
        };
        break;
      case "gcs":
        base.backend = {
          type: "gcs",
          bucket: this.configService.get<string>("STATE_SYNC_GCS_BUCKET") ?? "",
          prefix: this.configService.get<string>("STATE_SYNC_GCS_PREFIX") ?? "clawster/state/",
          projectId: this.configService.get<string>("STATE_SYNC_GCS_PROJECT_ID"),
          keyFilePath: this.configService.get<string>("STATE_SYNC_GCS_KEY_FILE"),
        };
        break;
      case "local":
      default:
        base.backend = {
          type: "local",
          basePath: this.configService.get<string>("STATE_SYNC_LOCAL_PATH") ?? "/tmp/clawster-state-backups",
        };
        break;
    }

    return base;
  }

  private createBackend(config: StateSyncConfig): StateSyncBackend {
    switch (config.backend.type) {
      case "local":
        return new LocalStateSyncBackend(config.backend);
      case "s3":
      case "r2":
      case "azure-blob":
      case "gcs":
        // Cloud backends require injected SDK clients.
        // For now, only local backend is directly instantiable.
        // Cloud backends should be configured via provider injection
        // in a production setup. Fall back to local with a warning.
        this.logger.warn(
          `Cloud backend "${config.backend.type}" requires SDK client injection. ` +
            `Use setBackend() to provide a configured backend instance. ` +
            `Falling back to local backend.`,
        );
        return new LocalStateSyncBackend({
          type: "local",
          basePath: "/tmp/clawster-state-backups",
        });
      default:
        throw new Error(`Unsupported backend type: ${(config.backend as { type: string }).type}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Override the backend with a pre-configured instance
   * (useful for injecting cloud SDK clients).
   */
  setBackend(backend: StateSyncBackend): void {
    this.backend = backend;
    if (this.scheduler) {
      this.scheduler.stop();
    }
    this.scheduler = new SyncScheduler(backend, {
      intervalSeconds: this.config?.intervalSeconds ?? 300,
      onSyncComplete: (result) => {
        if (result.status === "error") {
          this.logger.error(`Backup failed for ${result.instanceId}: ${result.message}`);
        }
      },
      onError: (error, instanceId) => {
        this.logger.error(`Scheduler error for ${instanceId}: ${error.message}`);
      },
    });
  }

  /**
   * Register an instance for scheduled backups.
   */
  registerInstance(instance: ScheduledInstance): void {
    if (!this.scheduler) {
      this.logger.warn("State sync not initialized — cannot register instance");
      return;
    }
    this.scheduler.addInstance(instance);
    this.logger.log(`Registered instance ${instance.instanceId} for state sync`);
  }

  /**
   * Remove an instance from scheduled backups.
   */
  unregisterInstance(instanceId: string): void {
    this.scheduler?.removeInstance(instanceId);
  }

  /**
   * Start the periodic backup scheduler.
   */
  startScheduler(): void {
    if (!this.scheduler) {
      this.logger.warn("State sync not initialized — cannot start scheduler");
      return;
    }
    this.scheduler.start();
    this.logger.log("State sync scheduler started");
  }

  /**
   * Stop the periodic backup scheduler.
   */
  stopScheduler(): void {
    if (this.scheduler?.isRunning()) {
      this.scheduler.stop();
      this.logger.log("State sync scheduler stopped");
    }
  }

  /**
   * Manually trigger backup for a specific instance.
   */
  async backupInstance(instanceId: string, localPath: string): Promise<SyncResult> {
    if (!this.backend) {
      return {
        status: "error",
        direction: "backup",
        backendType: "local",
        instanceId,
        timestamp: new Date().toISOString(),
        message: "State sync not initialized",
      };
    }

    return this.backend.backup({
      instanceId,
      localPath,
      encrypt: this.config?.encrypt ?? false,
      encryptionKey: this.config?.encryptionKey,
      force: true,
    });
  }

  /**
   * Manually trigger restore for a specific instance.
   */
  async restoreInstance(instanceId: string, localPath: string): Promise<SyncResult> {
    if (!this.backend) {
      return {
        status: "error",
        direction: "restore",
        backendType: "local",
        instanceId,
        timestamp: new Date().toISOString(),
        message: "State sync not initialized",
      };
    }

    return this.backend.restore({
      instanceId,
      localPath,
      encrypt: this.config?.encrypt ?? false,
      encryptionKey: this.config?.encryptionKey,
      force: true,
    });
  }

  /**
   * Run a backup cycle for all registered instances.
   */
  async runBackupCycle(): Promise<SyncResult[]> {
    if (!this.scheduler) {
      return [];
    }
    return this.scheduler.runBackupCycle();
  }

  /**
   * Get the last backup timestamp for an instance.
   */
  async getLastBackupTimestamp(instanceId: string): Promise<string | null> {
    if (!this.backend) return null;
    return this.backend.getLastBackupTimestamp(instanceId);
  }

  /**
   * Check backend health.
   */
  async healthCheck(): Promise<boolean> {
    if (!this.backend) return false;
    return this.backend.healthCheck();
  }

  /**
   * Get current state sync status info.
   */
  getStatus(): {
    enabled: boolean;
    backendType: string | null;
    schedulerRunning: boolean;
    registeredInstances: string[];
    intervalSeconds: number;
  } {
    return {
      enabled: this.backend !== null,
      backendType: this.backend?.type ?? null,
      schedulerRunning: this.scheduler?.isRunning() ?? false,
      registeredInstances: this.scheduler?.getRegisteredInstances() ?? [],
      intervalSeconds: this.config?.intervalSeconds ?? 300,
    };
  }
}
