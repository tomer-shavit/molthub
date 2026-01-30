import { z } from "zod";

/** String that may contain `${VAR}` env-var references. Defined locally to avoid circular import. */
const envString = z.string();

// =============================================================================
// Model API Types — matches OpenClaw's supported API protocols
// =============================================================================

export const ModelApiSchema = z.enum([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "github-copilot",
  "bedrock-converse-stream",
]);
export type ModelApi = z.infer<typeof ModelApiSchema>;

// =============================================================================
// Model Entry — rich metadata for individual models
// =============================================================================

export const ModelCostSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
});
export type ModelCost = z.infer<typeof ModelCostSchema>;

export const ModelEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  reasoning: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  cost: ModelCostSchema.optional(),
  contextWindow: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  params: z.record(z.unknown()).optional(),
  alias: z.string().optional(),
});
export type ModelEntry = z.infer<typeof ModelEntrySchema>;

// =============================================================================
// Model Provider Config — matches OpenClaw's ModelProviderConfig shape
// =============================================================================

export const ModelProviderConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: envString.optional(),
  auth: z.enum(["api_key", "oauth", "token"]).default("api_key"),
  api: ModelApiSchema.default("anthropic-messages"),
  headers: z.record(z.string()).optional(),
  models: z.array(z.union([z.string(), ModelEntrySchema])).optional(),
  compat: z.record(z.unknown()).optional(),
  authHeader: z.boolean().optional(),
});
export type ModelProviderConfig = z.infer<typeof ModelProviderConfigSchema>;

// =============================================================================
// Models Config Section — top-level config section for OpenClawConfigSchema
// =============================================================================

export const ModelsConfigSchema = z.object({
  providers: z.record(z.string(), ModelProviderConfigSchema).optional(),
  mode: z.enum(["merge", "replace"]).default("merge"),
});
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;

// =============================================================================
// AI Gateway Settings — stored on BotInstance DB, NOT in openclaw.json
// =============================================================================

export const AiGatewaySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  providerName: z.string().min(1).default("vercel-ai-gateway"),
  gatewayUrl: z.string().url().optional(),
  gatewayApiKey: z.string().min(1).optional(),
  api: ModelApiSchema.default("anthropic-messages"),
});
export type AiGatewaySettings = z.infer<typeof AiGatewaySettingsSchema>;
