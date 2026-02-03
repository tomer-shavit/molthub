/**
 * Security Configuration Module
 *
 * Exports security configuration types and helpers for
 * Clawster deployment targets.
 */

export {
  SecurityTier,
  SandboxConfig,
  GatewaySecurityConfig,
  ChannelSecurityConfig,
  LoggingSecurityConfig,
  SecurityConfig,
  getSecurityTierForTarget,
  targetSupportsSandbox,
  getSecurityDefaults,
  applySecurityDefaults,
  getSecuritySummary,
} from "./security-config";
