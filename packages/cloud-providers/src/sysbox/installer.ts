/**
 * Sysbox Auto-Installer Module
 *
 * Attempts to install Sysbox automatically on the current platform.
 * Used by DockerContainerTarget to auto-install before deployment,
 * matching the behavior of cloud providers (EC2/GCE/Azure) that
 * install Sysbox in their VM startup scripts.
 *
 * Platform strategy:
 * - Linux/WSL2: Install via official script with sudo -n (non-interactive)
 * - macOS: Create Lima VM with Sysbox template (no sudo needed)
 * - Windows native: Return manual instructions for WSL2 setup
 */

import { execFile } from "child_process";
import {
  detectPlatform,
  detectSysboxCapability,
  getSysboxInstallCommand,
  resetCache,
} from "./detect";
import type { Platform, SysboxCapability } from "./types";

const INSTALL_TIMEOUT_MS = 300_000; // 5 minutes for install
const DOCKER_RESTART_TIMEOUT_MS = 30_000;

/**
 * Result of a Sysbox auto-install attempt.
 */
export interface SysboxInstallResult {
  /** Whether installation succeeded */
  success: boolean;
  /** Human-readable status message */
  message: string;
  /** If true, the user must run a command manually (e.g., sudo requires password) */
  requiresManualAction?: boolean;
  /** The command the user should run manually */
  manualCommand?: string;
}

type LogCallback = (line: string, stream: "stdout" | "stderr") => void;

/**
 * Run a command and return stdout. Rejects on non-zero exit.
 */
function runInstallCommand(
  cmd: string,
  args: string[],
  timeoutMs: number = INSTALL_TIMEOUT_MS,
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
 * Attempt to auto-install Sysbox on the current platform.
 *
 * This function is designed to be called from the Docker deployment flow
 * (DockerContainerTarget) when Sysbox is not detected. It mirrors what
 * cloud providers do in their startup scripts.
 *
 * @param logCallback - Optional callback for streaming install progress
 * @returns Install result with success/failure and manual fallback instructions
 */
export async function attemptSysboxInstall(
  logCallback?: LogCallback,
): Promise<SysboxInstallResult> {
  const log = (msg: string, stream: "stdout" | "stderr" = "stdout") => {
    logCallback?.(msg, stream);
  };

  // Check if already installed (avoid unnecessary work)
  const capability = await detectSysboxCapability({ skipCache: true });
  if (capability.available === "available") {
    return { success: true, message: "Sysbox is already installed" };
  }

  const platform = detectPlatform();
  log(`Platform detected: ${platform}`);

  switch (platform) {
    case "linux":
    case "wsl2":
      return installOnLinux(platform, capability, log);
    case "macos":
      return installOnMacOS(capability, log);
    case "windows-native":
      return {
        success: false,
        message: "Sysbox requires Linux. Use WSL2 on Windows.",
        requiresManualAction: true,
        manualCommand: "wsl --install -d Ubuntu",
      };
    default:
      return {
        success: false,
        message: `Unsupported platform: ${platform}`,
      };
  }
}

/**
 * Install Sysbox on Linux or WSL2 using sudo -n (non-interactive).
 *
 * If sudo requires a password, returns manual instructions instead of blocking.
 */
async function installOnLinux(
  platform: Platform,
  capability: SysboxCapability,
  log: (msg: string, stream?: "stdout" | "stderr") => void,
): Promise<SysboxInstallResult> {
  // WSL2: Check systemd first
  if (platform === "wsl2") {
    const systemdResult = await checkSystemd(log);
    if (!systemdResult.ok) {
      return {
        success: false,
        message: systemdResult.reason,
        requiresManualAction: true,
        manualCommand:
          'echo -e "[boot]\\nsystemd=true" | sudo tee /etc/wsl.conf && wsl.exe --shutdown',
      };
    }
  }

  const installCommand = capability.installCommand ?? getSysboxInstallCommand();
  const manualCommand = `sudo bash -c '${installCommand}' && sudo systemctl restart docker`;

  log("Attempting Sysbox installation (requires sudo)...");

  // Try non-interactive sudo
  try {
    await runInstallCommand(
      "sudo",
      ["-n", "bash", "-c", installCommand],
      INSTALL_TIMEOUT_MS,
    );
    log("Sysbox install script completed");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // sudo -n fails with "password is required" when interactive auth needed
    if (errorMsg.includes("password") || errorMsg.includes("sudo")) {
      log("Sudo requires a password — manual installation needed", "stderr");
      return {
        success: false,
        message: "Sudo requires a password. Run the install command manually.",
        requiresManualAction: true,
        manualCommand,
      };
    }

    // Other failure (network, script error, etc.)
    log(`Install failed: ${errorMsg}`, "stderr");
    return {
      success: false,
      message: `Sysbox installation failed: ${errorMsg}`,
      requiresManualAction: true,
      manualCommand,
    };
  }

  // Restart Docker to pick up the new runtime
  log("Restarting Docker to register Sysbox runtime...");
  try {
    await runInstallCommand(
      "sudo",
      ["-n", "systemctl", "restart", "docker"],
      DOCKER_RESTART_TIMEOUT_MS,
    );
    log("Docker restarted successfully");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Docker restart failed: ${errorMsg}`, "stderr");
    return {
      success: false,
      message: `Sysbox installed but Docker restart failed: ${errorMsg}`,
      requiresManualAction: true,
      manualCommand: "sudo systemctl restart docker",
    };
  }

  // Verify installation
  return verifyInstallation(log);
}

/**
 * Install Sysbox on macOS via Lima VM.
 *
 * Lima and limactl are userspace tools that don't require sudo.
 */
async function installOnMacOS(
  capability: SysboxCapability,
  log: (msg: string, stream?: "stdout" | "stderr") => void,
): Promise<SysboxInstallResult> {
  // Check if Lima is installed
  let limaInstalled = false;
  try {
    await runInstallCommand("limactl", ["--version"], 10_000);
    limaInstalled = true;
  } catch {
    // Lima not found
  }

  if (!limaInstalled) {
    // Try installing Lima via Homebrew
    log("Lima not found — installing via Homebrew...");
    try {
      await runInstallCommand("brew", ["install", "lima"], INSTALL_TIMEOUT_MS);
      log("Lima installed successfully");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Lima installation failed: ${errorMsg}`, "stderr");
      return {
        success: false,
        message: `Failed to install Lima: ${errorMsg}`,
        requiresManualAction: true,
        manualCommand: "brew install lima && limactl start --name=clawster template://sysbox",
      };
    }
  }

  // Check if clawster Lima VM already exists
  const existingVm = await getExistingLimaVm(log);
  if (existingVm === "running") {
    return verifyInstallation(log);
  }

  if (existingVm === "stopped") {
    log("Starting existing Clawster Lima VM...");
    try {
      await runInstallCommand("limactl", ["start", "clawster"], INSTALL_TIMEOUT_MS);
      log("Lima VM started");
      return verifyInstallation(log);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to start Lima VM: ${errorMsg}`,
        requiresManualAction: true,
        manualCommand: "limactl start clawster",
      };
    }
  }

  // Create new Lima VM with Sysbox template
  log("Creating Lima VM with Sysbox template...");
  try {
    await runInstallCommand(
      "limactl",
      ["start", "--name=clawster", "template://sysbox"],
      INSTALL_TIMEOUT_MS,
    );
    log("Lima VM with Sysbox created successfully");
    return verifyInstallation(log);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Lima VM creation failed: ${errorMsg}`, "stderr");
    return {
      success: false,
      message: `Failed to create Lima VM: ${errorMsg}`,
      requiresManualAction: true,
      manualCommand: capability.installCommand ?? "limactl start --name=clawster template://sysbox",
    };
  }
}

