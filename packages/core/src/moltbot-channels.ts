import { z } from "zod";

// =============================================================================
// Common Channel Enums & Shared Schemas
// =============================================================================

export const DmPolicySchema = z.enum([
  "pairing",
  "allowlist",
  "open",
  "disabled",
]);
export type DmPolicy = z.infer<typeof DmPolicySchema>;

export const GroupPolicySchema = z.enum([
  "allowlist",
  "open",
  "disabled",
]);
export type GroupPolicy = z.infer<typeof GroupPolicySchema>;

export const ChannelTypeSchema = z.enum([
  "whatsapp",
  "telegram",
  "discord",
  "slack",
  "signal",
  "imessage",
  "mattermost",
  "google-chat",
  "ms-teams",
  "line",
  "matrix",
]);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

/** Fields common to every channel block. */
const BaseChannelFields = {
  enabled: z.boolean().default(true),
  dmPolicy: DmPolicySchema.default("allowlist"),
  groupPolicy: GroupPolicySchema.default("disabled"),
  allowFrom: z.array(z.string()).optional(),
  groupAllowFrom: z.array(z.string()).optional(),
  historyLimit: z.number().int().min(0).default(50),
  mediaMaxMb: z.number().min(0).default(25),
};


/**
 * Refine helper: validates that allowFrom / groupAllowFrom are non-empty
 * when the corresponding policy is set to "allowlist".
 */
function refineChannelAllowlists<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .refine(
      (data: Record<string, unknown>) =>
        data.dmPolicy !== "allowlist" ||
        (Array.isArray(data.allowFrom) && data.allowFrom.length > 0),
      {
        message:
          "allowFrom must contain at least one user ID when dmPolicy is 'allowlist'",
        path: ["allowFrom"],
      },
    )
    .refine(
      (data: Record<string, unknown>) =>
        data.groupPolicy !== "allowlist" ||
        (Array.isArray(data.groupAllowFrom) && data.groupAllowFrom.length > 0),
      {
        message:
          "groupAllowFrom must contain at least one group ID when groupPolicy is 'allowlist'",
        path: ["groupAllowFrom"],
      },
    );
}

// =============================================================================
// Per-Channel Schemas (discriminated by `type`)
// =============================================================================

const WhatsAppChannelObjectSchema = z.object({
  type: z.literal("whatsapp"),
  ...BaseChannelFields,
  sendReadReceipts: z.boolean().default(false),
  chunkMode: z.enum(["length", "newline"]).default("length"),
});
export const WhatsAppChannelSchema = refineChannelAllowlists(WhatsAppChannelObjectSchema);
export type WhatsAppChannel = z.infer<typeof WhatsAppChannelSchema>;

const TelegramChannelObjectSchema = z.object({
  type: z.literal("telegram"),
  ...BaseChannelFields,
  botToken: z.string().optional(),
  tokenFile: z.string().optional(),
  linkPreview: z.boolean().default(false),
  streamMode: z.enum(["off", "partial", "block"]).default("off"),
  customCommands: z.array(
    z.object({
      command: z.string(),
      description: z.string().optional(),
    }),
  ).optional(),
});
export const TelegramChannelSchema = refineChannelAllowlists(TelegramChannelObjectSchema);
export type TelegramChannel = z.infer<typeof TelegramChannelSchema>;

const DiscordChannelObjectSchema = z.object({
  type: z.literal("discord"),
  ...BaseChannelFields,
  token: z.string().optional(),
  allowBots: z.boolean().default(false),
  guilds: z.record(
    z.string(),
    z.object({
      slug: z.string().optional(),
    }),
  ).optional(),
  replyToMode: z.enum(["off", "first", "all"]).default("first"),
});
export const DiscordChannelSchema = refineChannelAllowlists(DiscordChannelObjectSchema);
export type DiscordChannel = z.infer<typeof DiscordChannelSchema>;

const SlackChannelObjectSchema = z.object({
  type: z.literal("slack"),
  ...BaseChannelFields,
  botToken: z.string().optional(),
  appToken: z.string().optional(),
  slashCommand: z
    .object({
      enabled: z.boolean().default(false),
      command: z.string().default("/moltbot"),
    })
    .optional(),
  thread: z
    .object({
      historyScope: z.enum(["thread", "channel"]).default("thread"),
    })
    .optional(),
});
export const SlackChannelSchema = refineChannelAllowlists(SlackChannelObjectSchema);
export type SlackChannel = z.infer<typeof SlackChannelSchema>;

const SignalChannelObjectSchema = z.object({
  type: z.literal("signal"),
  ...BaseChannelFields,
});
export const SignalChannelSchema = refineChannelAllowlists(SignalChannelObjectSchema);
export type SignalChannel = z.infer<typeof SignalChannelSchema>;

