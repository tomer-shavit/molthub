/**
 * Shared utilities for cloud provider implementations
 * 
 * This module provides common patterns for:
 * - Error handling and retry logic
 * - Progress tracking
 * - Resource naming and tagging
 * - Idempotency helpers
 * 
 * When adding a new provider, use these utilities to ensure
 * consistent behavior across all implementations.
 */

import { ProgressCallback } from "../interface/provider";

/**
 * Standard error types that all providers should handle
 */
export enum ProviderErrorType {
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  NETWORK = "NETWORK",
  UNKNOWN = "UNKNOWN",
}

/**
 * Structured error for provider operations
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly type: ProviderErrorType,
    public readonly originalError?: Error,
    public readonly suggestions?: string[]
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * Retry configuration for transient failures
 */
export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  retryableErrors: [
    "ThrottlingException",
    "RateExceeded",
    "RequestLimitExceeded",
    "ServiceUnavailable",
    "InternalError",
    "ECONNRESET",
    "ETIMEDOUT",
  ],
};

/**
 * Execute an async operation with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let delay = retryConfig.delayMs;

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const errorName = (error as any).name || (error as any).code || "";
      
      // Check if error is retryable
      const isRetryable = retryConfig.retryableErrors.some(e => 
        errorName.includes(e) || lastError!.message.includes(e)
      );

      if (!isRetryable || attempt === retryConfig.maxAttempts) {
        throw error;
      }

      // Wait before retrying
      await sleep(delay);
      delay *= retryConfig.backoffMultiplier;
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate standardized resource names
 * Format: molthub-{workspace}-{resourceType}-{suffix}
 */
export function generateResourceName(
  workspace: string,
  resourceType: string,
  suffix?: string
): string {
  const parts = ["molthub", workspace, resourceType];
  if (suffix) parts.push(suffix);
  return parts.join("-").toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/**
 * Generate standardized tags for all resources
 */
export function generateTags(
  workspace: string,
  extraTags?: Record<string, string>
): Record<string, string> {
  return {
    managedBy: "molthub",
    workspace,
    createdAt: new Date().toISOString(),
    ...extraTags,
  };
}

/**
 * Convert tags object to AWS format
 */
export function toAWSTags(tags: Record<string, string>): Array<{ Key: string; Value: string }> {
  return Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
}

/**
 * Convert tags object to Azure format
 */
export function toAzureTags(tags: Record<string, string>): Record<string, string> {
  // Azure tags have different restrictions - sanitize keys
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    // Azure tag keys: max 512 chars, no special chars
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 512);
    sanitized[sanitizedKey] = value.slice(0, 256); // Azure value max 256 chars
  }
  return sanitized;
}

/**
 * Convert tags object to GCP format
 */
export function toGCPLabels(tags: Record<string, string>): Record<string, string> {
  // GCP labels: keys must be lowercase, start with letter, max 63 chars
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    const sanitizedKey = key.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 63);
    const sanitizedValue = value.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 63);
    if (sanitizedKey && !sanitizedKey.match(/^[0-9]/)) {
      sanitized[sanitizedKey] = sanitizedValue;
    }
  }
  return sanitized;
}

/**
 * Track progress through multiple steps
 */
export class ProgressTracker {
  private steps: Map<string, { status: "pending" | "in_progress" | "complete" | "error"; message: string }> = new Map();

  constructor(
    private stepNames: string[],
    private onProgress?: ProgressCallback
  ) {
    for (const step of stepNames) {
      this.steps.set(step, { status: "pending", message: "" });
    }
  }

  start(step: string, message?: string): void {
    this.steps.set(step, { status: "in_progress", message: message || `${step}...` });
    this.onProgress?.(step, "in_progress", message);
  }

  complete(step: string, message?: string): void {
    const finalMessage = message || `${step} complete`;
    this.steps.set(step, { status: "complete", message: finalMessage });
    this.onProgress?.(step, "complete", finalMessage);
  }

  error(step: string, message: string): void {
    this.steps.set(step, { status: "error", message });
    this.onProgress?.(step, "error", message);
  }

  getStatus(step: string): string {
    return this.steps.get(step)?.status || "unknown";
  }

  isComplete(): boolean {
    return Array.from(this.steps.values()).every(s => s.status === "complete");
  }

  hasErrors(): boolean {
    return Array.from(this.steps.values()).some(s => s.status === "error");
  }

  getSummary(): { completed: number; total: number; errors: string[] } {
    const values = Array.from(this.steps.values());
    return {
      completed: values.filter(s => s.status === "complete").length,
      total: values.length,
      errors: values.filter(s => s.status === "error").map(s => s.message),
    };
  }
}

/**
 * Helper to make operations idempotent
 * Checks if resource exists before creating
 */
