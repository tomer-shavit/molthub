/**
 * OpenClaw Configuration Transformer
 *
 * Centralizes configuration transformations required for OpenClaw compatibility.
 * Each deployment target may have slightly different transformation needs,
 * so this module provides both a default transformer and customization options.
 *
 * Transformations handled:
 * - gateway.host -> gateway.bind (OpenClaw uses "bind" not "host")
 * - Root-level sandbox -> agents.defaults.sandbox
 * - Remove channels.*.enabled flags (not valid in OpenClaw config)
 * - Remove skills.allowUnverified (deprecated field)
 */

export interface TransformOptions {
  /**
   * Whether to rename gateway.host to gateway.bind.
   * Default: true
   */
  renameGatewayHost?: boolean;

  /**
   * Whether to relocate root-level sandbox config to agents.defaults.sandbox.
   * Default: true
   */
  relocateSandbox?: boolean;

  /**
   * Whether to remove enabled flags from channel configs.
   * Default: true
   */
  removeChannelEnabledFlags?: boolean;

  /**
   * Whether to remove deprecated fields like skills.allowUnverified.
   * Default: true
   */
  removeDeprecatedFields?: boolean;

  /**
   * Additional custom transformations to apply.
   */
  customTransforms?: Array<(config: Record<string, unknown>) => Record<string, unknown>>;
}

const DEFAULT_OPTIONS: Required<Omit<TransformOptions, "customTransforms">> = {
  renameGatewayHost: true,
  relocateSandbox: true,
  removeChannelEnabledFlags: true,
  removeDeprecatedFields: true,
};

/**
 * Transform an OpenClaw configuration object for deployment.
 *
 * @param config - Raw configuration object
 * @param options - Transformation options
 * @returns Transformed configuration ready for OpenClaw
 */
export function transformConfig(
  config: Record<string, unknown>,
  options: TransformOptions = {}
): Record<string, unknown> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let result = deepClone(config);

  if (opts.renameGatewayHost) {
    result = transformGatewayHost(result);
  }

  if (opts.relocateSandbox) {
    result = relocateSandboxConfig(result);
  }

  if (opts.removeChannelEnabledFlags) {
    result = removeChannelEnabledFlags(result);
  }

  if (opts.removeDeprecatedFields) {
    result = removeDeprecatedFields(result);
  }

  // Apply custom transforms
  for (const transform of options.customTransforms ?? []) {
    result = transform(result);
  }

  return result;
}

/**
 * Transform gateway.host to gateway.bind for OpenClaw compatibility.
 * OpenClaw uses "bind" instead of "host" for the gateway address.
 */
function transformGatewayHost(config: Record<string, unknown>): Record<string, unknown> {
  const gateway = config.gateway as Record<string, unknown> | undefined;
  if (gateway && "host" in gateway && !("bind" in gateway)) {
    const { host, ...rest } = gateway;
    return { ...config, gateway: { ...rest, bind: host } };
  }
  return config;
}

/**
 * Relocate root-level sandbox config to agents.defaults.sandbox.
 * OpenClaw expects sandbox config under agents.defaults, not at root level.
 */
function relocateSandboxConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (!config.sandbox) return config;

  const { sandbox, ...rest } = config;
  const agents = (rest.agents ?? {}) as Record<string, unknown>;
  const defaults = (agents.defaults ?? {}) as Record<string, unknown>;

  // Only relocate if not already present in agents.defaults
  if (!defaults.sandbox) {
    return {
      ...rest,
      agents: {
        ...agents,
        defaults: {
          ...defaults,
          sandbox,
        },
      },
    };
  }

  return config;
}

/**
 * Remove enabled flags from channel configs.
 * OpenClaw doesn't use enabled flags - presence in config means the channel is active.
 */
function removeChannelEnabledFlags(config: Record<string, unknown>): Record<string, unknown> {
  const channels = config.channels as Record<string, unknown> | undefined;
  if (!channels) return config;

  const transformedChannels: Record<string, unknown> = {};
  for (const [name, channelConfig] of Object.entries(channels)) {
    if (channelConfig && typeof channelConfig === "object") {
      const { enabled, ...rest } = channelConfig as Record<string, unknown>;
      transformedChannels[name] = rest;
    } else {
      transformedChannels[name] = channelConfig;
    }
  }

  return { ...config, channels: transformedChannels };
}

/**
 * Remove deprecated fields from the config.
 * Currently handles: skills.allowUnverified
 */
function removeDeprecatedFields(config: Record<string, unknown>): Record<string, unknown> {
  const skills = config.skills as Record<string, unknown> | undefined;
  if (skills && "allowUnverified" in skills) {
    const { allowUnverified, ...rest } = skills;
    return { ...config, skills: rest };
  }
  return config;
}

/**
 * Deep clone an object using JSON serialization.
 * Note: This will not preserve functions, undefined values, or circular references.
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
