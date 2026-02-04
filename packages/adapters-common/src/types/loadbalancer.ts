/**
 * Load balancer service type definitions.
 *
 * Shared types for cloud load balancer operations across providers.
 */

/**
 * Configuration for creating a load balancer.
 */
export interface LoadBalancerConfig {
  /** Load balancer type (application, network, etc.) */
  type?: "application" | "network" | "classic";
  /** Whether the load balancer is internet-facing or internal */
  scheme?: "internet-facing" | "internal";
  /** Subnet IDs for the load balancer */
  subnetIds?: string[];
  /** Security group IDs to attach */
  securityGroupIds?: string[];
  /** Listeners configuration */
  listeners: LoadBalancerListener[];
  /** Health check configuration */
  healthCheck?: HealthCheckConfig;
  /** Tags/labels for the load balancer */
  tags?: Record<string, string>;
  /** SSL certificate ARN/ID for HTTPS listeners */
  sslCertificateId?: string;
}

/**
 * Load balancer listener configuration.
 */
export interface LoadBalancerListener {
  /** Port the load balancer listens on */
  port: number;
  /** Protocol for the listener */
  protocol: "http" | "https" | "tcp" | "udp" | "tls";
  /** Target port to forward traffic to */
  targetPort: number;
  /** Target protocol */
  targetProtocol?: "http" | "https" | "tcp" | "udp";
}

/**
 * Health check configuration for load balancer targets.
 */
export interface HealthCheckConfig {
  /** Protocol for health checks */
  protocol: "http" | "https" | "tcp";
  /** Port for health checks */
  port: number;
  /** Path for HTTP/HTTPS health checks */
  path?: string;
  /** Interval between health checks in seconds */
  intervalSeconds?: number;
  /** Timeout for health check response in seconds */
  timeoutSeconds?: number;
  /** Number of consecutive successes before marking healthy */
  healthyThreshold?: number;
  /** Number of consecutive failures before marking unhealthy */
  unhealthyThreshold?: number;
}

/**
 * Result of creating a load balancer.
 */
export interface LoadBalancerResult {
  /** Provider-assigned load balancer ID */
  loadBalancerId: string;
  /** Load balancer name */
  name: string;
  /** DNS name for the load balancer */
  dnsName?: string;
  /** Provider-specific resource identifier (ARN, self-link, etc.) */
  resourceId?: string;
  /** Current status */
  status: "provisioning" | "active" | "failed" | "deleting";
}

/**
 * Load balancer endpoint information.
 */
export interface LoadBalancerEndpoint {
  /** DNS name for the load balancer */
  dnsName: string;
  /** Public IP address (if applicable) */
  publicIp?: string;
  /** Hosted zone ID for DNS (AWS-specific) */
  hostedZoneId?: string;
  /** Port the load balancer is listening on */
  port: number;
  /** Full URL to access the load balancer */
  url: string;
}
