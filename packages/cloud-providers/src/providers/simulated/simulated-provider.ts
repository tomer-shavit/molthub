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
import { InstanceManifest } from "@molthub/core";

export interface SimulatedConfig extends CloudProviderConfig {
  simulateDelay?: number;
}

/**
 * Simulated Provider for Testing
 * 
 * This provider simulates cloud operations without making actual API calls.
 * Useful for testing the CLI and UI without real infrastructure.
 */
export class SimulatedProvider implements CloudProvider {
  readonly type: CloudProviderType = "selfhosted";
  region: string = "local";
  
  private workspace?: string;
  private containers: Map<string, ContainerInstance> = new Map();
  private secrets: Map<string, string> = new Map();
  private logs: Map<string, LogEvent[]> = new Map();
  private simulateDelay: number;

  async initialize(config: SimulatedConfig): Promise<void> {
    this.region = config.region || "local";
    this.workspace = config.workspace;
    this.simulateDelay = config.simulateDelay || 100;
  }

  async validate(): Promise<ValidationResult> {
    // Always valid in simulation mode
    return {
      valid: true,
      errors: [],
      warnings: ["Running in simulation mode - no real infrastructure will be created"],
    };
  }

  async bootstrap(options: BootstrapOptions, onProgress?: ProgressCallback): Promise<CloudResources> {
    const steps = [
      { key: "validate", message: "Validating configuration" },
      { key: "network", message: "Creating virtual network" },
      { key: "cluster", message: "Creating container cluster" },
      { key: "iam", message: "Setting up permissions" },
      { key: "storage", message: "Configuring storage" },
      { key: "logging", message: "Setting up logging" },
    ];

    for (const step of steps) {
      onProgress?.(step.key, "in_progress", step.message + "...");
      await this.delay(this.simulateDelay);
      onProgress?.(step.key, "complete", step.message + " ✓");
    }

    return {
      provider: "selfhosted",
      region: this.region,
      clusterId: `simulated-${this.workspace}`,
      clusterEndpoint: "http://localhost:4000",
      network: {
        vpcId: `vpc-simulated-${Date.now()}`,
        subnetIds: [`subnet-1-${Date.now()}`, `subnet-2-${Date.now()}`],
        securityGroupId: `sg-simulated-${Date.now()}`,
      },
      iam: {
        executionRoleArn: `arn:aws:iam::123456789:role/molthub-${this.workspace}-execution`,
        taskRoleArn: `arn:aws:iam::123456789:role/molthub-${this.workspace}-task`,
      },
      logging: {
        logGroupName: `/molthub/${this.workspace}`,
        logDriver: "json-file",
        logOptions: {
          "max-size": "10m",
          "max-file": "3",
        },
      },
      metadata: {
        simulated: true,
        workspace: this.workspace,
        createdAt: new Date().toISOString(),
      },
    };
  }

