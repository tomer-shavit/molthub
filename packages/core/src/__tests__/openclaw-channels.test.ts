import { describe, it, expect } from "vitest";
import {
  DmPolicySchema,
  GroupPolicySchema,
  ChannelTypeSchema,
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

describe("DmPolicySchema", () => {
  it("accepts valid dm policies", () => {
    for (const policy of ["pairing", "allowlist", "open", "disabled"]) {
      expect(DmPolicySchema.safeParse(policy).success).toBe(true);
    }
  });

  it("rejects invalid dm policies", () => {
    expect(DmPolicySchema.safeParse("public").success).toBe(false);
    expect(DmPolicySchema.safeParse("private").success).toBe(false);
  });
});

describe("GroupPolicySchema", () => {
  it("accepts valid group policies", () => {
    for (const policy of ["allowlist", "open", "disabled"]) {
      expect(GroupPolicySchema.safeParse(policy).success).toBe(true);
    }
  });

  it("rejects 'pairing' (not valid for group)", () => {
    expect(GroupPolicySchema.safeParse("pairing").success).toBe(false);
  });
});

describe("ChannelTypeSchema", () => {
  const allChannels = [
    "whatsapp", "telegram", "discord", "slack", "signal",
    "imessage", "mattermost", "google-chat", "ms-teams", "line", "matrix",
  ];

  it("validates all 11 channel types", () => {
    for (const ch of allChannels) {
      expect(ChannelTypeSchema.safeParse(ch).success).toBe(true);
    }
  });

  it("has exactly 11 channel types", () => {
    expect(ChannelTypeSchema.options).toHaveLength(11);
  });

  it("rejects invalid channel types", () => {
    expect(ChannelTypeSchema.safeParse("fax").success).toBe(false);
    expect(ChannelTypeSchema.safeParse("email").success).toBe(false);
  });
});

describe("OpenClawChannelSchema (discriminated union)", () => {
  it("validates all 11 channel types with pairing policy", () => {
    const channels = [
      { type: "whatsapp" }, { type: "telegram" }, { type: "discord" },
      { type: "slack" }, { type: "signal" }, { type: "imessage" },
      { type: "mattermost" }, { type: "google-chat" }, { type: "ms-teams" },
      { type: "line" }, { type: "matrix" },
    ];
    for (const ch of channels) {
      const result = OpenClawChannelSchema.safeParse({ ...ch, dmPolicy: "pairing" });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown channel type", () => {
    expect(OpenClawChannelSchema.safeParse({ type: "fax" }).success).toBe(false);
  });

  it("applies default values", () => {
    const parsed = OpenClawChannelSchema.parse({
      type: "whatsapp",
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.dmPolicy).toBe("pairing");
    expect(parsed.groupPolicy).toBe("disabled");
    expect(parsed.historyLimit).toBe(50);
    expect(parsed.mediaMaxMb).toBe(25);
  });

  it("enforces allowFrom when dmPolicy is allowlist", () => {
    const result = OpenClawChannelSchema.safeParse({
      type: "whatsapp",
      dmPolicy: "allowlist",
      // Missing allowFrom
    });
    expect(result.success).toBe(false);
  });

  it("enforces groupAllowFrom when groupPolicy is allowlist", () => {
    const result = OpenClawChannelSchema.safeParse({
      type: "whatsapp",
      dmPolicy: "pairing",
      groupPolicy: "allowlist",
      // Missing groupAllowFrom
    });
    expect(result.success).toBe(false);
  });

  it("passes when allowlist has entries", () => {
    const result = OpenClawChannelSchema.safeParse({
      type: "whatsapp",
      dmPolicy: "allowlist",
      allowFrom: ["+15551234567"],
      groupPolicy: "allowlist",
      groupAllowFrom: ["group-id-1"],
    });
    expect(result.success).toBe(true);
  });
});

describe("WhatsApp-specific fields", () => {
  it("validates sendReadReceipts", () => {
    const result = WhatsAppChannelSchema.safeParse({
      type: "whatsapp",
      dmPolicy: "pairing",
      sendReadReceipts: true,
    });
    expect(result.success).toBe(true);
  });

  it("validates chunkMode enum", () => {
    expect(
      WhatsAppChannelSchema.safeParse({ type: "whatsapp", dmPolicy: "pairing", chunkMode: "length" }).success,
    ).toBe(true);
    expect(
      WhatsAppChannelSchema.safeParse({ type: "whatsapp", dmPolicy: "pairing", chunkMode: "newline" }).success,
    ).toBe(true);
    expect(
      WhatsAppChannelSchema.safeParse({ type: "whatsapp", dmPolicy: "pairing", chunkMode: "word" }).success,
    ).toBe(false);
  });

  it("applies defaults for WhatsApp", () => {
    const parsed = WhatsAppChannelSchema.parse({ type: "whatsapp", dmPolicy: "pairing" });
    expect(parsed.sendReadReceipts).toBe(true);
    expect(parsed.chunkMode).toBe("length");
  });
});

describe("Telegram-specific fields", () => {
  it("validates botToken and tokenFile", () => {
    const result = TelegramChannelSchema.safeParse({
      type: "telegram",
      dmPolicy: "pairing",
      botToken: "123:ABC",
      tokenFile: "/path/to/token",
    });
    expect(result.success).toBe(true);
  });

  it("validates streamMode enum", () => {
    for (const mode of ["off", "partial", "block"]) {
      expect(
        TelegramChannelSchema.safeParse({ type: "telegram", dmPolicy: "pairing", streamMode: mode }).success,
      ).toBe(true);
    }
    expect(
      TelegramChannelSchema.safeParse({ type: "telegram", dmPolicy: "pairing", streamMode: "full" }).success,
    ).toBe(false);
  });

  it("validates customCommands array", () => {
    const result = TelegramChannelSchema.safeParse({
      type: "telegram",
      dmPolicy: "pairing",
      customCommands: [
        { command: "/help", description: "Show help" },
        { command: "/status" },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("Discord-specific fields", () => {
  it("validates guilds configuration", () => {
    const result = DiscordChannelSchema.safeParse({
      type: "discord",
      dmPolicy: "pairing",
      guilds: {
        "123456": { slug: "my-server" },
        "789012": { slug: "another-server" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates replyToMode enum", () => {
    for (const mode of ["off", "first", "all"]) {
      expect(
        DiscordChannelSchema.safeParse({ type: "discord", dmPolicy: "pairing", replyToMode: mode }).success,
      ).toBe(true);
    }
  });

  it("validates allowBots boolean", () => {
    const parsed = DiscordChannelSchema.parse({ type: "discord", dmPolicy: "pairing" });
    expect(parsed.allowBots).toBe(false);
  });
});

describe("Slack-specific fields", () => {
  it("validates slashCommand configuration", () => {
    const result = SlackChannelSchema.safeParse({
      type: "slack",
      dmPolicy: "pairing",
      slashCommand: { enabled: true, name: "/molt" },
    });
    expect(result.success).toBe(true);
  });

  it("validates thread historyScope", () => {
    expect(
      SlackChannelSchema.safeParse({ type: "slack", dmPolicy: "pairing", thread: { historyScope: "thread" } }).success,
    ).toBe(true);
    expect(
      SlackChannelSchema.safeParse({ type: "slack", dmPolicy: "pairing", thread: { historyScope: "channel" } }).success,
    ).toBe(true);
  });
});

describe("Other channel types", () => {
  it("validates Mattermost with serverUrl", () => {
    const result = MattermostChannelSchema.safeParse({
      type: "mattermost",
      dmPolicy: "pairing",
      serverUrl: "https://mattermost.example.com",
      token: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("validates Google Chat with service account", () => {
    const result = GoogleChatChannelSchema.safeParse({
      type: "google-chat",
      dmPolicy: "pairing",
      serviceAccountKeyFile: "/path/to/key.json",
    });
    expect(result.success).toBe(true);
  });

  it("validates MS Teams with app credentials", () => {
    const result = MSTeamsChannelSchema.safeParse({
      type: "ms-teams",
      dmPolicy: "pairing",
      appId: "app-id-123",
      appPassword: "app-password",
    });
    expect(result.success).toBe(true);
  });

  it("validates LINE with tokens", () => {
    const result = LINEChannelSchema.safeParse({
      type: "line",
      dmPolicy: "pairing",
      channelAccessToken: "token-123",
      channelSecret: "secret-456",
    });
    expect(result.success).toBe(true);
  });

  it("validates Matrix with homeserver", () => {
    const result = MatrixChannelSchema.safeParse({
      type: "matrix",
      dmPolicy: "pairing",
      homeserverUrl: "https://matrix.example.com",
      accessToken: "token-789",
    });
    expect(result.success).toBe(true);
  });

  it("validates Signal (minimal)", () => {
    expect(
      SignalChannelSchema.safeParse({ type: "signal", dmPolicy: "pairing" }).success,
    ).toBe(true);
  });

  it("validates iMessage (minimal)", () => {
    expect(
      IMessageChannelSchema.safeParse({ type: "imessage", dmPolicy: "pairing" }).success,
    ).toBe(true);
  });
});

describe("ChannelsConfigSchema (keyed format)", () => {
  it("validates config with multiple channels", () => {
    const result = ChannelsConfigSchema.safeParse({
      whatsapp: { enabled: true, sendReadReceipts: true, dmPolicy: "pairing" },
      telegram: { enabled: true, botToken: "abc", dmPolicy: "pairing" },
      discord: { enabled: false, dmPolicy: "pairing" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty channels object", () => {
    const result = ChannelsConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts undefined (optional)", () => {
    const result = ChannelsConfigSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it("validates individual channel within keyed format", () => {
    const result = ChannelsConfigSchema.safeParse({
      slack: {
        enabled: true,
        dmPolicy: "pairing",
        botToken: "xoxb-token",
        appToken: "xapp-token",
        slashCommand: { enabled: true, name: "/bot" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("enforces allowFrom in keyed format when dmPolicy is allowlist", () => {
    const result = ChannelsConfigSchema.safeParse({
      whatsapp: {
        enabled: true,
        dmPolicy: "allowlist",
        // Missing allowFrom
      },
    });
    expect(result.success).toBe(false);
  });
});
