/**
 * Sysbox Capability Module
 *
 * Provides detection and configuration utilities for Sysbox runtime support.
 * Sysbox enables secure Docker-in-Docker for OpenClaw sandbox mode.
 */

// Types
export type {
  SysboxAvailability,
  SysboxCapability,
  SysboxInstallMethod,
  Platform,
  RuntimeConfig,
  ContainerRuntime,
  DockerRuntimes,
  SysboxDetectionOptions,
  LimaVmInfo,
} from "./types";

// Detection functions
export {
  detectPlatform,
  detectSysboxCapability,
  isSysboxAvailable,
  getRecommendedRuntime,
  resetCache,
  getSysboxInstallCommand,
  getSysboxRecommendedVersion,
} from "./detect";

// Installation
export { attemptSysboxInstall, type SysboxInstallResult } from "./installer";
