import {
  CloudProvider,
  CloudProviderConfig,
  CloudProviderType,
  ContainerInstance,
  ContainerDeploymentConfig,
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

export interface DigitalOceanConfig extends CloudProviderConfig {
  credentials?: {
    apiToken: string;
  };
}

interface DOApp {
  id: string;
  spec: DOAppSpec;
  created_at: string;
  updated_at: string;
  active_deployment?: DODeployment;
  in_progress_deployment?: DODeployment;
  live_url?: string;
  default_ingress?: string;
}

interface DOAppSpec {
  name: string;
  region?: string;
  services?: DOService[];
}

interface DOService {
  name: string;
  image?: DOImageSource;
  instance_count?: number;
  instance_size_slug?: string;
  envs?: DOEnvVar[];
  http_port?: number;
  run_command?: string;
  routes?: DORoute[];
}

interface DOImageSource {
  registry_type?: "DOCR" | "DOCKER_HUB" | "GHCR";
  repository: string;
  tag?: string;
}

interface DOEnvVar {
  key: string;
  value?: string;
  scope?: "RUN_TIME" | "BUILD_TIME" | "RUN_AND_BUILD_TIME";
  type?: "GENERAL" | "SECRET";
}

interface DORoute {
  path: string;
}

interface DODeployment {
  id: string;
  phase: string;
  created_at: string;
  updated_at: string;
}

/**
 * DigitalOcean App Platform Provider
 * 
 * Manages containerized Moltbot instances on DigitalOcean App Platform
 * PaaS with built-in CI/CD, automatic HTTPS, and global CDN
 */
export class DigitalOceanProvider implements CloudProvider {
  readonly type: CloudProviderType = "digitalocean";
  region: string = "nyc1";
  private apiToken?: string;
  private baseUrl = "https://api.digitalocean.com/v2";

  async initialize(config: CloudProviderConfig): Promise<void> {
    this.region = config.region || "nyc1";
    
    const doConfig = config as DigitalOceanConfig;
    if (!doConfig.credentials?.apiToken) {
      throw new Error("DigitalOcean API token is required");
    }

    this.apiToken = doConfig.credentials.apiToken;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    if (!this.apiToken) {
      throw new Error("DigitalOcean provider not initialized");
    }

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DigitalOcean API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async validate(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.apiToken) {
      errors.push("DigitalOcean provider not initialized");
      return { valid: false, errors, warnings };
    }

    try {
      // Validate API token by listing apps
      await this.fetch<{ apps: DOApp[] }>("/apps");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("401")) {
        errors.push("Invalid API token");
      } else {
        errors.push(`Failed to validate DigitalOcean access: ${message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async bootstrap(options: BootstrapOptions, onProgress?: ProgressCallback): Promise<CloudResources> {
    // DigitalOcean App Platform doesn't require explicit resource creation
    // Apps are created on-demand

    onProgress?.("DigitalOcean App Platform ready", "complete");

    return {
      provider: this.type,
      region: this.region,
      clusterId: `do-${this.region}`,
      network: {
        subnetIds: [],
      },
      iam: {},
      logging: {
        logDriver: "digitalocean",
        logOptions: {},
      },
      metadata: {
        region: this.region,
      },
    };
  }

  async deployContainer(
    config: ContainerDeploymentConfig,
    manifest: InstanceManifest
  ): Promise<ContainerInstance> {
    const appName = this.sanitizeAppName(config.name);
    const instanceId = config.labels?.["molthub.io/instance-id"] || appName;

    // Build environment variables
    const envs: DOEnvVar[] = Object.entries(config.environment || {}).map(([key, value]) => ({
      key,
      value: String(value),
      scope: "RUN_TIME",
      type: "GENERAL",
    }));

    // Handle secrets
    for (const [key, value] of Object.entries(config.secrets || {})) {
      envs.push({
        key,
        value,
        scope: "RUN_TIME",
        type: "SECRET",
      });
    }

    // Map instance size based on CPU/Memory
    const instanceSizeSlug = this.mapToInstanceSize(config.cpu, config.memory);

    // Build service spec
    const service: DOService = {
      name: "moltbot",
      image: {
        registry_type: this.detectRegistryType(config.image),
        repository: config.image,
        tag: "latest",
      },
      instance_count: 1,
      instance_size_slug: instanceSizeSlug,
      envs,
      http_port: config.ports?.[0]?.containerPort || 8080,
      run_command: config.command?.join(" "),
      routes: [{ path: "/" }],
    };

    // Build app spec
    const spec: DOAppSpec = {
      name: appName,
      region: this.region,
      services: [service],
    };

    // Check if app exists
    const existingApp = await this.findAppByName(appName);

    let app: DOApp;
    if (existingApp) {
      // Update existing app
      const result = await this.fetch<{ app: DOApp }>(`/apps/${existingApp.id}`, {
        method: "PUT",
        body: JSON.stringify({ spec }),
      });
      app = result.app;
    } else {
      // Create new app
      const result = await this.fetch<{ app: DOApp }>("/apps", {
        method: "POST",
        body: JSON.stringify({ spec }),
      });
      app = result.app;
    }

    // Wait for deployment to complete
    app = await this.waitForDeployment(app);

    return this.mapAppToContainer(app, instanceId);
  }

  private detectRegistryType(image: string): "DOCKER_HUB" | "DOCR" | "GHCR" {
    if (image.includes("registry.digitalocean.com")) {
      return "DOCR";
    } else if (image.includes("ghcr.io")) {
      return "GHCR";
    }
    return "DOCKER_HUB";
  }

  private mapToInstanceSize(cpu?: number, memory?: number): string {
    const cpuCount = cpu || 1;
    const memoryMB = memory || 512;

    if (cpuCount <= 0.5 && memoryMB <= 512) return "basic-xs";
    if (cpuCount <= 1 && memoryMB <= 1024) return "basic-s";
    if (cpuCount <= 1 && memoryMB <= 2048) return "basic-m";
    if (cpuCount <= 1 && memoryMB <= 4096) return "basic-l";
    if (cpuCount <= 2 && memoryMB <= 4096) return "professional-xs";
    if (cpuCount <= 2 && memoryMB <= 8192) return "professional-s";
    if (cpuCount <= 4 && memoryMB <= 16384) return "professional-m";
    return "professional-l";
  }

  private async findAppByName(name: string): Promise<DOApp | null> {
    const { apps } = await this.fetch<{ apps: DOApp[] }>("/apps");
    return apps.find((app) => app.spec.name === name) || null;
  }

  private async waitForDeployment(app: DOApp, timeoutMs: number = 300000): Promise<DOApp> {
    const start = Date.now();
    
    while (Date.now() - start < timeoutMs) {
      const { app: updatedApp } = await this.fetch<{ app: DOApp }>(`/apps/${app.id}`);
      
      const deployment = updatedApp.in_progress_deployment || updatedApp.active_deployment;
      if (!deployment) {
        await this.sleep(5000);
        continue;
      }

      const phase = deployment.phase;
      if (phase === "ACTIVE") {
        return updatedApp;
      } else if (phase === "ERROR" || phase === "CANCELED") {
        throw new Error(`Deployment failed`);
      }

      await this.sleep(5000);
    }

    throw new Error("Deployment timed out");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async updateContainer(
    instanceId: string,
    config: Partial<ContainerDeploymentConfig>
  ): Promise<ContainerInstance> {
    const appName = this.sanitizeAppName(`molthub-${instanceId}`);
    const app = await this.findAppByName(appName);

    if (!app) {
      throw new Error(`App ${instanceId} not found`);
    }

    // Get current spec
    const spec = { ...app.spec };
    const service = spec.services?.[0];

    if (!service) {
      throw new Error("No service found in app");
    }

    // Apply updates
    if (config.image) {
      service.image = {
        ...service.image,
        repository: config.image,
      };
    }

    if (config.cpu || config.memory) {
      service.instance_size_slug = this.mapToInstanceSize(config.cpu, config.memory);
    }

    if (config.environment) {
      const newEnvs = Object.entries(config.environment).map(([key, value]) => ({
        key,
        value: String(value),
        scope: "RUN_TIME" as const,
        type: "GENERAL" as const,
      }));
      
      // Merge with existing envs
      const existingKeys = new Set(newEnvs.map((e) => e.key));
      service.envs = [
        ...(service.envs?.filter((e) => !existingKeys.has(e.key)) || []),
        ...newEnvs,
      ];
    }

    // Update app
    const { app: updatedApp } = await this.fetch<{ app: DOApp }>(`/apps/${app.id}`, {
      method: "PUT",
      body: JSON.stringify({ spec }),
    });

    // Wait for deployment
    const deployedApp = await this.waitForDeployment(updatedApp);
    return this.mapAppToContainer(deployedApp, instanceId);
  }

  async stopContainer(instanceId: string): Promise<void> {
    const appName = this.sanitizeAppName(`molthub-${instanceId}`);
    const app = await this.findAppByName(appName);

    if (!app) {
      throw new Error(`App ${instanceId} not found`);
    }

    // Scale to 0 instances
    const spec = { ...app.spec };
    if (spec.services?.[0]) {
      spec.services[0].instance_count = 0;
    }

    await this.fetch(`/apps/${app.id}`, {
      method: "PUT",
      body: JSON.stringify({ spec }),
    });
  }

  async startContainer(instanceId: string): Promise<void> {
    const appName = this.sanitizeAppName(`molthub-${instanceId}`);
    const app = await this.findAppByName(appName);

    if (!app) {
      throw new Error(`App ${instanceId} not found`);
    }

    // Scale to 1 instance
    const spec = { ...app.spec };
    if (spec.services?.[0]) {
      spec.services[0].instance_count = 1;
    }

    const { app: updatedApp } = await this.fetch<{ app: DOApp }>(`/apps/${app.id}`, {
      method: "PUT",
      body: JSON.stringify({ spec }),
    });

    await this.waitForDeployment(updatedApp);
  }

  async deleteContainer(instanceId: string): Promise<void> {
    const appName = this.sanitizeAppName(`molthub-${instanceId}`);
    const app = await this.findAppByName(appName);

    if (!app) {
      return;
    }

    await this.fetch(`/apps/${app.id}`, {
      method: "DELETE",
    });
  }

  async getContainer(instanceId: string): Promise<ContainerInstance | null> {
    const appName = this.sanitizeAppName(`molthub-${instanceId}`);
    const app = await this.findAppByName(appName);

    if (!app) {
      return null;
    }

    return this.mapAppToContainer(app, instanceId);
  }

  async listContainers(filters?: ContainerFilters): Promise<ContainerInstance[]> {
    const { apps } = await this.fetch<{ apps: DOApp[] }>("/apps");

    let containers = apps
      .filter((app) => app.spec.name.startsWith("molthub-"))
      .map((app) => {
        const instanceId = app.spec.name.replace("molthub-", "");
        return this.mapAppToContainer(app, instanceId);
      });

    if (filters?.status) {
      containers = containers.filter((c) => c.status === filters.status);
    }

    return containers;
  }

  async getLogs(instanceId: string, options?: LogOptions): Promise<LogResult> {
    const appName = this.sanitizeAppName(`molthub-${instanceId}`);
    const app = await this.findAppByName(appName);

    if (!app) {
      throw new Error(`App ${instanceId} not found`);
    }

    const limit = options?.limit || 100;
    
    // Get logs from DigitalOcean
    const result = await this.fetch<{ historic_urls: string[]; live_url?: string }>(
      `/apps/${app.id}/logs?type=RUN&pod_name=${appName}`
    );

    // DigitalOcean returns URLs to download logs
    if (result.historic_urls?.length > 0) {
      const events: LogEvent[] = [{
        timestamp: new Date(),
        message: `Logs available at: ${result.historic_urls.join(", ")}`,
      }];
      return {
        events,
        nextToken: limit > 100 ? String(limit) : undefined,
      };
    }

    return {
      events: [{
        timestamp: new Date(),
        message: "No logs available",
      }],
    };
  }

  async storeSecret(name: string, value: string, metadata?: Record<string, string>): Promise<string> {
    // DigitalOcean App Platform uses environment variables with type: "SECRET"
    // Secrets are stored per-app, not globally
    return `do:secret:${name}`;
  }

  async getSecret(name: string): Promise<string | null> {
    // DigitalOcean doesn't have a global secret store for App Platform
    throw new Error("DigitalOcean App Platform secrets are app-specific.");
  }

  async deleteSecret(name: string): Promise<void> {
    // Secrets are deleted when the app is updated
  }

  getConsoleUrl(resourceType?: string, resourceId?: string): string {
    if (resourceId) {
      return `https://cloud.digitalocean.com/apps/${resourceId}`;
    }
    return "https://cloud.digitalocean.com/apps";
  }

  private sanitizeAppName(name: string): string {
    // DigitalOcean app names: lowercase, alphanumeric and hyphens, max 32 chars
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 32);
  }

  private mapAppToContainer(app: DOApp, instanceId: string): ContainerInstance {
    const deployment = app.active_deployment || app.in_progress_deployment;
    const service = app.spec.services?.[0];
    const phase = deployment?.phase;

    let status: ContainerInstance["status"] = "PENDING";
    if (phase === "ACTIVE") {
      status = "RUNNING";
    } else if (phase === "ERROR" || phase === "CANCELED") {
      status = "ERROR";
    } else if (phase === "PENDING_BUILD" || phase === "PENDING_DEPLOY" || phase === "BUILDING" || phase === "DEPLOYING") {
      status = "CREATING";
    }

    // Check if scaled to 0
    if (service?.instance_count === 0) {
      status = "STOPPED";
    }

    let health: ContainerInstance["health"] = "UNKNOWN";
    if (status === "RUNNING") {
      health = "HEALTHY";
    } else if (status === "ERROR") {
      health = "UNHEALTHY";
    }

    return {
      id: instanceId,
      name: app.spec.name,
      status,
      health,
      provider: this.type,
      region: this.region,
      metadata: {
        appId: app.id,
        url: app.live_url || "",
        instanceSize: service?.instance_size_slug || "",
        defaultIngress: app.default_ingress || "",
      },
      createdAt: new Date(app.created_at),
      updatedAt: new Date(app.updated_at),
    };
  }
}
