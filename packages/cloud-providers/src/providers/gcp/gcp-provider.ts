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
import { InstanceManifest } from "@clawster/core";
import { ServicesClient } from "@google-cloud/run";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { Logging } from "@google-cloud/logging";

export interface GCPConfig extends CloudProviderConfig {
  credentials?: {
    projectId: string;
    keyFile?: string;
  };
}

interface GCPResources {
  projectId: string;
  runClient: ServicesClient;
  secretClient: SecretManagerServiceClient;
  loggingClient: Logging;
}

/** Minimal shape of a Cloud Run service as returned by the SDK */
interface GCPServiceInfo {
  name?: string;
  labels?: Record<string, string>;
  template?: Record<string, unknown>;
  conditions?: Array<{ type?: string; status?: string; reason?: string }>;
  status?: { url?: string };
  createTime?: string;
  updateTime?: string;
}

/**
 * Google Cloud Run Provider
 * 
 * Manages containerized OpenClaw instances on Google Cloud Run
 * Fully managed serverless containers with automatic scaling
 */
export class GCPProvider implements CloudProvider {
  readonly type: CloudProviderType = "gcp";
  region: string = "us-central1";
  private resources?: GCPResources;

  async initialize(config: CloudProviderConfig): Promise<void> {
    this.region = config.region || "us-central1";
    
    const gcpConfig = config as GCPConfig;
    if (!gcpConfig.credentials?.projectId) {
      throw new Error("GCP projectId is required");
    }

    const projectId = gcpConfig.credentials.projectId;
    
    // Initialize clients
    this.resources = {
      projectId,
      runClient: new ServicesClient(gcpConfig.credentials.keyFile 
        ? { keyFile: gcpConfig.credentials.keyFile }
        : undefined),
      secretClient: new SecretManagerServiceClient(gcpConfig.credentials.keyFile
        ? { keyFile: gcpConfig.credentials.keyFile }
        : undefined),
      loggingClient: new Logging({
        projectId,
        keyFile: gcpConfig.credentials.keyFile,
      }),
    };
  }

  async validate(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.resources) {
      errors.push("GCP provider not initialized");
      return { valid: false, errors, warnings };
    }

