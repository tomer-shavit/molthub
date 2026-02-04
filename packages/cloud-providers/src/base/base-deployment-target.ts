/**
 * Base Deployment Target
 *
 * Abstract base class for deployment targets that provides common functionality.
 * Subclasses should extend this and implement the abstract methods.
 */

import {
  DeploymentTarget,
  DeploymentTargetType,
  InstallOptions,
  InstallResult,
  OpenClawConfigPayload,
  ConfigureResult,
  TargetStatus,
  DeploymentLogOptions,
  GatewayEndpoint,
} from "../interface/deployment-target";
import type { ResourceSpec, ResourceUpdateResult } from "../interface/resource-spec";
import { transformConfig, TransformOptions } from "./config-transformer";

export type LogCallback = (line: string, stream: "stdout" | "stderr") => void;

/**
 * Abstract base class for deployment targets.
 * Provides common utilities for logging, config transformation, and resource naming.
 */
export abstract class BaseDeploymentTarget implements DeploymentTarget {
  abstract readonly type: DeploymentTargetType;

  protected logCallback?: LogCallback;

  /**
   * Set a callback to receive log output during operations.
   */
  setLogCallback(cb: LogCallback): void {
    this.logCallback = cb;
  }

  /**
   * Emit a log line to the registered callback.
   */
  protected log(message: string, stream: "stdout" | "stderr" = "stdout"): void {
    if (this.logCallback) {
      this.logCallback(message, stream);
    }
  }

  /**
   * Transform an OpenClaw configuration using the default transformer.
   * Subclasses can override getTransformOptions() to customize behavior.
   */
  protected transformConfig(config: Record<string, unknown>): Record<string, unknown> {
    return transformConfig(config, this.getTransformOptions());
  }

  /**
   * Get transformation options for this target.
   * Override in subclasses to customize config transformation.
   */
  protected getTransformOptions(): TransformOptions {
    return {};
  }

  /**
   * Generate a resource name with proper formatting.
   *
   * @param baseName - The base name (e.g., instance name)
   * @param suffix - Optional suffix (e.g., "vm", "disk", "nic")
   * @param maxLength - Maximum length for the resulting name (default: 63)
   * @returns Sanitized resource name
   */
  protected resourceName(baseName: string, suffix?: string, maxLength = 63): string {
    const parts = ["clawster", baseName];
    if (suffix) {
      parts.push(suffix);
    }

    const name = parts
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");

    // Ensure name starts with a letter (some cloud providers require this)
    const finalName = /^[a-z]/.test(name) ? name : `a${name}`;

    return finalName.substring(0, maxLength);
  }

  /**
   * Sanitize a name for use in cloud resources.
   *
   * @param name - Raw name to sanitize
   * @param maxLength - Maximum length (default: 63)
   * @returns Sanitized name safe for cloud resources
   */
  protected sanitizeName(name: string, maxLength = 63): string {
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-")
      .substring(0, maxLength);

    if (!sanitized) {
      throw new Error(`Invalid name: "${name}" produces empty sanitized value`);
    }

    return sanitized;
  }

  /**
   * Wait for a condition to be met, with polling.
   *
   * @param condition - Function that returns true when condition is met
   * @param options - Polling options
   * @returns Promise that resolves when condition is met or rejects on timeout
   */
  protected async waitFor(
    condition: () => Promise<boolean>,
    options: {
      timeoutMs?: number;
      intervalMs?: number;
      description?: string;
    } = {}
  ): Promise<void> {
    const {
      timeoutMs = 300_000, // 5 minutes default
      intervalMs = 5_000, // 5 seconds default
      description = "condition",
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await condition()) {
        return;
      }
      this.log(`Waiting for ${description}...`, "stdout");
      await this.sleep(intervalMs);
    }

    throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
  }

  /**
   * Sleep for specified milliseconds.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute an operation with retry logic.
   *
   * @param operation - Async function to execute
   * @param options - Retry options
   * @returns Result of the operation
   * @throws Last error if all retries fail
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      delayMs?: number;
      backoffMultiplier?: number;
      description?: string;
      shouldRetry?: (error: Error) => boolean;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      delayMs = 1000,
      backoffMultiplier = 2,
      description = "operation",
      shouldRetry = () => true,
    } = options;

    let lastError: Error;
    let currentDelay = delayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxAttempts || !shouldRetry(lastError)) {
          throw lastError;
        }

        this.log(
          `${description} failed (attempt ${attempt}/${maxAttempts}): ${lastError.message}. Retrying in ${currentDelay}ms...`,
          "stderr"
        );

        await this.sleep(currentDelay);
        currentDelay *= backoffMultiplier;
      }
    }

    throw lastError!;
  }

  // -- Abstract methods that subclasses must implement --

  abstract install(options: InstallOptions): Promise<InstallResult>;
  abstract configure(config: OpenClawConfigPayload): Promise<ConfigureResult>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract restart(): Promise<void>;
  abstract getStatus(): Promise<TargetStatus>;
  abstract getLogs(options?: DeploymentLogOptions): Promise<string[]>;
  abstract getEndpoint(): Promise<GatewayEndpoint>;
  abstract destroy(): Promise<void>;

  // -- Optional methods with default implementations --

  /**
   * Update resource allocation.
   * Default implementation throws - override in targets that support it.
   */
  updateResources(_spec: ResourceSpec): Promise<ResourceUpdateResult> {
    return Promise.reject(
      new Error(`Resource updates not supported for ${this.type} targets`)
    );
  }

  /**
   * Get current resource allocation.
   * Default implementation throws - override in targets that support it.
   */
  getResources(): Promise<ResourceSpec> {
    return Promise.reject(
      new Error(`Resource queries not supported for ${this.type} targets`)
    );
  }
}
