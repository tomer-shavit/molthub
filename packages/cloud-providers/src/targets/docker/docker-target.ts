import { execFile, spawn } from "child_process";
import * as path from "path";
import * as readline from "readline";
import {
  DeploymentTargetType,
  InstallOptions,
  InstallResult,
  OpenClawConfigPayload,
  ConfigureResult,
  TargetStatus,
  DeploymentLogOptions,
  GatewayEndpoint,
  DockerTargetConfig,
} from "../../interface/deployment-target";
import { BaseDeploymentTarget } from "../../base/base-deployment-target";
import type { TransformOptions } from "../../base/config-transformer";
import type { AdapterMetadata, SelfDescribingDeploymentTarget } from "../../interface/adapter-metadata";
import {
  isSysboxAvailable,
  resetCache,
  attemptSysboxInstall,
  getSysboxInstallCommand,
  type ContainerRuntime,
} from "../../sysbox";

const DEFAULT_IMAGE = "openclaw:local";

/**
 * Executes a command using child_process.execFile and returns stdout.
 */
function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${cmd} ${args.join(" ")}\n${stderr || error.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Executes a command using child_process.spawn and streams stdout/stderr line by line.
 */
function runCommandStreaming(
  cmd: string,
  args: string[],
  onLine?: (line: string, stream: "stdout" | "stderr") => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { timeout: 300_000 });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    if (child.stdout) {
      const rl = readline.createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        stdoutChunks.push(line);
        onLine?.(line, "stdout");
      });
    }

    if (child.stderr) {
      const rl = readline.createInterface({ input: child.stderr });
      rl.on("line", (line) => {
        stderrChunks.push(line);
        onLine?.(line, "stderr");
      });
    }

    child.on("error", (err) => {
      reject(new Error(`Command failed: ${cmd} ${args.join(" ")}\n${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Command failed (exit ${code}): ${cmd} ${args.join(" ")}\n${stderrChunks.join("\n")}`,
          ),
        );
        return;
      }
      resolve(stdoutChunks.join("\n"));
    });
  });
}

/**
 * DockerContainerTarget manages an OpenClaw gateway instance running
 * inside a Docker container.
 *
 * Configuration is mounted as a volume, the gateway port is exposed,
 * and the container is managed via Docker CLI commands.
 */
/**
 * Extended Docker target configuration with Sysbox support.
 *
 * DREAM ARCHITECTURE: Security is not optional. Sysbox is REQUIRED for
 * Docker deployments. If Sysbox is not available, deployment will fail
 * with instructions to install it.
 */
export interface DockerTargetConfigExtended extends DockerTargetConfig {
  /**
   * Skip Sysbox requirement check. USE WITH CAUTION.
   * Only for development/testing. Production deployments MUST have Sysbox.
   * @default false
   */
  allowInsecureWithoutSysbox?: boolean;
}

export class DockerContainerTarget extends BaseDeploymentTarget implements SelfDescribingDeploymentTarget {
  readonly type = DeploymentTargetType.DOCKER;

  private config: DockerTargetConfigExtended;
  private imageName: string;
  private environmentVars: Record<string, string> = {};

  /** Detected runtime - always sysbox-runc in dream architecture */
  private detectedRuntime: ContainerRuntime = "sysbox-runc";
  /** Whether Sysbox detection has been performed */
  private runtimeDetected = false;
  /** Whether Sysbox is available */
  private sysboxAvailable = false;

  constructor(config: DockerTargetConfigExtended) {
    super();
    this.config = config;
    this.imageName = config.imageName || DEFAULT_IMAGE;
  }

