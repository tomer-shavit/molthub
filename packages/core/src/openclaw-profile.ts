import { z } from "zod";

// =============================================================================
// Multi-Instance Profile Isolation
// =============================================================================

/**
 * Minimum port gap between two OpenClaw gateway instances.
 * The docs recommend 20+ to leave room for auxiliary services.
 */
export const MIN_PORT_SPACING = 20;

/**
 * Represents a single OpenClaw profile for multi-instance isolation.
 *
 * Each profile gets:
 *   - Dedicated config file   (OPENCLAW_CONFIG_PATH)
 *   - Isolated state directory (OPENCLAW_STATE_DIR)
 *   - Separate workspace
 *   - Unique gateway port (spaced 20+ apart)
 *
 * Service naming:
 *   - macOS: bot.molt.<profileName>
 *   - Linux: openclaw-gateway-<profileName>.service
 */
export const OpenClawProfileSchema = z.object({
  /** Human-friendly profile name (also used in service names). */
  name: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
      "Profile name must be lowercase alphanumeric with optional hyphens, not starting/ending with hyphen",
    )
    .min(1)
    .max(63),

  /** Gateway port for this profile. */
  port: z.number().int().min(1).max(65535),

  /** Path to this profile's openclaw.json config. */
  configPath: z.string().min(1),

  /** Isolated state directory. */
  stateDir: z.string().min(1),

  /** Workspace root for this profile's agents. */
  workspace: z.string().min(1),

  /** Optional description. */
  description: z.string().optional(),

  /** Whether this profile is currently active. */
  enabled: z.boolean().default(true),
});
export type OpenClawProfile = z.infer<typeof OpenClawProfileSchema>;

// =============================================================================
// Multi-Profile Registry (validates port spacing)
// =============================================================================

export const OpenClawProfileRegistrySchema = z
  .object({
    profiles: z.array(OpenClawProfileSchema).min(1),
  })
  .refine(
    (data) => {
      const names = data.profiles.map((p) => p.name);
      return new Set(names).size === names.length;
    },
    { message: "Profile names must be unique" },
  )
  .refine(
    (data) => {
      const ports = data.profiles
        .filter((p) => p.enabled)
        .map((p) => p.port)
        .sort((a, b) => a - b);
      for (let i = 1; i < ports.length; i++) {
        if (ports[i] - ports[i - 1] < MIN_PORT_SPACING) {
          return false;
        }
      }
      return true;
    },
    {
      message: `Enabled profiles must have gateway ports spaced at least ${MIN_PORT_SPACING} apart`,
    },
  );
export type OpenClawProfileRegistry = z.infer<
  typeof OpenClawProfileRegistrySchema
>;

/**
 * Derive the platform-specific service name for a profile.
 */
export function serviceName(
  profileName: string,
  platform: "macos" | "linux",
): string {
  return platform === "macos"
    ? `bot.molt.${profileName}`
    : `openclaw-gateway-${profileName}.service`;
}

/**
 * Build environment variables for launching a profile's gateway.
 */
export function profileEnvVars(profile: OpenClawProfile): Record<string, string> {
  return {
    OPENCLAW_CONFIG_PATH: profile.configPath,
    OPENCLAW_STATE_DIR: profile.stateDir,
  };
}
