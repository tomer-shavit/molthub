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
  ContainerStatus,
  ContainerHealth,
} from "../../interface/provider";
import { InstanceManifest } from "@molthub/core";

export interface DigitalOceanConfig extends CloudProviderConfig {
  credentials?: {
    apiToken: string;
  };
}

interface DOApp {
  id: string;
  owner_id?: number;
  owner_uuid?: string;
  spec: DOAppSpec;
  default_ingress?: string;
  created_at: string;
  updated_at: string;
  active_deployment?: DODeployment;
  in_progress_deployment?: DODeployment;
  last_deployment_created_at?: string;
  live_url?: string;
  region?: {
    slug: string;
    label: string;
    flag: string;
    continent: string;
    data_centers: string[];
    disabled?: boolean;
    reason?: string;
  };
  tier_slug?: string;
  permissions?: string[];
}

interface DOAppSpec {
  name: string;
  region?: string;
  services?: DOService[];
  envs?: DOEnvVar[];
  alerts?: DOAlert[];
}

interface DOService {
  name: string;
  image?: DOImageSource;
  github?: DOGitSource;
  gitlab?: DOGitSource;
  dockerfile_path?: string;
  envs?: DOEnvVar[];
  instance_count?: number;
  instance_size_slug?: string;
  routes?: DORoute[];
  health_check?: DOHealthCheck;
  http_port?: number;
  internal_ports?: number[];
  run_command?: string;
}

interface DOImageSource {
  registry_type?: "DOCR" | "DOCKER_HUB" | "GHCR";
  registry?: string;
  repository: string;
  tag?: string;
  digest?: string;
  deploy_on_push?: {
    enabled: boolean;
  };
}

interface DOGitSource {
  repo: string;
  branch: string;
  deploy_on_push?: boolean;
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

interface DOHealthCheck {
  http_path?: string;
  port?: number;
}

interface DODeployment {
  id: string;
  spec: DOAppSpec;
  services?: DODeploymentService[];
  phase: "PENDING_BUILD" | "PENDING_DEPLOY" | "BUILDING" | "DEPLOYING" | "ACTIVE" | "SUPERSEDED" | "ERROR" | "CANCELED";
  progress?: DODeploymentProgress;
  created_at: string;
  updated_at: string;
  cause?: string;
  cloned_from?: string;
}

interface DODeploymentService {
  name: string;
  source_commit_hash?: string;
  build_info?: {
    name?: string;
    stages?: DOBuildStage[];
  };
}

interface DOBuildStage {
  name: string;
  steps?: DOBuildStep[];
}

interface DOBuildStep {
  name: string;
  status: string;
  started_at?: string;
  ended_at?: string;
}

interface DODeploymentProgress {
  pending_steps?: number;
  total_steps?: number;
  completed_steps?: number;
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

  async initialize(config: DigitalOceanConfig): Promise<void> {
    this.region = config.region || "nyc1";
    
    if (!config.credentials?.apiToken) {
      throw new Error("DigitalOcean API token is required");
    }

    this.apiToken = config.credentials.apiToken;
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
    } catch (error: any) {
      if (error.message?.includes("401")) {
        errors.push("Invalid API token");
      } else {
        errors.push(`Failed to validate DigitalOcean access: ${error.message}`);
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

    onProgress?.({ step: "DigitalOcean App Platform ready", percent: 100 });

    return {
      provider: this.type,
      region: this.region,
      vpcId: `do-${this.region}`,
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

    // Build environment variables
    const envs: DOEnvVar[] = Object.entries(config.envVars || {}).map(([key, value]) => ({
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

    return this.mapAppToContainer(app, config.id);
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
    // DigitalOcean instance sizes: basic-xs, basic-s, basic-m, basic-l, professional-xs, etc.
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
        throw new Error(`Deployment failed: ${deployment.progress}`);
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

    if (config.envVars) {
      const newEnvs = Object.entries(config.envVars).map(([key, value]) => ({
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

    if (filters?.fleetId) {
      containers = containers.filter((c) => c.metadata?.fleetId === filters.fleetId);
    }

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

    const tail = options?.tail || 100;
    
    // Get logs from DigitalOcean
    const result = await this.fetch<{ historic_urls: string[]; live_url?: string }>(
      `/apps/${app.id}/logs?type=RUN&pod_name=${appName}`
    );

    // DigitalOcean returns URLs to download logs
    // For simplicity, return the URL for live logs
    if (result.historic_urls?.length > 0) {
      // In a real implementation, you'd fetch and parse the log files
      return {
        content: `Logs available at: ${result.historic_urls.join(", ")}`,
        lines: tail,
      };
    }

    return {
      content: "No logs available",
      lines: 0,
    };
  }

  async storeSecret(name: string, value: string, metadata?: Record<string, string>): Promise<string> {
    // DigitalOcean App Platform uses environment variables with type: "SECRET"
    // Secrets are stored per-app, not globally
    // We'll return a reference that can be used in the env var
    return `do:secret:${name}`;
  }

  async getSecret(name: string): Promise<string | null> {
    // DigitalOcean doesn't have a global secret store for App Platform
    // Secrets are retrieved from the app's environment variables
    throw new Error("DigitalOcean App Platform secrets are app-specific. Use getContainer to retrieve.");
  }

  async deleteSecret(name: string): Promise<void> {
    // Secrets are deleted when the app is updated
    // No-op for global secret deletion
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

    let status: ContainerStatus = ContainerStatus.PENDING;
    if (phase === "ACTIVE") {
      status = ContainerStatus.RUNNING;
    } else if (phase === "ERROR" || phase === "CANCELED") {
      status = ContainerStatus.ERROR;
    } else if (phase === "PENDING_BUILD" || phase === "PENDING_DEPLOY" || phase === "BUILDING" || phase === "DEPLOYING") {
      status = ContainerStatus.CREATING;
    }

    // Check if scaled to 0
    if (service?.instance_count === 0) {
      status = ContainerStatus.STOPPED;
    }

    let health = ContainerHealth.UNKNOWN;
    if (status === ContainerStatus.RUNNING) {
      health = ContainerHealth.HEALTHY;
    } else if (status === ContainerStatus.ERROR) {
      health = ContainerHealth.UNHEALTHY;
    }

    // Parse instance size to CPU/memory
    let cpu = 1;
    let memory = 512;
    const sizeSlug = service?.instance_size_slug || "basic-xs";
    
    switch (sizeSlug) {
      case "basic-xs": cpu = 0.5; memory = 512; break;
      case "basic-s": cpu = 1; memory = 1024; break;
      case "basic-m": cpu = 1; memory = 2048; break;
      case "basic-l": cpu = 1; memory = 4096; break;
      case "professional-xs": cpu = 1; memory = 2048; break;
      case "professional-s": cpu = 2; memory = 4096; break;
      case "professional-m": cpu = 2; memory = 8192; break;
      case "professional-l": cpu = 4; memory = 16384; break;
    }

    const ports = service?.http_port
      ? [{ containerPort: service.http_port, protocol: "tcp" as const }]
      : [];

    return {
      id: instanceId,
      name: app.spec.name,
      provider: this.type,
      region: app.region?.slug || this.region,
      status,
      health,
      image: service?.image?.repository || "",
      cpu,
      memory,
      ports,
      envVars: {},
      metadata: {
        appId: app.id,
        url: app.live_url,
        fleetId: undefined, // DO doesn't have a direct fleet concept
        instanceSize: sizeSlug,
        defaultIngress: app.default_ingress,
      },
      createdAt: new Date(app.created_at),
      updatedAt: new Date(app.updated_at),
    };
  }
}
