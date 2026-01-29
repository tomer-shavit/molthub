import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import type { MoltbotManifest, MoltbotFullConfig } from "@molthub/core";

/**
 * ConfigGeneratorService — transforms a v2 MoltbotManifest into a
 * validated MoltbotFullConfig (the `moltbot.json` payload) and produces
 * deterministic config hashes for drift detection.
 */
@Injectable()
export class ConfigGeneratorService {
  private readonly logger = new Logger(ConfigGeneratorService.name);

  /**
   * Extract and transform the `spec.moltbotConfig` section of a manifest
   * into a full MoltbotFullConfig suitable for writing to disk or pushing
   * via the Gateway `config.apply` RPC.
   *
   * The manifest metadata (environment, labels, deploymentTarget) is used
   * to set context-sensitive defaults (e.g. log level, gateway host) when
   * the spec does not explicitly set them.
   */
  generateMoltbotConfig(manifest: MoltbotManifest): MoltbotFullConfig {
    const base = manifest.spec.moltbotConfig;

    // Apply environment-aware defaults that are not already set in the spec.
    const config: MoltbotFullConfig = {
      ...base,
      // Ensure gateway section exists with sensible defaults for deployment
      gateway: {
        port: base.gateway?.port ?? 18789,
        host: base.gateway?.host ?? "0.0.0.0",
        ...base.gateway,
      },
      // Ensure logging section exists with environment-aware defaults
      logging: {
        level: base.logging?.level ?? this.defaultLogLevel(manifest.metadata.environment),
        ...base.logging,
      },
    };

    this.logger.debug(
      `Generated config for ${manifest.metadata.name} (env=${manifest.metadata.environment})`,
    );

    return config;
  }

  /**
   * Produce a deterministic SHA-256 hash of a config object.
   * Keys are sorted recursively so that logically identical configs
   * always produce the same hash regardless of property order.
   */
  generateConfigHash(config: MoltbotFullConfig): string {
    const normalized = JSON.stringify(this.sortKeys(config));
    return createHash("sha256").update(normalized).digest("hex");
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private defaultLogLevel(env: string): "debug" | "info" | "warn" | "error" {
    switch (env) {
      case "prod":
        return "warn";
      case "staging":
        return "info";
      default:
        return "debug";
    }
  }

  /**
   * Recursively sort object keys so that serialisation is deterministic.
   */
  private sortKeys(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortKeys(item));
    }
    if (obj !== null && typeof obj === "object") {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
        sorted[key] = this.sortKeys((obj as Record<string, unknown>)[key]);
      }
      return sorted;
    }
    return obj;
  }
}
