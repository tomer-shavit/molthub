/**
 * Configuration for GCP Cloud Run deployment targets.
 *
 * SECURITY: All deployments use VPC + External Load Balancer architecture.
 * Cloud Run services use INTERNAL_LOAD_BALANCER ingress - they are NEVER
 * exposed directly to the internet via their default Cloud Run URL.
 * External access (for webhooks from Telegram, WhatsApp, etc.) goes through
 * the External Application Load Balancer.
 *
 * Architecture:
 *   Internet → External LB → Serverless NEG → Cloud Run (internal-only)
 *                                                    ↓
 *                                              VPC Connector (egress)
 */
export interface CloudRunConfig {
  /** GCP project ID */
  projectId: string;

  /** GCP region (e.g., "us-central1") */
  region: string;

  // ── Authentication ──

  /**
   * Path to service account key file (JSON).
   * Optional - uses Application Default Credentials if not provided.
   */
  keyFilePath?: string;

  // ── VPC Configuration ──

  /**
   * VPC network name - will be created if it doesn't exist.
   * Default: "clawster-vpc-{profileName}"
   */
  vpcNetworkName?: string;

  /**
   * VPC Connector name for outbound traffic from Cloud Run.
   * Default: "clawster-connector-{profileName}"
   */
  vpcConnectorName?: string;

  /**
   * Subnet IP range for VPC Connector (CIDR notation).
   * Default: "10.8.0.0/28" (minimum /28 required)
   */
  vpcConnectorIpRange?: string;

  // ── Load Balancer Configuration ──

  /**
   * Static external IP address name.
   * Default: "clawster-ip-{profileName}"
   */
  externalIpName?: string;

  /**
   * SSL certificate ID for HTTPS (managed or self-managed).
   * If provided, the load balancer will use HTTPS (443).
   * If not provided, HTTP (80) will be used.
   */
  sslCertificateId?: string;

  /**
   * Custom domain for the load balancer.
   * Only used if sslCertificateId is provided.
   */
  customDomain?: string;

  // ── Container Configuration ──

  /**
   * Container image.
   * Default: "node:22-slim"
   */
  image?: string;

  /**
   * CPU allocation (e.g., "1", "2", "4").
   * Default: "1"
   */
  cpu?: string;

  /**
   * Memory allocation (e.g., "512Mi", "1Gi", "2Gi").
   * Default: "2Gi"
   */
  memory?: string;

  /**
   * Bot/profile name — used to derive resource names on re-instantiation.
   */
  profileName?: string;

  /**
   * Maximum number of instances for auto-scaling.
   * Default: 1 (single instance for stateful gateway)
   */
  maxInstances?: number;

  /**
   * Minimum number of instances.
   * Default: 0 (allows scale-to-zero when stopped)
   *
   * NOTE: Setting minInstances=0 enables scale-to-zero which saves costs but
   * may cause cold start delays (10-30s) when the Gateway receives traffic
   * after being idle. For production workloads requiring consistent latency,
   * consider setting minInstances=1 to keep at least one instance warm.
   */
  minInstances?: number;

  // ── Security Options ──

  /**
   * Allowed source IP ranges for Cloud Armor security policy (CIDR notation).
   * Only traffic from these ranges can reach the load balancer.
   * Default: ["0.0.0.0/0"] (allows all - configure for production!)
   */
  allowedCidr?: string[];
}
