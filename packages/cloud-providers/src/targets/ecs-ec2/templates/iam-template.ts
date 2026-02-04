/**
 * IAM CloudFormation resources builder.
 *
 * Creates IAM roles and policies for ECS EC2 deployments:
 * - EC2 Instance Role (ECS agent, CloudWatch, SSM)
 * - EC2 Instance Profile
 * - Task Execution Role (pull images, read secrets, push logs)
 * - Task Role (empty - least privilege)
 */

import type { CloudFormationResources } from "./types";

/**
 * Builds IAM role and policy resources for ECS EC2.
 *
 * @param botName - The bot name used for resource naming and tagging
 * @returns CloudFormation resources for IAM roles
 */
export function buildIamResources(botName: string): CloudFormationResources {
  const tag = { Key: "clawster:bot", Value: botName };

  return {
    // ── EC2 Instance Role (ECS agent, CloudWatch, SSM) ──
    Ec2InstanceRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: { "Fn::Sub": `clawster-${botName}-ec2` },
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ec2.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        ManagedPolicyArns: [
          "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
          "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
        ],
        Tags: [tag],
      },
    },
    Ec2InstanceProfile: {
      Type: "AWS::IAM::InstanceProfile",
      Properties: {
        Roles: [{ Ref: "Ec2InstanceRole" }],
      },
    },

    // ── Task Execution Role (pull images, read secrets, push logs) ──
    TaskExecutionRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: { "Fn::Sub": `clawster-${botName}-exec` },
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ecs-tasks.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        ManagedPolicyArns: [
          "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
        ],
        Policies: [
          {
            PolicyName: "SecretsManagerRead",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: ["secretsmanager:GetSecretValue"],
                  Resource: {
                    "Fn::Sub":
                      `arn:aws:secretsmanager:\${AWS::Region}:\${AWS::AccountId}:secret:clawster/${botName}/*`,
                  },
                },
              ],
            },
          },
        ],
        Tags: [tag],
      },
    },

    // ── Task Role (empty — least privilege) ──
    TaskRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: { "Fn::Sub": `clawster-${botName}-task` },
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ecs-tasks.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        Tags: [tag],
      },
    },
  };
}