export async function createOrUpdate<T>(
  checkExists: () => Promise<T | null>,
  create: () => Promise<T>,
  update?: (existing: T) => Promise<T>
): Promise<T> {
  const existing = await checkExists();
  
  if (existing) {
    if (update) {
      return await update(existing);
    }
    return existing;
  }
  
  return await create();
}

/**
 * Wait for a resource to reach a desired state
 */
export async function waitForState<T>(
  getState: () => Promise<T>,
  isDesiredState: (state: T) => boolean,
  options: {
    maxWaitMs?: number;
    pollIntervalMs?: number;
    timeoutMessage?: string;
  } = {}
): Promise<T> {
  const { 
    maxWaitMs = 300000, // 5 minutes
    pollIntervalMs = 5000, // 5 seconds
    timeoutMessage = "Timeout waiting for resource to reach desired state"
  } = options;

  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const state = await getState();
    if (isDesiredState(state)) {
      return state;
    }
    await sleep(pollIntervalMs);
  }
  
  throw new ProviderError(timeoutMessage, ProviderErrorType.UNKNOWN);
}

/**
 * Format resource list for CLI output
 */
export function formatResourceList(resources: Array<{ name: string; id: string; status: string }>): string {
  const maxNameLength = Math.max(...resources.map(r => r.name.length), 10);
  const maxIdLength = Math.max(...resources.map(r => r.id.length), 10);
  
  const header = `${"Name".padEnd(maxNameLength)} | ${"ID".padEnd(maxIdLength)} | Status`;
  const lines = resources.map(r => 
    `${r.name.padEnd(maxNameLength)} | ${r.id.slice(0, maxIdLength).padEnd(maxIdLength)} | ${r.status}`
  );
  
  return [header, "-".repeat(header.length), ...lines].join("\n");
}

/**
 * Sanitize a string for use as a resource name
 * Different clouds have different naming rules
 */
export function sanitizeResourceName(name: string, maxLength: number = 63): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength);
}

/**
 * Parse error from cloud SDK and return standardized error info
 */
export function parseCloudError(error: any, providerName: string): {
  type: ProviderErrorType;
  message: string;
  suggestions: string[];
} {
  const errorName = error?.name || error?.code || "";
  const errorMessage = error?.message || String(error);

  // AWS errors
  if (errorName.includes("CredentialsProviderError") || 
      errorName.includes("TokenRefreshError") ||
      errorMessage.includes("credentials")) {
    return {
      type: ProviderErrorType.AUTHENTICATION,
      message: `AWS credentials not configured or expired`,
      suggestions: [
        "Run 'aws configure' to set up credentials",
        "Check that your AWS access keys are valid",
        "Verify the AWS_REGION environment variable is set",
      ],
    };
  }

  if (errorName.includes("AccessDenied") || 
      errorName.includes("UnauthorizedOperation")) {
    return {
      type: ProviderErrorType.AUTHORIZATION,
      message: `Insufficient permissions to perform this operation`,
      suggestions: [
        "Check your IAM policies for required permissions",
        "Ensure your user/role has the necessary access rights",
        `See ${providerName} documentation for required permissions`,
      ],
    };
  }

  if (errorName.includes("ResourceNotFound") || 
      errorName.includes("NotFound") ||
      errorName.includes("NoSuch")) {
    return {
      type: ProviderErrorType.NOT_FOUND,
      message: `Resource not found: ${errorMessage}`,
      suggestions: [
        "Check that the resource name/ID is correct",
        "Verify the resource exists in the correct region",
      ],
    };
  }

  if (errorName.includes("AlreadyExists") || 
      errorName.includes("ResourceExists") ||
      errorName.includes("Conflict")) {
    return {
      type: ProviderErrorType.ALREADY_EXISTS,
      message: `Resource already exists: ${errorMessage}`,
      suggestions: [
        "Use a different name for the resource",
        "Check if the resource was already created",
        "Run 'molthub cleanup' to remove existing resources",
      ],
    };
  }

  if (errorName.includes("LimitExceeded") || 
      errorName.includes("QuotaExceeded") ||
      errorName.includes("Throttling")) {
    return {
      type: ProviderErrorType.QUOTA_EXCEEDED,
      message: `Service limit exceeded: ${errorMessage}`,
      suggestions: [
        "Request a quota increase from your cloud provider",
        "Wait a few minutes and try again",
        "Reduce the number of resources being created",
      ],
    };
  }

  if (errorName.includes("NetworkError") || 
      errorName.includes("Timeout") ||
      errorName.includes("ECONN")) {
    return {
      type: ProviderErrorType.NETWORK,
      message: `Network error: ${errorMessage}`,
      suggestions: [
        "Check your internet connection",
        "Verify you can reach the cloud provider's API",
        "Try again in a few moments",
      ],
    };
  }

  return {
    type: ProviderErrorType.UNKNOWN,
    message: errorMessage,
    suggestions: [
      "Check the error details above",
      "Run with DEBUG=1 for more information",
      `See ${providerName} troubleshooting documentation`,
    ],
  };
}