const IMessageChannelObjectSchema = z.object({
  type: z.literal("imessage"),
  ...BaseChannelFields,
});
export const IMessageChannelSchema = refineChannelAllowlists(IMessageChannelObjectSchema);
export type IMessageChannel = z.infer<typeof IMessageChannelSchema>;

const MattermostChannelObjectSchema = z.object({
  type: z.literal("mattermost"),
  ...BaseChannelFields,
  serverUrl: z.string().url().optional(),
  token: z.string().optional(),
});
export const MattermostChannelSchema = refineChannelAllowlists(MattermostChannelObjectSchema);
export type MattermostChannel = z.infer<typeof MattermostChannelSchema>;

const GoogleChatChannelObjectSchema = z.object({
  type: z.literal("google-chat"),
  ...BaseChannelFields,
  serviceAccountKeyFile: z.string().optional(),
});
export const GoogleChatChannelSchema = refineChannelAllowlists(GoogleChatChannelObjectSchema);
export type GoogleChatChannel = z.infer<typeof GoogleChatChannelSchema>;

const MSTeamsChannelObjectSchema = z.object({
  type: z.literal("ms-teams"),
  ...BaseChannelFields,
  appId: z.string().optional(),
  appPassword: z.string().optional(),
});
export const MSTeamsChannelSchema = refineChannelAllowlists(MSTeamsChannelObjectSchema);
export type MSTeamsChannel = z.infer<typeof MSTeamsChannelSchema>;

const LINEChannelObjectSchema = z.object({
  type: z.literal("line"),
  ...BaseChannelFields,
  channelAccessToken: z.string().optional(),
  channelSecret: z.string().optional(),
});
export const LINEChannelSchema = refineChannelAllowlists(LINEChannelObjectSchema);
export type LINEChannel = z.infer<typeof LINEChannelSchema>;

const MatrixChannelObjectSchema = z.object({
  type: z.literal("matrix"),
  ...BaseChannelFields,
  homeserverUrl: z.string().url().optional(),
  accessToken: z.string().optional(),
});
export const MatrixChannelSchema = refineChannelAllowlists(MatrixChannelObjectSchema);
export type MatrixChannel = z.infer<typeof MatrixChannelSchema>;

// =============================================================================
// Discriminated Union of All Channel Types
// =============================================================================

export const MoltbotChannelSchema = z.discriminatedUnion("type", [
  WhatsAppChannelObjectSchema,
  TelegramChannelObjectSchema,
  DiscordChannelObjectSchema,
  SlackChannelObjectSchema,
  SignalChannelObjectSchema,
  IMessageChannelObjectSchema,
  MattermostChannelObjectSchema,
  GoogleChatChannelObjectSchema,
  MSTeamsChannelObjectSchema,
  LINEChannelObjectSchema,
  MatrixChannelObjectSchema,
]).superRefine((data, ctx) => {
  if (data.dmPolicy === "allowlist" && (!Array.isArray(data.allowFrom) || data.allowFrom.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "allowFrom must contain at least one user ID when dmPolicy is 'allowlist'",
      path: ["allowFrom"],
    });
  }
  if (data.groupPolicy === "allowlist" && (!Array.isArray(data.groupAllowFrom) || data.groupAllowFrom.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "groupAllowFrom must contain at least one group ID when groupPolicy is 'allowlist'",
      path: ["groupAllowFrom"],
    });
  }
});
export type MoltbotChannel = z.infer<typeof MoltbotChannelSchema>;

/**
 * Record keyed by channel type for the top-level `channels` config block.
 * Each key is optional; only configured channels need to appear.
 */
export const ChannelsConfigSchema = z.object({
  whatsapp: refineChannelAllowlists(WhatsAppChannelObjectSchema.omit({ type: true })).optional(),
  telegram: refineChannelAllowlists(TelegramChannelObjectSchema.omit({ type: true })).optional(),
  discord: refineChannelAllowlists(DiscordChannelObjectSchema.omit({ type: true })).optional(),
  slack: refineChannelAllowlists(SlackChannelObjectSchema.omit({ type: true })).optional(),
  signal: refineChannelAllowlists(SignalChannelObjectSchema.omit({ type: true })).optional(),
  imessage: refineChannelAllowlists(IMessageChannelObjectSchema.omit({ type: true })).optional(),
  mattermost: refineChannelAllowlists(MattermostChannelObjectSchema.omit({ type: true })).optional(),
  "google-chat": refineChannelAllowlists(GoogleChatChannelObjectSchema.omit({ type: true })).optional(),
  "ms-teams": refineChannelAllowlists(MSTeamsChannelObjectSchema.omit({ type: true })).optional(),
  line: refineChannelAllowlists(LINEChannelObjectSchema.omit({ type: true })).optional(),
  matrix: refineChannelAllowlists(MatrixChannelObjectSchema.omit({ type: true })).optional(),
}).optional();
export type ChannelsConfig = z.infer<typeof ChannelsConfigSchema>;
