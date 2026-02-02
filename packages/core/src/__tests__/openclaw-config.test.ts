import { describe, it, expect } from "vitest";
import {
  OpenClawConfigSchema,
  validateOpenClawConfig,
  SandboxConfigSchema,
  GatewayConfigSchema,
  ToolsConfigSchema,
  SessionConfigSchema,
  AgentsConfigSchema,
  LoggingConfigSchema,
  BindingEntrySchema,
} from "../openclaw-config";
import {
  OpenClawChannelSchema,
  ChannelsConfigSchema,
  WhatsAppChannelSchema,
  TelegramChannelSchema,
  DiscordChannelSchema,
  SlackChannelSchema,
  SignalChannelSchema,
  IMessageChannelSchema,
  MattermostChannelSchema,
  GoogleChatChannelSchema,
  MSTeamsChannelSchema,
  LINEChannelSchema,
  MatrixChannelSchema,
} from "../openclaw-channels";
import {
  OpenClawManifestSchema,
  validateOpenClawManifest,
} from "../openclaw-manifest";
import {
  OpenClawProfileRegistrySchema,
  OpenClawProfileSchema,
  MIN_PORT_SPACING,
  serviceName,
  profileEnvVars,
} from "../openclaw-profile";

// =============================================================================
// Realistic full config fixture
// =============================================================================

const realisticConfig = {
  agents: {
    defaults: {
      workspace: "~/openclaw",
      model: {
        primary: "anthropic/claude-sonnet-4-20250514",
        fallbacks: ["openai/gpt-4o"],
      },
      thinkingDefault: "low",
      timeoutSeconds: 600,
      maxConcurrent: 3,
      sandbox: {
        mode: "non-main",
        scope: "session",
        workspaceAccess: "rw",
        docker: {
          image: "openclaw/sandbox:latest",
          network: "bridge",
          memory: "512m",
          cpus: 1,
        },
      },
    },
    list: [
      {
        id: "main",
        default: true,
        identity: { name: "Molt", emoji: "🦀", theme: "ocean" },
      },
      {
        id: "coder",
        workspace: "~/projects",
        agentDir: "~/.openclaw/agents/coder",
        model: { primary: "anthropic/claude-sonnet-4-20250514" },
        tools: {
          allow: ["group:fs", "group:runtime"],
          deny: ["group:messaging"],
        },
      },
    ],
  },
  session: {
    scope: "per-sender",
    reset: { mode: "daily" },
    resetTriggers: ["/new", "/reset"],
  },
  messages: {
    responsePrefix: "[{provider}/{model}] {identity.name}:",
    ackReaction: "👀",
    queue: { mode: "steer" },
    tts: { enabled: false },
  },
  channels: {
    whatsapp: {
      enabled: true,
      sendReadReceipts: true,
      chunkMode: "newline",
      dmPolicy: "pairing",
      groupPolicy: "allowlist",
      groupAllowFrom: ["+15551234567"],
      historyLimit: 100,
    },
    telegram: {
      enabled: true,
      botToken: "${TELEGRAM_TOKEN}",
      linkPreview: false,
      streamMode: "partial",
      customCommands: [
        { command: "/help", description: "Show help" },
      ],
    },
    discord: {
      enabled: true,
      token: "${DISCORD_TOKEN}",
      allowBots: false,
      guilds: { "123456": { slug: "my-server" } },
      replyToMode: "all",
    },
    slack: {
      enabled: true,
      botToken: "${SLACK_BOT_TOKEN}",
      appToken: "${SLACK_APP_TOKEN}",
      slashCommand: { enabled: true, command: "/molt" },
      thread: { historyScope: "thread" },
    },
  },
  tools: {
    profile: "coding",
    allow: ["group:fs", "group:runtime", "group:web"],
    deny: ["group:automation"],
    elevated: {
      enabled: true,
      allowFrom: ["admin-user-id"],
    },
    exec: {
      backgroundMs: 15000,
      timeoutSec: 3600,
    },
  },
  skills: {
    allowBundled: ["web-search", "image-gen"],
    load: { extraDirs: ["~/.openclaw/skills"] },
    entries: {
      "web-search": { enabled: true, apiKey: "${SEARCH_API_KEY}" },
      "custom-skill": {
        enabled: true,
        config: { maxResults: 10 },
        env: { API_URL: "https://api.example.com" },
      },
    },
  },
  plugins: {
    enabled: true,
    allow: ["analytics", "audit-log"],
    deny: ["experimental-plugin"],
    entries: {
      analytics: { config: { endpoint: "https://analytics.example.com" } },
    },
  },
  gateway: {
    port: 18789,
    auth: { token: "${GATEWAY_TOKEN}" },
    host: "0.0.0.0",
  },
  logging: {
    level: "debug",
    file: "/var/log/openclaw.log",
    redactSensitive: "tools",
  },
  bindings: [
    {
      agentId: "coder",
      match: { channel: "slack", peer: { kind: "dm", id: "U12345" } },
    },
    {
      agentId: "main",
      match: { channel: "telegram" },
    },
  ],
};

