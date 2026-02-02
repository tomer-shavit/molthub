import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import type { OpenClawManifest, OpenClawFullConfig, SecurityOverrides, AiGatewaySettings } from "@clawster/core";
import { injectGatewayIntoConfig } from "@clawster/core";

/**
 * ConfigGeneratorService — transforms a v2 OpenClawManifest into a
 * validated OpenClawFullConfig (the `openclaw.json` payload) and produces
 * deterministic config hashes for drift detection.
 */
@Injectable()
export class ConfigGeneratorService {
  private readonly logger = new Logger(ConfigGeneratorService.name);

  /**
   * Extract and transform the `spec.openclawConfig` section of a manifest
   * into a full OpenClawFullConfig suitable for writing to disk or pushing
   * via the Gateway `config.apply` RPC.
   *
   * The manifest metadata (environment, labels, deploymentTarget) is used
   * to set context-sensitive defaults (e.g. log level, gateway host) when
   * the spec does not explicitly set them.
   */
  generateOpenClawConfig(
    manifest: OpenClawManifest,
    aiGatewaySettings?: AiGatewaySettings,
  ): OpenClawFullConfig {
    const base = manifest.spec.openclawConfig;

    // OpenClaw's root schema uses .strict() — sandbox is NOT a valid top-level
    // key. It must live under agents.defaults.sandbox.  If the manifest has
    // sandbox at the top level, relocate it before building the config object.
    const { sandbox: topLevelSandbox, ...baseWithoutSandbox } = base as Record<string, unknown> & typeof base;

    // Apply environment-aware defaults that are not already set in the spec.
    let config: OpenClawFullConfig = {
      ...baseWithoutSandbox,
      // Ensure gateway section exists with sensible defaults for deployment
      gateway: {
        port: base.gateway?.port ?? 18789,
        ...base.gateway,
      },
      // Ensure logging section exists with environment-aware defaults
      logging: {
        level: base.logging?.level ?? this.defaultLogLevel(manifest.metadata.environment),
        ...base.logging,
      },
    };

    // Relocate sandbox into agents.defaults.sandbox if it was at top level
    if (topLevelSandbox && typeof topLevelSandbox === "object") {
      config.agents = {
        ...config.agents,
        defaults: {
          ...config.agents?.defaults,
          sandbox: {
            ...(topLevelSandbox as Record<string, unknown>),
            ...config.agents?.defaults?.sandbox,
          },
        },
      };
    }

    // Inject AI Gateway provider if enabled
    if (aiGatewaySettings?.enabled) {
      config = injectGatewayIntoConfig(config, aiGatewaySettings);
      this.logger.log(
        `AI Gateway injected for ${manifest.metadata.name} (provider=${aiGatewaySettings.providerName})`,
      );

      if (!config.agents?.defaults?.model?.primary?.startsWith(aiGatewaySettings.providerName ?? "vercel-ai-gateway")) {
        this.logger.warn(
          `AI Gateway enabled for ${manifest.metadata.name} but no model primary is set — gateway provider added but not routing traffic`,
        );
      }
    }

    // Strip fields that OpenClaw's strict Zod schema does not recognize.
    // OpenClaw uses `gateway.bind` (not `host`); `host` is a Clawster-internal
    // concept used for GatewayConnection options.
    if (config.gateway && "host" in config.gateway) {
      const { host: _host, ...gwRest } = config.gateway as Record<string, unknown>;
      config.gateway = gwRest as typeof config.gateway;
    }

    // Default gateway.bind to "lan" so the gateway listens on 0.0.0.0 and is
    // reachable from outside Docker containers. OpenClaw defaults to "loopback"
    // (127.0.0.1) which is inaccessible from the host network.
    // Valid modes: "auto" | "lan" | "loopback" | "custom" | "tailnet"
    if (config.gateway) {
      const gw = config.gateway as Record<string, unknown>;
      if (!gw.bind) {
        gw.bind = "lan";
      }
    }

    // OpenClaw skills schema does not have `allowUnverified`.
    if (config.skills && "allowUnverified" in config.skills) {
      const { allowUnverified: _av, ...skillsRest } = config.skills as Record<string, unknown>;
      config.skills = skillsRest as typeof config.skills;
    }

    // Strip "enabled" from channel configs — OpenClaw doesn't recognize this key.
    // Channels are enabled by being present in the config.
    if (config.channels && typeof config.channels === "object") {
      for (const [key, value] of Object.entries(config.channels)) {
        if (value && typeof value === "object" && "enabled" in value) {
          const { enabled: _enabled, ...rest } = value as Record<string, unknown>;
          (config.channels as Record<string, unknown>)[key] = rest;
        }
      }
    }

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
  generateConfigHash(config: OpenClawFullConfig): string {
    const normalized = JSON.stringify(this.sortKeys(config));
    return createHash("sha256").update(normalized).digest("hex");
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private enforceSecureDefaults(
    config: OpenClawFullConfig,
    environment: string,
    securityOverrides?: SecurityOverrides,
  ): OpenClawFullConfig {
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
    // Sandbox lives under agents.defaults.sandbox (not top-level)
    const agentSandbox = secured.agents?.defaults?.sandbox;
    if (
      (environment === "prod" || environment === "staging") &&
      agentSandbox?.mode === "off" &&
      !securityOverrides?.allowSandboxOff
    ) {
      secured.agents = {
        ...secured.agents,
        defaults: {
          ...secured.agents?.defaults,
          sandbox: {
            ...agentSandbox,
            mode: "all",
          },
        },
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
