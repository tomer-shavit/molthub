/**
 * Local filesystem state-sync backend.
 *
 * Stores state archives on the local disk with SHA-256 checksums
 * stored in a companion metadata file.
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { constants as fsConstants } from "node:fs";
import {
  BaseStateSyncBackend,
  type BaseBackendOptions,
  type RemoteMetadata,
} from "./base-backend";
import type { BackupMetadata } from "./directory-utils";
import type { LocalBackendConfig } from "./interface";

export class LocalStateSyncBackend extends BaseStateSyncBackend {
  private readonly basePath: string;

  constructor(config: LocalBackendConfig) {
    const options: BaseBackendOptions = {
      type: "local",
      prefix: "",
    };
    super(options);
    this.basePath = resolve(config.basePath);
  }

  private instanceDir(instanceId: string): string {
    return join(this.basePath, instanceId);
  }

  // Override key generation for local filesystem paths
  protected override getDataKey(instanceId: string): string {
    return join(this.instanceDir(instanceId), "state.dat");
  }

  protected override getMetaKey(instanceId: string): string {
    return join(this.instanceDir(instanceId), "state.meta.json");
  }

  protected async uploadData(
    key: string,
    data: Buffer,
    _metadata?: Record<string, string>,
  ): Promise<void> {
    // Ensure parent directory exists
    const dir = key.substring(0, key.lastIndexOf("/"));
    if (dir) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(key, data);
  }

  protected async downloadData(key: string): Promise<Buffer | null> {
    try {
      return await readFile(key);
    } catch {
      return null;
    }
  }

  protected async getRemoteMetadata(
    instanceId: string,
  ): Promise<RemoteMetadata | null> {
    try {
      const raw = await readFile(this.getMetaKey(instanceId), "utf-8");
      const parsed = JSON.parse(raw);
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
    const metaPath = this.getMetaKey(instanceId);
    const dir = metaPath.substring(0, metaPath.lastIndexOf("/"));
    if (dir) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(metaPath, JSON.stringify(metadata, null, 2));
  }

  protected async checkBackendHealth(): Promise<boolean> {
    try {
      await mkdir(this.basePath, { recursive: true });
      await access(this.basePath, fsConstants.W_OK | fsConstants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}
