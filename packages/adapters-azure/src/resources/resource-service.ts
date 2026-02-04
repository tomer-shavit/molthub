/**
 * Azure Resource Service
 *
 * Provides operations for managing Azure Resource Groups and resources.
 * Uses the Azure Resource Manager SDK for resource management operations.
 */

import {
  ResourceManagementClient,
  ResourceGroup,
  GenericResource,
} from "@azure/arm-resources";
import { DefaultAzureCredential, TokenCredential } from "@azure/identity";

/**
 * Resource summary information.
 */
export interface ResourceSummary {
  /** Resource ID */
  id: string;
  /** Resource name */
  name: string;
  /** Resource type (e.g., "Microsoft.Compute/virtualMachines") */
  type: string;
  /** Resource location */
  location: string;
  /** Resource tags */
  tags?: Record<string, string>;
}

/**
 * Azure Resource Service for resource group and resource operations.
 */
export class ResourceService {
  private readonly resourceClient: ResourceManagementClient;
  private readonly subscriptionId: string;

  /**
   * Create a new ResourceService instance.
   *
   * @param subscriptionId - Azure subscription ID
   * @param credential - Optional TokenCredential (defaults to DefaultAzureCredential)
   */
  constructor(subscriptionId: string, credential?: TokenCredential) {
    const cred = credential || new DefaultAzureCredential();
    this.resourceClient = new ResourceManagementClient(cred, subscriptionId);
    this.subscriptionId = subscriptionId;
  }

  // ------------------------------------------------------------------
  // Resource Group Operations
  // ------------------------------------------------------------------

