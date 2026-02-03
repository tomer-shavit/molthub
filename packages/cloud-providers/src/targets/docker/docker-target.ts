import { execFile, spawn } from "child_process";
import * as path from "path";
import * as readline from "readline";
import {
  DeploymentTarget,
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
import { isSysboxAvailable, type ContainerRuntime } from "../../sysbox";

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

export class DockerContainerTarget implements DeploymentTarget {
  readonly type = DeploymentTargetType.DOCKER;

  private config: DockerTargetConfigExtended;
  private imageName: string;
  private environmentVars: Record<string, string> = {};
  private onLog?: (line: string, stream: "stdout" | "stderr") => void;

  /** Detected runtime - always sysbox-runc in dream architecture */
  private detectedRuntime: ContainerRuntime = "sysbox-runc";
  /** Whether Sysbox detection has been performed */
  private runtimeDetected = false;
  /** Whether Sysbox is available */
  private sysboxAvailable = false;

  constructor(config: DockerTargetConfigExtended) {
    this.config = config;
    this.imageName = config.imageName || DEFAULT_IMAGE;
  }

  /**
   * Detect Sysbox availability and enforce the dream architecture requirement.
   *
   * DREAM ARCHITECTURE: Security is not optional. Sysbox is REQUIRED.
   * This method will throw an error if Sysbox is not available, unless
   * `allowInsecureWithoutSysbox` is explicitly set (for dev/testing only).
   */
  private async ensureSysboxAvailable(): Promise<void> {
    if (this.runtimeDetected) {
      return;
    }

    this.sysboxAvailable = await isSysboxAvailable();
    this.runtimeDetected = true;

    if (this.sysboxAvailable) {
      this.detectedRuntime = "sysbox-runc";
      this.onLog?.("Sysbox runtime detected - secure sandbox mode enabled", "stdout");
    } else if (this.config.allowInsecureWithoutSysbox) {
      // Development/testing escape hatch - NOT for production
      this.detectedRuntime = "runc";
      this.onLog?.(
        "WARNING: Sysbox not available, running WITHOUT sandbox protection. " +
        "This is INSECURE and should only be used for development/testing.",
        "stderr"
      );
    } else {
      // DREAM ARCHITECTURE: Security is not optional
      throw new Error(
        "SYSBOX REQUIRED: Secure deployment requires Sysbox runtime.\n" +
        "Run: clawster sysbox install\n\n" +
        "Sysbox provides secure Docker-in-Docker for OpenClaw sandbox mode,\n" +
        "protecting against prompt injection attacks.\n\n" +
        "For development/testing only, you can bypass this check by setting\n" +
        "allowInsecureWithoutSysbox: true in the Docker target config."
      );
    }
  }

  /**
   * Get the runtime that will be used.
   * Call ensureSysboxAvailable() first to perform detection.
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

  setLogCallback(cb: (line: string, stream: "stdout" | "stderr") => void): void {
    this.onLog = cb;
  }

  /**
   * Ensure the Docker image is available locally — check, build, or pull.
   */
  async install(options: InstallOptions): Promise<InstallResult> {
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
        await runCommandStreaming("docker", ["build", "-t", image, resolved], this.onLog);
        this.imageName = image;
        return {
          success: true,
          instanceId: this.config.containerName,
          message: `Built Docker image ${image}`,
        };
      }

      // Fallback: try to pull (for users with custom registries)
      await runCommandStreaming("docker", ["pull", image], this.onLog);
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
    const raw = { ...config.config } as Record<string, unknown>;

    // gateway.host -> gateway.bind (OpenClaw uses "bind" not "host")
    // Docker containers MUST bind to 0.0.0.0 — bridge networking cannot reach 127.0.0.1 inside the container
    if (raw.gateway && typeof raw.gateway === "object") {
      const gw = { ...(raw.gateway as Record<string, unknown>) };
      gw.bind = "lan";
      delete gw.host;
      delete gw.port;
      raw.gateway = gw;
    }

    // skills.allowUnverified is not a valid OpenClaw key
    if (raw.skills && typeof raw.skills === "object") {
      const skills = { ...(raw.skills as Record<string, unknown>) };
      delete skills.allowUnverified;
      raw.skills = skills;
    }

    // sandbox at root level -> agents.defaults.sandbox
    if ("sandbox" in raw) {
      const agents = (raw.agents as Record<string, unknown>) || {};
      const defaults = (agents.defaults as Record<string, unknown>) || {};
      defaults.sandbox = raw.sandbox;
      agents.defaults = defaults;
      raw.agents = agents;
      delete raw.sandbox;
    }

    // channels.*.enabled is not valid for WhatsApp (and unnecessary for others —
    // presence in the config means the channel is active)
    if (raw.channels && typeof raw.channels === "object") {
      for (const [key, value] of Object.entries(raw.channels as Record<string, unknown>)) {
        if (value && typeof value === "object" && "enabled" in (value as Record<string, unknown>)) {
          const { enabled: _enabled, ...rest } = value as Record<string, unknown>;
          (raw.channels as Record<string, unknown>)[key] = rest;
        }
      }
    }

    const configData = raw;

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
   *
   * DREAM ARCHITECTURE: This method enforces the Sysbox requirement.
   * If Sysbox is not available and allowInsecureWithoutSysbox is not set,
   * this method will throw an error with installation instructions.
   */
  async start(): Promise<void> {
    // DREAM ARCHITECTURE: Enforce Sysbox requirement BEFORE anything else
    await this.ensureSysboxAvailable();

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
      this.onLog?.("Using Sysbox runtime for secure Docker-in-Docker", "stdout");
    } else {
      this.onLog?.("WARNING: Running without Sysbox - INSECURE MODE", "stderr");
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

    await runCommandStreaming("docker", args, this.onLog);
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
}
