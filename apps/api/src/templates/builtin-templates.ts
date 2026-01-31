import type { OpenClawFullConfig } from "@molthub/core";

// =============================================================================
// Template Types
// =============================================================================

export type TemplateCategory =
  | "communication"
  | "development"
  | "operations"
  | "minimal";

export interface RequiredInput {
  /** Machine-readable key, e.g. "telegramBotToken". */
  key: string;
  /** Human-readable label shown in UI. */
  label: string;
  /** The env var name that will hold this value at runtime. */
  envVar: string;
  /** Where in the config the value is placed (dot-path). */
  configPath: string;
  /** If true the input is a secret and must never appear in plaintext config. */
  secret: boolean;
  /** Optional hint / placeholder text. */
  placeholder?: string;
}

export interface ChannelPreset {
  type: string;
  enabled: boolean;
  /** Non-secret default overrides for this channel block. */
  defaults: Record<string, unknown>;
}

export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Partial OpenClawFullConfig with sensible defaults. */
  defaultConfig: Partial<OpenClawFullConfig>;
  /** Inputs the user *must* provide before generation. */
  requiredInputs: RequiredInput[];
  /** Pre-configured channel list. */
  channels: ChannelPreset[];
  /** Policy pack IDs recommended for this template. */
  recommendedPolicies: string[];
}

