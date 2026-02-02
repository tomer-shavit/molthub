import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  prisma,
} from "@clawster/database";
import {
  GatewayClient,
  PROTOCOL_VERSION,
} from "@clawster/gateway-client";
import type {
  GatewayConnectionOptions,
  GatewayAuth,
  ConfigGetResult,
} from "@clawster/gateway-client";
import type {
  ProcessInfo,
  GatewayProbeResult,
  RedactedConfig,
  EnvVarStatus,
  FileInfo,
  ConnectivityResult,
} from "./debug.types";

/** Connection timeout for debug operations (ms). */
const DEBUG_TIMEOUT_MS = 15_000;

/** Keys in openclaw.json that should be redacted. */
const SECRET_KEYS = new Set([
  "token",
  "password",
  "secret",
  "apiKey",
  "api_key",
  "botToken",
  "appToken",
  "authToken",
  "privateKey",
  "accessKeyId",
  "secretAccessKey",
  "credentials",
]);

/** Known environment variable categories for OpenClaw. */
const ENV_VAR_CATALOG: Array<{ name: string; category: EnvVarStatus["category"] }> = [
  { name: "OPENCLAW_CONFIG_PATH", category: "required" },
  { name: "OPENCLAW_STATE_DIR", category: "required" },
  { name: "OPENCLAW_PROFILE", category: "required" },
  { name: "OPENCLAW_GATEWAY_PORT", category: "required" },
  { name: "OPENCLAW_DISABLE_BONJOUR", category: "optional" },
  { name: "OPENCLAW_LOG_LEVEL", category: "optional" },
  { name: "NODE_ENV", category: "optional" },
  { name: "TELEGRAM_BOT_TOKEN", category: "channel" },
  { name: "DISCORD_BOT_TOKEN", category: "channel" },
  { name: "SLACK_BOT_TOKEN", category: "channel" },
  { name: "SLACK_APP_TOKEN", category: "channel" },
  { name: "ANTHROPIC_API_KEY", category: "ai" },
  { name: "OPENAI_API_KEY", category: "ai" },
  { name: "GOOGLE_API_KEY", category: "ai" },
];

@Injectable()
export class DebugService {
  private readonly logger = new Logger(DebugService.name);

  async getProcesses(instanceId: string): Promise<ProcessInfo[]> {
    const instance = await this.loadInstanceOrThrow(instanceId);
    const processes: ProcessInfo[] = [];

    const connection = await prisma.gatewayConnection.findUnique({
      where: { instanceId },
    });

    if (connection) {
      let client: GatewayClient | null = null;
      try {
        client = this.createClient(connection);
        await client.connect();
        const health = await client.health();

        processes.push({
          pid: 1,
          command: `openclaw gateway --port ${connection.port}${instance.profileName ? ` --profile ${instance.profileName}` : ""}`,
          cpuPercent: 0,
          memoryMb: 0,
          uptime: `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`,
        });

        for (const ch of health.channels) {
          processes.push({
            pid: 0,
            command: `[channel] ${ch.type}:${ch.name} (${ch.ok ? "healthy" : "degraded"})`,
            cpuPercent: 0,
            memoryMb: 0,
            uptime: "N/A",
          });
        }
      } catch (err) {
        this.logger.warn(`Cannot probe gateway for processes on ${instanceId}: ${(err as Error).message}`);
        processes.push({
          pid: 0,
          command: "[gateway unreachable]",
          cpuPercent: 0,
          memoryMb: 0,
          uptime: "unknown",
        });
      } finally {
        if (client) {
          try { await client.disconnect(); } catch { /* ignore */ }
        }
      }
    } else {
      processes.push({
        pid: 0,
        command: "[no gateway connection configured]",
        cpuPercent: 0,
        memoryMb: 0,
        uptime: "unknown",
      });
    }

    return processes;
  }

