import { z } from "zod";
import { ChannelsConfigSchema, ChannelTypeSchema } from "./openclaw-channels";
import { ModelsConfigSchema } from "./ai-gateway/config";

// =============================================================================
// Shared Primitives
// =============================================================================

/**
 * Environment variable substitution pattern: ${VAR_NAME}
 * Values that support env-var interpolation accept either a plain string
 * or a string containing one or more `${…}` references.
 */
export const EnvSubstitutionPattern = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;

/** String that may contain `${VAR}` env-var references. */
export const envString = z.string();

// =============================================================================
// Tool Groups
// =============================================================================

export const ToolGroupSchema = z.enum([
  "group:runtime",
  "group:fs",
  "group:sessions",
  "group:memory",
  "group:web",
  "group:ui",
  "group:automation",
  "group:messaging",
  "group:nodes",
  "group:openclaw",
]);
export type ToolGroup = z.infer<typeof ToolGroupSchema>;

/** A tool reference is either a named tool or a group alias. */
export const ToolRefSchema = z.string().min(1);

// =============================================================================
// Sandbox Config
// =============================================================================

export const SandboxModeSchema = z.enum(["off", "non-main", "all"]);
export type SandboxMode = z.infer<typeof SandboxModeSchema>;

export const SandboxScopeSchema = z.enum(["session", "agent", "shared"]);
export type SandboxScope = z.infer<typeof SandboxScopeSchema>;

export const WorkspaceAccessSchema = z.enum(["none", "ro", "rw"]);
export type WorkspaceAccess = z.infer<typeof WorkspaceAccessSchema>;

export const DockerSandboxSchema = z.object({
  image: z.string().optional(),
  network: z.string().optional(),
  memory: z.string().optional(),
  cpus: z.number().positive().optional(),
  readOnlyRootfs: z.boolean().default(true),
  noNewPrivileges: z.boolean().default(true),
  dropCapabilities: z.array(z.string()).default(["ALL"]),
  addCapabilities: z.array(z.string()).optional(),
  user: z.string().default("1000:1000"),
});
export type DockerSandbox = z.infer<typeof DockerSandboxSchema>;

export const SandboxConfigSchema = z.object({
  mode: SandboxModeSchema.default("all"),
  scope: SandboxScopeSchema.default("session"),
  workspaceAccess: WorkspaceAccessSchema.default("ro"),
  docker: DockerSandboxSchema.optional(),
});
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

// =============================================================================
// Model Config
// =============================================================================

/** provider/model format, e.g. "anthropic/claude-sonnet-4-20250514" */
export const ModelRefSchema = z.string().min(1);

