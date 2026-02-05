/**
 * Google Cloud Storage (GCS) state-sync backend.
 *
 * Stores state archives as GCS objects with SHA-256 checksums
 * in object metadata and timestamps from object generation time.
 */
import {
  BaseStateSyncBackend,
  type BaseBackendOptions,
  type RemoteMetadata,
} from "./base-backend";
import type { BackupMetadata } from "./directory-utils";
import type { GCSBackendConfig } from "./interface";

/**
 * Minimal GCS client interface — consumers inject the real implementation.
 */
export interface GCSClientAdapter {
  uploadObject(params: {
    bucket: string;
    name: string;
    data: Buffer;
    metadata?: Record<string, string>;
  }): Promise<void>;

  downloadObject(params: {
    bucket: string;
    name: string;
  }): Promise<{ data: Buffer; metadata?: Record<string, string> }>;

  getObjectMetadata(params: {
    bucket: string;
    name: string;
  }): Promise<{
    updated?: Date;
    metadata?: Record<string, string>;
  } | null>;

  bucketExists(bucket: string): Promise<boolean>;
}

export class GCSStateSyncBackend extends BaseStateSyncBackend {
  private readonly config: GCSBackendConfig;

  constructor(config: GCSBackendConfig, private readonly client: GCSClientAdapter) {
    const options: BaseBackendOptions = {
      type: "gcs",
      prefix: config.prefix ?? "clawster-state/",
    };
    super(options);
    this.config = config;
  }

  private objectName(instanceId: string, suffix: string): string {
    return `${this.prefix}${instanceId}/${suffix}`;
  }

  protected async uploadData(
    key: string,
    data: Buffer,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.client.uploadObject({
      bucket: this.config.bucket,
      name: key,
      data,
      metadata,
    });
  }

  protected async downloadData(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.downloadObject({
        bucket: this.config.bucket,
        name: key,
      });
      return response.data;
    } catch {
      return null;
    }
  }

  protected async getRemoteMetadata(
    instanceId: string,
  ): Promise<RemoteMetadata | null> {
    try {
      const response = await this.client.downloadObject({
        bucket: this.config.bucket,
        name: this.objectName(instanceId, "state.meta.json"),
      });
      const parsed = JSON.parse(response.data.toString("utf-8"));
      return {
        timestamp: parsed.timestamp,
        checksum: parsed.checksum,
        encrypted: parsed.encrypted ?? false,
      };
    } catch {
      return null;
    }
  }

  protected async saveRemoteMetadata(
    instanceId: string,
    metadata: BackupMetadata,
  ): Promise<void> {
    const metaJson = JSON.stringify(metadata);
    await this.client.uploadObject({
      bucket: this.config.bucket,
      name: this.objectName(instanceId, "state.meta.json"),
      data: Buffer.from(metaJson, "utf-8"),
    });
  }

  protected async checkBackendHealth(): Promise<boolean> {
    return await this.client.bucketExists(this.config.bucket);
  }

  // Override key generation to use GCS-style naming
  protected override getDataKey(instanceId: string): string {
    return this.objectName(instanceId, "state.dat");
  }

  protected override getMetaKey(instanceId: string): string {
    return this.objectName(instanceId, "state.meta.json");
  }
}
