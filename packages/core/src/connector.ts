import { z } from "zod";

// IntegrationConnector: Shared credentials for external services
export const ConnectorType = z.enum([
  // AI Model Providers
  "openai",
  "anthropic",
  "gemini",
  "azure_openai",
  "cohere",
  "ollama",
  
  // Communication Channels
  "slack",
  "discord",
  "telegram",
  "teams",
  "webhook",
  "email",
  
  // Cloud Providers
  "aws",
  "gcp",
  "azure",
  
  // Databases
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  
  // Other integrations
  "github",
  "gitlab",
  "jira",
  "notion",
  "custom",
]);
export type ConnectorType = z.infer<typeof ConnectorType>;

export const ConnectorStatus = z.enum(["ACTIVE", "INACTIVE", "ERROR", "PENDING"]);
export type ConnectorStatus = z.infer<typeof ConnectorStatus>;

// Credential reference - points to actual secret in secret manager
export const CredentialRefSchema = z.object({
  name: z.string(),
  provider: z.literal("aws-secrets-manager"),
  arn: z.string(), // Full ARN of the secret
  key: z.string().optional(), // Optional: specific key within secret JSON
});

export type CredentialRef = z.infer<typeof CredentialRefSchema>;

// Connection configuration by type
export const ConnectionConfigSchema = z.discriminatedUnion("type", [
  // OpenAI
  z.object({
    type: z.literal("openai"),
    apiKey: CredentialRefSchema,
    organizationId: CredentialRefSchema.optional(),
    baseUrl: z.string().url().optional(), // For custom/proxy endpoints
    defaultModel: z.string().default("gpt-4"),
  }),
  
  // Anthropic
  z.object({
    type: z.literal("anthropic"),
    apiKey: CredentialRefSchema,
    defaultModel: z.string().default("claude-3-opus-20240229"),
  }),
  
  // Slack
  z.object({
    type: z.literal("slack"),
    botToken: CredentialRefSchema,
    signingSecret: CredentialRefSchema.optional(),
    appToken: CredentialRefSchema.optional(), // For socket mode
    socketMode: z.boolean().default(false),
    webhookUrl: CredentialRefSchema.optional(),
  }),
  
  // Discord
  z.object({
    type: z.literal("discord"),
    botToken: CredentialRefSchema,
    applicationId: z.string().optional(),
    publicKey: z.string().optional(), // For interactions
  }),
  
  // Telegram
  z.object({
    type: z.literal("telegram"),
    botToken: CredentialRefSchema,
    webhookUrl: z.string().url().optional(),
    allowedUpdates: z.array(z.string()).optional(),
  }),
  
  // Webhook
  z.object({
    type: z.literal("webhook"),
    sharedSecret: CredentialRefSchema.optional(),
    verifyToken: z.boolean().default(true),
    allowedIps: z.array(z.string()).optional(), // IP allowlist
  }),
  
  // AWS
  z.object({
    type: z.literal("aws"),
    accessKeyId: CredentialRefSchema,
    secretAccessKey: CredentialRefSchema,
    sessionToken: CredentialRefSchema.optional(),
    region: z.string().default("us-east-1"),
    roleArn: z.string().optional(), // For role assumption
  }),
  
  // Database (generic)
  z.object({
    type: z.enum(["postgres", "mysql", "mongodb", "redis"]),
    connectionString: CredentialRefSchema,
    ssl: z.boolean().default(true),
    maxConnections: z.number().int().default(10),
  }),
  
  // GitHub
  z.object({
    type: z.literal("github"),
    token: CredentialRefSchema,
    appId: z.string().optional(), // For GitHub App auth
    privateKey: CredentialRefSchema.optional(), // For GitHub App auth
    installationId: z.string().optional(),
  }),
  
  // Generic/Custom
  z.object({
    type: z.literal("custom"),
    credentials: z.record(CredentialRefSchema),
    config: z.record(z.unknown()).default({}),
  }),
]);

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