  async probeGateway(instanceId: string): Promise<GatewayProbeResult> {
    await this.loadInstanceOrThrow(instanceId);

    const connection = await prisma.gatewayConnection.findUnique({
      where: { instanceId },
    });

    if (!connection) {
      return {
        reachable: false,
        latencyMs: -1,
        protocolVersion: PROTOCOL_VERSION,
        healthOk: false,
        channelsLinked: 0,
        uptime: 0,
        error: "No gateway connection configured for this instance",
      };
    }

    let client: GatewayClient | null = null;
    try {
      client = this.createClient(connection);
      const startMs = Date.now();
      await client.connect();
      const health = await client.health();
      const latencyMs = Date.now() - startMs;

      return {
        reachable: true,
        latencyMs,
        protocolVersion: PROTOCOL_VERSION,
        healthOk: health.ok,
        channelsLinked: health.channels.length,
        uptime: health.uptime,
      };
    } catch (err) {
      return {
        reachable: false,
        latencyMs: -1,
        protocolVersion: PROTOCOL_VERSION,
        healthOk: false,
        channelsLinked: 0,
        uptime: 0,
        error: (err as Error).message ?? "Unknown error",
      };
    } finally {
      if (client) {
        try { await client.disconnect(); } catch { /* ignore */ }
      }
    }
  }

  async getConfig(instanceId: string): Promise<RedactedConfig> {
    const instance = await this.loadInstanceOrThrow(instanceId);

    const connection = await prisma.gatewayConnection.findUnique({
      where: { instanceId },
    });

    if (connection) {
      let client: GatewayClient | null = null;
      try {
        client = this.createClient(connection);
        await client.connect();
        const result: ConfigGetResult = await client.configGet();
        return {
          config: this.redactSecrets(result.config),
          configHash: result.hash,
          source: "gateway",
        };
      } catch (err) {
        this.logger.warn(`Cannot get config from gateway for ${instanceId}: ${(err as Error).message}`);
      } finally {
        if (client) {
          try { await client.disconnect(); } catch { /* ignore */ }
        }
      }
    }

    const config = (typeof instance.desiredManifest === "string" ? JSON.parse(instance.desiredManifest) : instance.desiredManifest) as Record<string, unknown> ?? {};
    return {
      config: this.redactSecrets(config),
      configHash: instance.configHash ?? "unknown",
      source: "target",
    };
  }

  async getEnvStatus(instanceId: string): Promise<EnvVarStatus[]> {
    const instance = await this.loadInstanceOrThrow(instanceId);

    const profile = await prisma.openClawProfile.findUnique({
      where: { instanceId },
    });

    const connection = await prisma.gatewayConnection.findUnique({
      where: { instanceId },
    });

    const manifest = (typeof instance.desiredManifest === "string" ? JSON.parse(instance.desiredManifest) : instance.desiredManifest) as Record<string, unknown> | null;
    const spec = (manifest?.spec as Record<string, unknown>) ?? manifest ?? {};
    const openclawConfig = (spec?.openclawConfig as Record<string, unknown>) ?? spec;
    const channels = (openclawConfig?.channels as Record<string, unknown>) ?? {};

    return ENV_VAR_CATALOG.map((envVar) => {
      let isSet = false;

      switch (envVar.name) {
        case "OPENCLAW_CONFIG_PATH":
          isSet = !!profile?.configPath;
          break;
        case "OPENCLAW_STATE_DIR":
          isSet = !!profile?.stateDir;
          break;
        case "OPENCLAW_PROFILE":
          isSet = !!instance.profileName;
          break;
        case "OPENCLAW_GATEWAY_PORT":
          isSet = !!instance.gatewayPort || !!connection?.port;
          break;
        case "TELEGRAM_BOT_TOKEN":
          isSet = !!(channels.telegram as Record<string, unknown> | undefined)?.botToken
            || !!(channels.telegram as Record<string, unknown> | undefined)?.tokenFile;
          break;
        case "DISCORD_BOT_TOKEN":
          isSet = !!(channels.discord as Record<string, unknown> | undefined)?.token;
          break;
        case "SLACK_BOT_TOKEN":
          isSet = !!(channels.slack as Record<string, unknown> | undefined)?.botToken;
          break;
        case "SLACK_APP_TOKEN":
          isSet = !!(channels.slack as Record<string, unknown> | undefined)?.appToken;
          break;
        case "ANTHROPIC_API_KEY":
        case "OPENAI_API_KEY":
        case "GOOGLE_API_KEY":
          isSet = this.inferAiKeyPresence(openclawConfig, envVar.name);
          break;
        default:
          isSet = false;
          break;
      }

      return { name: envVar.name, isSet, category: envVar.category };
    });
  }