export const ModelConfigSchema = z.object({
  primary: ModelRefSchema,
  fallbacks: z.array(ModelRefSchema).optional(),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

// =============================================================================
// Agent Identity
// =============================================================================

export const AgentIdentitySchema = z.object({
  name: z.string().min(1).optional(),
  emoji: z.string().optional(),
  theme: z.string().optional(),
  avatar: z.string().optional(),
});
export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

// =============================================================================
// Agent Defaults & Agent List
// =============================================================================

export const ThinkingDefaultSchema = z.enum(["low", "high", "off"]);
export type ThinkingDefault = z.infer<typeof ThinkingDefaultSchema>;

export const AgentDefaultsSchema = z.object({
  workspace: z.string().default("~/openclaw"),
  model: ModelConfigSchema.optional(),
  thinkingDefault: ThinkingDefaultSchema.default("off"),
  timeoutSeconds: z.number().int().positive().default(600),
  maxConcurrent: z.number().int().positive().optional(),
  sandbox: SandboxConfigSchema.optional(),
});
export type AgentDefaults = z.infer<typeof AgentDefaultsSchema>;

export const AgentEntrySchema = z.object({
  id: z.string().min(1),
  default: z.boolean().optional(),
  workspace: z.string().optional(),
  agentDir: z.string().optional(),
  identity: AgentIdentitySchema.optional(),
  model: ModelConfigSchema.optional(),
  sandbox: SandboxConfigSchema.optional(),
  tools: z
    .object({
      allow: z.array(ToolRefSchema).optional(),
      deny: z.array(ToolRefSchema).optional(),
    })
    .optional(),
});
export type AgentEntry = z.infer<typeof AgentEntrySchema>;

export const AgentsConfigSchema = z.object({
  defaults: AgentDefaultsSchema.optional(),
  list: z.array(AgentEntrySchema).optional(),
});
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

// =============================================================================
// Session Config
// =============================================================================

export const SessionScopeSchema = z.enum(["per-sender", "per-channel-peer"]);
export type SessionScope = z.infer<typeof SessionScopeSchema>;

export const SessionResetModeSchema = z.enum(["daily", "idle"]);
export type SessionResetMode = z.infer<typeof SessionResetModeSchema>;

export const SessionConfigSchema = z.object({
  scope: SessionScopeSchema.default("per-sender"),
  reset: z
    .object({
      mode: SessionResetModeSchema.default("daily"),
    })
    .optional(),
  resetTriggers: z.array(z.string()).default(["/new", "/reset"]),
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

// =============================================================================
// Messages Config
// =============================================================================

export const QueueModeSchema = z.enum([
  "steer",
  "collect",
  "followup",
  "interrupt",
]);
export type QueueMode = z.infer<typeof QueueModeSchema>;

export const MessagesConfigSchema = z.object({
  responsePrefix: z.string().optional(),
  ackReaction: z.string().optional(),
  queue: z
    .object({
      mode: QueueModeSchema.default("steer"),
    })
    .optional(),
  tts: z
    .object({
      enabled: z.boolean().default(false),
      voice: z.string().optional(),
    })
    .optional(),
});
export type MessagesConfig = z.infer<typeof MessagesConfigSchema>;

// =============================================================================
// Tools Config
// =============================================================================

export const ToolProfileSchema = z.enum([
  "minimal",
  "coding",
  "messaging",
  "full",
]);
export type ToolProfile = z.infer<typeof ToolProfileSchema>;

export const ToolsExecSchema = z.object({
  backgroundMs: z.number().int().positive().default(10_000),
  timeoutSec: z.number().int().positive().default(1800),
});
export type ToolsExec = z.infer<typeof ToolsExecSchema>;

// =============================================================================
// Browser Isolation Config
// =============================================================================

export const BrowserIsolationSchema = z.object({
  /** Use a separate browser profile for the bot (not the user's default). */
  separateProfile: z.boolean().default(true),
  /** Custom profile directory path. Auto-generated if omitted. */
  profilePath: z.string().optional(),
  /** Disable all browser extensions in the bot profile. */
  disableExtensions: z.boolean().default(true),
  /** Disable the browser's built-in password manager access. */
  disablePasswordManager: z.boolean().default(true),
  /** Disable autofill for forms (prevents credential leakage). */
  disableAutofill: z.boolean().default(true),
  /** URLs the bot is not allowed to navigate to. */
  blockInternalUrls: z.array(z.string()).default([
    "chrome://settings/passwords",
    "chrome://extensions",
    "chrome://settings/autofill",
    "about:logins",
  ]),
});
export type BrowserIsolation = z.infer<typeof BrowserIsolationSchema>;

// =============================================================================
// Credential Guard Config
// =============================================================================

export const CredentialGuardSchema = z.object({
  /** Block access to password manager CLIs. */
  blockPasswordManagers: z.boolean().default(true),
  /** Specific CLI commands to block from tool execution. */
  blockedCommands: z.array(z.string()).default([
    "op",               // 1Password CLI
    "bw",               // Bitwarden CLI
    "lpass",            // LastPass CLI
    "keepassxc-cli",    // KeePassXC CLI
    "security",         // macOS Keychain CLI
    "secret-tool",      // GNOME Keyring CLI
  ]),
  /** Block macOS Keychain / OS credential store access. */
  blockKeychain: z.boolean().default(true),
});
export type CredentialGuard = z.infer<typeof CredentialGuardSchema>;

export const ToolsConfigSchema = z.object({
  profile: ToolProfileSchema.default("coding"),
  allow: z.array(ToolRefSchema).optional(),
  deny: z.array(ToolRefSchema).optional(),
  elevated: z
    .object({
      enabled: z.boolean().default(false),
      allowFrom: z.array(z.string()).optional(),
    })
    .optional(),
  exec: ToolsExecSchema.optional(),
  /** Browser isolation settings — prevents session hijacking. */
  browser: BrowserIsolationSchema.optional(),
  /** Credential guard — blocks password manager access. */
  credentialGuard: CredentialGuardSchema.optional(),
});
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

// =============================================================================
// Skills Config
// =============================================================================

export const SkillSourceSchema = z.enum(["bundled", "registry", "local", "git"]);
export type SkillSource = z.infer<typeof SkillSourceSchema>;

export const SkillIntegritySchema = z.object({
  /** SHA-256 hash of the skill package for tamper detection. */
  sha256: z.string().optional(),
  /** Cryptographic signature of the skill package. */
  signature: z.string().optional(),
  /** Identity of the signer (e.g., publisher key fingerprint). */
  signedBy: z.string().optional(),
});
export type SkillIntegrity = z.infer<typeof SkillIntegritySchema>;

export const SkillPermissionsSchema = z.object({
  /** Whether the skill can make network requests. */
  network: z.boolean().default(false),
  /** Filesystem access level. */
  filesystem: z.enum(["none", "readonly", "workspace"]).default("none"),
  /** Whether the skill can spawn subprocesses. */
  subprocess: z.boolean().default(false),
});
export type SkillPermissions = z.infer<typeof SkillPermissionsSchema>;

export const SkillEntrySchema = z.object({
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().default(true),
  env: z.record(z.string()).optional(),
  apiKey: z.string().optional(),
  /** Where the skill comes from. */
  source: SkillSourceSchema.default("bundled"),
  /** Integrity verification data. */
  integrity: SkillIntegritySchema.optional(),
  /** Declared permissions required by the skill. */
  permissions: SkillPermissionsSchema.optional(),
});
export type SkillEntry = z.infer<typeof SkillEntrySchema>;

export const SkillsConfigSchema = z.object({
  /** Whether to allow skills without integrity verification. Default: false in production. */
  allowUnverified: z.boolean().default(false),
  allowBundled: z.array(z.string()).optional(),
  load: z
    .object({
      extraDirs: z.array(z.string()).optional(),
    })
    .optional(),
  entries: z.record(z.string(), SkillEntrySchema).optional(),
});
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

// =============================================================================
// Plugins Config
// =============================================================================

export const PluginEntrySchema = z.object({
  config: z.record(z.unknown()).optional(),
});
export type PluginEntry = z.infer<typeof PluginEntrySchema>;

export const PluginsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
  entries: z.record(z.string(), PluginEntrySchema).optional(),
});
export type PluginsConfig = z.infer<typeof PluginsConfigSchema>;

// =============================================================================
// Gateway Config
// =============================================================================

export const GatewayAuthSchema = z.object({
  token: z.string().optional(),
  password: z.string().optional(),
});
export type GatewayAuth = z.infer<typeof GatewayAuthSchema>;

export const GatewayConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(18789),
  auth: GatewayAuthSchema.optional(),
  host: z.string().default("127.0.0.1"),
});
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

