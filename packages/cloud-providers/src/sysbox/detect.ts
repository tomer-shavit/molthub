/**
 * Sysbox Detection Module
 *
 * Platform-aware detection of Sysbox runtime availability.
 * Supports Linux, WSL2, and macOS (via Lima VM).
 */

import { execFile } from "child_process";
import { readFileSync } from "fs";
import { platform as osPlatform } from "os";
import type {
  Platform,
  SysboxCapability,
  SysboxAvailability,
  SysboxInstallMethod,
  SysboxDetectionOptions,
  DockerRuntimes,
  LimaVmInfo,
} from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Sysbox installation constants.
 * Using a versioned release tag for reproducibility and security.
 */
const SYSBOX_RECOMMENDED_VERSION = "v0.6.4";
const SYSBOX_INSTALL_SCRIPT_URL_TEMPLATE =
  "https://raw.githubusercontent.com/nestybox/sysbox/{version}/scr/install.sh";

/**
 * Generate a safer Sysbox install command that downloads to a temp file first.
 * This avoids the dangerous `curl | bash` pattern by:
 * 1. Downloading to a temporary file
 * 2. Making it executable
 * 3. Running it
 * 4. Cleaning up
 *
 * @param version - Sysbox version tag (default: SYSBOX_RECOMMENDED_VERSION)
 */
export function getSysboxInstallCommand(version: string = SYSBOX_RECOMMENDED_VERSION): string {
  const scriptUrl = SYSBOX_INSTALL_SCRIPT_URL_TEMPLATE.replace("{version}", version);
  return [
    `SYSBOX_INSTALL_SCRIPT="/tmp/sysbox-install-$$.sh"`,
    `curl -fsSL -o "$SYSBOX_INSTALL_SCRIPT" "${scriptUrl}"`,
    `chmod +x "$SYSBOX_INSTALL_SCRIPT"`,
    `"$SYSBOX_INSTALL_SCRIPT"`,
    `rm -f "$SYSBOX_INSTALL_SCRIPT"`,
  ].join(" && ");
}

/**
 * Get the recommended Sysbox version for installation.
 */
export function getSysboxRecommendedVersion(): string {
  return SYSBOX_RECOMMENDED_VERSION;
}

// Cache detection results to avoid repeated shell calls
let cachedCapability: SysboxCapability | null = null;
let cachedPlatform: Platform | null = null;
// Promise-based caching to prevent duplicate concurrent detections
let pendingDetection: Promise<SysboxCapability> | null = null;

/**
 * Execute a command and return stdout.
 */
