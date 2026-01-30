/**
 * Cloudflare Workers deployment target for Moltbot.
 *
 * Exports the target implementation, R2 state sync, wrangler config generator,
 * and environment mapper.
 */

export { CloudflareWorkersTarget } from "./cloudflare-workers-target";
export {
  R2StateSync,
  DEFAULT_BACKUP_INTERVAL_MS,
  type R2BackupMetadata,
  type SyncResult,
  type ShouldRestoreResult,
  type ValidationResult,
} from "./r2-state-sync";
export {
  generateWranglerConfig,
  generateWorkerEntryPoint,
  type WranglerConfigOutput,
} from "./wrangler-generator";
export {
  mapEnvironment,
  rewriteAiGatewayUrl,
  isSecretKey,
  getSecretEntries,
  type MoltbotContainerEnv,
  type WorkerSecrets,
  type EnvMappingResult,
} from "./env-mapper";
