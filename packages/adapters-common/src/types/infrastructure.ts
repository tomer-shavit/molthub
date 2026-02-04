/**
 * Infrastructure service type definitions.
 *
 * Shared types for infrastructure-as-code operations across providers.
 * Supports CloudFormation (AWS), ARM/Bicep (Azure), Deployment Manager (GCP), etc.
 */

/**
 * Result of creating or updating an infrastructure stack.
 */
export interface StackResult {
  /** Provider-assigned stack ID */
  stackId: string;
  /** Stack name */
  name: string;
  /** Provider-specific resource identifier (ARN, self-link, etc.) */
  resourceId?: string;
  /** Current status of the stack */
  status: StackStatus;
  /** Status reason (useful for errors) */
  statusReason?: string;
  /** Timestamp when the stack was created */
  createdAt?: Date;
  /** Timestamp when the stack was last updated */
  updatedAt?: Date;
  /** Stack outputs */
  outputs?: Record<string, string>;
}

/**
 * Status of an infrastructure stack.
 */
export type StackStatus =
  | "create_in_progress"
  | "create_complete"
  | "create_failed"
  | "update_in_progress"
  | "update_complete"
  | "update_failed"
  | "delete_in_progress"
  | "delete_complete"
  | "delete_failed"
  | "rollback_in_progress"
  | "rollback_complete"
  | "rollback_failed"
  | "unknown";

/**
 * Configuration for stack creation/update.
 */
export interface StackConfig {
  /** Stack parameters */
  parameters?: Record<string, string>;
  /** Stack tags */
  tags?: Record<string, string>;
  /** IAM role ARN for stack operations (AWS-specific) */
  roleArn?: string;
  /** Capabilities to acknowledge (e.g., CAPABILITY_IAM) */
  capabilities?: string[];
  /** Timeout in minutes for stack operations */
  timeoutMinutes?: number;
  /** Whether to enable termination protection */
  terminationProtection?: boolean;
  /** Rollback configuration */
  rollback?: {
    /** Whether to rollback on failure */
    onFailure: "rollback" | "delete" | "do_nothing";
    /** Monitoring time in minutes */
    monitoringMinutes?: number;
  };
}

/**
 * Stack resource information.
 */
export interface StackResource {
  /** Logical resource ID */
  logicalId: string;
  /** Physical resource ID */
  physicalId?: string;
  /** Resource type (e.g., "AWS::EC2::Instance") */
  resourceType: string;
  /** Resource status */
  status: string;
  /** Status reason */
  statusReason?: string;
  /** Timestamp of last update */
  lastUpdatedAt?: Date;
}

/**
 * Stack event information.
 */
export interface StackEvent {
  /** Event ID */
  eventId: string;
  /** Logical resource ID */
  logicalResourceId: string;
  /** Physical resource ID */
  physicalResourceId?: string;
  /** Resource type */
  resourceType: string;
  /** Resource status */
  resourceStatus: string;
  /** Status reason */
  resourceStatusReason?: string;
  /** Event timestamp */
  timestamp: Date;
}
