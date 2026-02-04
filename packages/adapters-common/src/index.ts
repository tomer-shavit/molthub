// Interfaces
export type { ISecretRotationService } from "./interfaces/secret-rotation";
export type { ISecretsService } from "./interfaces/secrets-service";
export type { ILoggingService } from "./interfaces/logging-service";

// Types
export type { StaleSecret, SecretValue } from "./types/secret";
export type { LogEvent, LogQueryOptions, LogQueryResult } from "./types/logging";

// Utilities
export {
  sanitizeName,
  sanitizeKeyVaultName,
  sanitizeAciName,
  sanitizeAwsName,
} from "./utils/sanitize";

export { calculateAgeDays, isOlderThan, daysAgo } from "./utils/age-calculator";
