import { Injectable, Logger } from "@nestjs/common";
import type { BotInstance } from "@clawster/database";
import { validateOpenClawManifest } from "@clawster/core";
import type { OpenClawManifest } from "@clawster/core";

/**
 * ManifestParserService — responsible for parsing and validating
 * OpenClaw manifests from BotInstance records.
 *
 * Single Responsibility: Parse raw manifest JSON into validated OpenClawManifest.
 */
@Injectable()
export class ManifestParserService {
  private readonly logger = new Logger(ManifestParserService.name);

  /**
   * Parse and validate the desiredManifest JSON field into a typed
   * OpenClawManifest. Falls back to wrapping legacy manifests in a v2 envelope.
   *
   * @param instance - The BotInstance containing the raw manifest
   * @returns Validated OpenClawManifest
   * @throws Error if manifest is missing or invalid
   */
  parse(instance: BotInstance): OpenClawManifest {
    const rawStr = instance.desiredManifest;

    if (!rawStr) {
      throw new Error(`Instance ${instance.id} has no desired manifest`);
    }

    const obj = (typeof rawStr === "string" ? JSON.parse(rawStr) : rawStr) as Record<string, unknown>;

    // If it's already a v2 manifest, validate directly
    if (obj.apiVersion === "clawster/v2") {
      return validateOpenClawManifest(obj);
    }

    // Legacy format: wrap in v2 envelope
    // Assume the raw manifest IS the openclawConfig section
    const wrapped = {
      apiVersion: "clawster/v2" as const,
      kind: "OpenClawInstance" as const,
      metadata: {
        name: instance.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        workspace: instance.workspaceId,
        environment: "dev" as const,
        labels: {},
        deploymentTarget: "local" as const,
      },
      spec: {
        openclawConfig: obj,
      },
    };

    this.logger.debug(`Wrapped legacy manifest for ${instance.id} in v2 envelope`);
    return validateOpenClawManifest(wrapped);
  }

  /**
   * Validate a manifest without instance context (for testing/preview).
   *
   * @param manifest - Raw manifest object
   * @returns Validated OpenClawManifest
   */
  validate(manifest: Record<string, unknown>): OpenClawManifest {
    return validateOpenClawManifest(manifest);
  }
}
