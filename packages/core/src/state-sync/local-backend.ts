/**
 * Local filesystem state-sync backend.
 *
 * Stores state archives on the local disk with SHA-256 checksums
 * stored in a companion `.sha256` file and timestamps in `.meta.json`.
 */
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  access,
  readdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { constants as fsConstants } from "node:fs";
import { encryptBuffer, decryptBuffer } from "./encryption";
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

/**
 * Compute SHA-256 hex digest of a buffer.
 */
export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Recursively read all files under `dir` into a Map<relativePath, Buffer>.
 */
async function readDirRecursive(
  dir: string,
  base?: string,
): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  const root = base ?? dir;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await readDirRecursive(fullPath, root);
      for (const [k, v] of sub) {
        result.set(k, v);
      }
    } else if (entry.isFile()) {
      const relativePath = fullPath.slice(root.length + 1);
      result.set(relativePath, await readFile(fullPath));
    }
  }
  return result;
}

/**
 * Pack a directory's files into a single buffer.
 * Format: JSON header line (file list with offsets) + raw file contents.
 */
function packDirectory(files: Map<string, Buffer>): Buffer {
  const manifest: Array<{ path: string; offset: number; size: number }> = [];
  let offset = 0;
  const buffers: Buffer[] = [];

  for (const [path, data] of files) {
    manifest.push({ path, offset, size: data.length });
    buffers.push(data);
    offset += data.length;
  }

  const headerJson = JSON.stringify(manifest);
  const headerBuf = Buffer.from(headerJson, "utf-8");
  const headerLenBuf = Buffer.alloc(4);
  headerLenBuf.writeUInt32BE(headerBuf.length, 0);

  return Buffer.concat([headerLenBuf, headerBuf, ...buffers]);
}

/**
 * Unpack a buffer created by {@link packDirectory} into files on disk.
 */
async function unpackDirectory(
  packed: Buffer,
  targetDir: string,
): Promise<void> {
  const headerLen = packed.readUInt32BE(0);
  const headerJson = packed.subarray(4, 4 + headerLen).toString("utf-8");
  const manifest: Array<{ path: string; offset: number; size: number }> =
    JSON.parse(headerJson);

  const dataStart = 4 + headerLen;

  for (const entry of manifest) {
    const filePath = join(targetDir, entry.path);
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (dir) {
      await mkdir(dir, { recursive: true });
    }
    const fileData = packed.subarray(
      dataStart + entry.offset,
      dataStart + entry.offset + entry.size,
    );
    await writeFile(filePath, fileData);
  }
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