  async getStateFiles(instanceId: string): Promise<FileInfo[]> {
    await this.loadInstanceOrThrow(instanceId);

    const profile = await prisma.openClawProfile.findUnique({
      where: { instanceId },
    });

    const files: FileInfo[] = [];

    if (profile) {
      if (profile.configPath) {
        files.push({ path: profile.configPath, size: 0, lastModified: new Date(), isDirectory: false });
      }
      if (profile.stateDir) {
        files.push({ path: profile.stateDir, size: 0, lastModified: new Date(), isDirectory: true });
      }
      if (profile.workspace) {
        files.push({ path: profile.workspace, size: 0, lastModified: new Date(), isDirectory: true });
      }
    } else {
      files.push(
        { path: "~/.openclaw/openclaw.json", size: 0, lastModified: new Date(), isDirectory: false },
        { path: "~/.openclaw/state/", size: 0, lastModified: new Date(), isDirectory: true },
        { path: "~/openclaw/", size: 0, lastModified: new Date(), isDirectory: true },
      );
    }

    return files;
  }

  async testConnectivity(instanceId: string): Promise<ConnectivityResult> {
    await this.loadInstanceOrThrow(instanceId);

    const connection = await prisma.gatewayConnection.findUnique({
      where: { instanceId },
    });

    const result: ConnectivityResult = {
      gatewayPort: { reachable: false, latencyMs: -1 },
      dns: { resolved: false },
      internet: { reachable: true },
    };

    if (!connection) return result;

    let client: GatewayClient | null = null;
    try {
      client = this.createClient(connection);
      const startMs = Date.now();
      await client.connect();
      const latencyMs = Date.now() - startMs;
      result.gatewayPort = { reachable: true, latencyMs };
      result.dns = { resolved: true, ip: connection.host };
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (message.toLowerCase().includes("enotfound") || message.toLowerCase().includes("dns")) {
        result.dns = { resolved: false };
      } else {
        result.dns = { resolved: true, ip: connection.host };
      }
      result.gatewayPort = { reachable: false, latencyMs: -1 };
    } finally {
      if (client) {
        try { await client.disconnect(); } catch { /* ignore */ }
      }
    }

    return result;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private async loadInstanceOrThrow(instanceId: string) {
    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
    });
    if (!instance) {
      throw new NotFoundException(`Bot instance ${instanceId} not found`);
    }
    return instance;
  }

  private createClient(connection: {
    host: string;
    port: number;
    authMode: string;
    authToken: string | null;
  }): GatewayClient {
    const auth: GatewayAuth = connection.authMode === "token"
      ? { mode: "token", token: connection.authToken ?? "" }
      : { mode: "password", password: connection.authToken ?? "" };

    const options: GatewayConnectionOptions = {
      host: connection.host,
      port: connection.port,
      auth,
      timeoutMs: DEBUG_TIMEOUT_MS,
      reconnect: { enabled: false, maxAttempts: 0, baseDelayMs: 0, maxDelayMs: 0 },
    };

    return new GatewayClient(options);
  }

  private redactSecrets(obj: Record<string, unknown>): Record<string, unknown> {
    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SECRET_KEYS.has(key) && typeof value === "string") {
        clone[key] = "***REDACTED***";
      } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        clone[key] = this.redactSecrets(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        clone[key] = value.map((item) =>
          item !== null && typeof item === "object" && !Array.isArray(item)
            ? this.redactSecrets(item as Record<string, unknown>)
            : item,
        );
      } else {
        clone[key] = value;
      }
    }
    return clone;
  }

  private inferAiKeyPresence(config: Record<string, unknown>, envVarName: string): boolean {
    const agents = config.agents as Record<string, unknown> | undefined;
    const defaults = (agents?.defaults as Record<string, unknown>) ?? {};
    const model = (defaults.model as Record<string, unknown>) ?? {};
    const primary = (model.primary as string) ?? "";

    switch (envVarName) {
      case "ANTHROPIC_API_KEY":
        return primary.toLowerCase().includes("anthropic") || primary.toLowerCase().includes("claude");
      case "OPENAI_API_KEY":
        return primary.toLowerCase().includes("openai") || primary.toLowerCase().includes("gpt");
      case "GOOGLE_API_KEY":
        return primary.toLowerCase().includes("google") || primary.toLowerCase().includes("gemini");
      default:
        return false;
    }
  }
}
