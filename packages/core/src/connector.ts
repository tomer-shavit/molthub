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
    webhookUrl: z.union([z.string().url(), CredentialRefSchema]).optional(),
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
    sslMode: z.enum(["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]).optional(),
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
  name: z.string()
    .min(1, "Name cannot be empty")
    .max(128, "Name must be 128 characters or less")
    .refine(val => val.trim().length > 0, "Name cannot be only whitespace"),
  description: z.string()
    .max(2000, "Description must be 2000 characters or less")
    .optional(),
  
  // Scope
  workspaceId: z.string(),
  
  // Type and configuration
  type: ConnectorType,
  config: ConnectionConfigSchema,
  
  // Status
  status: ConnectorStatus.default("PENDING"),
  statusMessage: z.string().optional(),
  lastTestedAt: z.union([z.date(), z.null()]).optional(),
  lastTestResult: z.enum(["SUCCESS", "FAILURE"]).optional(),
  lastError: z.string().optional(),
  
  // Sharing - if not shared, must have allowedInstanceIds
  isShared: z.boolean().default(true),
  allowedInstanceIds: z.array(z.string()).default([]),
  
  // Rotation
  rotationSchedule: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).optional(),
    lastRotatedAt: z.union([z.date(), z.null()]).optional(),
    nextRotationAt: z.union([z.date(), z.null()]).optional(),
  }).optional(),
  
  // Usage tracking
  usageCount: z.number().int().min(0, "Usage count cannot be negative").default(0),
  lastUsedAt: z.union([z.date(), z.null()]).optional(),
  
  tags: z.record(z.string())
    .default({})
    .refine(
      (tags) => Object.keys(tags).length <= 50,
      { message: "Too many tags (max 50)" }
    ),
  
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  createdBy: z.string(),
}).refine(
  (data) => {
    // If not shared, must have allowedInstanceIds
    if (!data.isShared && data.allowedInstanceIds.length === 0) {
      return false;
    }
    return true;
  },
  {
    message: "Non-shared connectors must specify allowedInstanceIds",
    path: ["allowedInstanceIds"],
  }
).refine(
  (data) => {
    // Shared connectors should not have allowedInstanceIds
    if (data.isShared && data.allowedInstanceIds.length > 0) {
      return false;
    }
    return true;
  },
  {
    message: "Shared connectors should not have allowedInstanceIds",
    path: ["allowedInstanceIds"],
  }
);

export type IntegrationConnector = z.infer<typeof IntegrationConnectorSchema>;

// Connector reference used in manifests (instead of embedding full credentials)
export const ConnectorRefSchema = z.object({
  connectorId: z.string().min(1, "connectorId cannot be empty"),
  workspaceId: z.string().min(1, "workspaceId cannot be empty"),
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
  healthStatus: z.enum(["HEALTHY", "UNHEALTHY", "UNKNOWN", "DEGRADED"]).default("UNKNOWN"),
  lastHealthCheck: z.date().optional(),
  
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type BotConnectorBinding = z.infer<typeof BotConnectorBindingSchema>;

// Test connection result
export const ConnectionTestResultSchema = z.object({
  connectorId: z.string(),
  testedAt: z.date(),
  success: z.boolean(),

  // Response details
  responseTimeMs: z.number().int().min(0, "Response time cannot be negative"),
  statusCode: z.number().int().optional(),
  errorMessage: z.string().optional(),
  errorCode: z.string().optional(),

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