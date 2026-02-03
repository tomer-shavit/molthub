/**
 * Configuration for AWS ECS EC2 deployment targets.
 *
 * Provides all settings needed to deploy an OpenClaw gateway instance
 * on AWS ECS with EC2 launch type via CloudFormation.
 * EC2 launch type enables Docker socket mounting for sandbox isolation.
 */
export interface EcsEc2Config {
  /** AWS region (e.g. "us-east-1") */
  region: string;
  /** AWS access key ID for SDK authentication */
  accessKeyId: string;
  /** AWS secret access key for SDK authentication */
  secretAccessKey: string;
  /** Deployment tier: "simple" (public IP) or "production" (VPC + ALB) */
  tier: "simple" | "production";
  /** ACM certificate ARN for HTTPS (production tier only) */
  certificateArn?: string;
  /** CPU units for the ECS task (default: 1024) */
  cpu?: number;
  /** Memory in MiB for the ECS task (default: 2048) */
  memory?: number;
  /** Container image (default: auto-pushed to ECR) */
  image?: string;
  /** Bot/profile name — used to derive resource names on re-instantiation */
  profileName?: string;
  /** CIDR block for security group ingress (e.g. "203.0.113.0/24"). Defaults to "0.0.0.0/0" */
  allowedCidr?: string;
}
