/**
 * Compute service type definitions.
 *
 * Shared types for cloud compute operations across providers.
 */

/**
 * Configuration for creating a compute instance.
 */
export interface InstanceConfig {
  /** Machine type/size (e.g., "t3.micro", "Standard_B2s", "e2-small") */
  machineType: string;
  /** Operating system image identifier */
  image: string;
  /** Instance tags/labels for organization */
  tags?: Record<string, string>;
  /** Network configuration */
  network?: {
    /** VPC/VNet name or ID */
    vpcId?: string;
    /** Subnet name or ID */
    subnetId?: string;
    /** Security group IDs to attach */
    securityGroupIds?: string[];
    /** Whether to assign a public IP */
    assignPublicIp?: boolean;
  };
  /** Storage configuration */
  storage?: {
    /** Root disk size in GB */
    rootDiskSizeGb?: number;
    /** Root disk type (e.g., "gp3", "pd-ssd") */
    rootDiskType?: string;
    /** Additional data disk size in GB */
    dataDiskSizeGb?: number;
    /** Data disk type */
    dataDiskType?: string;
  };
  /** Startup script / cloud-init / user data */
  userData?: string;
  /** SSH public key for access */
  sshPublicKey?: string;
  /** Service account / IAM role for the instance */
  serviceAccount?: string;
  /** Provider-specific metadata */
  metadata?: Record<string, string>;
}

/**
 * Result of creating a compute instance.
 */
export interface InstanceResult {
  /** Provider-assigned instance ID */
  instanceId: string;
  /** Instance name */
  name: string;
  /** Private IP address */
  privateIp?: string;
  /** Public IP address (if assigned) */
  publicIp?: string;
  /** Provider-specific resource identifier (ARN, self-link, etc.) */
  resourceId?: string;
  /** Current status of the instance */
  status: InstanceStatus;
  /** Timestamp when the instance was created */
  createdAt?: Date;
}

/**
 * Status of a compute instance.
 */
export type InstanceStatus =
  | "pending"
  | "running"
  | "stopping"
  | "stopped"
  | "terminated"
  | "starting"
  | "rebooting"
  | "error"
  | "unknown";