    try {
      // Check project exists and we have access
      await this.resources.runClient.listServices({
        parent: `projects/${this.resources.projectId}/locations/${this.region}`,
      });
    } catch (error: unknown) {
      const grpcError = error as { code?: number; message?: string };
      if (grpcError.code === 7) {
        errors.push("Permission denied. Ensure Cloud Run API is enabled and you have appropriate permissions.");
      } else if (grpcError.code === 5) {
        errors.push(`Project '${this.resources.projectId}' not found`);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to validate GCP access: ${message}`);
      }
    }

    // Check Secret Manager access
    try {
      await this.resources.secretClient.listSecrets({
        parent: `projects/${this.resources.projectId}`,
      });
    } catch (error: unknown) {
      warnings.push("Cannot access Secret Manager. Secrets will not be available.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async bootstrap(options: BootstrapOptions, onProgress?: ProgressCallback): Promise<CloudResources> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    onProgress?.("Enabling Cloud Run API", "in_progress");
    
    // Cloud Run doesn't need explicit resource creation like AWS VPC
    // Services are created on-demand
    
    onProgress?.("Cloud Run ready", "complete");

    return {
      provider: this.type,
      region: this.region,
      clusterId: `projects/${this.resources.projectId}`,
      network: {
        subnetIds: [],
      },
      iam: {},
      logging: {
        logDriver: "cloud-logging",
        logOptions: {
          projectId: this.resources.projectId,
        },
      },
      metadata: {
        projectId: this.resources.projectId,
      },
    };
  }

  async deployContainer(
    config: ContainerDeploymentConfig,
    manifest: InstanceManifest
  ): Promise<ContainerInstance> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const serviceName = this.sanitizeServiceName(config.name);
    const parent = `projects/${this.resources.projectId}/locations/${this.region}`;
    const instanceId = config.labels?.["clawster.io/instance-id"] || serviceName;

    // Build environment variables
    const envs = Object.entries(config.environment || {}).map(([name, value]) => ({
      name,
      value: String(value),
    }));

    // Handle secrets
    for (const [name, value] of Object.entries(config.secrets || {})) {
      const secretId = `${serviceName}-${name}`.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      await this.storeSecretInGSM(secretId, value);
      (envs as Array<{ name: string; value?: string; valueSource?: { secretKeyRef: { secret: string; version: string } } }>).push({
        name,
        valueSource: {
          secretKeyRef: {
            secret: secretId,
            version: "latest",
          },
        },
      });
    }

    // Build container spec
    const container = {
      image: config.image,
      resources: {
        limits: {
          cpu: `${config.cpu || 1}`,
          memory: `${config.memory || 512}Mi`,
        },
      },
      env: envs,
      ports: (config.ports || []).map((port) => ({
        containerPort: port.containerPort,
      })),
      command: config.command,
    };

    // Build service request
    const service = {
      template: {
        metadata: {
          labels: {
            ...config.labels,
            managedBy: "clawster",
          },
          annotations: {
            "run.googleapis.com/execution-environment": "gen2",
            ...(config.cpu && config.cpu < 1 && {
              "run.googleapis.com/cpu-throttling": "true",
            }),
          },
        },
        spec: {
          containers: [container],
        },
      },
      labels: {
        managedBy: "clawster",
      },
    };

    // Create or update service
    const operation = await this.resources.runClient.createService({
      parent,
      serviceId: serviceName,
      service: service as Record<string, unknown>,
    });

    // Wait for operation to complete
    const [response] = await (operation as unknown as { promise(): Promise<unknown[]> }).promise();

    return this.mapServiceToContainer(response as GCPServiceInfo, instanceId);
  }

  private async storeSecretInGSM(secretId: string, value: string): Promise<string> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const parent = `projects/${this.resources.projectId}`;
    const secretName = `${parent}/secrets/${secretId}`;

    try {
      // Try to get existing secret
      await this.resources.secretClient.getSecret({ name: secretName });
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 5) {
        // Secret doesn't exist, create it
        await this.resources.secretClient.createSecret({
          parent,
          secretId,
          secret: {
            replication: {
              automatic: {},
            },
            labels: {
              managedBy: "clawster",
            },
          },
        });
      } else {
        throw error;
      }
    }

    // Add new version
    await this.resources.secretClient.addSecretVersion({
      parent: secretName,
      payload: {
        data: Buffer.from(value, "utf8"),
      },
    });

    return secretName;
  }

  async updateContainer(
    instanceId: string,
    config: Partial<ContainerDeploymentConfig>
  ): Promise<ContainerInstance> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const serviceName = this.sanitizeServiceName(`clawster-${instanceId}`);
    const name = `projects/${this.resources.projectId}/locations/${this.region}/services/${serviceName}`;

    // Get current service
    const [currentService] = await this.resources.runClient.getService({ name });

    // Build update
    const updateMask: string[] = [];
    const currentTemplate = currentService.template as Record<string, unknown>;
    const currentSpec = (currentTemplate?.spec || {}) as Record<string, unknown>;
    const currentContainers = (currentSpec?.containers || []) as Array<Record<string, unknown>>;
    const service: Record<string, unknown> = {
      name,
      template: {
        ...currentTemplate,
        spec: {
          ...currentSpec,
          containers: [...currentContainers],
        },
      },
    };

    const serviceTemplate = service.template as Record<string, unknown>;
    const serviceSpec = serviceTemplate.spec as Record<string, unknown>;
    const serviceContainers = serviceSpec.containers as Array<Record<string, unknown>>;
    const container = serviceContainers[0];

    if (config.image) {
      container.image = config.image;
      updateMask.push("template.spec.containers.image");
    }

    if (config.cpu || config.memory) {
      const existingResources = container.resources as Record<string, Record<string, string>> | undefined;
      container.resources = {
        limits: {
          cpu: `${config.cpu || existingResources?.limits?.cpu || 1}`,
          memory: `${config.memory || 512}Mi`,
        },
      };
      updateMask.push("template.spec.containers.resources");
    }

    if (config.environment) {
      // Merge with existing env vars
      const existingEnv = (container.env || []) as Array<{ name: string }>;
      const newEnv = Object.entries(config.environment).map(([name, value]) => ({
        name,
        value: String(value),
      }));
      container.env = [...existingEnv.filter((e: { name: string }) => !config.environment?.[e.name]), ...newEnv];
      updateMask.push("template.spec.containers.env");
    }

    if (updateMask.length === 0) {
      throw new Error("No fields to update");
    }

    const operation = await this.resources.runClient.updateService({
      service,
      updateMask: {
        paths: updateMask,
      },
    });

    const [response] = await (operation as unknown as { promise(): Promise<unknown[]> }).promise();
    return this.mapServiceToContainer(response as GCPServiceInfo, instanceId);
  }

  async stopContainer(instanceId: string): Promise<void> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const serviceName = this.sanitizeServiceName(`clawster-${instanceId}`);
    const name = `projects/${this.resources.projectId}/locations/${this.region}/services/${serviceName}`;

    // Get current service
    const [service] = await this.resources.runClient.getService({ name });

    // Update to set min instances to 0 (scales to 0)
    const operation = await this.resources.runClient.updateService({
      service: {
        name,
        template: {
          metadata: {
            annotations: {
              "autoscaling.knative.dev/minScale": "0",
            },
          },
        },
      } as Record<string, unknown>,
      updateMask: {
        paths: ["template.metadata.annotations.autoscaling.knative.dev/minScale"],
      },
    });

    await (operation as unknown as { promise(): Promise<unknown[]> }).promise();
  }

  async startContainer(instanceId: string): Promise<void> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const serviceName = this.sanitizeServiceName(`clawster-${instanceId}`);
    const name = `projects/${this.resources.projectId}/locations/${this.region}/services/${serviceName}`;

    // Update to set min instances to 1 (always running)
    const operation = await this.resources.runClient.updateService({
      service: {
        name,
        template: {
          metadata: {
            annotations: {
              "autoscaling.knative.dev/minScale": "1",
            },
          },
        },
      } as Record<string, unknown>,
      updateMask: {
        paths: ["template.metadata.annotations.autoscaling.knative.dev/minScale"],
      },
    });

    await (operation as unknown as { promise(): Promise<unknown[]> }).promise();
  }

  async deleteContainer(instanceId: string): Promise<void> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const serviceName = this.sanitizeServiceName(`clawster-${instanceId}`);
    const name = `projects/${this.resources.projectId}/locations/${this.region}/services/${serviceName}`;

    await this.resources.runClient.deleteService({ name });
  }

  async getContainer(instanceId: string): Promise<ContainerInstance | null> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const serviceName = this.sanitizeServiceName(`clawster-${instanceId}`);
    const name = `projects/${this.resources.projectId}/locations/${this.region}/services/${serviceName}`;

    try {
      const [service] = await this.resources.runClient.getService({ name });
      return this.mapServiceToContainer(service as GCPServiceInfo, instanceId);
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 5) {
        return null;
      }
      throw error;
    }
  }

  async listContainers(filters?: ContainerFilters): Promise<ContainerInstance[]> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const parent = `projects/${this.resources.projectId}/locations/${this.region}`;
    
    const [services] = await this.resources.runClient.listServices({
      parent,
    });

    let containers = services
      .filter((s) => s.labels?.managedBy === "clawster")
      .map((s) => this.mapServiceToContainer(s as GCPServiceInfo, s.labels?.["clawster.io/instance-id"] || s.name?.split('/').pop() || ''));

    if (filters?.status) {
      containers = containers.filter((c) => c.status === filters.status);
    }

    return containers;
  }

  async getLogs(instanceId: string, options?: LogOptions): Promise<LogResult> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const serviceName = this.sanitizeServiceName(`clawster-${instanceId}`);
    const limit = options?.limit || 100;

    // Query Cloud Logging
    const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}"`;
    
    const [entries] = await this.resources.loggingClient.getEntries({
      filter,
      pageSize: limit,
      orderBy: "timestamp desc",
    });

    const events: LogEvent[] = entries.map((entry) => {
      const timestamp = entry.metadata?.timestamp;
      let date: Date;
      if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
        // It's a Timestamp object from protobuf
        date = (timestamp as { toDate(): Date }).toDate();
      } else if (timestamp) {
        date = new Date(timestamp as string | number);
      } else {
        date = new Date();
      }
      return {
        timestamp: date,
        message: entry.data?.textPayload || JSON.stringify(entry.data) || "",
      };
    });

    return {
      events: events.reverse(),
    };
  }

