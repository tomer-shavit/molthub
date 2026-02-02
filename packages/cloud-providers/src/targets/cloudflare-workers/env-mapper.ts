/**
 * Environment variable mapper for Cloudflare Workers deployment.
 *
 * Maps Clawster configuration into Worker secrets and container environment
 * variables for the OpenClaw gateway running inside a Cloudflare Sandbox.
 */

import { CloudflareWorkersConfig } from "../../interface/deployment-target";

/**
 * Standard OpenClaw environment variables used inside the container.
 */
export interface OpenClawContainerEnv {
  /** Gateway auth token */
  OPENCLAW_GATEWAY_TOKEN: string;
  /** Gateway port inside the container */
  OPENCLAW_GATEWAY_PORT: string;
  /** Config file path inside the container */
  OPENCLAW_CONFIG_PATH: string;
  /** State directory path inside the container */
  OPENCLAW_STATE_DIR: string;
  /** Additional environment variables (model API keys, etc.) */
  [key: string]: string;
}

/**
 * Worker secrets that should be set via `wrangler secret put`.
 */
export interface WorkerSecrets {
  /** Gateway auth token */
  OPENCLAW_GATEWAY_TOKEN: string;
  /** R2 access key ID (if R2 state sync is enabled) */
  R2_ACCESS_KEY_ID?: string;
  /** R2 secret access key (if R2 state sync is enabled) */
  R2_SECRET_ACCESS_KEY?: string;
  /** AI Gateway API key (if AI Gateway is configured) */
  AI_GATEWAY_API_KEY?: string;
  /** Any additional secrets from the Clawster config */
  [key: string]: string | undefined;
}

/**
 * Result of mapping configuration to environment variables.
 */
export interface EnvMappingResult {
  /** Environment variables for the container */
  containerEnv: OpenClawContainerEnv;
  /** Secrets that should be set via wrangler secret */
  workerSecrets: WorkerSecrets;
  /** Plain-text variables safe for wrangler.jsonc [vars] section */
  workerVars: Record<string, string>;
}

/**
 * Maps Clawster Cloudflare Workers config and optional additional environment
 * into container env, worker secrets, and worker vars.
 *
 * @param config - Cloudflare Workers deployment config
 * @param additionalEnv - Extra environment variables from the Clawster config payload
 * @returns Separated env mapping result
 */
export function mapEnvironment(
  config: CloudflareWorkersConfig,
  additionalEnv?: Record<string, string>
): EnvMappingResult {
  const containerEnv: OpenClawContainerEnv = {
    OPENCLAW_GATEWAY_TOKEN: config.gatewayToken,
    OPENCLAW_GATEWAY_PORT: String(config.gatewayPort),
    OPENCLAW_CONFIG_PATH: "/app/config/openclaw.json",
    OPENCLAW_STATE_DIR: "/app/state",
  };

  const workerSecrets: WorkerSecrets = {
    OPENCLAW_GATEWAY_TOKEN: config.gatewayToken,
  };

  const workerVars: Record<string, string> = {
    WORKER_NAME: config.workerName,
    GATEWAY_PORT: String(config.gatewayPort),
    SANDBOX_INSTANCE_TYPE: config.sandboxInstanceType || "standard-4",
  };

  // R2 state sync credentials
  if (config.r2AccessKeyId) {
    workerSecrets.R2_ACCESS_KEY_ID = config.r2AccessKeyId;
  }
  if (config.r2SecretAccessKey) {
    workerSecrets.R2_SECRET_ACCESS_KEY = config.r2SecretAccessKey;
  }
  if (config.r2BucketName) {
    workerVars.R2_BUCKET_NAME = config.r2BucketName;
  }

  // AI Gateway config
  if (config.aiGatewayBaseUrl) {
    workerVars.AI_GATEWAY_BASE_URL = rewriteAiGatewayUrl(config.aiGatewayBaseUrl);
  }
  if (config.aiGatewayApiKey) {
    workerSecrets.AI_GATEWAY_API_KEY = config.aiGatewayApiKey;
  }

  // Custom domain
  if (config.customDomain) {
    workerVars.CUSTOM_DOMAIN = config.customDomain;
  }

  // Map additional environment variables, separating secrets from plain vars.
  // Keys containing SECRET, KEY, TOKEN, PASSWORD, or CREDENTIAL are treated as secrets.
  if (additionalEnv) {
    for (const [key, value] of Object.entries(additionalEnv)) {
      if (isSecretKey(key)) {
        workerSecrets[key] = value;
      } else {
        workerVars[key] = value;
      }
      // All additional env goes to the container regardless
      containerEnv[key] = value;
    }
  }

  return { containerEnv, workerSecrets, workerVars };
}

/**
 * Rewrites an AI Gateway URL to use the Cloudflare AI Gateway format
 * if it is not already in that format.
 *
 * Cloudflare AI Gateway URLs follow the pattern:
 *   https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}
 *
 * If the URL is already a Cloudflare AI Gateway URL, it is returned as-is.
 * Otherwise the original URL is returned unchanged (it may be a custom proxy).
 */
export function rewriteAiGatewayUrl(url: string): string {
  // Already a Cloudflare AI Gateway URL — return as-is
  if (url.includes("gateway.ai.cloudflare.com")) {
    return url;
  }
  // Non-Cloudflare URL — return unchanged (custom proxy)
  return url;
}

/**
 * Determines whether an environment variable key should be treated as a secret.
 * Keys containing common secret-related words are flagged.
 */
export function isSecretKey(key: string): boolean {
  const secretPatterns = ["SECRET", "KEY", "TOKEN", "PASSWORD", "CREDENTIAL", "PRIVATE"];
  const upper = key.toUpperCase();
  return secretPatterns.some((pattern) => upper.includes(pattern));
}

/**
 * Generates a list of `wrangler secret put` commands for all worker secrets.
 *
 * @param secrets - Worker secrets to set
 * @returns Array of [secretName, secretValue] tuples
 */
export function getSecretEntries(secrets: WorkerSecrets): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(secrets)) {
    if (value !== undefined) {
      entries.push([key, value]);
    }
  }
  return entries;
}
