import { ComputeService } from "./compute/compute-service";
import { SecretManagerService } from "./secrets/secret-manager-service";
import { SecretRotationService } from "./secrets/secret-rotation.service";
import { CloudLoggingService } from "./logging/cloud-logging-service";

// Re-export classes
export { ComputeService } from "./compute/compute-service";
export { SecretManagerService } from "./secrets/secret-manager-service";
export { SecretRotationService } from "./secrets/secret-rotation.service";
export { CloudLoggingService } from "./logging/cloud-logging-service";

// Re-export types
export type { ComputeServiceConfig, VmInstanceConfig, VmStatus } from "./compute/compute-service";
export type { SecretManagerServiceConfig, SecretValue } from "./secrets/secret-manager-service";
export type { SecretRotationServiceConfig, StaleSecret } from "./secrets/secret-rotation.service";
export type { CloudLoggingServiceConfig, LogEvent, LogQueryOptions } from "./logging/cloud-logging-service";

/**
 * Configuration for GCP adapters.
 * Provides common configuration options used across all GCP services.
 */
export interface GcpConfig {
  /** GCP project ID */
  projectId: string;

  /** GCP zone for Compute Engine resources (e.g., "us-central1-a") */
  zone?: string;

  /** GCP region (derived from zone if not provided) */
  region?: string;

  /**
   * Path to service account key file (JSON).
   * If not provided, Application Default Credentials will be used.
   */
  keyFilename?: string;

  /**
   * Service account credentials object.
   * Alternative to keyFilename for programmatic credential passing.
   */
  credentials?: {
    client_email: string;
    private_key: string;
  };
}

/**
 * Create a compute service with the given configuration.
 *
 * @param config - GCP configuration
 * @returns Configured ComputeService instance
 */
export function createComputeService(config: GcpConfig): ComputeService {
  if (!config.zone) {
    throw new Error("zone is required for ComputeService");
  }

  return new ComputeService({
    projectId: config.projectId,
    zone: config.zone,
    keyFilename: config.keyFilename,
    credentials: config.credentials,
  });
}

/**
 * Create a secret manager service with the given configuration.
 *
 * @param config - GCP configuration
 * @returns Configured SecretManagerService instance
 */
export function createSecretManagerService(config: GcpConfig): SecretManagerService {
  return new SecretManagerService({
    projectId: config.projectId,
    keyFilename: config.keyFilename,
    credentials: config.credentials,
  });
}

/**
 * Create a secret rotation service with the given configuration.
 *
 * @param config - GCP configuration
 * @returns Configured SecretRotationService instance
 */
export function createSecretRotationService(config: GcpConfig): SecretRotationService {
  return new SecretRotationService({
    projectId: config.projectId,
    keyFilename: config.keyFilename,
    credentials: config.credentials,
  });
}

/**
 * Create a cloud logging service with the given configuration.
 *
 * @param config - GCP configuration
 * @returns Configured CloudLoggingService instance
 */
export function createCloudLoggingService(config: GcpConfig): CloudLoggingService {
  return new CloudLoggingService({
    projectId: config.projectId,
    keyFilename: config.keyFilename,
    credentials: config.credentials,
  });
}
