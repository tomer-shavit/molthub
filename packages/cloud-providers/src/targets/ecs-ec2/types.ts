/**
 * Shared types for the AWS EC2 Caddy-on-VM deployment target.
 */

/** Log callback for streaming provisioning output */
export type AwsLogCallback = (line: string) => void;

/** IDs of shared infrastructure resources (one set per region) */
export interface SharedInfraIds {
  vpcId: string;
  subnetId: string;
  internetGatewayId: string;
  routeTableId: string;
  securityGroupId: string;
  instanceProfileArn: string;
  iamRoleName: string;
}

/** EC2 instance lifecycle states */
export type Ec2InstanceState =
  | "pending"
  | "running"
  | "shutting-down"
  | "terminated"
  | "stopping"
  | "stopped";

/** Configuration for creating/updating a Launch Template */
export interface LaunchTemplateConfig {
  /** Instance type (e.g. "t3.small") */
  instanceType: string;
  /** Boot disk size in GB */
  bootDiskSizeGb: number;
  /** Ubuntu 22.04 AMI ID (resolved at runtime) */
  amiId: string;
  /** Security group ID */
  securityGroupId: string;
  /** IAM instance profile ARN */
  instanceProfileArn: string;
  /** Base64-encoded user data script */
  userData: string;
  /** Tags for the instance */
  tags: Record<string, string>;
}
