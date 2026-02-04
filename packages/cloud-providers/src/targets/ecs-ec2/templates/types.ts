/**
 * CloudFormation template type definitions.
 *
 * These types provide structure for building CloudFormation resources
 * in a type-safe, modular way.
 */

/** A single CloudFormation resource */
export interface CloudFormationResource {
  Type: string;
  Properties: Record<string, unknown>;
  DependsOn?: string | string[];
}

/** A collection of CloudFormation resources */
export type CloudFormationResources = Record<string, CloudFormationResource>;

/** Parameters for VPC template builder */
export interface VpcTemplateParams {
  botName: string;
  vpcCidr?: string;
}

/** Parameters for IAM template builder */
export interface IamTemplateParams {
  botName: string;
  secretsArn?: string;
}

/** Parameters for security group template builder */
export interface SecurityTemplateParams {
  botName: string;
  gatewayPort: number;
  allowedCidr: string[];
}

/** Parameters for ALB template builder */
export interface AlbTemplateParams {
  botName: string;
  gatewayPort: number;
  certificateArn?: string;
}

/** Parameters for ECS template builder */
export interface EcsTemplateParams {
  botName: string;
  gatewayPort: number;
  imageUri: string;
  usePublicImage?: boolean;
  cpu: number;
  memory: number;
  gatewayAuthToken: string;
  containerEnv: Record<string, string>;
  listenerDependency: string;
}
