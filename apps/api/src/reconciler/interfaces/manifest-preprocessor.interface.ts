import type { OpenClawManifest } from "@clawster/core";
import type { BotInstance } from "@clawster/database";

/**
 * Context provided to manifest preprocessors.
 */
export interface PreprocessorContext {
  /** The bot instance being reconciled */
  instance: BotInstance;
  /** Additional metadata from the reconciliation process */
  metadata?: Record<string, unknown>;
}

/**
 * Result from a preprocessor execution.
 */
export interface PreprocessorResult {
  /** Whether any changes were made to the manifest */
  modified: boolean;
  /** Human-readable description of what changed */
  description?: string;
}

/**
 * Interface for manifest preprocessors.
 *
 * Preprocessors transform the manifest before config generation.
 * They run in a chain, each receiving the output of the previous.
 *
 * Open/Closed Principle: New preprocessors can be added without
 * modifying existing code — just implement this interface and
 * register with the PreprocessorChainService.
 */
export interface IManifestPreprocessor {
  /** Unique name for this preprocessor (used for logging/debugging) */
  readonly name: string;

  /** Order priority (lower runs first, default 100) */
  readonly priority?: number;

  /**
   * Process the manifest and optionally modify it.
   *
   * @param manifest - The OpenClaw manifest (may be mutated)
   * @param context - Additional context for preprocessing
   * @returns Result indicating if changes were made
   */
  process(manifest: OpenClawManifest, context: PreprocessorContext): Promise<PreprocessorResult>;
}