// =============================================================================
// Logging Config
// =============================================================================

export const LogLevelSchema = z.enum(["trace", "debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const RedactSensitiveSchema = z.enum(["off", "tools"]);
export type RedactSensitive = z.infer<typeof RedactSensitiveSchema>;

export const LoggingConfigSchema = z.object({
  level: LogLevelSchema.default("info"),
  file: z.string().optional(),
  redactSensitive: RedactSensitiveSchema.default("tools"),
});
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

// =============================================================================
// Bindings (Multi-Agent Routing)
// =============================================================================

export const PeerKindSchema = z.enum(["dm", "group", "channel"]);
export type PeerKind = z.infer<typeof PeerKindSchema>;

export const BindingMatchSchema = z.object({
  channel: ChannelTypeSchema.optional(),
  peer: z
    .object({
      kind: PeerKindSchema,
      id: z.string().min(1),
    })
    .optional(),
});
export type BindingMatch = z.infer<typeof BindingMatchSchema>;

export const BindingEntrySchema = z.object({
  agentId: z.string().min(1),
  match: BindingMatchSchema,
});
export type BindingEntry = z.infer<typeof BindingEntrySchema>;

// =============================================================================
// $include Directive (recursive config inclusion)
// =============================================================================

/** Supports lazy recursive references for $include directives. */
export const IncludeDirectiveSchema = z.object({
  $include: z.string().min(1),
});
export type IncludeDirective = z.infer<typeof IncludeDirectiveSchema>;

// =============================================================================
// Config RPC Types
// =============================================================================

export const ConfigGetResponseSchema = z.object({
  config: z.record(z.unknown()),
  hash: z.string(),
});
export type ConfigGetResponse = z.infer<typeof ConfigGetResponseSchema>;

export const ConfigApplyRequestSchema = z.object({
  raw: z.string().min(1),
  baseHash: z.string().optional(),
  sessionKey: z.string().optional(),
  restartDelayMs: z.number().int().min(0).optional(),
});
export type ConfigApplyRequest = z.infer<typeof ConfigApplyRequestSchema>;

export const ConfigPatchRequestSchema = z.object({
  patch: z.record(z.unknown()),
  baseHash: z.string().optional(),
  sessionKey: z.string().optional(),
  restartDelayMs: z.number().int().min(0).optional(),
});
export type ConfigPatchRequest = z.infer<typeof ConfigPatchRequestSchema>;

// =============================================================================
// Discovery Config (mDNS / LAN discovery)
// =============================================================================

export const DiscoveryConfigSchema = z.object({
  mdns: z
    .object({
      mode: z.enum(["off", "minimal", "full"]).default("minimal"),
    })
    .optional(),
});
export type DiscoveryConfig = z.infer<typeof DiscoveryConfigSchema>;

// =============================================================================
// Inline Environment Variables
// =============================================================================

export const EnvConfigSchema = z.record(z.string(), z.string());
export type EnvConfig = z.infer<typeof EnvConfigSchema>;

// =============================================================================
// Full OpenClaw Config Schema
// =============================================================================

export const OpenClawConfigSchema = z.object({
  /** Optional $include for splitting config across files. */
  $include: z.union([z.string(), z.array(z.string())]).optional(),

  agents: AgentsConfigSchema.optional(),
  session: SessionConfigSchema.optional(),
  messages: MessagesConfigSchema.optional(),
  channels: ChannelsConfigSchema,
  tools: ToolsConfigSchema.optional(),
  sandbox: SandboxConfigSchema.optional(),
  skills: SkillsConfigSchema.optional(),
  plugins: PluginsConfigSchema.optional(),
  gateway: GatewayConfigSchema.optional(),
  logging: LoggingConfigSchema.optional(),
  bindings: z.array(BindingEntrySchema).optional(),
  models: ModelsConfigSchema.optional(),
  discovery: DiscoveryConfigSchema.optional(),
  env: EnvConfigSchema.optional(),
});
/**
 * Full validated OpenClaw config type inferred from the Zod schema.
 *
 * Named `OpenClawFullConfig` to avoid collision with the lightweight
 * `OpenClawConfig` interface in `openclaw-policies.ts` (used for policy
 * evaluation).
 */
export type OpenClawFullConfig = z.infer<typeof OpenClawConfigSchema>;

/**
 * Parse & validate a raw config object (e.g. from JSON5) against the
 * full OpenClaw config schema.
 */
export function validateOpenClawConfig(data: unknown): OpenClawFullConfig {
  return OpenClawConfigSchema.parse(data);
}
