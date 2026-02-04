/**
 * CloudFormation Outputs builder.
 *
 * Defines stack outputs for the ECS EC2 deployment:
 * - Cluster and service names
 * - Task definition ARN
 * - Security group ID
 * - Log group name
 * - VPC ID
 * - ALB DNS name and ARN
 */

/**
 * Builds CloudFormation Outputs section.
 *
 * @param _botName - The bot name (unused but kept for consistency)
 * @returns CloudFormation Outputs object
 */
export function buildOutputs(_botName: string): Record<string, unknown> {
  return {
    ClusterName: {
      Description: "ECS Cluster name",
      Value: { Ref: "EcsCluster" },
    },
    ServiceName: {
      Description: "ECS Service name",
      Value: { "Fn::GetAtt": ["EcsService", "Name"] },
    },
    TaskDefinitionArn: {
      Description: "Task Definition ARN",
      Value: { Ref: "TaskDefinition" },
    },
    SecurityGroupId: {
      Description: "Task Security Group ID",
      Value: { Ref: "TaskSecurityGroup" },
    },
    LogGroupName: {
      Description: "CloudWatch Log Group name",
      Value: { Ref: "LogGroup" },
    },
    VpcId: {
      Description: "VPC ID",
      Value: { Ref: "Vpc" },
    },
    AlbDnsName: {
      Description: "Application Load Balancer DNS name",
      Value: { "Fn::GetAtt": ["Alb", "DNSName"] },
    },
    AlbArn: {
      Description: "Application Load Balancer ARN",
      Value: { Ref: "Alb" },
    },
  };
}
