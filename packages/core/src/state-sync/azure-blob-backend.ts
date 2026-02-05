/**
 * Azure Blob Storage state-sync backend.
 *
 * Stores state archives as block blobs with SHA-256 checksums in
 * blob metadata and timestamps from the blob properties.
 */
import {
  BaseStateSyncBackend,
  type BaseBackendOptions,
  type RemoteMetadata,
} from "./base-backend";
import type { BackupMetadata } from "./directory-utils";
import type { AzureBlobBackendConfig } from "./interface";

/**
 * Minimal Azure Blob client interface — consumers inject the real implementation.
 */
export interface AzureBlobClientAdapter {
  uploadBlob(params: {
    containerName: string;
    blobName: string;
    data: Buffer;
    metadata?: Record<string, string>;
  }): Promise<void>;

  downloadBlob(params: {
    containerName: string;
    blobName: string;
  }): Promise<{ data: Buffer; metadata?: Record<string, string> }>;

  getBlobProperties(params: {
    containerName: string;
    blobName: string;
  }): Promise<{
    lastModified?: Date;
    metadata?: Record<string, string>;
  } | null>;

  containerExists(containerName: string): Promise<boolean>;
}

export class AzureBlobStateSyncBackend extends BaseStateSyncBackend {
  private readonly config: AzureBlobBackendConfig;

  constructor(
    config: AzureBlobBackendConfig,
    private readonly client: AzureBlobClientAdapter,
  ) {
    const options: BaseBackendOptions = {
      type: "azure-blob",
      prefix: config.prefix ?? "clawster-state/",
    };
    super(options);
    this.config = config;
  }

  private blobName(instanceId: string, suffix: string): string {
    return `${this.prefix}${instanceId}/${suffix}`;
  }

  protected async uploadData(
    key: string,
    data: Buffer,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.client.uploadBlob({
      containerName: this.config.containerName,
      blobName: key,
      data,
      metadata,
    });
  }

  protected async downloadData(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.downloadBlob({
        containerName: this.config.containerName,
        blobName: key,
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
      const response = await this.client.downloadBlob({
        containerName: this.config.containerName,
        blobName: this.blobName(instanceId, "state.meta.json"),
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
    await this.client.uploadBlob({
      containerName: this.config.containerName,
      blobName: this.blobName(instanceId, "state.meta.json"),
      data: Buffer.from(metaJson, "utf-8"),
    });
  }

  protected async checkBackendHealth(): Promise<boolean> {
    return await this.client.containerExists(this.config.containerName);
  }

  // Override key generation to use Azure-style naming
  protected override getDataKey(instanceId: string): string {
    return this.blobName(instanceId, "state.dat");
  }

  protected override getMetaKey(instanceId: string): string {
    return this.blobName(instanceId, "state.meta.json");
  }
}
