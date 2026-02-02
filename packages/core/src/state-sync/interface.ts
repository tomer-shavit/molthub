/**
 * State Sync Backend Interface & Types
 *
 * Defines the pluggable interface for state backup/restore across
 * deployment targets: S3, R2, Azure Blob, GCS, and local filesystem.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const StateSyncBackendTypeSchema = z.enum([
  "s3",
  "r2",
  "azure-blob",
  "gcs",
  "local",
]);
export type StateSyncBackendType = z.infer<typeof StateSyncBackendTypeSchema>;

export const SyncDirectionSchema = z.enum(["backup", "restore"]);
export type SyncDirection = z.infer<typeof SyncDirectionSchema>;

export const SyncStatusSchema = z.enum([
  "success",
  "skipped",
  "error",
]);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const SyncResultSchema = z.object({
  status: SyncStatusSchema,
  direction: SyncDirectionSchema,
  backendType: StateSyncBackendTypeSchema,
  instanceId: z.string(),
  /** ISO-8601 timestamp of the sync operation */
  timestamp: z.string(),
  /** SHA-256 checksum of the synced data (hex) */
  checksum: z.string().optional(),
  /** Bytes transferred */
  bytesTransferred: z.number().int().nonnegative().optional(),
  /** Human-readable reason when status is 'skipped' or 'error' */
  message: z.string().optional(),
  /** Duration of the operation in milliseconds */
  durationMs: z.number().nonnegative().optional(),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;

export const SyncOptionsSchema = z.object({
  /** Instance ID to sync */
  instanceId: z.string(),
  /** Local path to the state directory */
  localPath: z.string(),
  /** Only restore if remote is newer than this timestamp */
  lastSyncedAt: z.string().datetime().optional(),
  /** Enable encryption at rest (AES-256-GCM) */
  encrypt: z.boolean().default(false),
  /** Encryption key (required when encrypt=true). 32-byte hex string. */
  encryptionKey: z.string().optional(),
  /** Force sync even if checksums match */
  force: z.boolean().default(false),
});
export type SyncOptions = z.infer<typeof SyncOptionsSchema>;

export const S3BackendConfigSchema = z.object({
  type: z.literal("s3"),
  bucket: z.string().min(1),
  region: z.string().min(1).default("us-east-1"),
  prefix: z.string().default("clawster/state/"),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  endpoint: z.string().url().optional(),
});
export type S3BackendConfig = z.infer<typeof S3BackendConfigSchema>;

export const R2BackendConfigSchema = z.object({
  type: z.literal("r2"),
  bucket: z.string().min(1),
  accountId: z.string().min(1),
  prefix: z.string().default("clawster/state/"),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
});
export type R2BackendConfig = z.infer<typeof R2BackendConfigSchema>;

export const AzureBlobBackendConfigSchema = z.object({
  type: z.literal("azure-blob"),
  connectionString: z.string().min(1),
  containerName: z.string().min(1).default("clawster-state"),
  prefix: z.string().default("state/"),
});
export type AzureBlobBackendConfig = z.infer<typeof AzureBlobBackendConfigSchema>;

export const GCSBackendConfigSchema = z.object({
  type: z.literal("gcs"),
  bucket: z.string().min(1),
  prefix: z.string().default("clawster/state/"),
  projectId: z.string().optional(),
  keyFilePath: z.string().optional(),
});
export type GCSBackendConfig = z.infer<typeof GCSBackendConfigSchema>;

export const LocalBackendConfigSchema = z.object({
  type: z.literal("local"),
  basePath: z.string().min(1),
});
export type LocalBackendConfig = z.infer<typeof LocalBackendConfigSchema>;

export const StateSyncBackendConfigSchema = z.discriminatedUnion("type", [
  S3BackendConfigSchema,
  R2BackendConfigSchema,
  AzureBlobBackendConfigSchema,
  GCSBackendConfigSchema,
  LocalBackendConfigSchema,
]);
export type StateSyncBackendConfig = z.infer<typeof StateSyncBackendConfigSchema>;

export const StateSyncConfigSchema = z.object({
  enabled: z.boolean().default(false),
  backend: StateSyncBackendConfigSchema,
  /** Backup interval in seconds (default: 300 = 5 minutes) */
  intervalSeconds: z.number().int().positive().default(300),
  /** Enable encryption at rest */
  encrypt: z.boolean().default(false),
  /** 32-byte hex encryption key (64 hex chars) */
  encryptionKey: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
});
export type StateSyncConfig = z.infer<typeof StateSyncConfigSchema>;

// ---------------------------------------------------------------------------
// Backend interface
// ---------------------------------------------------------------------------

/**
 * Pluggable backend for state persistence.
 *
 * Each implementation handles uploading/downloading state archives
 * to a specific storage provider.
 */
export interface StateSyncBackend {
  readonly type: StateSyncBackendType;

  /**
   * Upload local state to remote storage.
   * Must compute SHA-256 checksum of the payload and attach it as metadata.
   */
  backup(options: SyncOptions): Promise<SyncResult>;

  /**
   * Download remote state to local path.
   * Must verify SHA-256 checksum before overwriting local data.
   * If `lastSyncedAt` is provided, skip download when remote is not newer.
   */
  restore(options: SyncOptions): Promise<SyncResult>;

  /**
   * Return the remote timestamp of the last backup for an instance,
   * or null if no backup exists.
   */
  getLastBackupTimestamp(instanceId: string): Promise<string | null>;

  /**
   * Check connectivity to the backend storage.
   */
  healthCheck(): Promise<boolean>;
}
