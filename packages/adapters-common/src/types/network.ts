/**
 * Network service type definitions.
 *
 * Shared types for cloud networking operations across providers.
 */

/**
 * Result of creating or ensuring a network exists.
 */
export interface NetworkResult {
  /** Provider-assigned network ID */
  networkId: string;
  /** Network name */
  name: string;
  /** CIDR block of the network */
  cidr: string;
  /** Provider-specific resource identifier (ARN, self-link, etc.) */
  resourceId?: string;
  /** Whether the network was newly created or already existed */
  created: boolean;
}

/**
 * Result of creating or ensuring a subnet exists.
 */
export interface SubnetResult {
  /** Provider-assigned subnet ID */
  subnetId: string;
  /** Subnet name */
  name: string;
  /** CIDR block of the subnet */
  cidr: string;
  /** Availability zone (if applicable) */
  availabilityZone?: string;
  /** Provider-specific resource identifier (ARN, self-link, etc.) */
  resourceId?: string;
  /** Whether the subnet was newly created or already existed */
  created: boolean;
}

/**
 * Security rule definition for security groups / NSGs / firewall rules.
 */
export interface SecurityRule {
  /** Rule name or identifier */
  name?: string;
  /** Rule description */
  description?: string;
  /** Traffic direction */
  direction: "inbound" | "outbound";
  /** Allow or deny traffic */
  action: "allow" | "deny";
  /** Network protocol */
  protocol: "tcp" | "udp" | "icmp" | "all";
  /** Source CIDR blocks for inbound rules */
  sourceCidrs?: string[];
  /** Destination CIDR blocks for outbound rules */
  destinationCidrs?: string[];
  /** Port or port range (e.g., "22", "80-443", "*") */
  portRange: string;
  /** Rule priority (lower = higher priority) */
  priority?: number;
}

/**
 * Result of creating or ensuring a security group exists.
 */
export interface SecurityGroupResult {
  /** Provider-assigned security group ID */
  securityGroupId: string;
  /** Security group name */
  name: string;
  /** Provider-specific resource identifier (ARN, self-link, etc.) */
  resourceId?: string;
  /** Whether the security group was newly created or already existed */
  created: boolean;
  /** Applied rules */
  rules: SecurityRule[];
}
