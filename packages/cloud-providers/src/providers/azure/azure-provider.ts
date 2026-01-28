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
} from "../../interface/provider";
import { InstanceManifest } from "@molthub/core";

export interface AzureConfig extends CloudProviderConfig {
  credentials?: {
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
    subscriptionId?: string;
  };
  resourceGroup?: string;
}

/**
 * Azure Container Apps Provider
 * 
 * Stub implementation - would use @azure/arm-appcontainers
 */
export class AzureProvider implements CloudProvider {
  readonly type: CloudProviderType = "azure";
  region: string = "eastus";

  async initialize(config: AzureConfig): Promise<void> {
    this.region = config.region;
    throw new Error("Azure provider not yet implemented. Use AWS or self-hosted instead.");
  }

  async validate(): Promise<ValidationResult> {
    return {
      valid: false,
      errors: ["Azure provider not yet implemented"],
      warnings: [],
    };
  }

  async bootstrap(options: BootstrapOptions, onProgress?: ProgressCallback): Promise<CloudResources> {
    throw new Error("Azure provider not yet implemented");
  }

  async deployContainer(config: ContainerDeploymentConfig, manifest: InstanceManifest): Promise<ContainerInstance> {
    throw new Error("Azure provider not yet implemented");
  }

  async updateContainer(instanceId: string, config: Partial<ContainerDeploymentConfig>): Promise<ContainerInstance> {
    throw new Error("Azure provider not yet implemented");
  }

  async stopContainer(instanceId: string): Promise<void> {
    throw new Error("Azure provider not yet implemented");
  }

  async startContainer(instanceId: string): Promise<void> {
    throw new Error("Azure provider not yet implemented");
  }

  async deleteContainer(instanceId: string): Promise<void> {
    throw new Error("Azure provider not yet implemented");
  }

  async getContainer(instanceId: string): Promise<ContainerInstance | null> {
    throw new Error("Azure provider not yet implemented");
  }

  async listContainers(filters?: ContainerFilters): Promise<ContainerInstance[]> {
    throw new Error("Azure provider not yet implemented");
  }

  async getLogs(instanceId: string, options?: LogOptions): Promise<LogResult> {
    throw new Error("Azure provider not yet implemented");
  }

  async storeSecret(name: string, value: string, metadata?: Record<string, string>): Promise<string> {
    throw new Error("Azure provider not yet implemented");
  }

  async getSecret(name: string): Promise<string | null> {
    throw new Error("Azure provider not yet implemented");
  }

  async deleteSecret(name: string): Promise<void> {
    throw new Error("Azure provider not yet implemented");
  }

  getConsoleUrl(resourceType?: string, resourceId?: string): string {
    return "https://portal.azure.com";
  }
}