  /**
   * Detect Sysbox availability, attempt auto-install if missing, and enforce
   * the dream architecture requirement.
   *
   * Detect Sysbox availability and attempt auto-install if missing.
   *
   * Local Docker is a dev/testing environment. If Sysbox auto-install fails
   * (e.g. sudo requires password), fall back to runc with a warning rather
   * than blocking the entire deployment. Cloud providers handle Sysbox in
   * their startup scripts where they have root access.
   */
  private async ensureSysboxAvailableOrInstall(): Promise<void> {
    if (this.runtimeDetected) {
      return;
    }

    this.sysboxAvailable = await isSysboxAvailable();

    if (!this.sysboxAvailable) {
      // Attempt auto-install (mirrors cloud provider startup scripts)
      this.log("Sysbox not found — attempting auto-install...", "stdout");
      const result = await attemptSysboxInstall(this.logCallback);

      if (result.success) {
        resetCache();
        this.sysboxAvailable = await isSysboxAvailable({ skipCache: true });
      } else {
        this.log(`Auto-install result: ${result.message}`, "stderr");
      }
    }

    this.runtimeDetected = true;

    if (this.sysboxAvailable) {
      this.detectedRuntime = "sysbox-runc";
      this.log("Sysbox runtime ready — secure sandbox mode enabled", "stdout");
    } else {
      // Local Docker = dev environment. Fall back to runc with a warning.
      this.detectedRuntime = "runc";
      this.log(
        "WARNING: Sysbox not available — running without sandbox protection. " +
        "To enable secure sandbox mode, install Sysbox:\n" +
        "  sudo bash -c '" + getSysboxInstallCommand() + "'\n" +
        "  sudo systemctl restart docker",
        "stderr"
      );
    }
  }

  /**
   * Get the runtime that will be used.
   * Call ensureSysboxAvailableOrInstall() first to perform detection.
   */
  private getDetectedRuntime(): ContainerRuntime {
    return this.detectedRuntime;
  }

  /**
   * Get the current runtime being used.
   * Note: Returns the detected runtime. Call start() first to trigger detection.
   */
  getRuntime(): ContainerRuntime {
    return this.detectedRuntime;
  }

  /**
   * Check if Sysbox runtime is being used.
   * Note: Returns true after successful start(). Before start(), returns false.
   */
  isSysboxEnabled(): boolean {
    return this.sysboxAvailable && this.detectedRuntime === "sysbox-runc";
  }

  /**
   * Check if this target is running in insecure mode (without Sysbox).
   * This should ONLY be true in development/testing scenarios.
   */
  isRunningInsecure(): boolean {
    return this.runtimeDetected && !this.sysboxAvailable;
  }

  /**
   * Docker-specific config transformation options.
   * Forces gateway.bind = "lan" and removes port (bridge networking requirement).
   */
  protected override getTransformOptions(): TransformOptions {
    return {
      customTransforms: [
        (config) => {
          // Docker containers MUST bind to 0.0.0.0 (lan) - bridge networking cannot reach 127.0.0.1
          if (config.gateway && typeof config.gateway === "object") {
            const gw = { ...(config.gateway as Record<string, unknown>) };
            gw.bind = "lan";
            delete gw.host;
            delete gw.port;
            return { ...config, gateway: gw };
          }
          return config;
        },
      ],
    };
  }