// =============================================================================
// Tests
// =============================================================================

describe("OpenClawConfigSchema", () => {
  it("parses a realistic full config", () => {
    const result = OpenClawConfigSchema.safeParse(realisticConfig);
    expect(result.success).toBe(true);
  });

  it("accepts a minimal empty config", () => {
    const result = OpenClawConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("validates via helper function", () => {
    const parsed = validateOpenClawConfig(realisticConfig);
    expect(parsed.agents?.defaults?.workspace).toBe("~/openclaw");
    expect(parsed.gateway?.port).toBe(18789);
  });

  it("rejects invalid thinkingDefault", () => {
    const bad = {
      agents: { defaults: { thinkingDefault: "ultra" } },
    };
    const result = OpenClawConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects invalid sandbox mode", () => {
    const bad = {
      agents: { defaults: { sandbox: { mode: "custom" } } },
    };
    const result = OpenClawConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects invalid queue mode", () => {
    const bad = {
      messages: { queue: { mode: "fifo" } },
    };
    const result = OpenClawConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects invalid tool profile", () => {
    const bad = { tools: { profile: "enterprise" } };
    const result = OpenClawConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("applies defaults correctly", () => {
    const result = OpenClawConfigSchema.parse({
      gateway: {},
      logging: {},
      session: {},
    });
    expect(result.gateway?.port).toBe(18789);
    expect(result.gateway?.host).toBe("127.0.0.1");
    expect(result.logging?.level).toBe("info");
    expect(result.session?.scope).toBe("per-sender");
  });
});

describe("Channel schemas", () => {
  it("validates all 11 channel types via discriminated union", () => {
    const channels: Array<{ type: string; [key: string]: unknown }> = [
      { type: "whatsapp" },
      { type: "telegram" },
      { type: "discord" },
      { type: "slack" },
      { type: "signal" },
      { type: "imessage" },
      { type: "mattermost" },
      { type: "google-chat" },
      { type: "ms-teams" },
      { type: "line" },
      { type: "matrix" },
    ];
    for (const ch of channels) {
      const result = OpenClawChannelSchema.safeParse(ch);
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown channel type", () => {
    const result = OpenClawChannelSchema.safeParse({ type: "fax" });
    expect(result.success).toBe(false);
  });

  it("validates WhatsApp chunkMode enum", () => {
    expect(
      WhatsAppChannelSchema.safeParse({
        type: "whatsapp",
        chunkMode: "newline",
      }).success,
    ).toBe(true);
    expect(
      WhatsAppChannelSchema.safeParse({
        type: "whatsapp",
        chunkMode: "word",
      }).success,
    ).toBe(false);
  });

  it("validates Telegram streamMode enum", () => {
    expect(
      TelegramChannelSchema.safeParse({
        type: "telegram",
        streamMode: "block",
      }).success,
    ).toBe(true);
    expect(
      TelegramChannelSchema.safeParse({
        type: "telegram",
        streamMode: "full",
      }).success,
    ).toBe(false);
  });

  it("validates Discord replyToMode enum", () => {
    expect(
      DiscordChannelSchema.safeParse({
        type: "discord",
        replyToMode: "all",
      }).success,
    ).toBe(true);
  });

  it("validates Slack thread historyScope", () => {
    expect(
      SlackChannelSchema.safeParse({
        type: "slack",
        thread: { historyScope: "channel" },
      }).success,
    ).toBe(true);
  });

  it("validates dmPolicy and groupPolicy enums", () => {
    const result = WhatsAppChannelSchema.safeParse({
      type: "whatsapp",
      dmPolicy: "open",
      groupPolicy: "allowlist",
    });
    expect(result.success).toBe(true);

    const bad = WhatsAppChannelSchema.safeParse({
      type: "whatsapp",
      dmPolicy: "public",
    });
    expect(bad.success).toBe(false);
  });

  it("parses ChannelsConfigSchema keyed format", () => {
    const result = ChannelsConfigSchema.safeParse({
      whatsapp: { enabled: true, sendReadReceipts: false },
      discord: { enabled: false, allowBots: true },
    });
    expect(result.success).toBe(true);
  });
});

describe("OpenClawManifestSchema (v2)", () => {
  const validManifest = {
    apiVersion: "clawster/v2",
    kind: "OpenClawInstance",
    metadata: {
      name: "my-bot",
      workspace: "default",
      environment: "prod",
      labels: { team: "platform" },
      deploymentTarget: "docker",
      profileName: "main",
    },
    spec: {
      openclawConfig: realisticConfig,
      clawsterSettings: {
        fleetId: "fleet-123",
        autoRestart: true,
        healthCheckIntervalSec: 60,
        tags: { version: "1.0" },
      },
    },
  };

  it("parses a valid v2 manifest", () => {
    const result = OpenClawManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  it("rejects v1 apiVersion in v2 schema", () => {
    const result = OpenClawManifestSchema.safeParse({
      ...validManifest,
      apiVersion: "clawster/v1",
    });
    expect(result.success).toBe(false);
  });

  it("validates metadata name format", () => {
    const result = OpenClawManifestSchema.safeParse({
      ...validManifest,
      metadata: { ...validManifest.metadata, name: "INVALID_NAME" },
    });
    expect(result.success).toBe(false);
  });

  it("validates via helper function", () => {
    const parsed = validateOpenClawManifest(validManifest);
    expect(parsed.metadata.name).toBe("my-bot");
    expect(parsed.spec.openclawConfig.gateway?.port).toBe(18789);
  });
});

describe("OpenClawProfileRegistry", () => {
  it("accepts profiles with sufficient port spacing", () => {
    const result = OpenClawProfileRegistrySchema.safeParse({
      profiles: [
        {
          name: "main",
          port: 18789,
          configPath: "/etc/openclaw/main.json",
          stateDir: "/var/openclaw/main",
          workspace: "~/openclaw-main",
        },
        {
          name: "secondary",
          port: 18809,
          configPath: "/etc/openclaw/secondary.json",
          stateDir: "/var/openclaw/secondary",
          workspace: "~/openclaw-secondary",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects profiles with port spacing < 20", () => {
    const result = OpenClawProfileRegistrySchema.safeParse({
      profiles: [
        {
          name: "a",
          port: 18789,
          configPath: "/a.json",
          stateDir: "/a",
          workspace: "/a",
        },
        {
          name: "b",
          port: 18790,
          configPath: "/b.json",
          stateDir: "/b",
          workspace: "/b",
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        String(MIN_PORT_SPACING),
      );
    }
  });

  it("rejects duplicate profile names", () => {
    const result = OpenClawProfileRegistrySchema.safeParse({
      profiles: [
        {
          name: "main",
          port: 18789,
          configPath: "/a.json",
          stateDir: "/a",
          workspace: "/a",
        },
        {
          name: "main",
          port: 18809,
          configPath: "/b.json",
          stateDir: "/b",
          workspace: "/b",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("ignores port spacing for disabled profiles", () => {
    const result = OpenClawProfileRegistrySchema.safeParse({
      profiles: [
        {
          name: "a",
          port: 18789,
          configPath: "/a.json",
          stateDir: "/a",
          workspace: "/a",
          enabled: true,
        },
        {
          name: "b",
          port: 18790,
          configPath: "/b.json",
          stateDir: "/b",
          workspace: "/b",
          enabled: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("Profile utility functions", () => {
  it("generates correct macOS service name", () => {
    expect(serviceName("main", "macos")).toBe("bot.molt.main");
  });

  it("generates correct Linux service name", () => {
    expect(serviceName("main", "linux")).toBe(
      "openclaw-gateway-main.service",
    );
  });

  it("builds correct environment variables", () => {
    const env = profileEnvVars({
      name: "test",
      port: 18789,
      configPath: "/etc/openclaw/test.json",
      stateDir: "/var/openclaw/test",
      workspace: "~/openclaw-test",
      enabled: true,
    });
    expect(env.OPENCLAW_CONFIG_PATH).toBe("/etc/openclaw/test.json");
    expect(env.OPENCLAW_STATE_DIR).toBe("/var/openclaw/test");
  });
});

describe("Discovery config", () => {
  it("accepts discovery with mdns mode", () => {
    const result = OpenClawConfigSchema.safeParse({
      discovery: { mdns: { mode: "full" } },
    });
    expect(result.success).toBe(true);
  });

  it("applies default mdns mode of 'minimal'", () => {
    const result = OpenClawConfigSchema.parse({
      discovery: { mdns: {} },
    });
    expect(result.discovery?.mdns?.mode).toBe("minimal");
  });

  it("accepts discovery with mdns off", () => {
    const result = OpenClawConfigSchema.safeParse({
      discovery: { mdns: { mode: "off" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid mdns mode", () => {
    const result = OpenClawConfigSchema.safeParse({
      discovery: { mdns: { mode: "aggressive" } },
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty discovery object", () => {
    const result = OpenClawConfigSchema.safeParse({
      discovery: {},
    });
    expect(result.success).toBe(true);
  });
});

describe("Env config", () => {
  it("accepts inline env key-value pairs", () => {
    const result = OpenClawConfigSchema.safeParse({
      env: {
        API_KEY: "sk-abc123",
        DEBUG: "true",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty env object", () => {
    const result = OpenClawConfigSchema.safeParse({
      env: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-string env values", () => {
    const result = OpenClawConfigSchema.safeParse({
      env: { COUNT: 42 },
    });
    expect(result.success).toBe(false);
  });
});

describe("Sandbox config", () => {
  it("applies sandbox defaults", () => {
    const result = SandboxConfigSchema.parse({});
    expect(result.mode).toBe("off");
    expect(result.scope).toBe("session");
    expect(result.workspaceAccess).toBe("rw");
  });

  it("validates Docker sandbox options", () => {
    const result = SandboxConfigSchema.safeParse({
      mode: "all",
      docker: { image: "sandbox:v1", cpus: 2, memory: "1g", network: "none" },
    });
    expect(result.success).toBe(true);
  });
});

describe("Bindings", () => {
  it("validates a binding with channel and peer match", () => {
    const result = BindingEntrySchema.safeParse({
      agentId: "coder",
      match: {
        channel: "slack",
        peer: { kind: "dm", id: "U123" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects binding with invalid peer kind", () => {
    const result = BindingEntrySchema.safeParse({
      agentId: "coder",
      match: {
        peer: { kind: "broadcast", id: "X" },
      },
    });
    expect(result.success).toBe(false);
  });
});
