/**
 * Configuration for AWS ECS Fargate deployment targets.
 *
 * Provides all settings needed to deploy an OpenClaw gateway instance
 * on AWS ECS Fargate (serverless containers).
 */
export interface EcsFargateConfig {
  /** AWS region (e.g. "us-east-1") */
  region: string;
  /** AWS access key ID for CLI authentication */
  accessKeyId: string;
  /** AWS secret access key for CLI authentication */
  secretAccessKey: string;
  /** ECS cluster name (default: "openclaw-cluster") */
  clusterName?: string;
  /** VPC subnet IDs for Fargate tasks */
  subnetIds: string[];
  /** Security group ID for Fargate tasks */
  securityGroupId: string;
  /** IAM execution role ARN for ECS task (pulls images, writes logs) */
  executionRoleArn?: string;
  /** IAM task role ARN for the running container */
  taskRoleArn?: string;
  /** CPU units for the Fargate task (default: 256) */
  cpu?: number;
  /** Memory in MiB for the Fargate task (default: 512) */
  memory?: number;
  /** Container image (default: "ghcr.io/openclaw/openclaw:latest") */
  image?: string;
  /** Whether to assign a public IP to the task (default: true) */
  assignPublicIp?: boolean;
}
