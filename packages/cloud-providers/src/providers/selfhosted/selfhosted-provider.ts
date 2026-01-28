import { InstanceManifest } from "@molthub/core";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  CloudProvider,
  CloudProviderConfig,
  CloudProviderType,
  ContainerInstance,
  ContainerDeploymentConfig,
  ContainerStatus,
  ContainerHealth,
  CloudResources,
  BootstrapOptions,
  ValidationResult,
  ProgressCallback,
  ContainerFilters,
  LogOptions,
  LogResult,
  LogEvent,
} from "../../interface/provider";

const execAsync = promisify(exec);

export interface SelfHostedConfig extends CloudProviderConfig {
  dockerHost?: string;
  composeProjectName?: string;
  dataDir?: string;
}

interface DockerContainer {
  id: string;
  name: string;
  status: string;
  state: string;
  labels: Record<string, string>;
  created: string;
  ports: Array<{ privatePort: number; publicPort?: number; type: string }>;
}

export class SelfHostedProvider implements CloudProvider {
  readonly type: CloudProviderType = "selfhosted";
  region: string = "local";
  
  private dockerHost?: string;
  private workspace: string = "default";
  private dataDir: string = "";
  private composeProjectName: string = "";
  private secretsDir: string = "";

  async initialize(config: SelfHostedConfig): Promise<void> {
    this.region = config.region || "local";
    this.workspace = config.workspace;
    this.dockerHost = config.dockerHost;
    this.composeProjectName = config.composeProjectName || `molthub-${config.workspace}`;
    this.dataDir = config.dataDir || path.join(os.homedir(), ".molthub", config.workspace);
    this.secretsDir = path.join(this.dataDir, "secrets");

    // Ensure directories exist
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.secretsDir, { recursive: true });
  }

  async validate(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      await this.execDocker(["version"]);
    } catch (error) {
      errors.push(`Docker is not available: ${(error as Error).message}`);
      return { valid: false, errors, warnings };
    }

    try {
      await this.execDocker(["compose", "version"]);
    } catch {
      warnings.push("Docker Compose plugin not found. Some features may not work.");
    }

    // Check if we can write to data directory
    try {
      const testFile = path.join(this.dataDir!, ".write-test");
      await fs.writeFile(testFile, "");
      await fs.unlink(testFile);
    } catch (error) {
      errors.push(`Cannot write to data directory ${this.dataDir}: ${(error as Error).message}`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async bootstrap(options: BootstrapOptions, onProgress?: ProgressCallback): Promise<CloudResources> {
    onProgress?.("directories", "in_progress", "Creating data directories...");
    
    // Create directory structure
    await fs.mkdir(path.join(this.dataDir!, "logs"), { recursive: true });
    await fs.mkdir(path.join(this.dataDir!, "data"), { recursive: true });
    await fs.mkdir(this.secretsDir!, { recursive: true });
    
    onProgress?.("directories", "complete", "Created data directories");

    // Create docker-compose file for infrastructure
    onProgress?.("compose", "in_progress", "Creating docker-compose configuration...");
    
    const composeContent = this.generateComposeFile();
    await fs.writeFile(
      path.join(this.dataDir!, "docker-compose.yml"),
      composeContent,
      "utf-8"
    );
    
    onProgress?.("compose", "complete", "Created docker-compose.yml");

    // Create .env file
    const envContent = `
# Molthub Self-Hosted Configuration
COMPOSE_PROJECT_NAME=${this.composeProjectName}
MOLTHUB_WORKSPACE=${this.workspace}
MOLTHUB_DATA_DIR=${this.dataDir}
`.trim();

    await fs.writeFile(
      path.join(this.dataDir!, ".env"),
      envContent,
      "utf-8"
    );

    return {
      provider: "selfhosted",
      region: "local",
      clusterId: this.composeProjectName!,
      clusterEndpoint: "http://localhost:4000",
      network: {
        vpcId: undefined,
        subnetIds: [],
        securityGroupId: undefined,
      },
      iam: {
        executionRoleArn: undefined,
        taskRoleArn: undefined,
        serviceAccountName: undefined,
      },
      logging: {
        logGroupName: path.join(this.dataDir!, "logs"),
        logDriver: "json-file",
        logOptions: {
          "max-size": "10m",
          "max-file": "3",
        },
      },
      metadata: {
        dataDir: this.dataDir,
        composeProjectName: this.composeProjectName,
      },
    };
  }

  private generateComposeFile(): string {
    return `version: '3.8'

services:
  # Molthub API (optional - can run outside compose)
  # molthub-api:
  #   image: molthub/api:latest
  #   ports:
  #     - "4000:4000"
  #   environment:
  #     - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/molthub
  #   volumes:
  #     - ./data:/data
  #   depends_on:
  #     - postgres

  # PostgreSQL for local development
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: molthub
      POSTGRES_PASSWORD: molthub
      POSTGRES_DB: molthub
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U molthub"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
`;
  }

  async deployContainer(config: ContainerDeploymentConfig, manifest: InstanceManifest): Promise<ContainerInstance> {
    const containerName = `${this.composeProjectName}_${config.name}`;
    const containerDir = path.join(this.dataDir!, "containers", config.name);
    
    // Create container directory
    await fs.mkdir(containerDir, { recursive: true });

    // Create environment file
    const envVars = Object.entries(config.environment)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    await fs.writeFile(path.join(containerDir, ".env"), envVars, "utf-8");

    // Create secrets files
    for (const [key, value] of Object.entries(config.secrets)) {
      const secretPath = path.join(this.secretsDir!, `${config.name}_${key}`);
      await fs.writeFile(secretPath, value, "utf-8");
    }

    // Build docker run command
    const args = [
      "run",
      "-d",
      "--name", containerName,
      "--label", `molthub.workspace=${this.workspace}`,
      "--label", `molthub.instance=${config.name}`,
      "--label", `molthub.managed=true`,
      "--env-file", path.join(containerDir, ".env"),
      "--restart", "unless-stopped",
      "--memory", `${config.memory}m`,
      "--cpus", config.cpu.toString(),
      "--log-driver", "json-file",
      "--log-opt", "max-size=10m",
      "--log-opt", "max-file=3",
    ];

    // Add port mappings
    for (const port of config.ports || []) {
      if (port.hostPort) {
        args.push("-p", `${port.hostPort}:${port.containerPort}/${port.protocol}`);
      } else {
        args.push("-p", `${port.containerPort}/${port.protocol}`);
      }
    }

    // Add extra labels
    for (const [key, value] of Object.entries(config.labels)) {
      args.push("--label", `${key}=${value}`);
    }

    // Mount secrets as files
    for (const key of Object.keys(config.secrets)) {
      const secretPath = path.join(this.secretsDir!, `${config.name}_${key}`);
      args.push("-v", `${secretPath}:/run/secrets/${key}:ro`);
    }

    // Add image
    args.push(config.image);

    // Add command if specified
    if (config.command && config.command.length > 0) {
      args.push(...config.command);
    }

    const result = await this.execDocker(args);
    const containerId = result.stdout.trim();

    return {
      id: containerId,
      name: config.name,
      status: "RUNNING",
      health: "UNKNOWN",
      provider: "selfhosted",
      region: "local",
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        containerName,
        composeProject: this.composeProjectName,
        workspace: this.workspace || "default",
      },
    };
  }

  async updateContainer(instanceId: string, config: Partial<ContainerDeploymentConfig>): Promise<ContainerInstance> {
    const existing = await this.getContainer(instanceId);
    if (!existing) {
      throw new Error(`Container ${instanceId} not found`);
    }

    // For self-hosted, we recreate the container with new config
    // In production, you'd implement rolling updates
    if (config.replicas !== undefined && config.replicas === 0) {
      await this.stopContainer(instanceId);
    } else if (config.replicas !== undefined && config.replicas > 0) {
      await this.startContainer(instanceId);
    }

    return this.getContainer(instanceId) as Promise<ContainerInstance>;
  }

  async stopContainer(instanceId: string): Promise<void> {
    await this.execDocker(["stop", instanceId]);
  }

  async startContainer(instanceId: string): Promise<void> {
    await this.execDocker(["start", instanceId]);
  }

  async deleteContainer(instanceId: string): Promise<void> {
    try {
      await this.execDocker(["stop", instanceId]);
    } catch {
      // Container might already be stopped
    }
    
    try {
      await this.execDocker(["rm", instanceId]);
    } catch {
      // Container might already be removed
    }

    // Clean up secrets
    const instance = await this.getContainer(instanceId);
    if (instance) {
      const secretsPattern = path.join(this.secretsDir!, `${instance.name}_*`);
      try {
        const { stdout } = await execAsync(`ls ${secretsPattern}`);
        const files = stdout.trim().split("\n");
        for (const file of files) {
          if (file) await fs.unlink(file);
        }
      } catch {
        // No secrets to clean up
      }
    }
  }

  async getContainer(instanceId: string): Promise<ContainerInstance | null> {
    try {
      const result = await this.execDocker([
        "inspect",
        "--format", "{{json .}}",
        instanceId,
      ]);

      const info = JSON.parse(result.stdout);
      
      let status: ContainerStatus = "PENDING";
      const state = info.State;
      
      if (state.Running) {
        status = "RUNNING";
      } else if (state.Status === "exited") {
        status = state.ExitCode === 0 ? "STOPPED" : "ERROR";
      } else if (state.Status === "created") {
        status = "CREATING";
      }

      let health: ContainerHealth = "UNKNOWN";
      if (state.Health) {
        health = state.Health.Status === "healthy" ? "HEALTHY" : "UNHEALTHY";
      }

      const labels = info.Config.Labels || {};
      const name = info.Name.replace(/^\//, "");

      return {
        id: info.Id,
        name: labels["molthub.instance"] || name,
        status,
        health,
        provider: "selfhosted",
        region: "local",
        endpoint: this.getContainerEndpoint(info),
        createdAt: new Date(info.Created),
        updatedAt: new Date(info.State.StartedAt || info.Created),
        metadata: {
          ...labels,
          containerName: name,
          image: info.Config.Image,
        },
      };
    } catch {
      return null;
    }
  }

  private getContainerEndpoint(info: any): string | undefined {
    const ports = info.NetworkSettings?.Ports || {};
    for (const [containerPort, bindings] of Object.entries(ports)) {
      if (bindings && Array.isArray(bindings) && bindings.length > 0) {
        const hostPort = bindings[0].HostPort;
        return `http://localhost:${hostPort}`;
      }
    }
    return undefined;
  }

  async listContainers(filters?: ContainerFilters): Promise<ContainerInstance[]> {
    const result = await this.execDocker([
      "ps",
      "-a",
      "--format", "{{json .}}",
      "--filter", `label=molthub.workspace=${this.workspace}`,
    ]);

    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const instances: ContainerInstance[] = [];

    for (const line of lines) {
      try {
        const container = JSON.parse(line);
        const instance = await this.getContainer(container.ID);
        if (instance) {
          if (filters?.status && instance.status !== filters.status) continue;
          instances.push(instance);
        }
      } catch {
        // Skip invalid entries
      }
    }

    return instances;
  }

  async getLogs(instanceId: string, options?: LogOptions): Promise<LogResult> {
    const args = ["logs"];
    
    if (options?.follow) {
      args.push("-f");
    }
    
    if (options?.limit) {
      args.push("--tail", options.limit.toString());
    } else {
      args.push("--tail", "100");
    }

    // Docker logs doesn't support time-based filtering natively
    // We'd need to implement that ourselves if needed
    
    args.push(instanceId);

    const result = await this.execDocker(args);
    const lines = result.stdout.trim().split("\n");

    const events: LogEvent[] = lines.map(line => ({
      timestamp: new Date(),
      message: line,
    }));

    return { events };
  }

  async storeSecret(name: string, value: string, metadata?: Record<string, string>): Promise<string> {
    const secretPath = path.join(this.secretsDir!, name);
    await fs.mkdir(path.dirname(secretPath), { recursive: true });
    await fs.writeFile(secretPath, value, "utf-8");
    
    // Store metadata separately
    if (metadata) {
      const metaPath = `${secretPath}.meta.json`;
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
    }
    
    return secretPath;
  }

  async getSecret(name: string): Promise<string | null> {
    const secretPath = path.join(this.secretsDir!, name);
    try {
      return await fs.readFile(secretPath, "utf-8");
    } catch {
      return null;
    }
  }

  async deleteSecret(name: string): Promise<void> {
    const secretPath = path.join(this.secretsDir!, name);
    const metaPath = `${secretPath}.meta.json`;
    
    try {
      await fs.unlink(secretPath);
    } catch {
      // File might not exist
    }
    
    try {
      await fs.unlink(metaPath);
    } catch {
      // Metadata file might not exist
    }
  }

  getConsoleUrl(): string {
    return `file://${this.dataDir}`;
  }

  private async execDocker(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const command = this.dockerHost 
      ? `docker -H ${this.dockerHost} ${args.join(" ")}`
      : `docker ${args.join(" ")}`;

    try {
      return await execAsync(command);
    } catch (error) {
      throw new Error(`Docker command failed: ${(error as Error).message}`);
    }
  }

  /**
   * Start the infrastructure services (PostgreSQL, etc.)
   */
  async startInfrastructure(): Promise<void> {
    const composeFile = path.join(this.dataDir!, "docker-compose.yml");
    await this.execDocker(["compose", "-f", composeFile, "up", "-d"]);
  }

  /**
   * Stop the infrastructure services
   */
  async stopInfrastructure(): Promise<void> {
    const composeFile = path.join(this.dataDir!, "docker-compose.yml");
    await this.execDocker(["compose", "-f", composeFile, "down"]);
  }
}