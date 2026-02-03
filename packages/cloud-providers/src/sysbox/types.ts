/**
 * Sysbox Capability Types
 *
 * Type definitions for Sysbox runtime detection and configuration.
 * Sysbox enables secure Docker-in-Docker without --privileged or socket mounting.
 */

/**
 * Sysbox availability status.
 */
export type SysboxAvailability =
  | "available" // Sysbox installed and working
  | "not-installed" // Not installed but could be
  | "unavailable" // Platform doesn't support Sysbox
  | "unsupported"; // Target type doesn't use Docker

/**
 * Sysbox capability detection result.
 */
export interface SysboxCapability {
  /** Availability status */
  available: SysboxAvailability;
  /** Sysbox version if installed */
  version?: string;
  /** Installation method for this platform */
  installMethod?: SysboxInstallMethod;
  /** Installation command or instructions */
  installCommand?: string;
  /** Reason for unavailability (if not available) */
  reason?: string;
}

/**
 * Supported Sysbox installation methods.
 */
export type SysboxInstallMethod =
  | "apt" // Debian/Ubuntu
  | "rpm" // RHEL/CentOS/Fedora
  | "lima" // macOS via Lima VM
  | "wsl2" // Windows Subsystem for Linux 2
  | "manual"; // Manual installation required

/**
 * Platform detection result.
 */
export type Platform =
  | "linux" // Native Linux
  | "macos" // macOS (requires Lima)
  | "wsl2" // Windows Subsystem for Linux 2
  | "windows-native"; // Native Windows (unsupported)

/**
 * Runtime configuration for Docker containers.
 */
export interface RuntimeConfig {
  /** Container runtime to use */
  runtime?: ContainerRuntime;
  /** Whether sandbox mode is enabled */
  sandboxEnabled: boolean;
  /** Reason why Sysbox is unavailable (if applicable) */
  sysboxUnavailableReason?: string;
}

/**
 * Supported container runtimes.
 */
export type ContainerRuntime = "runc" | "sysbox-runc";

/**
 * Docker info runtime structure (from `docker info --format '{{json .Runtimes}}'`).
 */
export interface DockerRuntimes {
  [key: string]: {
    path?: string;
    runtimeArgs?: string[];
  };
}

/**
 * Sysbox detection options.
 */
export interface SysboxDetectionOptions {
  /** Skip cache and always run detection */
  skipCache?: boolean;
  /** Timeout for detection commands in ms */
  timeout?: number;
}

/**
 * Lima VM info for macOS Sysbox detection.
 */
export interface LimaVmInfo {
  name: string;
  status: "Running" | "Stopped" | "Unknown";
  hasSysbox: boolean;
  sysboxVersion?: string;
}
