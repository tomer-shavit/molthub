import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@clawster/database";
import { GatewayManager } from "@clawster/gateway-client";
import type {
  GatewayConnectionOptions,
  GatewayClient,
} from "@clawster/gateway-client";
import type { AgentCard, AgentSkill } from "./a2a.types";

const IDENTITY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedIdentity {
  name: string;
  description: string;
  fetchedAt: number;
}

const IDENTITY_PROBE_PROMPT = `You are being asked to identify yourself for a machine-readable agent card. Respond with ONLY a JSON object, no markdown, no explanation. The JSON must have exactly these fields:
{"name": "<your name>", "role": "<your role or what you do in one short phrase>"}
Example: {"name": "Joe", "role": "AI Marketing Expert"}`;

@Injectable()
export class A2aAgentCardService {
  private readonly logger = new Logger(A2aAgentCardService.name);
  private readonly gatewayManager = new GatewayManager();
  private readonly identityCache = new Map<string, CachedIdentity>();

  constructor(private readonly configService: ConfigService) {}

  async generate(botInstanceId: string): Promise<AgentCard> {
    const bot = await prisma.botInstance.findUnique({
      where: { id: botInstanceId },
      include: {
        skillPacks: {
          include: {
            skillPack: true,
          },
        },
      },
    });

    if (!bot) {
      throw new NotFoundException(`Bot instance ${botInstanceId} not found`);
    }

    const baseUrl =
      this.configService.get<string>("CLAWSTER_BASE_URL") ||
      "http://localhost:4000";

    // Connect to gateway (best effort)
    const client = await this.getGatewayClient(botInstanceId);

    // Fetch live config and probe identity in parallel
    const [liveConfig, identity] = await Promise.all([
      this.fetchLiveConfig(client),
      this.resolveIdentity(botInstanceId, bot, client),
    ]);

    // Build skills: live config > desiredManifest > SkillPacks
    const skills = this.resolveSkills(bot, liveConfig);
    const { name, description } = identity;

    return {
      name,
      description,
      url: `${baseUrl}/a2a/${botInstanceId}`,
      version: "1.0.0",
      skills,
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      authentication: {
        schemes: ["bearer"],
      },
      defaultInputModes: ["text"],
      defaultOutputModes: ["text"],
      provider: {
        organization: "Clawster",
      },
    };
  }

  /**
   * Get a connected gateway client, or null if unavailable.
   */
  private async getGatewayClient(
    botInstanceId: string,
  ): Promise<GatewayClient | null> {
    try {
      const gwConn = await prisma.gatewayConnection.findUnique({
        where: { instanceId: botInstanceId },
      });

      if (!gwConn || gwConn.status !== "CONNECTED") {
        return null;
      }

      const options: GatewayConnectionOptions = {
        host: gwConn.host,
        port: gwConn.port,
        auth: {
          mode: "token",
          token: gwConn.authToken || "clawster",
        },
        timeoutMs: 5_000,
      };

      return await this.gatewayManager.getClient(botInstanceId, options);
    } catch (err) {
      this.logger.debug(
        `Could not connect to gateway for ${botInstanceId}: ${(err as Error).message ?? err}`,
      );
      return null;
    }
  }

  /**
   * Fetch live config via configGet() RPC.
   */
  private async fetchLiveConfig(
    client: GatewayClient | null,
  ): Promise<Record<string, unknown> | null> {
    if (!client) return null;
    try {
      const result = await client.configGet();
      return result.config as Record<string, unknown>;
    } catch {
      this.logger.debug("Could not fetch live config, falling back");
      return null;
    }
  }

