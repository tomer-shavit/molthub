/**
 * Configuration for AWS EC2 Caddy-on-VM deployment targets.
 *
 * Architecture: Internet -> SG (80/443) -> EC2 (public subnet) -> Caddy -> 127.0.0.1:port -> OpenClaw (Sysbox)
 *
 * Uses direct RunInstances/TerminateInstances with tag-based instance discovery.
 */
export interface AwsEc2Config {
  /** AWS region (e.g. "us-east-1") */
  region: string;
  /** AWS access key ID for SDK authentication */
  accessKeyId: string;
  /** AWS secret access key for SDK authentication */
  secretAccessKey: string;
  /** Bot/profile name — used to derive resource names */
  profileName?: string;
  /** Custom domain for Caddy auto-HTTPS via Let's Encrypt */
  customDomain?: string;
  /** EC2 instance type (default: "t3.small") */
  instanceType?: string;
  /** Boot disk size in GB (default: 20) */
  bootDiskSizeGb?: number;
  /** Sysbox version to install (default: "0.6.7") */
  sysboxVersion?: string;
  /** CIDR blocks for Security Group SSH ingress. Empty = no SSH access. */
  allowedCidr?: string[];
}
