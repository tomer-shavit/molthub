/**
 * CloudFormation template generator for Production ECS EC2 deployments.
 *
 * Creates a production-ready EC2-backed ECS setup with a dedicated VPC,
 * public/private subnets across 2 AZs, VPC Endpoints (no NAT Gateway),
 * Application Load Balancer, and optional HTTPS termination.
 *
 * Uses VPC Endpoints instead of NAT Gateway for:
 * - Faster deployment (~2-3 min saved)
 * - Better security (no internet egress from private subnets)
 * - Lower cost (~$0.04/hr for endpoints vs $0.045/hr NAT + data charges)
 *
 * EC2 launch type enables Docker socket mounting for sandbox isolation.
 * Suitable for production bots requiring high availability, private
 * networking, and TLS.
 */

import { buildVpcResources } from "./vpc-template";
import { buildVpcEndpointResources } from "./vpc-endpoints-template";
import { buildIamResources } from "./iam-template";
import { buildSecurityGroupResources } from "./security-template";
import { buildAlbResources } from "./alb-template";
import { buildEcsResources } from "./ecs-template";
import { buildOutputs } from "./outputs-template";

export interface ProductionTemplateParams {
  botName: string;
  gatewayPort: number;
  imageUri: string;
  usePublicImage?: boolean;
  cpu?: number;
  memory?: number;
  gatewayAuthToken: string;
  containerEnv?: Record<string, string>;
  certificateArn?: string;
  /** CIDR blocks allowed to access the ALB. Defaults to ["0.0.0.0/0"] for webhook access. */
  allowedCidr?: string[];
}

export function generateProductionTemplate(
  params: ProductionTemplateParams,
): Record<string, unknown> {
  const {
    botName,
    gatewayPort,
    imageUri,
    usePublicImage,
    cpu = 1024,
    memory = 2048,
    gatewayAuthToken,
    containerEnv = {},
    certificateArn,
    allowedCidr = ["0.0.0.0/0"], // Default allows webhooks from anywhere
  } = params;

  // Build ALB resources and get the listener dependency
  const { resources: albResources, listenerDependency } = buildAlbResources(
    botName,
    gatewayPort,
    certificateArn,
    gatewayAuthToken,
  );

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `Clawster Production ECS stack for bot "${botName}"`,

    Parameters: {
      LatestEcsAmiId: {
        Type: "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>",
        Default: "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id",
        Description: "Latest ECS-optimized AMI (auto-resolved via SSM)",
      },
    },

    Resources: {
      // Networking — VPC, Subnets, Gateways, Route Tables
      ...buildVpcResources(botName),

      // VPC Endpoints (replaces NAT Gateway - faster & more secure)
      ...buildVpcEndpointResources(botName),

      // IAM Roles
      ...buildIamResources(botName),

      // Security Groups
      ...buildSecurityGroupResources(botName, gatewayPort, allowedCidr),

      // Application Load Balancer
      ...albResources,

      // ECS Cluster, Task Definition, Service
      ...buildEcsResources({
        botName,
        gatewayPort,
        imageUri,
        usePublicImage,
        cpu,
        memory,
        gatewayAuthToken,
        containerEnv,
        listenerDependency,
      }),
    },

    Outputs: buildOutputs(botName),
  };
}
