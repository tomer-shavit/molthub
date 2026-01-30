import type { OpenClawFullConfig } from "../openclaw-config";
import type { AiGatewaySettings, ModelProviderConfig, ModelsConfig } from "./config";

/**
 * Build a gateway provider entry from AI Gateway settings.
 * Returns a ModelProviderConfig suitable for injection into models.providers.
 */
export function buildGatewayProvider(settings: AiGatewaySettings): ModelProviderConfig {
  if (!settings.gatewayUrl) {
    throw new Error("AI Gateway URL is required when gateway is enabled");
  }

  return {
    baseUrl: settings.gatewayUrl,
    apiKey: settings.gatewayApiKey,
    auth: "api_key",
    api: settings.api ?? "anthropic-messages",
  };
}

/**
 * Rewrite a model reference to route through the gateway provider.
 *
 * OpenClaw convention: `<gateway-provider>/<underlying-provider>/<model-id>`
 * Example: `anthropic/claude-sonnet-4-20250514` → `vercel-ai-gateway/anthropic/claude-sonnet-4-20250514`
 */
export function rewriteModelRef(originalRef: string, gatewayProviderName: string): string {
  return `${gatewayProviderName}/${originalRef}`;
}

/**
 * Build a fallback chain: the original direct model ref serves as the fallback
 * when the gateway is unavailable.
 */
export function buildFallbackChain(originalRef: string, existingFallbacks?: string[]): string[] {
  const fallbacks = [originalRef];
  if (existingFallbacks) {
    for (const fb of existingFallbacks) {
      if (!fallbacks.includes(fb)) {
        fallbacks.push(fb);
      }
    }
  }
  return fallbacks;
}

/**
 * Inject an AI Gateway provider into an OpenClawFullConfig.
 *
 * When enabled:
 * 1. Adds the gateway provider to `models.providers`
 * 2. Rewrites `agents.defaults.model.primary` to route through the gateway
 * 3. Sets `agents.defaults.model.fallbacks` to include the original direct ref
 *
 * When disabled or settings incomplete: returns the config unchanged.
 */
export function injectGatewayIntoConfig(
  config: OpenClawFullConfig,
  settings: AiGatewaySettings,
): OpenClawFullConfig {
  if (!settings.enabled || !settings.gatewayUrl) {
    return config;
  }

  const providerName = settings.providerName ?? "vercel-ai-gateway";
  const gatewayProvider = buildGatewayProvider(settings);

  // Build the models.providers record, merging with any existing providers
  const existingModels = config.models;
  const existingProviders = existingModels?.providers ?? {};

  const modelsSection: ModelsConfig = {
    mode: existingModels?.mode ?? "merge",
    providers: {
      ...existingProviders,
      [providerName]: gatewayProvider,
    },
  };

  // Rewrite model ref if agents.defaults.model.primary exists
  const currentModel = config.agents?.defaults?.model;
  const currentDefaults = config.agents?.defaults;
  let updatedAgents = config.agents;

  if (currentModel?.primary && currentDefaults) {
    const rewrittenPrimary = rewriteModelRef(currentModel.primary, providerName);
    const fallbacks = buildFallbackChain(currentModel.primary, currentModel.fallbacks);

    updatedAgents = {
      ...config.agents,
      defaults: {
        ...currentDefaults,
        model: {
          primary: rewrittenPrimary,
          fallbacks,
        },
      },
    };
  }

  return {
    ...config,
    models: modelsSection,
    agents: updatedAgents,
  };
}