  async storeSecret(name: string, value: string, metadata?: Record<string, string>): Promise<string> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const secretId = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const secretName = await this.storeSecretInGSM(secretId, value);
    return `gsm:${secretName}`;
  }

  async getSecret(name: string): Promise<string | null> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    // Handle gsm: prefix
    const secretId = name.startsWith("gsm:")
      ? name.replace("gsm:", "")
      : `projects/${this.resources.projectId}/secrets/${name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;

    try {
      const [version] = await this.resources.secretClient.accessSecretVersion({
        name: `${secretId}/versions/latest`,
      });
      return version.payload?.data?.toString() || null;
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 5) {
        return null;
      }
      throw error;
    }
  }

  async deleteSecret(name: string): Promise<void> {
    if (!this.resources) {
      throw new Error("GCP provider not initialized");
    }

    const secretId = name.startsWith("gsm:")
      ? name.replace("gsm:", "").split('/secrets/')[1]?.split('/')[0]
      : name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    if (!secretId) {
      throw new Error(`Invalid secret name: ${name}`);
    }

    await this.resources.secretClient.deleteSecret({
      name: `projects/${this.resources.projectId}/secrets/${secretId}`,
    });
  }

  getConsoleUrl(resourceType?: string, resourceId?: string): string {
    const base = `https://console.cloud.google.com/run?project=${this.resources?.projectId || ""}`;
    if (resourceId) {
      return `${base}&service=${resourceId}`;
    }
    return base;
  }

  private sanitizeServiceName(name: string): string {
    // Cloud Run service names: lowercase, letters, numbers, hyphens, max 63 chars
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 63);
  }

  private mapServiceToContainer(service: GCPServiceInfo, instanceId: string): ContainerInstance {
    const template = service.template;
    const spec = template?.spec as Record<string, unknown> | undefined;
    const containers = spec?.containers as Array<Record<string, unknown>> | undefined;
    const container = containers?.[0];
    const conditions = service.conditions || [];

    let status: ContainerInstance["status"] = "PENDING";
    const readyCondition = conditions.find((c: { type?: string }) => c.type === "Ready");
    
    if (readyCondition?.status === "True") {
      status = "RUNNING";
    } else if (readyCondition?.status === "False") {
      const reason = readyCondition.reason;
      if (reason === "RevisionFailed") {
        status = "ERROR";
      } else if (reason === "Inactive") {
        status = "STOPPED";
      } else {
        status = "PENDING";
      }
    }

    let health: ContainerInstance["health"] = "UNKNOWN";
    if (status === "RUNNING") {
      health = "HEALTHY";
    } else if (status === "ERROR") {
      health = "UNHEALTHY";
    }

    return {
      id: instanceId,
      name: service.name?.split('/').pop() || instanceId,
      status,
      health,
      provider: this.type,
      region: this.region,
      metadata: {
        projectId: this.resources?.projectId || "",
        serviceName: service.name || "",
        url: service.status?.url || "",
        ...service.labels,
      },
      createdAt: service.createTime ? new Date(service.createTime) : new Date(),
      updatedAt: service.updateTime ? new Date(service.updateTime) : new Date(),
    };
  }
}