// Integration Connector definition
export const IntegrationConnectorSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string(),
  
  // Scope
  workspaceId: z.string(),
  
  // Type and configuration
  type: ConnectorType,
  config: ConnectionConfigSchema,
  
  // Status
  status: ConnectorStatus.default("PENDING"),
  statusMessage: z.string().optional(),
  lastTestedAt: z.date().optional(),
  lastTestResult: z.enum(["SUCCESS", "FAILURE"]).optional(),
  lastError: z.string().optional(),
  
  // Sharing
  isShared: z.boolean().default(true), // Can be used by multiple instances
  allowedInstanceIds: z.array(z.string()).optional(), // If not shared, specific instances
  
  // Rotation
  rotationSchedule: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
    lastRotatedAt: z.date().optional(),
    nextRotationAt: z.date().optional(),
  }).optional(),
  
  // Usage tracking
  usageCount: z.number().int().min(0).default(0),
  lastUsedAt: z.date().optional(),
  
  tags: z.record(z.string()).default({}),
  
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string(),
});

export type IntegrationConnector = z.infer<typeof IntegrationConnectorSchema>;

// Connector reference used in manifests (instead of embedding full credentials)
export const ConnectorRefSchema = z.object({
  connectorId: z.string(),
  workspaceId: z.string(),
  type: ConnectorType,
  
  // Optional: override specific config values
  configOverrides: z.record(z.unknown()).optional(),
  
  // Optional: use specific credentials from connector
  credentialKeys: z.array(z.string()).optional(),
});

export type ConnectorRef = z.infer<typeof ConnectorRefSchema>;

// Bot instance connector binding
export const BotConnectorBindingSchema = z.object({
  id: z.string(),
  botInstanceId: z.string(),
  connectorId: z.string(),
  
  // How the connector is used
  purpose: z.enum([
    "llm",           // AI model provider
    "channel",       // Communication channel
    "database",      // Database connection
    "storage",       // File/object storage
    "external_api",  // External API
    "other",
  ]),
  
  // Channel-specific config (if purpose is channel)
  channelConfig: z.object({
    channelType: z.enum(["slack", "discord", "telegram", "webhook", "email"]).optional(),
    enabled: z.boolean().default(true),
    settings: z.record(z.unknown()).optional(),
  }).optional(),
  
  // Override connector defaults for this bot
  overrides: z.record(z.unknown()).optional(),
  
  // Health
  healthStatus: z.enum(["HEALTHY", "UNHEALTHY", "UNKNOWN"]).default("UNKNOWN"),
  lastHealthCheck: z.date().optional(),
  
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type BotConnectorBinding = z.infer<typeof BotConnectorBindingSchema>;

// Credential rotation event
export const CredentialRotationSchema = z.object({
  id: z.string(),
  connectorId: z.string(),
  
  triggeredBy: z.enum(["schedule", "manual", "security"]),
  triggeredAt: z.date(),
  triggeredByUser: z.string().optional(),
  
  // Status
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "ROLLED_BACK"]),
  
  // Timeline
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  
  // Old/new secret ARNs
  oldSecretArn: z.string().optional(),
  newSecretArn: z.string().optional(),
  
  // Rollout status
  instancesUpdated: z.number().int().default(0),
  instancesTotal: z.number().int().default(0),
  
  // Rollback info
  canRollback: z.boolean().default(false),
  rolledBackAt: z.date().optional(),
  
  error: z.string().optional(),
});

export type CredentialRotation = z.infer<typeof CredentialRotationSchema>;

// Test connection result
export const ConnectionTestResultSchema = z.object({
  connectorId: z.string(),
  testedAt: z.date(),
  success: z.boolean(),
  
  // Response details
  responseTimeMs: z.number().int(),
  statusCode: z.number().int().optional(),
  errorMessage: z.string().optional(),
  
  // Validation results
  checks: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    message: z.string().optional(),
  })).default([]),
});

export type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;

// Validation helpers
export function validateIntegrationConnector(data: unknown): IntegrationConnector {
  return IntegrationConnectorSchema.parse(data);
}

export function validateConnectorRef(data: unknown): ConnectorRef {
  return ConnectorRefSchema.parse(data);
}

export function validateBotConnectorBinding(data: unknown): BotConnectorBinding {
  return BotConnectorBindingSchema.parse(data);
}