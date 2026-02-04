/**
 * Local filesystem state-sync backend.
 *
 * Stores state archives on the local disk with SHA-256 checksums
 * stored in a companion `.sha256` file and timestamps in `.meta.json`.
 */
import {
  mkdir,
  readFile,
  writeFile,
  access,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { constants as fsConstants } from "node:fs";
import { encryptBuffer, decryptBuffer } from "./encryption";
import {
  sha256,
  readDirRecursive,
  packDirectory,
  unpackDirectory,
} from "./directory-utils";
import type {
  StateSyncBackend,
  SyncOptions,
  SyncResult,
  LocalBackendConfig,
} from "./interface";

interface BackupMeta {
  instanceId: string;
  timestamp: string;
  checksum: string;
  bytes: number;
  encrypted: boolean;
}

export class LocalStateSyncBackend implements StateSyncBackend {
  readonly type = "local" as const;
  private readonly basePath: string;

  constructor(config: LocalBackendConfig) {
    this.basePath = resolve(config.basePath);
  }

  private instanceDir(instanceId: string): string {
    return join(this.basePath, instanceId);
  }

  private metaPath(instanceId: string): string {
    return join(this.instanceDir(instanceId), "backup.meta.json");
  }

  private dataPath(instanceId: string): string {
    return join(this.instanceDir(instanceId), "backup.dat");
  }

  async backup(options: SyncOptions): Promise<SyncResult> {
    const start = Date.now();
    const now = new Date().toISOString();

    try {
      const localDir = resolve(options.localPath);
      const files = await readDirRecursive(localDir);

      if (files.size === 0) {
        return {
          status: "skipped",
          direction: "backup",
          backendType: "local",
          instanceId: options.instanceId,
          timestamp: now,
          message: "No files to back up",
          durationMs: Date.now() - start,
        };
      }

      let packed = packDirectory(files);
      const checksum = sha256(packed);

      // Check if we should skip (same checksum as last backup)
      if (!options.force) {
        const existingMeta = await this.readMeta(options.instanceId);
        if (existingMeta && existingMeta.checksum === checksum) {
          return {
            status: "skipped",
            direction: "backup",
            backendType: "local",
            instanceId: options.instanceId,
            timestamp: now,
            checksum,
            message: "Checksum unchanged, skipping backup",
            durationMs: Date.now() - start,
          };
        }
      }

      // Encrypt if requested
      if (options.encrypt) {
        if (!options.encryptionKey) {
          throw new Error("Encryption key required when encrypt=true");
        }
        packed = encryptBuffer(packed, options.encryptionKey);
      }

      // Write to backup location
      const destDir = this.instanceDir(options.instanceId);
      await mkdir(destDir, { recursive: true });
      await writeFile(this.dataPath(options.instanceId), packed);

      const meta: BackupMeta = {
        instanceId: options.instanceId,
        timestamp: now,
        checksum,
        bytes: packed.length,
        encrypted: options.encrypt ?? false,
      };
      await writeFile(this.metaPath(options.instanceId), JSON.stringify(meta, null, 2));

      return {
        status: "success",
        direction: "backup",
        backendType: "local",
        instanceId: options.instanceId,
        timestamp: now,
        checksum,
        bytesTransferred: packed.length,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "error",
        direction: "backup",
        backendType: "local",
        instanceId: options.instanceId,
        timestamp: now,
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }

  async restore(options: SyncOptions): Promise<SyncResult> {
    const start = Date.now();
    const now = new Date().toISOString();

    try {
      const meta = await this.readMeta(options.instanceId);
      if (!meta) {
        return {
          status: "skipped",
          direction: "restore",
          backendType: "local",
          instanceId: options.instanceId,
          timestamp: now,
          message: "No backup found for this instance",
          durationMs: Date.now() - start,
        };
      }

      // Timestamp-based restore: skip if remote is not newer
      if (options.lastSyncedAt && !options.force) {
        const lastSynced = new Date(options.lastSyncedAt).getTime();
        const backupTime = new Date(meta.timestamp).getTime();
        if (backupTime <= lastSynced) {
          return {
            status: "skipped",
            direction: "restore",
            backendType: "local",
            instanceId: options.instanceId,
            timestamp: now,
            message: "Remote backup is not newer than last sync",
            durationMs: Date.now() - start,
          };
        }
      }

      let data: Buffer = Buffer.from(await readFile(this.dataPath(options.instanceId)));

      // Decrypt if needed
      if (meta.encrypted) {
        if (!options.encryptionKey) {
          throw new Error("Encryption key required to restore encrypted backup");
        }
        data = decryptBuffer(data, options.encryptionKey);
      }

      // Verify checksum
      const checksum = sha256(data);
      if (checksum !== meta.checksum) {
        return {
          status: "error",
          direction: "restore",
          backendType: "local",
          instanceId: options.instanceId,
          timestamp: now,
          message: `Checksum mismatch: expected ${meta.checksum}, got ${checksum}`,
          durationMs: Date.now() - start,
        };
      }

      // Unpack to local path
      const targetDir = resolve(options.localPath);
      await mkdir(targetDir, { recursive: true });
      await unpackDirectory(data, targetDir);

      return {
        status: "success",
        direction: "restore",
        backendType: "local",
        instanceId: options.instanceId,
        timestamp: now,
        checksum,
        bytesTransferred: data.length,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "error",
        direction: "restore",
        backendType: "local",
        instanceId: options.instanceId,
        timestamp: now,
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }

  async getLastBackupTimestamp(instanceId: string): Promise<string | null> {
    const meta = await this.readMeta(instanceId);
    return meta?.timestamp ?? null;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await mkdir(this.basePath, { recursive: true });
      await access(this.basePath, fsConstants.W_OK | fsConstants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async readMeta(instanceId: string): Promise<BackupMeta | null> {
    try {
      const raw = await readFile(this.metaPath(instanceId), "utf-8");
      return JSON.parse(raw) as BackupMeta;
    } catch {
      return null;
    }
  }
}
