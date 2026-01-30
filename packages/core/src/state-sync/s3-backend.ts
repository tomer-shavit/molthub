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
import { createHash } from "node:crypto";
import { encryptBuffer, decryptBuffer } from "./encryption";
import type {
  StateSyncBackend,
  SyncOptions,
  SyncResult,
  S3BackendConfig,
} from "./interface";

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

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export class S3StateSyncBackend implements StateSyncBackend {
  readonly type = "s3" as const;

  constructor(
    private readonly config: S3BackendConfig,
    private readonly client: S3ClientAdapter,
  ) {}

  private objectKey(instanceId: string): string {
    return `${this.config.prefix}${instanceId}/state.dat`;
  }

  private metaKey(instanceId: string): string {
    return `${this.config.prefix}${instanceId}/state.meta.json`;
  }

  async backup(options: SyncOptions): Promise<SyncResult> {
    const start = Date.now();
    const now = new Date().toISOString();

    try {
      // Read the local state data — expects a single packed buffer at localPath
      const { resolve } = await import("node:path");
      const localDir = resolve(options.localPath);

      const files = await this.readDirRecursive(localDir);
      if (files.size === 0) {
        return {
          status: "skipped",
          direction: "backup",
          backendType: "s3",
          instanceId: options.instanceId,
          timestamp: now,
          message: "No files to back up",
          durationMs: Date.now() - start,
        };
      }

      let packed = this.packDirectory(files);
      const checksum = sha256(packed);

      // Skip if checksum unchanged
      if (!options.force) {
        const existing = await this.getRemoteMeta(options.instanceId);
        if (existing?.checksum === checksum) {
          return {
            status: "skipped",
            direction: "backup",
            backendType: "s3",
            instanceId: options.instanceId,
            timestamp: now,
            checksum,
            message: "Checksum unchanged, skipping backup",
            durationMs: Date.now() - start,
          };
        }
      }

      const encrypted = options.encrypt ?? false;
      if (encrypted) {
        if (!options.encryptionKey) {
          throw new Error("Encryption key required when encrypt=true");
        }
        packed = encryptBuffer(packed, options.encryptionKey);
      }

      await this.client.putObject({
        Bucket: this.config.bucket,
        Key: this.objectKey(options.instanceId),
        Body: packed,
        Metadata: { checksum, encrypted: String(encrypted) },
      });

      // Write metadata object
      const meta = JSON.stringify({
        instanceId: options.instanceId,
        timestamp: now,
        checksum,
        bytes: packed.length,
        encrypted,
      });
      await this.client.putObject({
        Bucket: this.config.bucket,
        Key: this.metaKey(options.instanceId),
        Body: Buffer.from(meta, "utf-8"),
      });

      return {
        status: "success",
        direction: "backup",
        backendType: "s3",
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
        backendType: "s3",
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
      const meta = await this.getRemoteMeta(options.instanceId);
      if (!meta) {
        return {
          status: "skipped",
          direction: "restore",
          backendType: "s3",
          instanceId: options.instanceId,
          timestamp: now,
          message: "No backup found for this instance",
          durationMs: Date.now() - start,
        };
      }

      // Timestamp-based restore
      if (options.lastSyncedAt && !options.force) {
        const lastSynced = new Date(options.lastSyncedAt).getTime();
        const backupTime = new Date(meta.timestamp).getTime();
        if (backupTime <= lastSynced) {
          return {
            status: "skipped",
            direction: "restore",
            backendType: "s3",
            instanceId: options.instanceId,
            timestamp: now,
            message: "Remote backup is not newer than last sync",
            durationMs: Date.now() - start,
          };
        }
      }

      const response = await this.client.getObject({
        Bucket: this.config.bucket,
        Key: this.objectKey(options.instanceId),
      });

      let data = response.Body;

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
          backendType: "s3",
          instanceId: options.instanceId,
          timestamp: now,
          message: `Checksum mismatch: expected ${meta.checksum}, got ${checksum}`,
          durationMs: Date.now() - start,
        };
      }

      // Unpack
      const { resolve } = await import("node:path");
      const { mkdir } = await import("node:fs/promises");
      const targetDir = resolve(options.localPath);
      await mkdir(targetDir, { recursive: true });
      await this.unpackDirectory(data, targetDir);

      return {
        status: "success",
        direction: "restore",
        backendType: "s3",
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
        backendType: "s3",
        instanceId: options.instanceId,
        timestamp: now,
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }

  async getLastBackupTimestamp(instanceId: string): Promise<string | null> {
    const meta = await this.getRemoteMeta(instanceId);
    return meta?.timestamp ?? null;
  }

  async healthCheck(): Promise<boolean> {
    try {
      return await this.client.headBucket({ Bucket: this.config.bucket });
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getRemoteMeta(instanceId: string): Promise<{
    timestamp: string;
    checksum: string;
    encrypted: boolean;
  } | null> {
    try {
      const response = await this.client.getObject({
        Bucket: this.config.bucket,
        Key: this.metaKey(instanceId),
      });
      return JSON.parse(response.Body.toString("utf-8"));
    } catch {
      return null;
    }
  }

  private async readDirRecursive(
    dir: string,
    base?: string,
  ): Promise<Map<string, Buffer>> {
    const { readdir, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
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
        const sub = await this.readDirRecursive(fullPath, root);
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

  private packDirectory(files: Map<string, Buffer>): Buffer {
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

  private async unpackDirectory(
    packed: Buffer,
    targetDir: string,
  ): Promise<void> {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");

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
}
