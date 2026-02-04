/**
 * GCE Target Type Definitions
 *
 * Shared types for GCE deployment target and its managers.
 */

/**
 * Result from a GCE operation.
 */
export interface GceOperationResult {
  /** Operation name (used for polling) */
  operationName: string;
  /** Current status of the operation */
  status: "PENDING" | "RUNNING" | "DONE";
}

/**
 * Options for VPC network creation.
 */
export interface VpcOptions {
  /** IP CIDR range for the network (e.g., "10.0.0.0/16") */
  cidr?: string;
  /** Description for the VPC */
  description?: string;
  /** Whether to auto-create subnetworks */
  autoCreateSubnetworks?: boolean;
}

/**
 * Firewall rule definition.
 */
export interface FirewallRule {
  /** TCP/UDP ports to allow */
  ports: string[];
  /** IP protocol (TCP, UDP, ICMP, etc.) */
  protocol: string;
  /** Source IP ranges in CIDR notation */
  sourceRanges: string[];
  /** Target network tags */
  targetTags?: string[];
  /** Rule description */
  description?: string;
}

/**
 * VM instance configuration.
 */
export interface VmInstanceConfig {
  /** Instance name */
  name: string;
  /** Machine type (e.g., "e2-small") */
  machineType: string;
  /** Boot disk configuration */
  bootDisk: {
    /** Source image for the boot disk */
    sourceImage: string;
    /** Disk size in GB */
    sizeGb: number;
    /** Disk type (e.g., "pd-standard", "pd-ssd") */
    diskType: string;
  };
  /** Data disk name to attach */
  dataDiskName?: string;
  /** VPC network name */
  networkName: string;
  /** Subnet name */
  subnetName: string;
  /** Network tags for firewall rules */
  networkTags: string[];
  /** Metadata items for the instance */
  metadata: Array<{ key: string; value: string }>;
  /** Labels for organization */
  labels: Record<string, string>;
  /** Service account scopes */
  scopes?: string[];
}

/**
 * Named port for instance groups.
 */
export interface NamedPort {
  /** Port name (e.g., "http") */
  name: string;
  /** Port number */
  port: number;
}

/**
 * Load balancer resource names.
 */
export interface LoadBalancerNames {
  /** Backend service name */
  backendService: string;
  /** URL map name */
  urlMap: string;
  /** HTTP proxy name */
  httpProxy: string;
  /** HTTPS proxy name */
  httpsProxy: string;
  /** Forwarding rule name */
  forwardingRule: string;
  /** Security policy name */
  securityPolicy: string;
  /** Instance group name */
  instanceGroup: string;
  /** External IP name */
  externalIp: string;
}

/**
 * VM status values.
 */
export type VmStatus =
  | "RUNNING"
  | "STOPPED"
  | "TERMINATED"
  | "STAGING"
  | "PROVISIONING"
  | "SUSPENDING"
  | "SUSPENDED"
  | "REPAIRING"
  | "UNKNOWN";

/**
 * Type alias for log callback function.
 */
export type GceLogCallback = (message: string, stream: "stdout" | "stderr") => void;
