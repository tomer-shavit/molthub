/**
 * AWS S3 state-sync backend.
 *
 * Uses the S3 API to store state archives with SHA-256 checksums
 * stored as object metadata and timestamps from LastModified.
 *
 * NOTE: This module declares the interface contract. The actual AWS SDK
 * calls are abstracted so the core package has zero cloud SDK dependencies.
 * In production, the NestJS service injects the real SDK client.
 */
import {
  BaseStateSyncBackend,
  type BaseBackendOptions,
  type RemoteMetadata,
} from "./base-backend";
import type { BackupMetadata } from "./directory-utils";
import type { S3BackendConfig } from "./interface";

/**
 * Minimal S3 client interface — consumers inject the real implementation.
 */
export interface S3ClientAdapter {
  putObject(params: {
    Bucket: string;
    Key: string;
    Body: Buffer;
    Metadata?: Record<string, string>;
  }): Promise<void>;

  getObject(params: {
    Bucket: string;
    Key: string;
  }): Promise<{ Body: Buffer; Metadata?: Record<string, string> }>;

  headObject(params: {
    Bucket: string;
    Key: string;
  }): Promise<{
    LastModified?: Date;
    Metadata?: Record<string, string>;
  } | null>;

  headBucket(params: { Bucket: string }): Promise<boolean>;
}

export class S3StateSyncBackend extends BaseStateSyncBackend {
  private readonly config: S3BackendConfig;

  constructor(config: S3BackendConfig, private readonly client: S3ClientAdapter) {
    const options: BaseBackendOptions = {
      type: "s3",
      prefix: config.prefix ?? "clawster-state/",
    };
    super(options);
    this.config = config;
  }

  protected async uploadData(
    key: string,
    data: Buffer,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.client.putObject({
      Bucket: this.config.bucket,
      Key: key,
      Body: data,
      Metadata: metadata,
    });
  }

  protected async downloadData(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.getObject({
        Bucket: this.config.bucket,
        Key: key,
      });
      return response.Body;
    } catch {
      return null;
    }
  }

  protected async getRemoteMetadata(
    instanceId: string,
  ): Promise<RemoteMetadata | null> {
    try {
      const response = await this.client.getObject({
        Bucket: this.config.bucket,
        Key: this.getMetaKey(instanceId),
      });
      const parsed = JSON.parse(response.Body.toString("utf-8"));
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
    await this.client.putObject({
      Bucket: this.config.bucket,
      Key: this.getMetaKey(instanceId),
      Body: Buffer.from(metaJson, "utf-8"),
    });
  }

  protected async checkBackendHealth(): Promise<boolean> {
    return await this.client.headBucket({ Bucket: this.config.bucket });
  }
}
