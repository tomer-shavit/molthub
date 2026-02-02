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
import { DefaultAzureCredential, ClientSecretCredential } from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";
import { ContainerInstanceManagementClient } from "@azure/arm-containerinstance";
import { SecretClient } from "@azure/keyvault-secrets";
import { LogsQueryClient } from "@azure/monitor-query";

export interface AzureConfig extends CloudProviderConfig {
  credentials?: {
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
    subscriptionId: string;
  };
  resourceGroup?: string;
  keyVaultName?: string;
  logAnalyticsWorkspaceId?: string;
}

interface AzureResources {
  credential: DefaultAzureCredential | ClientSecretCredential;
  subscriptionId: string;
  resourceGroup: string;
  containerClient: ContainerInstanceManagementClient;
  resourceClient: ResourceManagementClient;
  keyVaultClient?: SecretClient;
  logsClient?: LogsQueryClient;
  keyVaultName?: string;
  logAnalyticsWorkspaceId?: string;
}

/** Minimal shape of an Azure Container Group as returned by the SDK */
interface AzureContainerGroup {
  name?: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: {
    provisioningState?: string;
    containers?: Array<{
      properties?: {
        instanceView?: {
          state?: string;
        };
      };
    }>;
  };
}

/**
 * Azure Container Instances Provider
 * 
 * Manages containerized OpenClaw instances on Azure Container Instances (ACI)
 * Similar to AWS ECS Fargate - serverless containers without VM management
 */
export class AzureProvider implements CloudProvider {
  readonly type: CloudProviderType = "azure";
  region: string = "eastus";
  private resources?: AzureResources;

  async initialize(config: CloudProviderConfig): Promise<void> {
    this.region = config.region || "eastus";
    
    const azureConfig = config as AzureConfig;
    if (!azureConfig.credentials?.subscriptionId) {
      throw new Error("Azure subscriptionId is required");
    }

    const subscriptionId = azureConfig.credentials.subscriptionId;
    
    // Use service principal if provided, otherwise default credential (CLI, MSI, etc.)
    let credential: DefaultAzureCredential | ClientSecretCredential;
    if (azureConfig.credentials.clientId && azureConfig.credentials.clientSecret && azureConfig.credentials.tenantId) {
      credential = new ClientSecretCredential(
        azureConfig.credentials.tenantId,
        azureConfig.credentials.clientId,
        azureConfig.credentials.clientSecret
      );
    } else {
      credential = new DefaultAzureCredential();
    }

    const resourceGroup = azureConfig.resourceGroup || `clawster-${this.region}`;

    this.resources = {
      credential,
      subscriptionId,
      resourceGroup,
      containerClient: new ContainerInstanceManagementClient(credential, subscriptionId),
      resourceClient: new ResourceManagementClient(credential, subscriptionId),
      keyVaultName: azureConfig.keyVaultName,
      logAnalyticsWorkspaceId: azureConfig.logAnalyticsWorkspaceId,
    };

    // Initialize Key Vault client if configured
    if (azureConfig.keyVaultName) {
      const vaultUrl = `https://${azureConfig.keyVaultName}.vault.azure.net`;
      this.resources.keyVaultClient = new SecretClient(vaultUrl, credential);
    }

    // Initialize Logs client if Log Analytics is configured
    if (azureConfig.logAnalyticsWorkspaceId) {
      this.resources.logsClient = new LogsQueryClient(credential);
    }
  }

  async validate(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.resources) {
      errors.push("Azure provider not initialized");
      return { valid: false, errors, warnings };
    }

    try {
      // Check resource group exists
      const rg = await this.resources.resourceClient.resourceGroups.get(
        this.resources.resourceGroup
      );
      
      if (rg.location !== this.region) {
        warnings.push(`Resource group is in ${rg.location}, expected ${this.region}`);
      }
    } catch (error) {
      errors.push(`Resource group '${this.resources.resourceGroup}' not found in region ${this.region}`);
    }