  /**
   * Resolve agent identity. Priority:
   * 1. In-memory cache (if fresh)
   * 2. Agent probe via agent() RPC — asks the bot who it is (cached for 1h)
   * 3. agent.identity.get RPC (often returns defaults, but try)
   * 4. Live config agents.list[].identity
   * 5. desiredManifest config
   * 6. Bot name from DB
   */
  private async resolveIdentity(
    botInstanceId: string,
    bot: { name: string; desiredManifest: unknown },
    client: GatewayClient | null,
  ): Promise<{ name: string; description: string }> {
    // 1. Check cache
    const cached = this.identityCache.get(botInstanceId);
    if (cached && Date.now() - cached.fetchedAt < IDENTITY_CACHE_TTL_MS) {
      return { name: cached.name, description: cached.description };
    }

    // 2. Agent probe — ask the bot who it is
    if (client) {
      const probed = await this.probeAgentIdentity(client);
      if (probed) {
        const entry: CachedIdentity = {
          name: probed.name,
          description: probed.description,
          fetchedAt: Date.now(),
        };
        this.identityCache.set(botInstanceId, entry);
        return { name: probed.name, description: probed.description };
      }

      // 3. agent.identity.get fallback
      try {
        const idResult = await client.agentIdentityGet();
        if (idResult.name && idResult.name !== "Assistant") {
          const desc = `${idResult.name} — OpenClaw agent`;
          this.identityCache.set(botInstanceId, {
            name: idResult.name,
            description: desc,
            fetchedAt: Date.now(),
          });
          return { name: idResult.name, description: desc };
        }
      } catch {
        // Fall through
      }
    }

    // 4. Live config identity — skipped here since we don't have liveConfig in this method
    // (config-based identity is a weak signal anyway)

    // 5. desiredManifest
    const manifestIdentity = this.extractIdentityFromManifest(bot);
    if (manifestIdentity) return manifestIdentity;

    // 6. Default
    return {
      name: bot.name,
      description: `${bot.name} — OpenClaw agent managed by Clawster`,
    };
  }

