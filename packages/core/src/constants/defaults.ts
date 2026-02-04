/**
 * OpenClaw default configuration values.
 *
 * These constants are derived from the OpenClaw documentation and source code.
 * Reference: https://docs.openclaw.ai/gateway/configuration
 */

// Gateway defaults
export const DEFAULT_GATEWAY_PORT = 18789;
export const DEFAULT_PORT_SPACING = 20;

// Agent defaults
export const DEFAULT_TIMEOUT_SECONDS = 600;
export const DEFAULT_WORKSPACE = "~/openclaw";

// Session/message defaults
export const DEFAULT_HISTORY_LIMIT = 50;
export const DEFAULT_MEDIA_MAX_MB = 25;

// Logging defaults
export const DEFAULT_LOG_LEVEL = "info";

// Channel policy defaults (security model)
export const DEFAULT_DM_POLICY = "pairing";
export const DEFAULT_GROUP_POLICY = "allowlist";

// File permission defaults (security)
export const DEFAULT_CONFIG_FILE_MODE = "600";
export const DEFAULT_STATE_DIR_MODE = "700";

// Derived ports (relative to base gateway port)
export const DERIVED_PORT_OFFSETS = {
  BROWSER_CONTROL: 2,
  CANVAS_HOST: 4,
  CDP_START: 11,
  CDP_END: 110,
} as const;

// Sandbox defaults
export const DEFAULT_SANDBOX_MODE = "off";
export const DEFAULT_SANDBOX_SCOPE = "agent";
export const DEFAULT_WORKSPACE_ACCESS = "none";

// Tool execution defaults
export const DEFAULT_EXEC_BACKGROUND_MS = 10000;
export const DEFAULT_EXEC_TIMEOUT_SEC = 1800;

// Config apply defaults
export const DEFAULT_RESTART_DELAY_MS = 2000;