    // Check Key Vault if configured
    if (this.resources.keyVaultName) {
      try {
        // Try to list secrets (will fail if no access)
        await this.resources.keyVaultClient?.listPropertiesOfSecrets().next();
      } catch (error) {
        warnings.push(`Cannot access Key Vault '${this.resources.keyVaultName}'. Secrets will not be available.`);
      }
    }

    // Check Log Analytics if configured
    if (this.resources.logAnalyticsWorkspaceId) {
      try {
        // Simple validation - workspace ID format
        const workspaceId = this.resources.logAnalyticsWorkspaceId;
        if (!workspaceId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          warnings.push("Log Analytics Workspace ID format appears invalid");
        }
      } catch (error) {
        warnings.push("Cannot validate Log Analytics Workspace");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async bootstrap(options: BootstrapOptions, onProgress?: ProgressCallback): Promise<CloudResources> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    onProgress?.("Creating resource group", "in_progress");
    
    // Create or ensure resource group exists
    try {
      await this.resources.resourceClient.resourceGroups.createOrUpdate(
        this.resources.resourceGroup,
        {
          location: this.region,
          tags: {
            managedBy: "clawster",
            workspace: options.workspace,
          },
        }
      );
    } catch (error) {
      throw new Error(`Failed to create resource group: ${error}`);
    }

    onProgress?.("Resource group ready", "complete");

    return {
      provider: this.type,
      region: this.region,
      clusterId: this.resources.resourceGroup,
      network: {
        subnetIds: [],
      },
      iam: {},
      logging: {
        logDriver: "azure-monitor",
        logOptions: {
          workspaceId: this.resources.logAnalyticsWorkspaceId || "",
        },
      },
      metadata: {
        resourceGroup: this.resources.resourceGroup,
        subscriptionId: this.resources.subscriptionId,
      },
    };
  }

  async deployContainer(
    config: ContainerDeploymentConfig,
    manifest: InstanceManifest
  ): Promise<ContainerInstance> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    const containerGroupName = this.sanitizeName(config.name);
    const containerName = "openclaw";
    const instanceId = config.labels?.["clawster.io/instance-id"] || containerGroupName;

    // Build environment variables
    const environmentVariables = Object.entries(config.environment || {}).map(([name, value]) => ({
      name,
      value: String(value),
    }));

    // Handle secrets
    for (const [name, value] of Object.entries(config.secrets || {})) {
      if (this.resources.keyVaultClient) {
        // Store in Key Vault
        const secretName = `${containerGroupName}-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        await this.resources.keyVaultClient.setSecret(secretName, value);
        environmentVariables.push({
          name,
          value: `keyvault:${secretName}`,
        });
      } else {
        // Store as secure environment variable
        (environmentVariables as Array<{ name: string; value?: string; secureValue?: string }>).push({
          name,
          secureValue: value,
        });
      }
    }

    // Build container group
    const containerGroup = {
      location: this.region,
      containers: [
        {
          name: containerName,
          image: config.image,
          resources: {
            requests: {
              cpu: config.cpu || 1,
              memoryInGB: (config.memory || 2048) / 1024,
            },
          },
          environmentVariables,
          ports: (config.ports || []).map((port) => ({
            port: port.containerPort,
            protocol: port.protocol === "udp" ? "UDP" : "TCP",
          })),
          command: config.command,
        },
      ],
      osType: "Linux" as const,
      restartPolicy: "Always" as const,
      tags: {
        ...config.labels,
        managedBy: "clawster",
      },
    };

    // Create container group
    const result = await this.resources.containerClient.containerGroups.beginCreateOrUpdate(
      this.resources.resourceGroup,
      containerGroupName,
      containerGroup
    );
    
    await result.pollUntilDone();

    // Get the created container group
    const created = await this.resources.containerClient.containerGroups.get(
      this.resources.resourceGroup,
      containerGroupName
    );

    return this.mapContainerInstance(created, instanceId);
  }

  async updateContainer(
    instanceId: string,
    config: Partial<ContainerDeploymentConfig>
  ): Promise<ContainerInstance> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    // Azure Container Instances doesn't support in-place updates
    // We need to delete and recreate
    const current = await this.getContainer(instanceId);
    if (!current) {
      throw new Error(`Container ${instanceId} not found`);
    }

    throw new Error(
      "Azure Container Instances requires container recreation for updates. " +
      "Use delete and deploy instead."
    );
  }

  async stopContainer(instanceId: string): Promise<void> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    const containerGroupName = this.getContainerGroupName(instanceId);
    
    await this.resources.containerClient.containerGroups.stop(
      this.resources.resourceGroup,
      containerGroupName
    );
  }

  async startContainer(instanceId: string): Promise<void> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    const containerGroupName = this.getContainerGroupName(instanceId);
    
    await this.resources.containerClient.containerGroups.beginStart(
      this.resources.resourceGroup,
      containerGroupName
    );
  }

  async deleteContainer(instanceId: string): Promise<void> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    const containerGroupName = this.getContainerGroupName(instanceId);
    
    await this.resources.containerClient.containerGroups.beginDeleteAndWait(
      this.resources.resourceGroup,
      containerGroupName
    );

    // Clean up Key Vault secrets
    if (this.resources.keyVaultClient) {
      try {
        const prefix = `${containerGroupName}-`.toLowerCase();
        for await (const secret of this.resources.keyVaultClient.listPropertiesOfSecrets()) {
          if (secret.name.startsWith(prefix)) {
            await this.resources.keyVaultClient.beginDeleteSecret(secret.name);
          }
        }
      } catch (error) {
        // Best effort cleanup
        console.warn(`Failed to clean up Key Vault secrets: ${error}`);
      }
    }
  }

  async getContainer(instanceId: string): Promise<ContainerInstance | null> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    try {
      const containerGroupName = this.getContainerGroupName(instanceId);
      const group = await this.resources.containerClient.containerGroups.get(
        this.resources.resourceGroup,
        containerGroupName
      );
      return this.mapContainerInstance(group, instanceId);
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async listContainers(filters?: ContainerFilters): Promise<ContainerInstance[]> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    const groups = [];
    for await (const group of this.resources.containerClient.containerGroups.listByResourceGroup(
      this.resources.resourceGroup
    )) {
      groups.push(group);
    }

    let containers = groups
      .filter((g) => g.tags?.managedBy === "clawster")
      .map((g) => this.mapContainerInstance(g, g.tags?.["clawster.io/instance-id"] || g.name!));

    if (filters?.status) {
      containers = containers.filter((c) => c.status === filters.status);
    }

    return containers;
  }

  async getLogs(instanceId: string, options?: LogOptions): Promise<LogResult> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    const containerGroupName = this.getContainerGroupName(instanceId);
    
    try {
      // Get logs from ACI
      const logs = await this.resources.containerClient.containers.listLogs(
        this.resources.resourceGroup,
        containerGroupName,
        "openclaw"
      );

      const content = logs.content || "";
      const lines = content.split("\n");
      
      // Apply limit
      const limit = options?.limit || 100;
      const limitedLines = lines.slice(-limit);

      const events: LogEvent[] = limitedLines.map((line, index) => ({
        timestamp: new Date(Date.now() - (limitedLines.length - index) * 1000),
        message: line,
      }));

      return {
        events,
      };
    } catch (error) {
      // If Log Analytics is configured, try querying from there
      if (this.resources.logsClient && this.resources.logAnalyticsWorkspaceId) {
        return this.getLogsFromAnalytics(instanceId, options);
      }
      throw error;
    }
  }

  private async getLogsFromAnalytics(instanceId: string, options?: LogOptions): Promise<LogResult> {
    if (!this.resources?.logsClient || !this.resources.logAnalyticsWorkspaceId) {
      throw new Error("Log Analytics not configured");
    }

    const containerGroupName = this.getContainerGroupName(instanceId);
    const limit = options?.limit || 100;
    
    const query = `ContainerInstanceLog_CL | where ContainerGroup_s == "${containerGroupName}" | take ${limit} | project TimeGenerated, Message`;
    
    const result = await this.resources.logsClient.queryWorkspace(
      this.resources.logAnalyticsWorkspaceId,
      query,
      { duration: "P1D" }
    );

    const events: LogEvent[] = [];
    const tables = (result as { tables?: Array<{ rows?: unknown[][] }> }).tables;
    if (tables && tables[0]?.rows) {
      for (const row of tables[0].rows) {
        events.push({
          timestamp: new Date(row[0] as string | number),
          message: row[1] as string,
        });
      }
    }
    
    return { events };
  }

  async storeSecret(name: string, value: string, metadata?: Record<string, string>): Promise<string> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    if (!this.resources.keyVaultClient) {
      throw new Error("Key Vault not configured. Set keyVaultName in config.");
    }

    // Sanitize secret name for Key Vault (alphanumeric and hyphens only)
    const secretName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    await this.resources.keyVaultClient.setSecret(secretName, value, {
      tags: metadata,
    });

    return `keyvault:${secretName}`;
  }

  async getSecret(name: string): Promise<string | null> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    if (!this.resources.keyVaultClient) {
      throw new Error("Key Vault not configured");
    }

    // Handle keyvault: prefix
    const secretName = name.startsWith("keyvault:") 
      ? name.replace("keyvault:", "")
      : name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    try {
      const secret = await this.resources.keyVaultClient.getSecret(secretName);
      return secret.value || null;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async deleteSecret(name: string): Promise<void> {
    if (!this.resources) {
      throw new Error("Azure provider not initialized");
    }

    if (!this.resources.keyVaultClient) {
      throw new Error("Key Vault not configured");
    }

    const secretName = name.startsWith("keyvault:") 
      ? name.replace("keyvault:", "")
      : name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    await this.resources.keyVaultClient.beginDeleteSecret(secretName);
  }

  getConsoleUrl(resourceType?: string, resourceId?: string): string {
    if (resourceId) {
      return `https://portal.azure.com/#@/resource${resourceId}`;
    }
    return "https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.ContainerInstance%2FcontainerGroups";
  }

  private sanitizeName(name: string): string {
    // Azure container group names: lowercase, alphanumeric and hyphens, max 63 chars
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 63);
  }

  private getContainerGroupName(instanceId: string): string {
    return this.sanitizeName(`clawster-${instanceId}`);
  }

  private mapContainerInstance(group: AzureContainerGroup, instanceId: string): ContainerInstance {
    const containers = group.properties?.containers || [];
    const container = containers[0];
    const instanceView = container?.properties?.instanceView;

    let status: ContainerInstance["status"] = "PENDING";
    const state = instanceView?.state;

    if (group.properties?.provisioningState === "Failed") {
      status = "ERROR";
    } else if (state === "Running") {
      status = "RUNNING";
    } else if (state === "Terminated") {
      status = "STOPPED";
    } else if (state === "Waiting") {
      status = "PENDING";
    } else if (group.properties?.provisioningState === "Creating") {
      status = "CREATING";
    }

    let health: ContainerInstance["health"] = "UNKNOWN";
    if (status === "RUNNING") {
      health = "HEALTHY";
    } else if (status === "ERROR") {
      health = "UNHEALTHY";
    }

    return {
      id: instanceId,
      name: group.name || instanceId,
      status,
      health,
      provider: this.type,
      region: group.location || this.region,
      metadata: {
        resourceGroup: this.resources?.resourceGroup || "",
        containerGroupName: group.name || "",
        ...group.tags,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
