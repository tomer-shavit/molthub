/**
 * Container service type definitions.
 *
 * Shared types for cloud container orchestration operations across providers.
 */

/**
 * Configuration for creating a container service.
 */
export interface ContainerServiceConfig {
  /** Container image to run */
  image: string;
  /** CPU units (e.g., 256 for 0.25 vCPU) */
  cpu: number;
  /** Memory in MB */
  memory: number;
  /** Desired number of running tasks/containers */
  desiredCount: number;
  /** Port mappings for the container */
  portMappings?: PortMapping[];
  /** Environment variables */
  environment?: Record<string, string>;
  /** Secret references (name -> ARN/ID) */
  secrets?: Record<string, string>;
  /** Container command override */
  command?: string[];
  /** Container entrypoint override */
  entrypoint?: string[];
  /** Health check configuration */
  healthCheck?: ContainerHealthCheck;
  /** Network configuration */
  network?: {
    /** VPC/VNet ID */
    vpcId?: string;
    /** Subnet IDs */
    subnetIds?: string[];
    /** Security group IDs */
    securityGroupIds?: string[];
    /** Whether to assign public IP */
    assignPublicIp?: boolean;
  };
  /** Logging configuration */
  logging?: {
    /** Log driver (e.g., "awslogs", "json-file") */
    driver: string;
    /** Log driver options */
    options?: Record<string, string>;
  };
  /** Tags/labels for the service */
  tags?: Record<string, string>;
  /** Service discovery configuration */
  serviceDiscovery?: {
    /** Namespace name */
    namespace: string;
    /** Service name */
    serviceName: string;
  };
}

/**
 * Port mapping for container services.
 */
export interface PortMapping {
  /** Container port */
  containerPort: number;
  /** Host port (optional, for bridge/host networking) */
  hostPort?: number;
  /** Protocol */
  protocol?: "tcp" | "udp";
  /** Port name for service discovery */
  name?: string;
}

/**
 * Health check configuration for containers.
 */
export interface ContainerHealthCheck {
  /** Command to run for health check */
  command: string[];
  /** Interval between health checks in seconds */
  intervalSeconds?: number;
  /** Timeout for health check in seconds */
  timeoutSeconds?: number;
  /** Number of retries before marking unhealthy */
  retries?: number;
  /** Start period grace time in seconds */
  startPeriodSeconds?: number;
}

/**
 * Result of creating a container service.
 */
export interface ServiceResult {
  /** Provider-assigned service ID */
  serviceId: string;
  /** Service name */
  name: string;
  /** Provider-specific resource identifier (ARN, self-link, etc.) */
  resourceId?: string;
  /** Current status */
  status: ServiceStatus;
  /** Number of running tasks/containers */
  runningCount: number;
  /** Desired number of tasks/containers */
  desiredCount: number;
  /** Service endpoint (if exposed) */
  endpoint?: string;
}

/**
 * Status of a container service.
 */
export type ServiceStatus =
  | "active"
  | "draining"
  | "inactive"
  | "provisioning"
  | "pending"
  | "running"
  | "updating"
  | "deleting"
  | "failed"
  | "unknown";
