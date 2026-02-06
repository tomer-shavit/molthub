/**
 * Configuration for AWS ECS EC2 deployment targets.
 *
 * SECURITY: All deployments use VPC + ALB architecture.
 * Containers are NEVER exposed directly to the internet.
 * External access (for webhooks) is handled through the Application Load Balancer.
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
  /** ACM certificate ARN for HTTPS (recommended for production) */
  certificateArn?: string;
  /** CPU units for the ECS task (default: 1024) */
  cpu?: number;
  /** Memory in MiB for the ECS task (default: 2048) */
  memory?: number;
  /** Container image (default: auto-pushed to ECR) */
  image?: string;
  /** Bot/profile name — used to derive resource names on re-instantiation */
  profileName?: string;
  /** CIDR blocks for ALB security group ingress. Defaults to ["0.0.0.0/0"] for webhook access */
  allowedCidr?: string[];
  /** Use shared infrastructure (VPC, endpoints, IAM) for faster deployments. Defaults to true for new deploys. */
  useSharedInfra?: boolean;
}
