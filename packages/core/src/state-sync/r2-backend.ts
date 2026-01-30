/**
 * Cloudflare R2 state-sync backend.
 *
 * R2 is S3-compatible, so this backend re-uses the S3 backend with
 * a custom endpoint pointing to the R2 API.
 */
import { S3StateSyncBackend, type S3ClientAdapter } from "./s3-backend";
import type {
  StateSyncBackend,
  SyncOptions,
  SyncResult,
  R2BackendConfig,
} from "./interface";

export class R2StateSyncBackend implements StateSyncBackend {
  readonly type = "r2" as const;
  private readonly inner: S3StateSyncBackend;

  constructor(config: R2BackendConfig, client: S3ClientAdapter) {
    // R2 uses S3-compatible API with a custom endpoint
    this.inner = new S3StateSyncBackend(
      {
        type: "s3",
        bucket: config.bucket,
        region: "auto",
        prefix: config.prefix,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      },
      client,
    );
  }

  async backup(options: SyncOptions): Promise<SyncResult> {
    const result = await this.inner.backup(options);
    return { ...result, backendType: "r2" };
  }

  async restore(options: SyncOptions): Promise<SyncResult> {
    const result = await this.inner.restore(options);
    return { ...result, backendType: "r2" };
  }

  async getLastBackupTimestamp(instanceId: string): Promise<string | null> {
    return this.inner.getLastBackupTimestamp(instanceId);
  }

  async healthCheck(): Promise<boolean> {
    return this.inner.healthCheck();
  }
}
