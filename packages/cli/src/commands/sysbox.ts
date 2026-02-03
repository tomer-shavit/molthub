/**
 * Sysbox CLI Commands
 *
 * Commands for checking and installing Sysbox runtime.
 */

import chalk from "chalk";
import ora from "ora";
import { execSync, spawn } from "child_process";
import {
  detectPlatform,
  detectSysboxCapability,
  type SysboxCapability,
  type Platform,
} from "@clawster/cloud-providers";

/**
 * Display Sysbox status.
 */
export async function sysboxStatus(): Promise<void> {
  console.log(chalk.blue.bold("\n[SYSBOX] Runtime Status\n"));

  const spinner = ora("Detecting platform...").start();

  // Detect platform
  const platform = detectPlatform();
  spinner.text = "Checking Sysbox availability...";

  // Detect Sysbox capability
  const capability = await detectSysboxCapability({ skipCache: true });

  spinner.stop();

  // Display platform
  console.log(`${chalk.cyan("Platform:")} ${getPlatformDisplay(platform)}`);
  console.log();

  // Display Sysbox status
  const statusIcon = getStatusIcon(capability.available);
  const statusColor = getStatusColor(capability.available);
  console.log(`${chalk.cyan("Sysbox Status:")} ${statusIcon} ${statusColor(capability.available)}`);

  if (capability.version) {
    console.log(`${chalk.cyan("Version:")} ${capability.version}`);
  }

  if (capability.reason) {
    console.log(`${chalk.cyan("Details:")} ${chalk.gray(capability.reason)}`);
  }

  console.log();

  // Display sandbox support
  const sandboxSupported = capability.available === "available";
  if (sandboxSupported) {
    console.log(chalk.green("✓ OpenClaw sandbox mode is supported"));
    console.log(chalk.gray("  Containers will use --runtime=sysbox-runc"));
  } else {
    console.log(chalk.yellow("⚠ OpenClaw sandbox mode is NOT supported"));
    console.log(chalk.gray("  Containers will use default runc runtime"));
    console.log(chalk.gray("  Sandbox isolation will be disabled for Docker deployments"));
  }

  console.log();

  // Show installation instructions if not available
  if (capability.available === "not-installed" && capability.installCommand) {
    console.log(chalk.cyan("To install Sysbox:"));
    console.log(chalk.white(`  ${capability.installCommand}`));
    console.log();
    console.log(chalk.gray("Or run: clawster sysbox install"));
    console.log();
  }
}

/**
 * Install Sysbox for the current platform.
 */
export async function sysboxInstall(): Promise<void> {
  console.log(chalk.blue.bold("\n[SYSBOX] Installation\n"));

  const spinner = ora("Detecting platform...").start();

  const platform = detectPlatform();
  const capability = await detectSysboxCapability({ skipCache: true });

  spinner.stop();

  // Check if already installed
  if (capability.available === "available") {
    console.log(chalk.green("✓ Sysbox is already installed"));
    if (capability.version) {
      console.log(chalk.gray(`  Version: ${capability.version}`));
    }
    console.log();
    return;
  }

  // Check if platform supports Sysbox
  if (capability.available === "unavailable") {
    console.log(chalk.red("✗ Sysbox is not available on this platform"));
    console.log(chalk.gray(`  ${capability.reason}`));
    console.log();
    return;
  }

  // Check if we have an install command
  if (!capability.installCommand) {
    console.log(chalk.red("✗ No installation command available for this platform"));
    console.log(chalk.gray("Please install Sysbox manually:"));
    console.log(chalk.gray("https://github.com/nestybox/sysbox#installation"));
    console.log();
    return;
  }

  // Show installation plan
  console.log(chalk.cyan("Platform:"), getPlatformDisplay(platform));
  console.log(chalk.cyan("Install method:"), capability.installMethod ?? "manual");
  console.log();
  console.log(chalk.cyan("Installation command:"));
  console.log(chalk.white(`  ${capability.installCommand}`));
  console.log();

  // Platform-specific installation
  switch (platform) {
    case "linux":
    case "wsl2":
      await installLinuxSysbox(capability);
      break;
    case "macos":
      await installMacosSysbox(capability);
      break;
    default:
      console.log(chalk.red("✗ Automatic installation not supported for this platform"));
      console.log(chalk.gray("Please run the installation command manually."));
  }
}

/**
 * Install Sysbox on Linux/WSL2.
 */
