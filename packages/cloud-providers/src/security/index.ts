/**
 * Security Configuration Module
 *
 * Exports security configuration types and helpers for
 * Clawster deployment targets.
 *
 * DREAM ARCHITECTURE: All targets should use sandbox.mode: "all" with
 * full hardening (network: none, readOnlyRootfs, noNewPrivileges, dropCapabilities).
 * Use the async versions of functions for accurate Sysbox detection.
 *
 * ASYNC-FIRST DESIGN:
 * - Async functions (suffixed with "Async") are PREFERRED
 * - They perform actual Sysbox detection for Docker/Local targets
 * - Sync functions exist for legacy compatibility or non-async contexts
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════
export type {
  SecurityTier,
  SandboxConfig,
  GatewaySecurityConfig,
  ChannelSecurityConfig,
  LoggingSecurityConfig,
  SecurityConfig,
} from "./security-defaults";

// ═══════════════════════════════════════════════════════════════════════════════
// Security Defaults (security-defaults.ts)
// ═══════════════════════════════════════════════════════════════════════════════

// Tier helpers
export { getSecurityTierForTarget } from "./security-defaults";

// Sandbox support detection
export {
  targetSupportsSandbox, // @deprecated - use targetSupportsSandboxAsync
  targetSupportsSandboxAsync, // PREFERRED
} from "./security-defaults";

// Dream architecture helpers
export {
  getDreamSandboxConfig,
  getSysboxRequiredConfig,
  isSysboxInstallationRequired,
  isTargetReadyForSecureDeployment,
} from "./security-defaults";

// ═══════════════════════════════════════════════════════════════════════════════
// Security Applier (security-applier.ts)
// ═══════════════════════════════════════════════════════════════════════════════

// Get security defaults
export {
  getSecurityDefaults, // @deprecated - use getSecurityDefaultsAsync
  getSecurityDefaultsAsync, // PREFERRED
} from "./security-applier";

// Apply security defaults to config
export {
  applySecurityDefaults, // @deprecated - use applySecurityDefaultsAsync
  applySecurityDefaultsAsync, // PREFERRED
} from "./security-applier";

// ═══════════════════════════════════════════════════════════════════════════════
// Security Summary (security-summary.ts)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  getSecuritySummary, // @deprecated - use getSecuritySummaryAsync
  getSecuritySummaryAsync, // PREFERRED
} from "./security-summary";
