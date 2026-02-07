import { Injectable, Logger } from "@nestjs/common";
import type { OpenClawManifest } from "@clawster/core";
import type {
  IManifestPreprocessor,
  PreprocessorContext,
  PreprocessorResult,
} from "../interfaces";
import { DelegationConfigPreprocessor } from "./delegation-config.preprocessor";
import { VaultConfigPreprocessor } from "../../vault/vault-config.preprocessor";

/**
 * Result from running the full preprocessor chain.
 */
export interface ChainResult {
  /** Results from each preprocessor that ran */
  results: Array<{
    name: string;
    result: PreprocessorResult;
  }>;
  /** Total number of modifications made */
  modificationCount: number;
  /** Human-readable descriptions of all changes */
  changes: string[];
}

/**
 * PreprocessorChainService — runs manifest preprocessors in sequence.
 *
 * Single Responsibility: Orchestrate preprocessor execution order.
 *
 * Open/Closed Principle: New preprocessors can be added by injecting
 * them and calling registerPreprocessor() — no need to modify this class.
 */
@Injectable()
export class PreprocessorChainService {
  private readonly logger = new Logger(PreprocessorChainService.name);
  private readonly preprocessors: IManifestPreprocessor[] = [];

  constructor(
    private readonly delegationPreprocessor: DelegationConfigPreprocessor,
    private readonly vaultPreprocessor: VaultConfigPreprocessor,
  ) {
    // Register default preprocessors (sorted by priority automatically)
    this.registerPreprocessor(vaultPreprocessor);       // priority 40
    this.registerPreprocessor(delegationPreprocessor);   // priority 50
  }

  /**
   * Register a preprocessor to run in the chain.
   * Preprocessors are sorted by priority (lower runs first).
   */
  registerPreprocessor(preprocessor: IManifestPreprocessor): void {
    this.preprocessors.push(preprocessor);
    // Sort by priority (lower first, default 100)
    this.preprocessors.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /**
   * Run all registered preprocessors on the manifest.
   *
   * @param manifest - The manifest to preprocess (will be mutated)
   * @param context - Context for preprocessors
   * @returns Results from all preprocessors
   */
  async process(
    manifest: OpenClawManifest,
    context: PreprocessorContext,
  ): Promise<ChainResult> {
    const results: ChainResult["results"] = [];
    const changes: string[] = [];
    let modificationCount = 0;

    for (const preprocessor of this.preprocessors) {
      try {
        const result = await preprocessor.process(manifest, context);
        results.push({ name: preprocessor.name, result });

        if (result.modified) {
          modificationCount++;
          if (result.description) {
            changes.push(result.description);
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Preprocessor ${preprocessor.name} failed for instance ${context.instance.id}: ${msg}`,
        );
        // Continue with other preprocessors — don't let one failure block all
        results.push({
          name: preprocessor.name,
          result: { modified: false, description: `Error: ${msg}` },
        });
      }
    }

    return { results, modificationCount, changes };
  }

  /**
   * Get the list of registered preprocessors (for debugging/testing).
   */
  getRegisteredPreprocessors(): ReadonlyArray<{ name: string; priority: number }> {
    return this.preprocessors.map((p) => ({
      name: p.name,
      priority: p.priority ?? 100,
    }));
  }
}
