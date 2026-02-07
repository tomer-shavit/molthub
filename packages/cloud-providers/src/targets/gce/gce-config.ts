/**
 * Configuration for GCP Compute Engine deployment targets.
 *
 * ARCHITECTURE: Caddy-on-VM with MIG auto-healing.
 *   Internet → Firewall → VM (ephemeral public IP) → Caddy → 127.0.0.1:port → OpenClaw (Sysbox)
 *
 * No load balancer, no NAT gateway — Caddy handles TLS and reverse proxy.
 * Cost: ~$26/bot/month with e2-medium.
 */
export interface GceConfig {
  /** GCP project ID */
  projectId: string;

  /** GCP zone (e.g., "us-central1-a") — VMs are zone-specific */
  zone: string;

  // -- Authentication --

  /**
   * Path to service account key file (JSON).
   * Optional — uses Application Default Credentials if not provided.
   */
  keyFilePath?: string;

  // -- VM Configuration --

  /**
   * Machine type (e.g., "e2-medium", "e2-standard-2").
   * Default: "e2-medium"
   *
   * IMPORTANT: e2-small (2GB) causes OOM during npm install.
   * Minimum recommended: e2-medium (4GB).
   */
  machineType?: string;

  /**
   * Boot disk size in GB.
   * Default: 30 (Ubuntu 22.04 + Docker + Sysbox + Caddy)
   */
  bootDiskSizeGb?: number;

  /**
   * Bot/profile name — used to derive resource names.
   */
  profileName?: string;

  // -- Network Configuration --

  /**
   * VPC network name (shared across bots).
   * Default: "clawster-vpc"
   */
  vpcNetworkName?: string;

  /**
   * Subnet name (shared across bots).
   * Default: "clawster-subnet"
   */
  subnetName?: string;

  // -- Caddy / TLS --

  /**
   * Custom domain for Caddy auto-HTTPS (Let's Encrypt).
   * If provided, Caddy obtains TLS certificates automatically.
   * If not provided, Caddy serves on :80 (HTTP only).
   */
  customDomain?: string;

  // -- Sysbox --

  /**
   * Sysbox version to install via .deb package.
   * Default: "0.6.7"
   *
   * Note: v0.6.7 changed the .deb filename pattern (no "-0" suffix).
   */
  sysboxVersion?: string;
}