  /**
   * Ensure a resource group exists, creating it if necessary.
   *
   * @param name - Resource group name
   * @param location - Azure region (e.g., "eastus")
   * @param tags - Optional resource tags
   * @returns Resource group
   */
  async ensureResourceGroup(
    name: string,
    location: string,
    tags?: Record<string, string>
  ): Promise<ResourceGroup> {
    // Check if already exists
    try {
      const existing = await this.resourceClient.resourceGroups.get(name);
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    const result = await this.resourceClient.resourceGroups.createOrUpdate(
      name,
      {
        location,
        tags: {
          managedBy: "clawster",
          ...tags,
        },
      }
    );

    return result;
  }

  /**
   * Get resource group information.
   *
   * @param name - Resource group name
   * @returns Resource group or undefined if not found
   */
  async getResourceGroup(name: string): Promise<ResourceGroup | undefined> {
    try {
      return await this.resourceClient.resourceGroups.get(name);
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Check if a resource group exists.
   *
   * @param name - Resource group name
   * @returns True if exists, false otherwise
   */
  async resourceGroupExists(name: string): Promise<boolean> {
    const result = await this.resourceClient.resourceGroups.checkExistence(name);
    return result.body ?? false;
  }

  /**
   * Delete a resource group and all its resources.
   * WARNING: This is a destructive operation that deletes all resources in the group.
   *
   * @param name - Resource group name
   */
  async deleteResourceGroup(name: string): Promise<void> {
    try {
      await this.resourceClient.resourceGroups.beginDeleteAndWait(name);
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return; // Already deleted
      }
      throw error;
    }
  }

  /**
   * List all resource groups in the subscription.
   *
   * @param filter - Optional OData filter expression
   * @returns Array of resource groups
   */
  async listResourceGroups(filter?: string): Promise<ResourceGroup[]> {
    const groups: ResourceGroup[] = [];
    const iterator = this.resourceClient.resourceGroups.list({ filter });

    for await (const group of iterator) {
      groups.push(group);
    }

    return groups;
  }

  // ------------------------------------------------------------------
  // Resource Operations
  // ------------------------------------------------------------------

  /**
   * List all resources in a resource group.
   *
   * @param resourceGroupName - Resource group name
   * @param filter - Optional OData filter expression
   * @returns Array of resource summaries
   */
  async listResources(
    resourceGroupName: string,
    filter?: string
  ): Promise<ResourceSummary[]> {
    const resources: ResourceSummary[] = [];
    const iterator = this.resourceClient.resources.listByResourceGroup(
      resourceGroupName,
      { filter }
    );

    for await (const resource of iterator) {
      resources.push({
        id: resource.id || "",
        name: resource.name || "",
        type: resource.type || "",
        location: resource.location || "",
        tags: resource.tags,
      });
    }

    return resources;
  }

  /**
   * List resources by type in a resource group.
   *
   * @param resourceGroupName - Resource group name
   * @param resourceType - Resource type (e.g., "Microsoft.Compute/virtualMachines")
   * @returns Array of resource summaries
   */
  async listResourcesByType(
    resourceGroupName: string,
    resourceType: string
  ): Promise<ResourceSummary[]> {
    const filter = `resourceType eq '${resourceType}'`;
    return this.listResources(resourceGroupName, filter);
  }

  /**
   * List resources by tag in a resource group.
   *
   * @param resourceGroupName - Resource group name
   * @param tagName - Tag name
   * @param tagValue - Tag value (optional)
   * @returns Array of resource summaries
   */
  async listResourcesByTag(
    resourceGroupName: string,
    tagName: string,
    tagValue?: string
  ): Promise<ResourceSummary[]> {
    const filter = tagValue
      ? `tagName eq '${tagName}' and tagValue eq '${tagValue}'`
      : `tagName eq '${tagName}'`;
    return this.listResources(resourceGroupName, filter);
  }

  /**
   * Get a resource by ID.
   *
   * @param resourceId - Full resource ID
   * @param apiVersion - API version for the resource type
   * @returns Resource or undefined if not found
   */
  async getResourceById(
    resourceId: string,
    apiVersion: string
  ): Promise<GenericResource | undefined> {
    try {
      return await this.resourceClient.resources.getById(resourceId, apiVersion);
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Delete a resource by ID.
   *
   * @param resourceId - Full resource ID
   * @param apiVersion - API version for the resource type
   */
  async deleteResourceById(resourceId: string, apiVersion: string): Promise<void> {
    try {
      await this.resourceClient.resources.beginDeleteByIdAndWait(
        resourceId,
        apiVersion
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return; // Already deleted
      }
      throw error;
    }
  }

  /**
   * Delete a resource.
   *
   * @param resourceGroupName - Resource group name
   * @param resourceProviderNamespace - Resource provider (e.g., "Microsoft.Compute")
   * @param parentResourcePath - Parent resource path (empty string for top-level resources)
   * @param resourceType - Resource type (e.g., "virtualMachines")
   * @param resourceName - Resource name
   * @param apiVersion - API version for the resource type
   */
  async deleteResource(
    resourceGroupName: string,
    resourceProviderNamespace: string,
    parentResourcePath: string,
    resourceType: string,
    resourceName: string,
    apiVersion: string
  ): Promise<void> {
    try {
      await this.resourceClient.resources.beginDeleteAndWait(
        resourceGroupName,
        resourceProviderNamespace,
        parentResourcePath,
        resourceType,
        resourceName,
        apiVersion
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return; // Already deleted
      }
      throw error;
    }
  }

  /**
   * Check if a resource exists.
   *
   * @param resourceGroupName - Resource group name
   * @param resourceProviderNamespace - Resource provider (e.g., "Microsoft.Compute")
   * @param parentResourcePath - Parent resource path (empty string for top-level resources)
   * @param resourceType - Resource type (e.g., "virtualMachines")
   * @param resourceName - Resource name
   * @param apiVersion - API version for the resource type
   * @returns True if exists, false otherwise
   */
  async resourceExists(
    resourceGroupName: string,
    resourceProviderNamespace: string,
    parentResourcePath: string,
    resourceType: string,
    resourceName: string,
    apiVersion: string
  ): Promise<boolean> {
    const result = await this.resourceClient.resources.checkExistence(
      resourceGroupName,
      resourceProviderNamespace,
      parentResourcePath,
      resourceType,
      resourceName,
      apiVersion
    );
    return result.body ?? false;
  }

  /**
   * Get common API versions for Azure resource types.
   *
   * @param resourceType - Short resource type name
   * @returns API version string
   */
  static getApiVersion(
    resourceType:
      | "virtualMachines"
      | "disks"
      | "networkInterfaces"
      | "virtualNetworks"
      | "networkSecurityGroups"
      | "publicIPAddresses"
      | "applicationGateways"
      | "containerGroups"
      | "vaults"
  ): string {
    const versions: Record<string, string> = {
      virtualMachines: "2023-09-01",
      disks: "2023-10-02",
      networkInterfaces: "2023-09-01",
      virtualNetworks: "2023-09-01",
      networkSecurityGroups: "2023-09-01",
      publicIPAddresses: "2023-09-01",
      applicationGateways: "2023-09-01",
      containerGroups: "2023-05-01",
      vaults: "2023-07-01",
    };
    return versions[resourceType] || "2023-01-01";
  }
}