  async deployContainer(config: ContainerDeploymentConfig, manifest: InstanceManifest): Promise<ContainerInstance> {
    await this.delay(this.simulateDelay);

    const id = `sim-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const instance: ContainerInstance = {
      id,
      name: config.name,
      status: "PENDING",
      health: "UNKNOWN",
      provider: "selfhosted",
      region: this.region,
      endpoint: `http://localhost:${3000 + Math.floor(Math.random() * 1000)}`,
      publicIp: "127.0.0.1",
      privateIp: "172.17.0.2",
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        image: config.image,
        cpu: config.cpu.toString(),
        memory: config.memory.toString(),
        replicas: config.replicas.toString(),
      },
    };

    this.containers.set(id, instance);
    this.logs.set(id, [{
      timestamp: new Date(),
      message: `Container ${config.name} created (simulated)`,
    }]);

    // Simulate container starting
    setTimeout(() => {
      instance.status = "RUNNING";
      instance.health = "HEALTHY";
      instance.updatedAt = new Date();
      this.addLog(id, "Container started successfully (simulated)");
      this.addLog(id, `Server listening on port ${instance.endpoint?.split(":")[2] || "3000"}`);
    }, this.simulateDelay * 2);

    return instance;
  }

  async updateContainer(instanceId: string, config: Partial<ContainerDeploymentConfig>): Promise<ContainerInstance> {
    await this.delay(this.simulateDelay);

    const existing = this.containers.get(instanceId);
    if (!existing) {
      throw new Error(`Container ${instanceId} not found`);
    }

    existing.updatedAt = new Date();
    if (config.image) existing.metadata.image = config.image;
    if (config.cpu) existing.metadata.cpu = config.cpu.toString();
    if (config.memory) existing.metadata.memory = config.memory.toString();
    if (config.replicas) existing.metadata.replicas = config.replicas.toString();

    this.addLog(instanceId, `Container updated (simulated): ${JSON.stringify(config)}`);

    return existing;
  }

  async stopContainer(instanceId: string): Promise<void> {
    await this.delay(this.simulateDelay);

    const container = this.containers.get(instanceId);
    if (!container) {
      throw new Error(`Container ${instanceId} not found`);
    }

    container.status = "STOPPED";
    container.health = "UNKNOWN";
    container.updatedAt = new Date();
    this.addLog(instanceId, "Container stopped (simulated)");
  }

  async startContainer(instanceId: string): Promise<void> {
    await this.delay(this.simulateDelay);

    const container = this.containers.get(instanceId);
    if (!container) {
      throw new Error(`Container ${instanceId} not found`);
    }

    container.status = "RUNNING";
    container.health = "HEALTHY";
    container.updatedAt = new Date();
    this.addLog(instanceId, "Container started (simulated)");
  }

  async deleteContainer(instanceId: string): Promise<void> {
    await this.delay(this.simulateDelay);

    const container = this.containers.get(instanceId);
    if (!container) {
      throw new Error(`Container ${instanceId} not found`);
    }

    container.status = "DELETING";
    this.addLog(instanceId, "Container deleted (simulated)");
    
    // Actually remove after a delay
    setTimeout(() => {
      this.containers.delete(instanceId);
      this.logs.delete(instanceId);
    }, this.simulateDelay);
  }

  async getContainer(instanceId: string): Promise<ContainerInstance | null> {
    await this.delay(this.simulateDelay / 2);
    return this.containers.get(instanceId) || null;
  }

  async listContainers(filters?: ContainerFilters): Promise<ContainerInstance[]> {
    await this.delay(this.simulateDelay / 2);

    let containers = Array.from(this.containers.values());

    if (filters?.status) {
      containers = containers.filter(c => c.status === filters.status);
    }

    if (filters?.workspace) {
      containers = containers.filter(c => c.metadata.workspace === filters.workspace);
    }

    if (filters?.labels) {
      containers = containers.filter(c => {
        return Object.entries(filters.labels!).every(
          ([key, value]) => c.metadata[key] === value
        );
      });
    }

    return containers;
  }

  async getLogs(instanceId: string, options?: LogOptions): Promise<LogResult> {
    await this.delay(this.simulateDelay / 2);

    let events = this.logs.get(instanceId) || [];

    if (options?.startTime) {
      events = events.filter(e => e.timestamp >= options.startTime!);
    }

    if (options?.endTime) {
      events = events.filter(e => e.timestamp <= options.endTime!);
    }

    if (options?.limit) {
      events = events.slice(-options.limit);
    }

    // Generate some simulated log traffic
    if (events.length > 0 && Math.random() > 0.7) {
      events.push({
        timestamp: new Date(),
        message: `Simulated log entry: ${Math.random().toString(36).substring(7)}`,
      });
    }

    return { events };
  }

  async storeSecret(name: string, value: string, metadata?: Record<string, string>): Promise<string> {
    await this.delay(this.simulateDelay / 2);
    const key = `/molthub/${this.workspace}/${name}`;
    this.secrets.set(key, value);
    return `arn:aws:secretsmanager:${this.region}:123456789:secret:${key}`;
  }

  async getSecret(name: string): Promise<string | null> {
    await this.delay(this.simulateDelay / 2);
    const key = `/molthub/${this.workspace}/${name}`;
    return this.secrets.get(key) || null;
  }

  async deleteSecret(name: string): Promise<void> {
    await this.delay(this.simulateDelay / 2);
    const key = `/molthub/${this.workspace}/${name}`;
    this.secrets.delete(key);
  }

  getConsoleUrl(resourceType?: string, resourceId?: string): string {
    return `http://localhost:3000/simulated/${resourceType || "dashboard"}/${resourceId || ""}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private addLog(instanceId: string, message: string): void {
    const events = this.logs.get(instanceId) || [];
    events.push({
      timestamp: new Date(),
      message,
    });
    this.logs.set(instanceId, events);
  }
}
