/**
 * Infrastructure Service Interface
 *
 * Provides abstraction for infrastructure-as-code operations across cloud providers.
 * Implemented by AWS CloudFormation Service, Azure ARM Service,
 * GCP Deployment Manager Service, etc.
 */

import type { StackResult, StackStatus } from "../types/infrastructure";

/**
 * Interface for managing infrastructure stacks across cloud providers.
 */
export interface IInfrastructureService {
  /**
   * Create a new infrastructure stack.
   *
   * @param name - Stack name
   * @param template - Stack template (CloudFormation, ARM, etc.)
   * @returns Stack creation result
   */
  createStack(name: string, template: object): Promise<StackResult>;

  /**
   * Update an existing infrastructure stack.
   *
   * @param name - Stack name or ID
   * @param template - Updated stack template
   * @returns Stack update result
   */
  updateStack(name: string, template: object): Promise<StackResult>;

  /**
   * Delete an infrastructure stack and all its resources.
   *
   * @param name - Stack name or ID
   */
  deleteStack(name: string): Promise<void>;

  /**
   * Get the current status of an infrastructure stack.
   *
   * @param name - Stack name or ID
   * @returns Current stack status
   */
  getStackStatus(name: string): Promise<StackStatus>;

  /**
   * Get the outputs of an infrastructure stack.
   *
   * @param name - Stack name or ID
   * @returns Map of output keys to values
   */
  getStackOutputs(name: string): Promise<Record<string, string>>;
}
