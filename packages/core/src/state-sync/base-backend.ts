/**
 * Abstract base class for state-sync backends.
 *
 * Implements the Template Method pattern - subclasses only implement
 * the cloud-specific data operations (uploadData, downloadData, etc.).
 *
 * This base class provides:
 * - Common backup/restore workflow with checksum verification
 * - Encryption/decryption handling
 * - Directory packing/unpacking
 * - Consistent error handling and result formatting
 *
 * NOTE: This is provided for future refactoring. The existing backends
 * can be migrated to extend this class incrementally.
 */
import type {
  StateSyncBackend,
  SyncOptions,
  SyncResult,
  StateSyncBackendType,
} from "./interface";
import {
  readDirRecursive,
  packDirectory,
  unpackDirectory,
  sha256,
  createBackupMetadata,
  type BackupMetadata,
} from "./directory-utils";
import { encryptBuffer, decryptBuffer } from "./encryption";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";

/**
 * Configuration options for the base backend.
 */
export interface BaseBackendOptions {
  /** The backend type identifier */
  type: StateSyncBackendType;
  /** Storage prefix for organizing backups */
  prefix?: string;
}

/**
 * Metadata returned from remote storage.
 */
export interface RemoteMetadata {
  timestamp: string;
  checksum: string;
  encrypted: boolean;
}

/**
 * Abstract base class that handles common backup/restore logic.
 * Subclasses implement the cloud-specific upload/download/meta operations.
 */
export abstract class BaseStateSyncBackend implements StateSyncBackend {
  readonly type: StateSyncBackendType;
  protected readonly prefix: string;

  constructor(options: BaseBackendOptions) {
    this.type = options.type;
    this.prefix = options.prefix ?? "";
  }

  /**
   * Upload data to the backend storage.
   * @param key - Storage key/path
   * @param data - Data to upload
   * @param metadata - Metadata to attach to the object
   */
  protected abstract uploadData(
    key: string,
    data: Buffer,
    metadata?: Record<string, string>
  ): Promise<void>;

  /**
   * Download data from the backend storage.
   * @param key - Storage key/path
   * @returns Buffer or null if not found
   */
  protected abstract downloadData(key: string): Promise<Buffer | null>;

  /**
   * Get metadata for a backup.
   * @param instanceId - Instance identifier
   * @returns Metadata or null if not found
   */
  protected abstract getRemoteMetadata(
    instanceId: string
  ): Promise<RemoteMetadata | null>;

  /**
   * Save metadata for a backup.
   * @param instanceId - Instance identifier
   * @param metadata - Metadata to save
   */
  protected abstract saveRemoteMetadata(
    instanceId: string,
    metadata: BackupMetadata
  ): Promise<void>;

  /**
   * Check if the backend is healthy/accessible.
   */
  protected abstract checkBackendHealth(): Promise<boolean>;

  /**
   * Get the storage key for state data.
   * @param instanceId - Instance identifier
   */
  protected getDataKey(instanceId: string): string {
    return `${this.prefix}${instanceId}/state.dat`;
  }

  /**
   * Get the storage key for metadata.
   * @param instanceId - Instance identifier
   */
  protected getMetaKey(instanceId: string): string {
    return `${this.prefix}${instanceId}/state.meta.json`;
  }

