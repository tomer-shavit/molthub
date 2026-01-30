/**
 * R2 State Sync for Cloudflare Workers deployment.
 *
 * Handles backup and restore of Moltbot state to/from Cloudflare R2 buckets.
 * Modeled after moltworker's pattern:
 * - Backup every 5 minutes via scheduler
 * - Timestamp-based: only restore if R2 has newer files
 * - Validate source files before overwriting (check critical files exist)
 * - Uses rsync-compatible approach for S3/R2 compatibility
 */

import { execFile } from "child_process";
import { CloudflareWorkersConfig } from "../../interface/deployment-target";

/**
 * Critical files that must exist in a valid Moltbot state directory.
 * These are checked before backup/restore to avoid corrupting state.
 */
const CRITICAL_STATE_FILES = [
  "gateway.db",
  "sessions/",
];

/**
 * Default backup interval in milliseconds (5 minutes).
 */
export const DEFAULT_BACKUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Metadata stored alongside each R2 backup to track timing.
 */
export interface R2BackupMetadata {
  /** ISO timestamp of last backup */
  lastBackupAt: string;
  /** Worker name that produced the backup */
  workerName: string;
  /** Unix timestamp (ms) for numeric comparison */
  timestampMs: number;
}

/**
 * Result of a sync operation (backup or restore).
 */
export interface SyncResult {
  success: boolean;
  message: string;
  /** Number of files synced */
  filesCount?: number;
  /** Total bytes transferred */
  bytesTransferred?: number;
}

/**
 * Result of a timestamp comparison to decide whether to restore.
 */
export interface ShouldRestoreResult {
  /** Whether the R2 state is newer and should be restored */
  shouldRestore: boolean;
  /** Local state timestamp (ms), or undefined if no local state */
  localTimestamp?: number;
  /** R2 state timestamp (ms), or undefined if no R2 state */
  r2Timestamp?: number;
  /** Human-readable reason */
  reason: string;
}

/**
 * Validation result for state files.
 */
export interface ValidationResult {
  valid: boolean;
  /** List of missing or invalid critical files */
  missingFiles: string[];
  message: string;
}

/**
 * Executes a command using child_process.execFile and returns stdout.
 */