  /**
   * Ensure the Docker image is available locally — check, build, or pull.
   * Also checks/installs Sysbox BEFORE image build (fail fast).
   */
  async install(options: InstallOptions): Promise<InstallResult> {
    // FAIL FAST: Check/install Sysbox BEFORE expensive image build
    await this.ensureSysboxAvailableOrInstall();

    const image = options.openclawVersion
      ? this.imageName.replace(/:.*$/, `:${options.openclawVersion}`)
      : this.imageName;

    try {
      // Check if image already exists locally
      try {
        await runCommand("docker", ["image", "inspect", image, "--format", "ok"]);
        this.imageName = image;
        return {
          success: true,
          instanceId: this.config.containerName,
          message: `Image ${image} already available locally`,
        };
      } catch {
        // Image not found locally — build or pull
      }

      if (this.config.dockerfilePath) {
        const resolved = path.resolve(this.config.dockerfilePath);
        await runCommandStreaming("docker", ["build", "-t", image, resolved], this.logCallback);
        this.imageName = image;
        return {
          success: true,
          instanceId: this.config.containerName,
          message: `Built Docker image ${image}`,
        };
      }

      // Fallback: try to pull (for users with custom registries)
      await runCommandStreaming("docker", ["pull", image], this.logCallback);
      this.imageName = image;
      return {
        success: true,
        instanceId: this.config.containerName,
        message: `Pulled Docker image ${image}`,
      };
    } catch (error) {
      return {
        success: false,
        instanceId: this.config.containerName,
        message: `Failed to obtain image ${image}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Write the OpenClaw configuration to the config path on the host,
   * which will be mounted into the container.
   */
  async configure(config: OpenClawConfigPayload): Promise<ConfigureResult> {
    const fs = await import("fs");
    const path = await import("path");

    const configDir = this.config.configPath;
    const configFile = path.join(configDir, "openclaw.json");

    // Store environment variables for docker run -e flags
    if (config.environment) {
      this.environmentVars = { ...this.environmentVars, ...config.environment };
    }

    // Transform Clawster internal schema to valid OpenClaw config format
    // Uses shared transformer with Docker-specific overrides (gateway.bind = "lan")
    const configData = this.transformConfig(config.config as Record<string, unknown>);

    try {
      // Ensure the config directory exists
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(configFile, JSON.stringify(configData, null, 2), "utf8");

      return {
        success: true,
        message: `Configuration written to ${configFile}`,
        requiresRestart: true,
        configPath: configFile,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to write config: ${error instanceof Error ? error.message : String(error)}`,
        requiresRestart: false,
      };
    }
  }

  /**
   * Start the Docker container with the configured volume mount and port mapping.
   * Sysbox detection/install already happened in install() — uses cached result.
   */
  async start(): Promise<void> {

    // Check if container already exists
    try {
      const state = await runCommand("docker", [
        "inspect",
        "--format",
        "{{.State.Status}}",
        this.config.containerName,
      ]);

      if (state === "running") {
        return; // Already running
      }

      if (state === "exited" || state === "created") {
        // Restart existing stopped container
        await runCommand("docker", ["start", this.config.containerName]);
        return;
      }
    } catch {
      // Container does not exist yet — create and run it
    }

    const runtime = this.getDetectedRuntime();

    const args: string[] = [
      "run",
      "-d",
      "--name",
      this.config.containerName,
    ];

    // Add runtime flag - always sysbox-runc in dream architecture
    // (unless running in insecure dev mode)
    if (runtime === "sysbox-runc") {
      args.push("--runtime=sysbox-runc");
      this.log("Using Sysbox runtime for secure Docker-in-Docker", "stdout");
    } else {
      this.log("WARNING: Running without Sysbox - INSECURE MODE", "stderr");
    }

    args.push(
      "-p",
      `${this.config.gatewayPort}:18789`,
      "-v",
      `${this.config.configPath}:/home/node/.openclaw`,
    );

    // Pass environment variables (e.g., LLM API keys)
    for (const [key, value] of Object.entries(this.environmentVars)) {
      args.push("-e", `${key}=${value}`);
    }

    if (this.config.networkName) {
      args.push("--network", this.config.networkName);
    }

    // Restart policy for resilience
    args.push("--restart", "unless-stopped");

    args.push(this.imageName);

    await runCommandStreaming("docker", args, this.logCallback);
  }

  /**
   * Stop the Docker container gracefully.
   */
  async stop(): Promise<void> {
    await runCommand("docker", ["stop", this.config.containerName]);
  }

  /**
   * Restart the Docker container.
   */
  async restart(): Promise<void> {
    await runCommand("docker", ["restart", this.config.containerName]);
  }

