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
  CloudflareWorkersConfig,
} from "../../interface/deployment-target";
import { mapEnvironment, getSecretEntries } from "./env-mapper";
import {
  generateWranglerConfig,
  generateWorkerEntryPoint,
} from "./wrangler-generator";
import { R2StateSync } from "./r2-state-sync";

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
 * Pipes a value to stdin of a command. Used for `wrangler secret put`
 * which reads the secret value from stdin.
 */
function runCommandWithStdin(cmd: string, args: string[], stdinData: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${cmd} ${args.join(" ")}\n${stderr || error.message}`));
        return;
      }
      resolve(stdout.trim());
    });

    if (child.stdin) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}

/**
 * CloudflareWorkersTarget manages an OpenClaw gateway instance deployed as a
 * Cloudflare Worker with a Sandbox container and optional R2 state persistence.
 *
 * Operations:
 * - install(): Generate wrangler.jsonc, Dockerfile, start-openclaw.sh, then `wrangler deploy`
 * - configure(): Map env vars, generate openclaw.json, set worker secrets
 * - start(): `wrangler deploy` (Workers are always-on with Durable Objects)
 * - stop(): `wrangler delete`
 * - restart(): Redeploy with `wrangler deploy`
 * - getStatus(): Check worker health endpoint
 * - getLogs(): `wrangler tail` output
 * - getEndpoint(): Worker URL + gateway port
 * - destroy(): `wrangler delete` + clean up R2 bucket
 */
export class CloudflareWorkersTarget implements DeploymentTarget {
  readonly type = DeploymentTargetType.CLOUDFLARE_WORKERS;

  private config: CloudflareWorkersConfig;
  private r2Sync: R2StateSync;
  private projectDir: string = "";
  private deployed: boolean = false;

  constructor(config: CloudflareWorkersConfig) {
    this.config = config;
    this.r2Sync = new R2StateSync(config);
  }

  /**
   * Install by generating all configuration files and deploying the Worker.
   *
   * Steps:
   * 1. Create project directory
   * 2. Generate wrangler.jsonc, Dockerfile, start-openclaw.sh
   * 3. Generate Worker entry point
   * 4. Run `wrangler deploy`
   */
  async install(options: InstallOptions): Promise<InstallResult> {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");

    // Create a temporary project directory
    this.projectDir = path.join(os.tmpdir(), `clawster-cf-${this.config.workerName}`);

    try {
      // Ensure project directory exists
      if (!fs.existsSync(this.projectDir)) {
        fs.mkdirSync(this.projectDir, { recursive: true });
      }

      // Create src directory for worker entry point
      const srcDir = path.join(this.projectDir, "src");
      if (!fs.existsSync(srcDir)) {
        fs.mkdirSync(srcDir, { recursive: true });
      }

      // Generate env mapping to get worker vars
      const envMapping = mapEnvironment(this.config);

      // Generate configuration files
      const configOutput = generateWranglerConfig(this.config, envMapping.workerVars);

      // Write wrangler.jsonc
      fs.writeFileSync(
        path.join(this.projectDir, "wrangler.jsonc"),
        configOutput.wranglerJsonc,
        "utf8"
      );

      // Write Dockerfile
      fs.writeFileSync(
        path.join(this.projectDir, "Dockerfile"),
        configOutput.dockerfile,
        "utf8"
      );

      // Write start script
      const startScriptPath = path.join(this.projectDir, "start-openclaw.sh");
      fs.writeFileSync(startScriptPath, configOutput.startScript, "utf8");
      fs.chmodSync(startScriptPath, 0o755);

      // Write worker entry point
      const entryPoint = generateWorkerEntryPoint(this.config);
      fs.writeFileSync(path.join(srcDir, "index.ts"), entryPoint, "utf8");

      // Deploy with wrangler
      await runCommand("wrangler", [
        "deploy",
        "--config",
        path.join(this.projectDir, "wrangler.jsonc"),
      ]);

      this.deployed = true;

      return {
        success: true,
        instanceId: this.config.workerName,
        message: `Deployed Cloudflare Worker "${this.config.workerName}" with Sandbox container`,
        serviceName: this.config.workerName,
        installPath: this.projectDir,
      };
    } catch (error) {
      return {
        success: false,
        instanceId: this.config.workerName,
        message: `Failed to deploy: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Configure the Worker by mapping environment variables, generating
   * openclaw.json, and setting worker secrets via `wrangler secret put`.
   */
  async configure(config: OpenClawConfigPayload): Promise<ConfigureResult> {
    const fs = await import("fs");
    const path = await import("path");

    try {
      // Map environment
      const envMapping = mapEnvironment(this.config, config.environment);

      // Generate openclaw.json config
      const openclawConfig = {
        gateway: {
          port: config.gatewayPort,
          auth: {
            mode: "token",
            token: "${OPENCLAW_GATEWAY_TOKEN}",
          },
        },
        ...config.config,
      };

      // Write openclaw.json to the project directory
      if (this.projectDir) {
        const configDir = path.join(this.projectDir, "config");
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(configDir, "openclaw.json"),
          JSON.stringify(openclawConfig, null, 2),
          "utf8"
        );
      }

      // Set worker secrets via wrangler
      const secretEntries = getSecretEntries(envMapping.workerSecrets);
      for (const [secretName, secretValue] of secretEntries) {
        await runCommandWithStdin(
          "wrangler",
          [
            "secret",
            "put",
            secretName,
            "--name",
            this.config.workerName,
          ],
          secretValue
        );
      }

      return {
        success: true,
        message: `Configuration applied to Worker "${this.config.workerName}" (${secretEntries.length} secrets set)`,
        requiresRestart: true,
        configPath: this.projectDir
          ? path.join(this.projectDir, "config", "openclaw.json")
          : undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to configure: ${error instanceof Error ? error.message : String(error)}`,
        requiresRestart: false,
      };
    }
  }

  /**
   * Start the Worker by deploying it. Cloudflare Workers with containers
   * are always-on after deployment.
   */
  async start(): Promise<void> {
    if (!this.projectDir) {
      throw new Error("Cannot start: Worker not installed. Call install() first.");
    }

    const path = await import("path");
    await runCommand("wrangler", [
      "deploy",
      "--config",
      path.join(this.projectDir, "wrangler.jsonc"),
    ]);

    this.deployed = true;

    // Restore state from R2 if available
    if (this.config.r2BucketName) {
      await this.r2Sync.restoreFromR2();
    }
  }

  /**
   * Stop the Worker by deleting it from Cloudflare.
   * Backs up state to R2 before deleting.
   */
  async stop(): Promise<void> {
    // Backup state to R2 before stopping
    if (this.config.r2BucketName) {
      await this.r2Sync.backupToR2();
    }

    await runCommand("wrangler", [
      "delete",
      "--name",
      this.config.workerName,
      "--force",
    ]);

    this.deployed = false;
  }

  /**
   * Restart by redeploying the Worker.
   * This triggers a new deployment which restarts the container.
   */
  async restart(): Promise<void> {
    if (!this.projectDir) {
      throw new Error("Cannot restart: Worker not installed. Call install() first.");
    }

    // Backup state before restart
    if (this.config.r2BucketName) {
      await this.r2Sync.backupToR2();
    }

    const path = await import("path");
    await runCommand("wrangler", [
      "deploy",
      "--config",
      path.join(this.projectDir, "wrangler.jsonc"),
    ]);

    // Restore state after restart
    if (this.config.r2BucketName) {
      await this.r2Sync.restoreFromR2();
    }
  }

  /**
   * Check the Worker health by hitting the health endpoint.
   */
  async getStatus(): Promise<TargetStatus> {
    try {
      const endpoint = await this.getEndpoint();
      const healthUrl = `${endpoint.protocol === "wss" ? "https" : "http"}://${endpoint.host}/health`;

      // Use curl to check health (avoids needing http client dependency)
      const output = await runCommand("curl", [
        "-s",
        "-o",
        "/dev/null",
        "-w",
        "%{http_code}",
        "--max-time",
        "10",
        healthUrl,
      ]);

      const statusCode = parseInt(output, 10);

      if (statusCode >= 200 && statusCode < 300) {
        return {
          state: "running",
          gatewayPort: this.config.gatewayPort,
        };
      } else if (statusCode === 0) {
        return {
          state: this.deployed ? "error" : "not-installed",
          error: "Worker unreachable",
          gatewayPort: this.config.gatewayPort,
        };
      } else {
        return {
          state: "error",
          error: `Health check returned status ${statusCode}`,
          gatewayPort: this.config.gatewayPort,
        };
      }
    } catch {
      return {
        state: this.deployed ? "error" : "not-installed",
        gatewayPort: this.config.gatewayPort,
      };
    }
  }

  /**
   * Get logs from the Worker using `wrangler tail`.
   *
   * Note: `wrangler tail` streams live logs. For historical logs,
   * Cloudflare provides limited log retention. This implementation
   * captures a snapshot of recent log output.
   */
  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    try {
      const args = ["tail", "--name", this.config.workerName, "--format", "json"];

      // wrangler tail doesn't support --lines natively, so we capture
      // output for a brief duration and return the results
      const output = await runCommand("wrangler", args);

      let lines = output.split("\n").filter(Boolean);

      if (options?.lines) {
        lines = lines.slice(-options.lines);
      }

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
   * Get the Worker endpoint URL.
   *
   * If a custom domain is configured, use that. Otherwise, use the
   * default workers.dev subdomain.
   */
  async getEndpoint(): Promise<GatewayEndpoint> {
    const host = this.config.customDomain
      ? this.config.customDomain
      : `${this.config.workerName}.${this.config.accountId}.workers.dev`;

    return {
      host,
      port: this.config.gatewayPort,
      protocol: "wss",
    };
  }

  /**
   * Destroy the Worker and clean up all resources.
   *
   * Steps:
   * 1. Backup state to R2 (final backup)
   * 2. Delete the Worker via `wrangler delete`
   * 3. Optionally clean up the R2 bucket
   * 4. Remove local project directory
   */
  async destroy(): Promise<void> {
    // Final state backup before destruction
    if (this.config.r2BucketName) {
      try {
        await this.r2Sync.backupToR2();
      } catch {
        // Best-effort backup
      }
    }

    // Delete the Worker
    try {
      await runCommand("wrangler", [
        "delete",
        "--name",
        this.config.workerName,
        "--force",
      ]);
    } catch {
      // Worker may not exist
    }

    // Clean up R2 bucket objects for this worker
    if (this.config.r2BucketName) {
      try {
        // Delete the state prefix and metadata
        const prefix = `${this.config.workerName}/`;
        await runCommand("wrangler", [
          "r2",
          "object",
          "delete",
          `${this.config.r2BucketName}/${prefix}`,
        ]);
      } catch {
        // Best-effort R2 cleanup
      }
    }

    // Clean up local project directory
    if (this.projectDir) {
      try {
        const fs = await import("fs");
        fs.rmSync(this.projectDir, { recursive: true, force: true });
      } catch {
        // Best-effort local cleanup
      }
    }

    this.deployed = false;
    this.projectDir = "";
  }

  /**
   * Returns the R2StateSync instance for external access
   * (e.g., for manual backup/restore operations).
   */
  getR2Sync(): R2StateSync {
    return this.r2Sync;
  }
}