async function installLinuxSysbox(capability: SysboxCapability): Promise<void> {
  console.log(chalk.yellow("⚠ This requires sudo permissions"));
  console.log();

  // Check for sudo
  try {
    execSync("sudo -n true", { stdio: "pipe" });
  } catch {
    console.log(chalk.gray("Requesting sudo permissions..."));
    console.log();
  }

  const spinner = ora("Installing Sysbox...").start();

  try {
    // Download and run the Sysbox install script
    const child = spawn("bash", ["-c", capability.installCommand!], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";

    child.stdout?.on("data", (data) => {
      output += data.toString();
      // Update spinner with last line of output
      const lines = output.split("\n").filter(Boolean);
      if (lines.length > 0) {
        spinner.text = `Installing: ${lines[lines.length - 1].slice(0, 60)}`;
      }
    });

    child.stderr?.on("data", (data) => {
      output += data.toString();
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on("close", (code, signal) => {
        if (signal) {
          reject(new Error(`Process terminated by signal: ${signal}`));
        } else {
          resolve(code ?? 1);
        }
      });
      child.on("error", reject);
    });

    spinner.stop();

    if (exitCode === 0) {
      console.log(chalk.green("+ Sysbox installed successfully"));
      console.log();

      // Verify installation
      console.log(chalk.cyan("Verifying installation..."));
      const postCapability = await detectSysboxCapability({ skipCache: true });

      if (postCapability.available === "available") {
        console.log(chalk.green("✓ Sysbox is now available"));
        if (postCapability.version) {
          console.log(chalk.gray(`  Version: ${postCapability.version}`));
        }

        // Check if Docker needs restart
        console.log();
        console.log(chalk.yellow("⚠ You may need to restart Docker:"));
        console.log(chalk.white("  sudo systemctl restart docker"));
      } else {
        console.log(chalk.yellow("⚠ Sysbox installed but not detected yet"));
        console.log(chalk.gray("  You may need to restart Docker:"));
        console.log(chalk.white("  sudo systemctl restart docker"));
      }
    } else {
      console.log(chalk.red("✗ Installation failed"));
      console.log(chalk.gray("Exit code:", exitCode));
      console.log();
      console.log(chalk.gray("Try running the command manually:"));
      console.log(chalk.white(`  ${capability.installCommand}`));
    }
  } catch (error) {
    spinner.stop();
    console.log(chalk.red("✗ Installation failed"));
    console.log(chalk.gray(error instanceof Error ? error.message : String(error)));
  }

  console.log();
}

/**
 * Install Sysbox on macOS via Lima.
 */
async function installMacosSysbox(capability: SysboxCapability): Promise<void> {
  // Check if Lima is installed
  try {
    execSync("limactl --version", { stdio: "pipe" });
  } catch {
    console.log(chalk.yellow("Lima is not installed. Installing via Homebrew..."));
    console.log();

    try {
      execSync("brew install lima", { stdio: "inherit" });
      console.log();
    } catch {
      console.log(chalk.red("✗ Failed to install Lima"));
      console.log(chalk.gray("Please install manually: brew install lima"));
      return;
    }
  }

  const spinner = ora("Creating Sysbox-enabled Lima VM...").start();

  try {
    // Start a Sysbox-enabled Lima VM
    const child = spawn("limactl", ["start", "--name=clawster", "template://sysbox"], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    child.stdout?.on("data", (data) => {
      const line = data.toString().trim();
      if (line) {
        spinner.text = `Creating VM: ${line.slice(0, 60)}`;
      }
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on("close", (code, signal) => {
        if (signal) {
          reject(new Error(`Process terminated by signal: ${signal}`));
        } else {
          resolve(code ?? 1);
        }
      });
      child.on("error", reject);
    });

    spinner.stop();

    if (exitCode === 0) {
      console.log(chalk.green("+ Sysbox Lima VM created successfully"));
      console.log();

      // Configure Docker context
      console.log(chalk.cyan("Configure Docker to use the Lima VM:"));
      console.log(chalk.white("  limactl shell clawster"));
      console.log(chalk.gray("  or"));
      console.log(chalk.white("  docker context use lima-clawster"));
      console.log();

      // Verify
      const postCapability = await detectSysboxCapability({ skipCache: true });
      if (postCapability.available === "available") {
        console.log(chalk.green("✓ Sysbox is now available"));
      }
    } else {
      console.log(chalk.red("✗ Failed to create Lima VM"));
      console.log(chalk.gray("Try running manually:"));
      console.log(chalk.white("  limactl start --name=clawster template://sysbox"));
    }
  } catch (error) {
    spinner.stop();
    console.log(chalk.red("✗ Failed to create Lima VM"));
    console.log(chalk.gray(error instanceof Error ? error.message : String(error)));
  }

  console.log();
}

/**
 * Get display name for platform.
 */
function getPlatformDisplay(platform: Platform): string {
  switch (platform) {
    case "linux":
      return "Linux";
    case "macos":
      return "macOS";
    case "wsl2":
      return "Windows (WSL2)";
    case "windows-native":
      return "Windows (native)";
    default:
      return platform;
  }
}

/**
 * Get status icon for availability.
 */
function getStatusIcon(available: string): string {
  switch (available) {
    case "available":
      return chalk.green("✓");
    case "not-installed":
      return chalk.yellow("⚠");
    case "unavailable":
    case "unsupported":
      return chalk.red("✗");
    default:
      return chalk.gray("?");
  }
}

/**
 * Get color function for availability.
 */
function getStatusColor(available: string): (text: string) => string {
  switch (available) {
    case "available":
      return chalk.green;
    case "not-installed":
      return chalk.yellow;
    case "unavailable":
    case "unsupported":
      return chalk.red;
    default:
      return chalk.gray;
  }
}
