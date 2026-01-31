import { execFile } from "child_process";
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

const DEFAULT_IMAGE = "ghcr.io/openclaw/openclaw:latest";

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
 * DockerContainerTarget manages an OpenClaw gateway instance running
 * inside a Docker container.
 *
 * Configuration is mounted as a volume, the gateway port is exposed,
 * and the container is managed via Docker CLI commands.
 */
export class DockerContainerTarget implements DeploymentTarget {
  readonly type = DeploymentTargetType.DOCKER;

  private config: DockerTargetConfig;
  private imageName: string;

  constructor(config: DockerTargetConfig) {
    this.config = config;
    this.imageName = config.imageName || DEFAULT_IMAGE;
  }

  /**
   * Pull the Docker image for the OpenClaw gateway.
   */
  async install(options: InstallOptions): Promise<InstallResult> {
    const image = options.openclawVersion
      ? this.imageName.replace(/:.*$/, `:${options.openclawVersion}`)
      : this.imageName;

    try {
      await runCommand("docker", ["pull", image]);

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
        message: `Failed to pull image: ${error instanceof Error ? error.message : String(error)}`,
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
    const configFile = path.join(configDir, "config.json");

    const configData = {
      profileName: config.profileName,
      gatewayPort: config.gatewayPort,
      environment: config.environment || {},
      ...config.config,
    };

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

    const args: string[] = [
      "run",
      "-d",
      "--name",
      this.config.containerName,
      "-p",
      `${this.config.gatewayPort}:${this.config.gatewayPort}`,
      "-v",
      `${this.config.configPath}:/app/config:ro`,
      "-e",
      `OPENCLAW_CONFIG_PATH=/app/config/config.json`,
    ];

    if (this.config.networkName) {
      args.push("--network", this.config.networkName);
    }

    // Restart policy for resilience
    args.push("--restart", "unless-stopped");

    args.push(this.imageName);

    await runCommand("docker", args);
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
      };
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
