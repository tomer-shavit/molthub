/**
 * Configuration and output types for shared ECS EC2 infrastructure.
 *
 * Shared infrastructure (VPC, VPC endpoints, IAM roles) is created once
 * per region and reused across all bot deployments to reduce provisioning
 * time from ~10 min to ~2-3 min.
 */

/** Outputs from a deployed shared infrastructure stack */
export interface SharedInfraOutputs {
  /** The shared VPC ID */
  vpcId: string;
  /** Public subnet 1 ID */
  publicSubnet1: string;
  /** Public subnet 2 ID */
  publicSubnet2: string;
  /** Private subnet 1 ID */
  privateSubnet1: string;
  /** Private subnet 2 ID */
  privateSubnet2: string;
  /** Private route table ID */
  privateRouteTable: string;
  /** NAT Instance ID (for monitoring/reference) */
  natInstanceId: string;
  /** EC2 instance profile ARN (for Launch Template) */
  ec2InstanceProfileArn: string;
  /** Task execution role ARN (for Task Definition) */
  taskExecutionRoleArn: string;
}

/** The CloudFormation stack name prefix for shared infrastructure */
export const SHARED_INFRA_STACK_PREFIX = "clawster-shared";

/**
 * Get the shared infrastructure stack name for a region.
 * Format: clawster-shared-{region}
 */
export function getSharedInfraStackName(region: string): string {
  return `${SHARED_INFRA_STACK_PREFIX}-${region}`;
}

/** CloudFormation stack name prefix for per-bot stacks */
export const BOT_STACK_PREFIX = "clawster-bot-";

/**
 * CloudFormation export name prefix.
 * All shared stack exports use this prefix for cross-stack references.
 */
const SHARED_EXPORT_PREFIX = "clawster-shared";

/** Default VPC CIDR block — used in VPC template, NAT SG ingress, and ALB trustedProxies */
export const VPC_CIDR = "10.0.0.0/16";

/** Shared resource tag applied to all shared infrastructure resources */
export const SHARED_TAG = { Key: "clawster:shared", Value: "true" } as const;

/** Well-known export names from the shared infrastructure stack */
export const SharedExportNames = {
  VpcId: `${SHARED_EXPORT_PREFIX}-VpcId`,
  PublicSubnet1: `${SHARED_EXPORT_PREFIX}-PublicSubnet1`,
  PublicSubnet2: `${SHARED_EXPORT_PREFIX}-PublicSubnet2`,
  PrivateSubnet1: `${SHARED_EXPORT_PREFIX}-PrivateSubnet1`,
  PrivateSubnet2: `${SHARED_EXPORT_PREFIX}-PrivateSubnet2`,
  PrivateRouteTable: `${SHARED_EXPORT_PREFIX}-PrivateRouteTable`,
  NatInstanceId: `${SHARED_EXPORT_PREFIX}-NatInstanceId`,
  Ec2InstanceProfileArn: `${SHARED_EXPORT_PREFIX}-Ec2InstanceProfileArn`,
  TaskExecutionRoleArn: `${SHARED_EXPORT_PREFIX}-TaskExecRoleArn`,
} as const;