function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${cmd} ${args.join(" ")}\n${stderr || error.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * R2StateSync manages backup and restore of Moltbot state to Cloudflare R2.
 */
export class R2StateSync {
  private config: CloudflareWorkersConfig;
  private stateDir: string;
  private metadataKey: string;

  constructor(config: CloudflareWorkersConfig, stateDir: string = "/app/state") {
    this.config = config;
    this.stateDir = stateDir;
    this.metadataKey = `${config.workerName}/backup-metadata.json`;
  }

  /**
   * Backs up the local state directory to the R2 bucket.
   *
   * Uses `wrangler r2 object put` for each file in the state directory.
   * Skips backup if validation fails (critical files missing).
   */
  async backupToR2(): Promise<SyncResult> {
    if (!this.config.r2BucketName) {
      return { success: false, message: "R2 bucket not configured" };
    }

    // Validate local state before uploading
    const validation = await this.validateBeforeSync(this.stateDir);
    if (!validation.valid) {
      return {
        success: false,
        message: `Backup skipped: ${validation.message}`,
      };
    }

    const bucketName = this.config.r2BucketName;
    const prefix = `${this.config.workerName}/state`;

    try {
      // Use wrangler to sync files to R2
      // wrangler r2 object put <bucket>/<key> --file <path>
      const output = await runCommand("wrangler", [
        "r2",
        "object",
        "put",
        `${bucketName}/${prefix}`,
        "--file",
        this.stateDir,
        "--content-type",
        "application/octet-stream",
      ]);

      // Write backup metadata
      const metadata: R2BackupMetadata = {
        lastBackupAt: new Date().toISOString(),
        workerName: this.config.workerName,
        timestampMs: Date.now(),
      };

      const fs = await import("fs");
      const metadataPath = `${this.stateDir}/.backup-metadata.json`;
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      await runCommand("wrangler", [
        "r2",
        "object",
        "put",
        `${bucketName}/${this.metadataKey}`,
        "--file",
        metadataPath,
        "--content-type",
        "application/json",
      ]);

      return {
        success: true,
        message: `State backed up to R2 bucket "${bucketName}" at prefix "${prefix}". ${output}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Backup failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Restores state from the R2 bucket to the local state directory.
   *
   * Only restores if `shouldRestore()` indicates R2 has newer state.
   * Validates R2 state before overwriting local files.
   */
  async restoreFromR2(): Promise<SyncResult> {
    if (!this.config.r2BucketName) {
      return { success: false, message: "R2 bucket not configured" };
    }

    const restoreCheck = await this.shouldRestore();
    if (!restoreCheck.shouldRestore) {
      return {
        success: true,
        message: `Restore skipped: ${restoreCheck.reason}`,
      };
    }

    const bucketName = this.config.r2BucketName;
    const prefix = `${this.config.workerName}/state`;

    try {
      // Use wrangler to download state from R2
      await runCommand("wrangler", [
        "r2",
        "object",
        "get",
        `${bucketName}/${prefix}`,
        "--file",
        this.stateDir,
      ]);

      return {
        success: true,
        message: `State restored from R2 bucket "${bucketName}" (R2 timestamp: ${restoreCheck.r2Timestamp})`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Restore failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Compares timestamps between local state and R2 state to determine
   * if a restore is needed.
   *
   * Returns true if:
   * - No local state exists (fresh container)
   * - R2 state is newer than local state
   *
   * Returns false if:
   * - No R2 state exists
   * - Local state is newer or equal to R2 state
   */
  async shouldRestore(): Promise<ShouldRestoreResult> {
    if (!this.config.r2BucketName) {
      return {
        shouldRestore: false,
        reason: "R2 bucket not configured",
      };
    }

    const localTimestamp = await this.getLocalTimestamp();
    const r2Timestamp = await this.getR2Timestamp();

    // No R2 backup exists — nothing to restore
    if (r2Timestamp === undefined) {
      return {
        shouldRestore: false,
        localTimestamp,
        r2Timestamp,
        reason: "No R2 backup found",
      };
    }

    // No local state — definitely restore
    if (localTimestamp === undefined) {
      return {
        shouldRestore: true,
        localTimestamp,
        r2Timestamp,
        reason: "No local state found; R2 backup available",
      };
    }

    // Compare timestamps — only restore if R2 is strictly newer
    if (r2Timestamp > localTimestamp) {
      return {
        shouldRestore: true,
        localTimestamp,
        r2Timestamp,
        reason: `R2 state is newer (R2: ${r2Timestamp}, local: ${localTimestamp})`,
      };
    }

    return {
      shouldRestore: false,
      localTimestamp,
      r2Timestamp,
      reason: `Local state is current (local: ${localTimestamp}, R2: ${r2Timestamp})`,
    };
  }

  /**
   * Validates that a state directory contains the critical files needed
   * for a valid Moltbot state. Used before both backup and restore to
   * prevent corrupting state.
   *
   * @param directory - Path to the state directory to validate
   * @returns Validation result with missing files list
   */
  async validateBeforeSync(directory: string): Promise<ValidationResult> {
    const fs = await import("fs");
    const path = await import("path");
    const missingFiles: string[] = [];

    for (const file of CRITICAL_STATE_FILES) {
      const fullPath = path.join(directory, file);
      try {
        const stat = fs.statSync(fullPath);
        if (file.endsWith("/") && !stat.isDirectory()) {
          missingFiles.push(file);
        } else if (!file.endsWith("/") && !stat.isFile()) {
          missingFiles.push(file);
        }
      } catch {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      return {
        valid: false,
        missingFiles,
        message: `Missing critical files: ${missingFiles.join(", ")}`,
      };
    }

    return {
      valid: true,
      missingFiles: [],
      message: "All critical state files present",
    };
  }

  /**
   * Gets the timestamp of the local backup metadata, if it exists.
   */
  private async getLocalTimestamp(): Promise<number | undefined> {
    const fs = await import("fs");
    const metadataPath = `${this.stateDir}/.backup-metadata.json`;

    try {
      const content = fs.readFileSync(metadataPath, "utf8");
      const metadata: R2BackupMetadata = JSON.parse(content);
      return metadata.timestampMs;
    } catch {
      return undefined;
    }
  }

  /**
   * Gets the timestamp of the R2 backup metadata by downloading it.
   */
  private async getR2Timestamp(): Promise<number | undefined> {
    if (!this.config.r2BucketName) {
      return undefined;
    }

    try {
      const output = await runCommand("wrangler", [
        "r2",
        "object",
        "get",
        `${this.config.r2BucketName}/${this.metadataKey}`,
        "--pipe",
      ]);

      const metadata: R2BackupMetadata = JSON.parse(output);
      return metadata.timestampMs;
    } catch {
      return undefined;
    }
  }
}