// =============================================================================
// 7 Built-in Templates
// =============================================================================

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  // -------------------------------------------------------------------------
  // 1. WhatsApp Personal Bot
  // -------------------------------------------------------------------------
  {
    id: "builtin-whatsapp-personal",
    name: "WhatsApp Personal Bot",
    description:
      "A personal WhatsApp bot using QR-based pairing with basic skills and a minimal tool profile. Ideal for quick personal assistant use cases.",
    category: "communication",
    defaultConfig: {
      channels: {
        whatsapp: {
          enabled: true,
          dmPolicy: "pairing",
          groupPolicy: "disabled",
          historyLimit: 50,
          mediaMaxMb: 25,
          sendReadReceipts: true,
          chunkMode: "length",
        },
      },
      tools: {
        profile: "minimal",
      },
      sandbox: {
        mode: "non-main",
        scope: "session",
        workspaceAccess: "ro",
      },
      skills: {
        allowBundled: ["weather", "search"],
        allowUnverified: false,
      },
      session: {
        scope: "per-sender",
        resetTriggers: ["/new", "/reset"],
      },
      gateway: {
        port: 18789,
        host: "127.0.0.1",
        auth: { token: "${GATEWAY_AUTH_TOKEN}" },
      },
      logging: {
        level: "info",
        redactSensitive: "tools",
      },
    },
    requiredInputs: [
      {
        key: "gatewayAuthToken",
        label: "Gateway Auth Token",
        envVar: "GATEWAY_AUTH_TOKEN",
        configPath: "gateway.auth.token",
        secret: true,
        placeholder: "auto-generated-if-empty",
      },
    ],
    channels: [
      {
        type: "whatsapp",
        enabled: true,
        defaults: {
          dmPolicy: "pairing",
          groupPolicy: "disabled",
          sendReadReceipts: true,
          chunkMode: "length",
        },
      },
    ],
    recommendedPolicies: [
      "require-secret-manager",
      "forbid-public-admin",
      "dm-pairing-only",
    ],
  },

  // -------------------------------------------------------------------------
  // 2. Telegram Bot
  // -------------------------------------------------------------------------
  {
    id: "builtin-telegram-bot",
    name: "Telegram Bot",
    description:
      "A Telegram bot with coding tool profile and Docker-based sandbox. Great for developer assistants accessible via Telegram.",
    category: "communication",
    defaultConfig: {
      channels: {
        telegram: {
          enabled: true,
          dmPolicy: "allowlist",
          groupPolicy: "allowlist",
          historyLimit: 100,
          mediaMaxMb: 50,
          botToken: "${TELEGRAM_BOT_TOKEN}",
          linkPreview: true,
          streamMode: "off",
        },
      },
      tools: {
        profile: "coding",
      },
      sandbox: {
        mode: "all",
        scope: "session",
        workspaceAccess: "rw",
        docker: {
          image: "node:20-slim",
          memory: "512m",
          cpus: 1,
          readOnlyRootfs: true,
          noNewPrivileges: true,
          dropCapabilities: ["ALL"],
          user: "1000:1000",
        },
      },
      skills: {
        allowBundled: ["github", "search", "code-review"],
        allowUnverified: false,
      },
      session: {
        scope: "per-sender",
        resetTriggers: ["/new", "/reset"],
      },
      gateway: {
        port: 18789,
        host: "127.0.0.1",
        auth: { token: "${GATEWAY_AUTH_TOKEN}" },
      },
      logging: {
        level: "info",
        redactSensitive: "tools",
      },
    },
    requiredInputs: [
      {
        key: "telegramBotToken",
        label: "Telegram Bot Token",
        envVar: "TELEGRAM_BOT_TOKEN",
        configPath: "channels.telegram.botToken",
        secret: true,
        placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      },
      {
        key: "gatewayAuthToken",
        label: "Gateway Auth Token",
        envVar: "GATEWAY_AUTH_TOKEN",
        configPath: "gateway.auth.token",
        secret: true,
        placeholder: "auto-generated-if-empty",
      },
    ],
    channels: [
      {
        type: "telegram",
        enabled: true,
        defaults: {
          dmPolicy: "allowlist",
          groupPolicy: "allowlist",
          linkPreview: true,
          streamMode: "off",
        },
      },
    ],
    recommendedPolicies: [
      "require-secret-manager",
      "forbid-public-admin",
      "sandbox-required",
    ],
  },

  // -------------------------------------------------------------------------
  // 3. Discord Server Bot
  // -------------------------------------------------------------------------
  {
    id: "builtin-discord-server",
    name: "Discord Server Bot",
    description:
      "A Discord bot with per-guild configuration and messaging tool profile. Designed for community server deployments.",
    category: "communication",
    defaultConfig: {
      channels: {
        discord: {
          enabled: true,
          dmPolicy: "allowlist",
          groupPolicy: "allowlist",
          historyLimit: 100,
          mediaMaxMb: 25,
          token: "${DISCORD_TOKEN}",
          allowBots: false,
          replyToMode: "first",
        },
      },
      tools: {
        profile: "messaging",
      },
      sandbox: {
        mode: "non-main",
        scope: "session",
        workspaceAccess: "ro",
      },
      skills: {
        allowBundled: ["weather", "search", "poll", "reminder"],
        allowUnverified: false,
      },
      session: {
        scope: "per-channel-peer",
        resetTriggers: ["/new", "/reset"],
      },
      messages: {
        ackReaction: "eyes",
        queue: {
          mode: "steer",
        },
      },
      gateway: {
        port: 18789,
        host: "127.0.0.1",
        auth: { token: "${GATEWAY_AUTH_TOKEN}" },
      },
      logging: {
        level: "info",
        redactSensitive: "tools",
      },
    },
    requiredInputs: [
      {
        key: "discordToken",
        label: "Discord Bot Token",
        envVar: "DISCORD_TOKEN",
        configPath: "channels.discord.token",
        secret: true,
        placeholder: "your-discord-bot-token",
      },
      {
        key: "gatewayAuthToken",
        label: "Gateway Auth Token",
        envVar: "GATEWAY_AUTH_TOKEN",
        configPath: "gateway.auth.token",
        secret: true,
        placeholder: "auto-generated-if-empty",
      },
    ],
    channels: [
      {
        type: "discord",
        enabled: true,
        defaults: {
          dmPolicy: "allowlist",
          groupPolicy: "allowlist",
          allowBots: false,
          replyToMode: "first",
        },
      },
    ],
    recommendedPolicies: [
      "require-secret-manager",
      "forbid-public-admin",
      "group-allowlist",
    ],
  },

  // -------------------------------------------------------------------------
  // 4. Slack Workspace Bot
  // -------------------------------------------------------------------------
  {
    id: "builtin-slack-workspace",
    name: "Slack Workspace Bot",
    description:
      "A Slack bot using Socket Mode with full tool profile. Built for workspace-wide productivity and automation.",
    category: "communication",
    defaultConfig: {
      channels: {
        slack: {
          enabled: true,
          dmPolicy: "allowlist",
          groupPolicy: "allowlist",
          historyLimit: 100,
          mediaMaxMb: 25,
          botToken: "${SLACK_BOT_TOKEN}",
          appToken: "${SLACK_APP_TOKEN}",
          slashCommand: {
            enabled: true,
            command: "/openclaw",
          },
          thread: {
            historyScope: "thread",
          },
        },
      },
      tools: {
        profile: "coding",
        elevated: {
          enabled: false,
          allowFrom: [],
        },
      },
      sandbox: {
        mode: "non-main",
        scope: "session",
        workspaceAccess: "rw",
      },
      skills: {
        allowBundled: [
          "github",
          "jira",
          "search",
          "code-review",
          "deployment",
        ],
        allowUnverified: false,
      },
      session: {
        scope: "per-sender",
        resetTriggers: ["/new", "/reset"],
      },
      messages: {
        ackReaction: "eyes",
        queue: {
          mode: "steer",
        },
      },
      gateway: {
        port: 18789,
        host: "127.0.0.1",
        auth: { token: "${GATEWAY_AUTH_TOKEN}" },
      },
      logging: {
        level: "info",
        redactSensitive: "tools",
      },
    },
    requiredInputs: [
      {
        key: "slackBotToken",
        label: "Slack Bot Token (xoxb-...)",
        envVar: "SLACK_BOT_TOKEN",
        configPath: "channels.slack.botToken",
        secret: true,
        placeholder: "your-slack-bot-token",
      },
      {
        key: "slackAppToken",
        label: "Slack App-Level Token (xapp-...)",
        envVar: "SLACK_APP_TOKEN",
        configPath: "channels.slack.appToken",
        secret: true,
        placeholder: "your-slack-app-token",
      },
      {
        key: "gatewayAuthToken",
        label: "Gateway Auth Token",
        envVar: "GATEWAY_AUTH_TOKEN",
        configPath: "gateway.auth.token",
        secret: true,
        placeholder: "auto-generated-if-empty",
      },
    ],
    channels: [
      {
        type: "slack",
        enabled: true,
        defaults: {
          dmPolicy: "allowlist",
          groupPolicy: "allowlist",
          slashCommand: { enabled: true, command: "/openclaw" },
          thread: { historyScope: "thread" },
        },
      },
    ],
    recommendedPolicies: [
      "require-secret-manager",
      "forbid-public-admin",
      "elevated-tools-audit",
    ],
  },

  // -------------------------------------------------------------------------
  // 5. Multi-Channel Bot
  // -------------------------------------------------------------------------
  {
    id: "builtin-multi-channel",
    name: "Multi-Channel Bot",
    description:
      "A bot that operates across WhatsApp, Telegram, and Discord simultaneously with shared skills and unified session management.",
    category: "operations",
    defaultConfig: {
      channels: {
        whatsapp: {
          enabled: true,
          dmPolicy: "pairing",
          groupPolicy: "disabled",
          historyLimit: 50,
          mediaMaxMb: 25,
          sendReadReceipts: true,
          chunkMode: "length",
        },
        telegram: {
          enabled: true,
          dmPolicy: "allowlist",
          groupPolicy: "allowlist",
          historyLimit: 100,
          mediaMaxMb: 50,
          botToken: "${TELEGRAM_BOT_TOKEN}",
          linkPreview: true,
          streamMode: "off",
        },
        discord: {
          enabled: true,
          dmPolicy: "allowlist",
          groupPolicy: "allowlist",
          historyLimit: 100,
          mediaMaxMb: 25,
          token: "${DISCORD_TOKEN}",
          allowBots: false,
          replyToMode: "first",
        },
      },
      tools: {
        profile: "messaging",
      },
      sandbox: {
        mode: "non-main",
        scope: "session",
        workspaceAccess: "ro",
      },
      skills: {
        allowBundled: ["weather", "search", "reminder", "github"],
        allowUnverified: false,
      },
      session: {
        scope: "per-sender",
        resetTriggers: ["/new", "/reset"],
      },
      messages: {
        ackReaction: "eyes",
        queue: {
          mode: "steer",
        },
      },
      gateway: {
        port: 18789,
        host: "127.0.0.1",
        auth: { token: "${GATEWAY_AUTH_TOKEN}" },
      },
      logging: {
        level: "info",
        redactSensitive: "tools",
      },
    },
    requiredInputs: [
      {
        key: "telegramBotToken",
        label: "Telegram Bot Token",
        envVar: "TELEGRAM_BOT_TOKEN",
        configPath: "channels.telegram.botToken",
        secret: true,
        placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      },
      {
        key: "discordToken",
        label: "Discord Bot Token",
        envVar: "DISCORD_TOKEN",
        configPath: "channels.discord.token",
        secret: true,
        placeholder: "your-discord-bot-token",
      },
      {
        key: "gatewayAuthToken",
        label: "Gateway Auth Token",
        envVar: "GATEWAY_AUTH_TOKEN",
        configPath: "gateway.auth.token",
        secret: true,
        placeholder: "auto-generated-if-empty",
      },
    ],
    channels: [
      {
        type: "whatsapp",
        enabled: true,
        defaults: {
          dmPolicy: "pairing",
          groupPolicy: "disabled",
          sendReadReceipts: true,
          chunkMode: "length",
        },
      },
      {
        type: "telegram",
        enabled: true,
        defaults: {
          dmPolicy: "allowlist",
          groupPolicy: "allowlist",
          linkPreview: true,
          streamMode: "off",
        },
      },
      {
        type: "discord",
        enabled: true,
        defaults: {
          dmPolicy: "allowlist",
          groupPolicy: "allowlist",
          allowBots: false,
          replyToMode: "first",
        },
      },
    ],
    recommendedPolicies: [
      "require-secret-manager",
      "forbid-public-admin",
      "dm-pairing-only",
      "sandbox-required",
    ],
  },

  // -------------------------------------------------------------------------
  // 6. Coding Assistant
  // -------------------------------------------------------------------------
  {
    id: "builtin-coding-assistant",
    name: "Coding Assistant",
    description:
      "An API-only coding assistant with elevated tools, full sandbox isolation, and no messaging channels. Designed for IDE and CLI integration.",
    category: "development",
    defaultConfig: {
      channels: {},
      tools: {
        profile: "coding",
        elevated: {
          enabled: true,
          allowFrom: [],
        },
        exec: {
          backgroundMs: 15_000,
          timeoutSec: 3600,
        },
      },
      sandbox: {
        mode: "all",
        scope: "session",
        workspaceAccess: "rw",
        docker: {
          image: "node:20-slim",
          memory: "1g",
          cpus: 2,
          readOnlyRootfs: true,
          noNewPrivileges: true,
          dropCapabilities: ["ALL"],
          user: "1000:1000",
        },
      },
      skills: {
        allowBundled: [
          "github",
          "code-review",
          "test-runner",
          "linter",
          "search",
        ],
        allowUnverified: false,
      },
      agents: {
        defaults: {
          workspace: "~/openclaw",
          thinkingDefault: "high",
          timeoutSeconds: 1800,
        },
      },
      session: {
        scope: "per-sender",
        resetTriggers: ["/new", "/reset"],
      },
      gateway: {
        port: 18789,
        host: "127.0.0.1",
        auth: { token: "${GATEWAY_AUTH_TOKEN}" },
      },
      logging: {
        level: "debug",
        redactSensitive: "tools",
      },
    },
    requiredInputs: [
      {
        key: "gatewayAuthToken",
        label: "Gateway Auth Token",
        envVar: "GATEWAY_AUTH_TOKEN",
        configPath: "gateway.auth.token",
        secret: true,
        placeholder: "auto-generated-if-empty",
      },
    ],
    channels: [],
    recommendedPolicies: [
      "require-secret-manager",
      "sandbox-required",
      "elevated-tools-audit",
      "local-only-gateway",
    ],
  },

  // -------------------------------------------------------------------------
  // 7. Minimal Gateway
  // -------------------------------------------------------------------------
  {
    id: "builtin-minimal-gateway",
    name: "Minimal Gateway",
    description:
      "A bare-bones API-only configuration with minimal tools and no channels. Use as a starting point for custom builds.",
    category: "minimal",
    defaultConfig: {
      channels: {},
      tools: {
        profile: "minimal",
      },
      sandbox: {
        mode: "non-main",
        scope: "session",
        workspaceAccess: "none",
      },
      skills: {
        allowBundled: [],
        allowUnverified: false,
      },
      session: {
        scope: "per-sender",
        resetTriggers: ["/new", "/reset"],
      },
      gateway: {
        port: 18789,
        host: "127.0.0.1",
        auth: { token: "${GATEWAY_AUTH_TOKEN}" },
      },
      logging: {
        level: "warn",
        redactSensitive: "tools",
      },
    },
    requiredInputs: [
      {
        key: "gatewayAuthToken",
        label: "Gateway Auth Token",
        envVar: "GATEWAY_AUTH_TOKEN",
        configPath: "gateway.auth.token",
        secret: true,
        placeholder: "auto-generated-if-empty",
      },
    ],
    channels: [],
    recommendedPolicies: ["require-secret-manager", "forbid-public-admin"],
  },
];

/**
 * Look up a built-in template by its stable ID.
 */
export function getBuiltinTemplate(
  id: string,
): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}

/**
 * Returns true when the given id belongs to a built-in template.
 */
export function isBuiltinTemplateId(id: string): boolean {
  return BUILTIN_TEMPLATES.some((t) => t.id === id);
}
