/**
 * Container Service Interface
 *
 * Provides abstraction for container orchestration operations across cloud providers.
 * Implemented by AWS ECS Service, Azure Container Instances Service,
 * GCP Cloud Run Service, Kubernetes Service, etc.
 */

import type {
  ContainerServiceConfig,
  ServiceResult,
  ServiceStatus,
} from "../types/container";

/**
 * Interface for managing containerized services across cloud providers.
 */
export interface IContainerService {
  /**
   * Create a new container service.
   *
   * @param name - Service name
   * @param config - Service configuration including image, resources, and networking
   * @returns Service creation result
   */
  createService(
    name: string,
    config: ContainerServiceConfig
  ): Promise<ServiceResult>;

  /**
   * Update an existing container service.
   *
   * @param name - Service name or ID
   * @param config - Partial service configuration to update
   */
  updateService(
    name: string,
    config: Partial<ContainerServiceConfig>
  ): Promise<void>;

  /**
   * Delete a container service.
   *
   * @param name - Service name or ID
   */
  deleteService(name: string): Promise<void>;

  /**
   * Get the current status of a container service.
   *
   * @param name - Service name or ID
   * @returns Current service status
   */
  getServiceStatus(name: string): Promise<ServiceStatus>;

  /**
   * Scale a container service to the desired number of instances.
   *
   * @param name - Service name or ID
   * @param desiredCount - Desired number of running containers/tasks
   */
  scaleService(name: string, desiredCount: number): Promise<void>;
}
