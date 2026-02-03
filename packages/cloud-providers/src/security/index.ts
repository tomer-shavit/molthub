/**
 * Security Configuration Module
 *
 * Exports security configuration types and helpers for
 * Clawster deployment targets.
 *
 * DREAM ARCHITECTURE: All targets should use sandbox.mode: "all" with
 * full hardening (network: none, readOnlyRootfs, noNewPrivileges, dropCapabilities).
 * Use the async versions of functions for accurate Sysbox detection.
 */

export {
  // Types
  SecurityTier,
  SandboxConfig,
  GatewaySecurityConfig,
  ChannelSecurityConfig,
  LoggingSecurityConfig,
  SecurityConfig,
  // Sync helpers (use async versions when possible)
  getSecurityTierForTarget,
  targetSupportsSandbox,
  getSecurityDefaults,
  applySecurityDefaults,
  getSecuritySummary,
  // Dream architecture helpers
  getDreamSandboxConfig,
  getSysboxRequiredConfig,
  isSysboxInstallationRequired,
  isTargetReadyForSecureDeployment,
  // Async helpers (PREFERRED - use these for accurate Sysbox detection)
  targetSupportsSandboxAsync,
  getSecurityDefaultsAsync,
  applySecurityDefaultsAsync,
  getSecuritySummaryAsync,
} from "./security-config";
