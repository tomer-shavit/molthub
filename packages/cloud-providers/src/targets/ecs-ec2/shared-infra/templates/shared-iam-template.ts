/**
 * Shared IAM CloudFormation resources builder.
 *
 * Creates IAM roles shared across all bot deployments:
 * - EC2 Instance Role (ECS agent, CloudWatch, SSM)
 * - EC2 Instance Profile
 * - Task Execution Role (pull images, read secrets, push logs)
 *
 * Note: Task Role is NOT shared — it stays per-bot for least-privilege isolation.
 * The SecretsManager policy uses a `clawster/*` wildcard to allow any bot's secrets.
 */

import type { CloudFormationResources } from "../../templates/types";

/**
 * Builds shared IAM role and policy resources for ECS EC2.
 *
 * @returns CloudFormation resources for shared IAM roles
 */
export function buildSharedIamResources(): CloudFormationResources {
  const tag = { Key: "clawster:shared", Value: "true" };

  return {
    // ── EC2 Instance Role (ECS agent, CloudWatch, SSM) ──
    Ec2InstanceRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "clawster-shared-ec2",
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
        InstanceProfileName: "clawster-shared-ec2-profile",
        Roles: [{ Ref: "Ec2InstanceRole" }],
      },
    },

    // ── Task Execution Role (pull images, read secrets, push logs) ──
    // Uses clawster/* wildcard for SecretsManager to support all bots
    TaskExecutionRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "clawster-shared-exec",
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
                      "arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:clawster/*",
                  },
                },
              ],
            },
          },
        ],
        Tags: [tag],
      },
    },
  };
}