/**
 * Check if systemd is running (required for Sysbox on WSL2).
 */
async function checkSystemd(
  log: (msg: string, stream?: "stdout" | "stderr") => void,
): Promise<{ ok: boolean; reason: string }> {
  try {
    const pid1 = await runInstallCommand("ps", ["-p", "1", "-o", "comm="], 5_000);
    if (pid1.trim() === "systemd") {
      return { ok: true, reason: "systemd is running" };
    }
    log("WSL2: systemd is not enabled (required for Sysbox)", "stderr");
    return {
      ok: false,
      reason: "WSL2 requires systemd enabled for Sysbox. Enable it in /etc/wsl.conf and restart WSL.",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Warning: Could not detect init system (${errorMsg}) — proceeding with install`, "stderr");
    return { ok: true, reason: "Could not determine init system, proceeding" };
  }
}

/**
 * Check if a clawster Lima VM already exists.
 */
async function getExistingLimaVm(
  log: (msg: string, stream?: "stdout" | "stderr") => void,
): Promise<"running" | "stopped" | "none"> {
  try {
    const output = await runInstallCommand("limactl", ["list", "--json"], 10_000);
    const vms = JSON.parse(output) as Array<{ name: string; status: string }>;
    const clawsterVm = vms.find((vm) => vm.name === "clawster");
    if (!clawsterVm) {
      return "none";
    }
    return clawsterVm.status === "Running" ? "running" : "stopped";
  } catch {
    return "none";
  }
}

const VERIFY_RETRIES = 3;
const VERIFY_DELAY_MS = 2_000;

/**
 * Verify Sysbox is actually available after installation.
 * Retries a few times since Docker may need a moment to register the new runtime.
 */
async function verifyInstallation(
  log: (msg: string, stream?: "stdout" | "stderr") => void,
): Promise<SysboxInstallResult> {
  for (let attempt = 1; attempt <= VERIFY_RETRIES; attempt++) {
    resetCache();
    const capability = await detectSysboxCapability({ skipCache: true });

    if (capability.available === "available") {
      const versionInfo = capability.version ? ` (v${capability.version})` : "";
      log(`Sysbox verified${versionInfo} — secure sandbox mode available`);
      return {
        success: true,
        message: `Sysbox installed and verified${versionInfo}`,
      };
    }

    if (attempt < VERIFY_RETRIES) {
      log(`Sysbox not yet detected (attempt ${attempt}/${VERIFY_RETRIES}), retrying...`);
      await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS * attempt));
    } else {
      log("Sysbox installation could not be verified", "stderr");
      return {
        success: false,
        message: `Installation completed but Sysbox not detected: ${capability.reason ?? "unknown reason"}`,
        requiresManualAction: true,
        manualCommand: capability.installCommand,
      };
    }
  }

  // Unreachable, but TypeScript needs it
  return { success: false, message: "Verification failed" };
}
