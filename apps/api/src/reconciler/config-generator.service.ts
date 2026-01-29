import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import type { MoltbotManifest, MoltbotFullConfig, SecurityOverrides } from "@molthub/core";

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
        host: base.gateway?.host ?? "127.0.0.1",
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

    return this.enforceSecureDefaults(
      config,
      manifest.metadata.environment,
      manifest.metadata.securityOverrides,
    );
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

  private enforceSecureDefaults(
    config: MoltbotFullConfig,
    environment: string,
    securityOverrides?: SecurityOverrides,
  ): MoltbotFullConfig {
    const secured = { ...config };

    // Auto-generate a gateway auth token if auth is missing
    if (!secured.gateway?.auth?.token && !secured.gateway?.auth?.password) {
      if (!securityOverrides?.allowOpenGateway) {
        secured.gateway = {
          ...secured.gateway,
          port: secured.gateway?.port ?? 18789,
          auth: {
            ...secured.gateway?.auth,
            token: randomBytes(32).toString("hex"),
          },
        };
        this.logger.warn(
          "No gateway auth configured — auto-generated auth token",
        );
      }
    }

    // Force sandbox mode to "all" in prod/staging if currently "off"
    if (
      (environment === "prod" || environment === "staging") &&
      secured.sandbox?.mode === "off" &&
      !securityOverrides?.allowSandboxOff
    ) {
      secured.sandbox = {
        ...secured.sandbox,
        mode: "all",
      };
      this.logger.warn(
        `Sandbox mode was "off" in ${environment} — forced to "all"`,
      );
    }

    // Disable elevated tools if allowFrom is empty
    if (
      secured.tools?.elevated?.enabled &&
      (!secured.tools.elevated.allowFrom || secured.tools.elevated.allowFrom.length === 0)
    ) {
      secured.tools = {
        ...secured.tools,
        elevated: {
          ...secured.tools.elevated,
          enabled: false,
        },
      };
      this.logger.warn(
        "Elevated tools disabled — allowFrom list is empty",
      );
    }

    // Set logging.redactSensitive to "tools" if not already set
    if (!secured.logging?.redactSensitive) {
      secured.logging = {
        ...secured.logging,
        level: secured.logging?.level ?? "info",
        redactSensitive: "tools",
      };
    }

    return secured;
  }

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