function runCommand(
  cmd: string,
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Detect the current platform.
 */
export function detectPlatform(): Platform {
  if (cachedPlatform) {
    return cachedPlatform;
  }

  const p = osPlatform();

  if (p === "darwin") {
    cachedPlatform = "macos";
    return "macos";
  }

  if (p === "win32") {
    cachedPlatform = "windows-native";
    return "windows-native";
  }

  if (p === "linux") {
    // Check for WSL2 via /proc/version
    try {
      const release = readFileSync("/proc/version", "utf8");
      if (release.toLowerCase().includes("microsoft")) {
        cachedPlatform = "wsl2";
        return "wsl2";
      }
    } catch {
      // Not available, assume native Linux
    }
    cachedPlatform = "linux";
    return "linux";
  }

  // Default to linux for unknown platforms
  cachedPlatform = "linux";
  return "linux";
}

/**
 * Reset the cached platform and capability (for testing).
 */
export function resetCache(): void {
  cachedCapability = null;
  cachedPlatform = null;
  pendingDetection = null;
}

/**
 * Detect Sysbox capability for the current platform.
 * Uses promise-based caching to prevent duplicate concurrent detections.
 */
export async function detectSysboxCapability(
  options: SysboxDetectionOptions = {}
): Promise<SysboxCapability> {
  const { skipCache = false, timeout = DEFAULT_TIMEOUT_MS } = options;

  // Return cached result if available and caching is enabled
  if (!skipCache && cachedCapability) {
    return cachedCapability;
  }

  // If there's already a detection in progress, wait for it
  if (!skipCache && pendingDetection) {
    return pendingDetection;
  }

  // Start new detection
  const detection = performDetection(timeout);

  if (!skipCache) {
    pendingDetection = detection;
  }

  try {
    const capability = await detection;
    if (!skipCache) {
      cachedCapability = capability;
    }
    return capability;
  } finally {
    if (!skipCache) {
      pendingDetection = null;
    }
  }
}

/**
 * Internal detection logic.
 */
async function performDetection(timeout: number): Promise<SysboxCapability> {
  const platform = detectPlatform();

  switch (platform) {
    case "linux":
      return checkLinuxSysbox(timeout);
    case "wsl2":
      return checkWsl2Sysbox(timeout);
    case "macos":
      return checkMacosSysbox(timeout);
    case "windows-native":
      return {
        available: "unavailable",
        reason: "Sysbox requires Linux. Use WSL2 on Windows.",
        installMethod: "wsl2",
        installCommand: "wsl --install -d Ubuntu",
      };
    default:
      return {
        available: "unavailable",
        reason: `Unknown platform: ${platform}`,
      };
  }
}

/**
 * Check for Sysbox on native Linux.
 */
async function checkLinuxSysbox(timeout: number): Promise<SysboxCapability> {
  // First, check if Docker is installed
  try {
    await runCommand("docker", ["--version"], timeout);
  } catch {
    return {
      available: "unavailable",
      reason: "Docker is not installed",
      installMethod: "apt",
      installCommand: "curl -fsSL https://get.docker.com | bash",
    };
  }

  // Check Docker runtimes for sysbox-runc
  try {
    const runtimesJson = await runCommand(
      "docker",
      ["info", "--format", "{{json .Runtimes}}"],
      timeout
    );

    const runtimes: DockerRuntimes = JSON.parse(runtimesJson);

    if ("sysbox-runc" in runtimes) {
      // Sysbox is installed, try to get version
      const version = await getSysboxVersion(timeout);
      return {
        available: "available",
        version,
        installMethod: "apt",
      };
    }
  } catch {
    // Docker info failed, Sysbox likely not installed
  }

  // Sysbox not found, provide installation instructions
  const distro = await detectLinuxDistro(timeout);

  return {
    available: "not-installed",
    reason: "Sysbox runtime not registered with Docker",
    installMethod: distro.installMethod,
    installCommand: distro.installCommand,
  };
}

/**
 * Check for Sysbox on WSL2.
 * WSL2 with systemd enabled can run Sysbox like native Linux.
 */
async function checkWsl2Sysbox(timeout: number): Promise<SysboxCapability> {
  // Check if systemd is enabled (required for Sysbox on WSL2)
  try {
    const systemdPid = await runCommand("ps", ["-p", "1", "-o", "comm="], timeout);
    const hasSystemd = systemdPid.trim() === "systemd";

    if (!hasSystemd) {
      return {
        available: "not-installed",
        reason: "WSL2 requires systemd enabled for Sysbox. Enable systemd in /etc/wsl.conf",
        installMethod: "wsl2",
        installCommand:
          'echo -e "[boot]\\nsystemd=true" | sudo tee /etc/wsl.conf && wsl.exe --shutdown',
      };
    }
  } catch {
    // Can't determine systemd status, continue with check
  }

  // WSL2 with systemd behaves like native Linux
  return checkLinuxSysbox(timeout);
}

/**
 * Check for Sysbox on macOS via Lima VM.
 */
async function checkMacosSysbox(timeout: number): Promise<SysboxCapability> {
  // Check if Lima is installed
  try {
    await runCommand("limactl", ["--version"], timeout);
  } catch {
    return {
      available: "not-installed",
      reason: "Lima is not installed (required for Sysbox on macOS)",
      installMethod: "lima",
      installCommand: "brew install lima && limactl start --name=clawster template://sysbox",
    };
  }

  // Check if there's a Sysbox-enabled Lima VM
  const vms = await listLimaVms(timeout);
  const sysboxVm = vms.find((vm) => vm.hasSysbox && vm.status === "Running");

  if (sysboxVm) {
    return {
      available: "available",
      version: sysboxVm.sysboxVersion,
      installMethod: "lima",
    };
  }

  // Check if there's a stopped Sysbox VM
  const stoppedSysboxVm = vms.find((vm) => vm.hasSysbox);
  if (stoppedSysboxVm) {
    return {
      available: "not-installed",
      reason: `Sysbox Lima VM "${stoppedSysboxVm.name}" exists but is not running`,
      installMethod: "lima",
      installCommand: `limactl start ${stoppedSysboxVm.name}`,
    };
  }

  // No Sysbox VM found
  return {
    available: "not-installed",
    reason: "No Sysbox-enabled Lima VM found",
    installMethod: "lima",
    installCommand: "limactl start --name=clawster template://sysbox",
  };
}

/**
 * List Lima VMs and check for Sysbox support.
 */
async function listLimaVms(timeout: number): Promise<LimaVmInfo[]> {
  try {
    const output = await runCommand("limactl", ["list", "--json"], timeout);
    const vms: Array<{ name: string; status: string; vmType?: string }> = JSON.parse(output);

    return vms.map((vm) => ({
      name: vm.name,
      status: vm.status === "Running" ? "Running" : "Stopped",
      // Lima VMs with sysbox template have "sysbox" in their config
      hasSysbox: vm.vmType?.toLowerCase().includes("sysbox") ?? false,
    }));
  } catch {
    return [];
  }
}

/**
 * Get the installed Sysbox version.
 */
async function getSysboxVersion(timeout: number): Promise<string | undefined> {
  try {
    // Try sysbox-runc --version
    const output = await runCommand("sysbox-runc", ["--version"], timeout);
    const match = output.match(/sysbox-runc version (\S+)/);
    return match?.[1];
  } catch {
    // sysbox-runc not in PATH, try querying Docker
    try {
      const runtimesJson = await runCommand(
        "docker",
        ["info", "--format", "{{json .Runtimes}}"],
        timeout
      );
      const runtimes: DockerRuntimes = JSON.parse(runtimesJson);
      const sysboxPath = runtimes["sysbox-runc"]?.path;
      if (sysboxPath) {
        const output = await runCommand(sysboxPath, ["--version"], timeout);
        const match = output.match(/version (\S+)/);
        return match?.[1];
      }
    } catch {
      // Can't determine version
    }
  }
  return undefined;
}

/**
 * Detect Linux distribution for appropriate install instructions.
 */
async function detectLinuxDistro(
  timeout: number
): Promise<{ installMethod: SysboxInstallMethod; installCommand: string }> {
  // Use the safer install command that downloads to a temp file first
  const safeInstallCommand = getSysboxInstallCommand();

  try {
    const osRelease = readFileSync("/etc/os-release", "utf8");
    const idMatch = osRelease.match(/^ID=(.+)$/m);
    const id = idMatch?.[1]?.replace(/"/g, "").toLowerCase();

    if (id === "ubuntu" || id === "debian" || id === "linuxmint" || id === "pop") {
      return {
        installMethod: "apt",
        installCommand: safeInstallCommand,
      };
    }

    if (id === "fedora" || id === "rhel" || id === "centos" || id === "rocky" || id === "almalinux") {
      return {
        installMethod: "rpm",
        installCommand: safeInstallCommand,
      };
    }
  } catch {
    // Can't read os-release
  }

  // Default to manual installation
  return {
    installMethod: "manual",
    installCommand: safeInstallCommand,
  };
}

/**
 * Check if Sysbox is available (convenience function).
 */
export async function isSysboxAvailable(
  options: SysboxDetectionOptions = {}
): Promise<boolean> {
  const capability = await detectSysboxCapability(options);
  return capability.available === "available";
}

/**
 * Get the recommended runtime based on Sysbox availability.
 */
export async function getRecommendedRuntime(
  options: SysboxDetectionOptions = {}
): Promise<"sysbox-runc" | "runc"> {
  const available = await isSysboxAvailable(options);
  return available ? "sysbox-runc" : "runc";
}
