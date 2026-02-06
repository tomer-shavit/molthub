import type { StackConfig } from "../../types/infrastructure";

/**
 * Stack information returned from describe operations.
 */
export interface StackInfo {
  stackId: string;
  stackName: string;
  status: string;
  statusReason?: string;
  creationTime: Date;
  lastUpdatedTime?: Date;
  outputs: StackOutput[];
}

export interface StackOutput {
  key: string;
  value: string;
  description?: string;
}

/**
 * Interface for infrastructure stack CRUD operations.
 * Part of ISP-compliant infrastructure service split.
 *
 * Template can be:
 * - string: CloudFormation JSON/YAML, ARM template string
 * - object: Parsed template object that will be serialized
 */
export interface IStackOperations {
  /**
   * Create a new infrastructure stack.
   * @param name - Stack name
   * @param template - Stack template (string or object)
   * @param options - Optional configuration (parameters, tags, capabilities)
   * @returns Stack ID
   */
  createStack(
    name: string,
    template: string | object,
    options?: StackConfig
  ): Promise<string>;

  /**
   * Update an existing infrastructure stack.
   * @param name - Stack name or ID
   * @param template - Updated stack template (string or object)
   * @param options - Optional configuration (parameters, tags, capabilities)
   * @returns Stack ID
   */
  updateStack(
    name: string,
    template: string | object,
    options?: StackConfig
  ): Promise<string>;

  /**
   * Delete an infrastructure stack and all its resources.
   * @param name - Stack name or ID
   * @param options - Optional deletion options (e.g. retainResources for recovery from failed deletes)
   */
  deleteStack(
    name: string,
    options?: { retainResources?: string[] }
  ): Promise<void>;

  /**
   * Describe an infrastructure stack.
   * @param name - Stack name or ID
   * @returns Stack info or undefined if not found
   */
  describeStack(name: string): Promise<StackInfo | undefined>;

  /**
   * Check if a stack exists and is not in a deleted state.
   * @param name - Stack name or ID
   * @returns True if stack exists and is usable
   */
  stackExists(name: string): Promise<boolean>;
}
