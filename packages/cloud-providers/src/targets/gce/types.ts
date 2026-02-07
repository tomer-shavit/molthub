/**
 * GCE Target Type Definitions
 *
 * Shared types for GCE deployment target and its managers.
 * Caddy-on-VM architecture: MIG + Instance Template + Caddy reverse proxy.
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
