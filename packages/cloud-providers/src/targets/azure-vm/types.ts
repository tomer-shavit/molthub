/**
 * Azure VM Target Type Definitions
 *
 * Shared types for Azure VM deployment target and its managers.
 */

/**
 * VM status values for Azure VMs.
 */
export type VmStatus =
  | "running"
  | "stopped"
  | "deallocated"
  | "starting"
  | "stopping"
  | "unknown";

/**
 * Application Gateway configuration.
 */
export interface AppGatewayConfig {
  /** Subnet ID for the Application Gateway */
  subnetId: string;
  /** Public IP resource ID */
  publicIpId: string;
  /** Backend pool port (gateway port) */
  gatewayPort: number;
  /** Optional SSL certificate secret ID from Key Vault */
  sslCertificateSecretId?: string;
}

/**
 * Gateway endpoint information.
 */
export interface GatewayEndpointInfo {
  /** Public IP address */
  publicIp: string;
  /** Fully qualified domain name */
  fqdn: string;
}

/**
 * NSG security rule definition.
 */
export interface SecurityRule {
  /** Rule name */
  name: string;
  /** Rule priority (100-4096) */
  priority: number;
  /** Traffic direction */
  direction: "Inbound" | "Outbound";
  /** Allow or Deny traffic */
  access: "Allow" | "Deny";
  /** Network protocol */
  protocol: "Tcp" | "Udp" | "*";
  /** Source address prefix (CIDR or service tag) */
  sourceAddressPrefix: string;
  /** Destination port range */
  destinationPortRange: string;
}

/**
 * Type alias for log callback function.
 * Stream is optional and defaults to "stdout".
 */
export type AzureLogCallback = (message: string, stream?: "stdout" | "stderr") => void;