  /**
   * Ask the bot to identify itself via the agent() RPC.
   * Parses a JSON response with { name, role }.
   */
  private async probeAgentIdentity(
    client: GatewayClient,
  ): Promise<{ name: string; description: string } | null> {
    try {
      const result = await client.agent({
        message: IDENTITY_PROBE_PROMPT,
        idempotencyKey: `identity-probe-${Date.now()}`,
        agentId: "main",
        deliver: false,
        timeout: 30_000,
        _localTimeoutMs: 35_000,
      });

      const output = result.completion?.output;
      if (!output) return null;

      // Extract JSON from the response (may have markdown fences)
      const jsonMatch = output.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        name?: string;
        role?: string;
      };
      if (!parsed.name) return null;

      const description = parsed.role
        ? `${parsed.name} — ${parsed.role}`
        : `${parsed.name} — OpenClaw agent`;

      this.logger.log(
        `Agent probe resolved identity: ${parsed.name} (${parsed.role || "no role"})`,
      );

      return { name: parsed.name, description };
    } catch (err) {
      this.logger.debug(
        `Agent identity probe failed: ${(err as Error).message ?? err}`,
      );
      return null;
    }
  }

  private extractIdentityFromConfig(
    config: Record<string, unknown> | null,
  ): { name: string; description: string } | null {
    if (!config) return null;

    try {
      const agents = config.agents as Record<string, unknown> | undefined;
      if (!agents) return null;

      // Check agents.list first (per-agent identity)
      const agentList = agents.list as
        | Array<Record<string, unknown>>
        | undefined;
      if (agentList?.[0]) {
        const agent = agentList[0];
        const identity = agent.identity as
          | Record<string, unknown>
          | undefined;
        if (identity) {
          const name = identity.name ? String(identity.name) : null;
          const theme = identity.theme ? String(identity.theme) : null;
          if (name || theme) {
            return {
              name: name || "OpenClaw Agent",
              description:
                theme || `${name || "OpenClaw Agent"} — managed by Clawster`,
            };
          }
        }
      }

      // Check agents.defaults
      const defaults = agents.defaults as
        | Record<string, unknown>
        | undefined;
      if (defaults?.identity) {
        const identity = defaults.identity as Record<string, unknown>;
        const name = identity.name ? String(identity.name) : null;
        const theme = identity.theme ? String(identity.theme) : null;
        if (name || theme) {
          return {
            name: name || "OpenClaw Agent",
            description:
              theme || `${name || "OpenClaw Agent"} — managed by Clawster`,
          };
        }
      }
    } catch {
      // Fall through
    }

    return null;
  }

  private extractIdentityFromManifest(bot: {
    name: string;
    desiredManifest: unknown;
  }): { name: string; description: string } | null {
    try {
      const manifest =
        typeof bot.desiredManifest === "string"
          ? JSON.parse(bot.desiredManifest)
          : bot.desiredManifest;
      const spec = (manifest as Record<string, unknown>)?.spec || manifest;
      const config =
        (spec as Record<string, unknown>)?.openclawConfig || spec;

      const result = this.extractIdentityFromConfig(
        config as Record<string, unknown>,
      );
      if (result) return result;
    } catch {
      // Fall through
    }

    return null;
  }

  /**
   * Resolve skills from live config (primary), desiredManifest, and SkillPacks (supplemental).
   * Live gateway skills take priority since they represent what's actually running.
   */
  private resolveSkills(
    bot: {
      id: string;
      desiredManifest: unknown;
      skillPacks: Array<{
        skillPack: {
          id: string;
          name: string;
          description: string;
          skills: unknown;
        };
      }>;
    },
    liveConfig: Record<string, unknown> | null,
  ): AgentSkill[] {
    const skillMap = new Map<string, AgentSkill>();

    // 1. Live config skills (highest priority — what's actually running)
    if (liveConfig) {
      this.extractSkillsFromConfig(liveConfig, "live", skillMap);
    }

    // 2. desiredManifest skills (what Clawster deployed)
    try {
      const manifest =
        typeof bot.desiredManifest === "string"
          ? JSON.parse(bot.desiredManifest)
          : bot.desiredManifest;
      const spec = (manifest as Record<string, unknown>)?.spec || manifest;
      const config =
        (spec as Record<string, unknown>)?.openclawConfig || spec;
      this.extractSkillsFromConfig(
        config as Record<string, unknown>,
        "config",
        skillMap,
      );
    } catch {
      // Config parsing failed
    }

    // 3. SkillPacks from DB (supplemental, Clawster-managed)
    for (const binding of bot.skillPacks) {
      const pack = binding.skillPack;
      if (!skillMap.has(pack.name)) {
        skillMap.set(pack.name, {
          id: pack.id,
          name: pack.name,
          description: pack.description,
          tags: ["skillpack"],
        });
      }
    }

    return Array.from(skillMap.values());
  }

  private extractSkillsFromConfig(
    config: Record<string, unknown>,
    source: string,
    skillMap: Map<string, AgentSkill>,
  ): void {
    const skillsConfig = config?.skills as
      | Record<string, unknown>
      | undefined;
    if (!skillsConfig) return;

    // skills.entries — individually configured skills
    if (skillsConfig.entries) {
      const entries = skillsConfig.entries as Record<string, unknown>;
      for (const [name, entry] of Object.entries(entries)) {
        const entryObj = entry as Record<string, unknown>;
        if (entryObj.enabled !== false && !skillMap.has(name)) {
          skillMap.set(name, {
            id: name,
            name,
            description: (entryObj.description as string) || undefined,
            tags: [source],
          });
        }
      }
    }

    // skills.allowBundled — bundled skills whitelist
    if (skillsConfig.allowBundled) {
      const bundled = skillsConfig.allowBundled as string[];
      for (const name of bundled) {
        if (!skillMap.has(name)) {
          skillMap.set(name, {
            id: name,
            name,
            tags: ["bundled", source],
          });
        }
      }
    }
  }
}