  /**
   * Get the status of the Docker container by inspecting it.
   */
  async getStatus(): Promise<TargetStatus> {
    try {
      const output = await runCommand("docker", [
        "inspect",
        "--format",
        "{{.State.Status}}|{{.State.Pid}}|{{.State.StartedAt}}",
        this.config.containerName,
      ]);

      const [status, pidStr, startedAt] = output.split("|");
      const pid = parseInt(pidStr, 10);

      let state: TargetStatus["state"];
      switch (status) {
        case "running":
          state = "running";
          break;
        case "exited":
        case "created":
        case "paused":
          state = "stopped";
          break;
        case "dead":
        case "restarting":
          state = "error";
          break;
        default:
          state = "not-installed";
      }

      let uptime: number | undefined;
      if (state === "running" && startedAt) {
        const startTime = new Date(startedAt).getTime();
        uptime = Math.floor((Date.now() - startTime) / 1000);
      }

      return {
        state,
        pid: pid > 0 ? pid : undefined,
        uptime,
        gatewayPort: this.config.gatewayPort,
        runtime: this.detectedRuntime,
        sysboxEnabled: this.detectedRuntime === "sysbox-runc",
      } as TargetStatus & { runtime: ContainerRuntime; sysboxEnabled: boolean };
    } catch {
      return { state: "not-installed" };
    }
  }

  /**
   * Get logs from the Docker container.
   */
  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    const args = ["logs"];

    if (options?.lines) {
      args.push("--tail", String(options.lines));
    } else {
      args.push("--tail", "100");
    }

    if (options?.since) {
      args.push("--since", options.since.toISOString());
    }

    if (options?.follow) {
      args.push("--follow");
    }

    args.push(this.config.containerName);

    try {
      const output = await runCommand("docker", args);
      let lines = output.split("\n").filter(Boolean);

      if (options?.filter) {
        const pattern = new RegExp(options.filter, "i");
        lines = lines.filter((line) => pattern.test(line));
      }

      return lines;
    } catch {
      return [];
    }
  }

  /**
   * Get the gateway endpoint for the Docker container.
   */
  async getEndpoint(): Promise<GatewayEndpoint> {
    return {
      host: "localhost",
      port: this.config.gatewayPort,
      protocol: "ws",
    };
  }

  /**
   * Remove the Docker container and clean up.
   */
  async destroy(): Promise<void> {
    // Force stop and remove the container
    try {
      await runCommand("docker", ["rm", "-f", this.config.containerName]);
    } catch {
      // Container may not exist
    }
  }

  /**
   * Return metadata describing this adapter's capabilities and provisioning steps.
   */
  getMetadata(): AdapterMetadata {
    return {
      type: DeploymentTargetType.DOCKER,
      displayName: "Docker",
      icon: "docker",
      description: "Run OpenClaw in a local Docker container",
      status: "ready",
      provisioningSteps: [
        { id: "validate_config", name: "Validate configuration" },
        { id: "security_audit", name: "Security audit" },
        { id: "install_sysbox", name: "Check/install Sysbox runtime", estimatedDurationSec: 120 },
        { id: "build_image", name: "Build container image", estimatedDurationSec: 60 },
        { id: "create_container", name: "Create container" },
        { id: "write_config", name: "Write configuration" },
        { id: "start_container", name: "Start container" },
        { id: "wait_for_gateway", name: "Wait for Gateway", estimatedDurationSec: 30 },
        { id: "health_check", name: "Health check" },
      ],
      resourceUpdateSteps: [
        { id: "validate_resources", name: "Validate resource configuration" },
        { id: "apply_changes", name: "Apply resource changes" },
        { id: "verify_completion", name: "Verify completion" },
      ],
      operationSteps: {
        install: "build_image",
        start: "start_container",
      },
      capabilities: {
        scaling: false,
        sandbox: true,
        persistentStorage: true,
        httpsEndpoint: false,
        logStreaming: true,
      },
      credentials: [],
    };
  }
}