  /**
   * Backup a directory to the backend storage.
   */
  async backup(options: SyncOptions): Promise<SyncResult> {
    const start = Date.now();
    const now = new Date().toISOString();

    try {
      const localDir = resolve(options.localPath);
      const files = await readDirRecursive(localDir);

      if (files.size === 0) {
        return this.createResult({
          status: "skipped",
          direction: "backup",
          instanceId: options.instanceId,
          timestamp: now,
          message: "No files to back up",
          durationMs: Date.now() - start,
        });
      }

      let packed = packDirectory(files);
      const checksum = sha256(packed);

      // Skip if checksum unchanged (unless force)
      if (!options.force) {
        const existing = await this.getRemoteMetadata(options.instanceId);
        if (existing?.checksum === checksum) {
          return this.createResult({
            status: "skipped",
            direction: "backup",
            instanceId: options.instanceId,
            timestamp: now,
            checksum,
            message: "Checksum unchanged, skipping backup",
            durationMs: Date.now() - start,
          });
        }
      }

      // Encrypt if requested
      const encrypted = options.encrypt ?? false;
      if (encrypted) {
        if (!options.encryptionKey) {
          throw new Error("Encryption key required when encrypt=true");
        }
        packed = encryptBuffer(packed, options.encryptionKey);
      }

      // Upload data
      await this.uploadData(this.getDataKey(options.instanceId), packed, {
        checksum,
        encrypted: String(encrypted),
      });

      // Save metadata
      const metadata = createBackupMetadata(
        options.instanceId,
        checksum,
        packed.length,
        encrypted
      );
      await this.saveRemoteMetadata(options.instanceId, metadata);

      return this.createResult({
        status: "success",
        direction: "backup",
        instanceId: options.instanceId,
        timestamp: now,
        checksum,
        bytesTransferred: packed.length,
        durationMs: Date.now() - start,
      });
    } catch (error) {
      return this.createResult({
        status: "error",
        direction: "backup",
        instanceId: options.instanceId,
        timestamp: now,
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      });
    }
  }

  /**
   * Restore a directory from the backend storage.
   */
  async restore(options: SyncOptions): Promise<SyncResult> {
    const start = Date.now();
    const now = new Date().toISOString();

    try {
      const meta = await this.getRemoteMetadata(options.instanceId);
      if (!meta) {
        return this.createResult({
          status: "skipped",
          direction: "restore",
          instanceId: options.instanceId,
          timestamp: now,
          message: "No backup found for this instance",
          durationMs: Date.now() - start,
        });
      }

      // Timestamp-based restore check
      if (options.lastSyncedAt && !options.force) {
        const lastSynced = new Date(options.lastSyncedAt).getTime();
        const backupTime = new Date(meta.timestamp).getTime();
        if (backupTime <= lastSynced) {
          return this.createResult({
            status: "skipped",
            direction: "restore",
            instanceId: options.instanceId,
            timestamp: now,
            message: "Remote backup is not newer than last sync",
            durationMs: Date.now() - start,
          });
        }
      }

      // Download data
      let data = await this.downloadData(this.getDataKey(options.instanceId));
      if (!data) {
        return this.createResult({
          status: "error",
          direction: "restore",
          instanceId: options.instanceId,
          timestamp: now,
          message: "Backup data not found",
          durationMs: Date.now() - start,
        });
      }

      // Decrypt if needed
      if (meta.encrypted) {
        if (!options.encryptionKey) {
          throw new Error(
            "Encryption key required to restore encrypted backup"
          );
        }
        data = decryptBuffer(data, options.encryptionKey);
      }

      // Verify checksum
      const checksum = sha256(data);
      if (checksum !== meta.checksum) {
        return this.createResult({
          status: "error",
          direction: "restore",
          instanceId: options.instanceId,
          timestamp: now,
          message: `Checksum mismatch: expected ${meta.checksum}, got ${checksum}`,
          durationMs: Date.now() - start,
        });
      }

      // Unpack to target directory
      const targetDir = resolve(options.localPath);
      await mkdir(targetDir, { recursive: true });
      await unpackDirectory(data, targetDir);

      return this.createResult({
        status: "success",
        direction: "restore",
        instanceId: options.instanceId,
        timestamp: now,
        checksum,
        bytesTransferred: data.length,
        durationMs: Date.now() - start,
      });
    } catch (error) {
      return this.createResult({
        status: "error",
        direction: "restore",
        instanceId: options.instanceId,
        timestamp: now,
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      });
    }
  }

  /**
   * Get the timestamp of the last backup.
   */
  async getLastBackupTimestamp(instanceId: string): Promise<string | null> {
    const meta = await this.getRemoteMetadata(instanceId);
    return meta?.timestamp ?? null;
  }

  /**
   * Check if the backend is healthy.
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await this.checkBackendHealth();
    } catch {
      return false;
    }
  }

  /**
   * Create a SyncResult with the backend type filled in.
   */
  private createResult(
    partial: Omit<SyncResult, "backendType">
  ): SyncResult {
    return {
      ...partial,
      backendType: this.type,
    };
  }
}
