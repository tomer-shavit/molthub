/**
 * CloudFormation template generator for Simple ECS EC2 deployments.
 *
 * Creates a minimal EC2-backed ECS setup (~$15/mo) that runs a single OpenClaw
 * gateway task on a t3.small instance in the user's default VPC with a public IP.
 * EC2 launch type enables Docker socket mounting for sandbox isolation.
 */

export interface SimpleTemplateParams {
  botName: string;
  gatewayPort: number;
  imageUri: string;
  usePublicImage?: boolean;
  cpu?: number;
  memory?: number;
  gatewayAuthToken: string;
  containerEnv?: Record<string, string>;
  allowedCidr?: string;
}

export function generateSimpleTemplate(
  params: SimpleTemplateParams,
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
    allowedCidr: rawAllowedCidr,
  } = params;

  const allowedCidr = rawAllowedCidr || "0.0.0.0/0";

  // When using a public base image, install OpenClaw + Docker CLI at container
  // startup.  docker.io is required for sandbox isolation (tool execution in
  // isolated containers).  The Docker socket is mounted from the EC2 host.
  const command = usePublicImage
    ? ["sh", "-c", [
        `apt-get update && apt-get install -y git docker.io`,
        `npm install -g openclaw@latest`,
        `mkdir -p ~/.openclaw`,
        `if [ -n "$OPENCLAW_CONFIG" ]; then printenv OPENCLAW_CONFIG > ~/.openclaw/openclaw.json; fi`,
        `chmod 666 /var/run/docker.sock 2>/dev/null || true`,
        `exec openclaw gateway --port ${gatewayPort} --allow-unconfigured`,
      ].join(" && ")]
    : undefined;

  const tag = { Key: "clawster:bot", Value: botName };

  // Build container environment variables
  const environment: Array<{ Name: string; Value: string }> = [
    { Name: "OPENCLAW_GATEWAY_PORT", Value: String(gatewayPort) },
    { Name: "OPENCLAW_PROFILE", Value: botName },
    ...Object.entries(containerEnv).map(([Name, Value]) => ({
      Name,
      Value,
    })),
  ];

  // Base64-encoded UserData script that configures the ECS agent on first boot
  const userData = Buffer.from(
    [
      `#!/bin/bash`,
      `echo "ECS_CLUSTER=clawster-${botName}" >> /etc/ecs/ecs.config`,
      `echo "ECS_ENABLE_TASK_IAM_ROLE=true" >> /etc/ecs/ecs.config`,
      `echo "ECS_ENABLE_TASK_ENI=true" >> /etc/ecs/ecs.config`,
    ].join("\n"),
  ).toString("base64");

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `Clawster Simple ECS stack for bot "${botName}"`,

    Parameters: {
      VpcId: {
        Type: "AWS::EC2::VPC::Id",
        Description: "VPC to deploy the ECS service into",
      },
      SubnetIds: {
        Type: "List<AWS::EC2::Subnet::Id>",
        Description:
          "Public subnet IDs for the EC2 instances (must be in the specified VPC)",
      },
      LatestEcsAmiId: {
        Type: "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>",
        Default: "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id",
        Description: "Latest ECS-optimized AMI (auto-resolved via SSM)",
      },
    },

    Resources: {
      // ── ECS Cluster ──
      EcsCluster: {
        Type: "AWS::ECS::Cluster",
        Properties: {
          ClusterName: { "Fn::Sub": `clawster-${botName}` },
          Tags: [tag],
        },
      },

      // ── CloudWatch Log Group ──
      LogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: { "Fn::Sub": `/ecs/clawster-${botName}` },
          RetentionInDays: 30,
          Tags: [tag],
        },
      },

      // ── IAM: EC2 Instance Role (ECS agent, CloudWatch, SSM) ──
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

      // ── IAM: Task Execution Role (pull images, read secrets, push logs) ──
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
                    Action: [
                      "secretsmanager:GetSecretValue",
                    ],
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

      // ── IAM: Task Role (empty — least privilege) ──
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

      // ── Security Group ──
      SecurityGroup: {
        Type: "AWS::EC2::SecurityGroup",
        Properties: {
          GroupDescription: {
            "Fn::Sub": `Clawster ${botName} ECS security group`,
          },
          VpcId: { Ref: "VpcId" },
          SecurityGroupIngress: [
            {
              IpProtocol: "tcp",
              FromPort: gatewayPort,
              ToPort: gatewayPort,
              CidrIp: allowedCidr,
              Description: `OpenClaw gateway - allowed: ${allowedCidr}`,
            },
          ],
          SecurityGroupEgress: [
            {
              IpProtocol: "-1",
              CidrIp: "0.0.0.0/0",
              Description: "All outbound traffic",
            },
          ],
          Tags: [
            { ...tag },
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-sg` },
            },
          ],
        },
      },

      // ── Gateway Token Secret ──
      ...(gatewayAuthToken
        ? {
            GatewayTokenSecret: {
              Type: "AWS::SecretsManager::Secret",
              Properties: {
                Name: { "Fn::Sub": `clawster/${botName}/gateway-token` },
                Description: {
                  "Fn::Sub": `Gateway auth token for bot "${botName}"`,
                },
                SecretString: gatewayAuthToken,
                Tags: [tag],
              },
            },
          }
        : {}),

      // ── EC2 Launch Template ──
      LaunchTemplate: {
        Type: "AWS::EC2::LaunchTemplate",
        Properties: {
          LaunchTemplateName: { "Fn::Sub": `clawster-${botName}-lt` },
          LaunchTemplateData: {
            ImageId: { Ref: "LatestEcsAmiId" },
            InstanceType: "t3.small",
            IamInstanceProfile: {
              Arn: { "Fn::GetAtt": ["Ec2InstanceProfile", "Arn"] },
            },
            SecurityGroupIds: [{ Ref: "SecurityGroup" }],
            UserData: userData,
            TagSpecifications: [
              {
                ResourceType: "instance",
                Tags: [
                  { ...tag },
                  {
                    Key: "Name",
                    Value: { "Fn::Sub": `clawster-${botName}` },
                  },
                ],
              },
            ],
          },
        },
      },

      // ── Auto Scaling Group ──
      AutoScalingGroup: {
        Type: "AWS::AutoScaling::AutoScalingGroup",
        Properties: {
          AutoScalingGroupName: { "Fn::Sub": `clawster-${botName}-asg` },
          LaunchTemplate: {
            LaunchTemplateId: { Ref: "LaunchTemplate" },
            Version: { "Fn::GetAtt": ["LaunchTemplate", "LatestVersionNumber"] },
          },
          MinSize: 0,
          MaxSize: 1,
          DesiredCapacity: 0,
          VPCZoneIdentifier: { Ref: "SubnetIds" },
          NewInstancesProtectedFromScaleIn: true,
          Tags: [
            {
              Key: "clawster:bot",
              Value: botName,
              PropagateAtLaunch: true,
            },
          ],
        },
      },

      // ── ECS Capacity Provider (links ASG to cluster) ──
      EcsCapacityProvider: {
        Type: "AWS::ECS::CapacityProvider",
        Properties: {
          Name: { "Fn::Sub": `clawster-${botName}-cp` },
          AutoScalingGroupProvider: {
            AutoScalingGroupArn: { Ref: "AutoScalingGroup" },
            ManagedScaling: {
              Status: "ENABLED",
              TargetCapacity: 100,
              MinimumScalingStepSize: 1,
              MaximumScalingStepSize: 1,
            },
            ManagedTerminationProtection: "ENABLED",
          },
        },
      },
      ClusterCapacityProviderAssociation: {
        Type: "AWS::ECS::ClusterCapacityProviderAssociations",
        Properties: {
          Cluster: { Ref: "EcsCluster" },
          CapacityProviders: [{ Ref: "EcsCapacityProvider" }],
          DefaultCapacityProviderStrategy: [
            {
              CapacityProvider: { Ref: "EcsCapacityProvider" },
              Weight: 1,
            },
          ],
        },
      },

      // ── ECS Task Definition (EC2 launch type with Docker socket) ──
      TaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: { "Fn::Sub": `clawster-${botName}` },
          Cpu: String(cpu),
          Memory: String(memory),
          NetworkMode: "awsvpc",
          RequiresCompatibilities: ["EC2"],
          ExecutionRoleArn: { "Fn::GetAtt": ["TaskExecutionRole", "Arn"] },
          TaskRoleArn: { "Fn::GetAtt": ["TaskRole", "Arn"] },
          Volumes: [
            {
              Name: "docker-socket",
              Host: { SourcePath: "/var/run/docker.sock" },
            },
          ],
          ContainerDefinitions: [
            {
              Name: "openclaw",
              Image: imageUri,
              ...(command ? { Command: command } : {}),
              Essential: true,
              PortMappings: [
                {
                  ContainerPort: gatewayPort,
                  HostPort: gatewayPort,
                  Protocol: "tcp",
                },
              ],
              MountPoints: [
                {
                  SourceVolume: "docker-socket",
                  ContainerPath: "/var/run/docker.sock",
                  ReadOnly: false,
                },
              ],
              Environment: environment,
              Secrets: [
                {
                  Name: "OPENCLAW_CONFIG",
                  ValueFrom: {
                    "Fn::Sub":
                      `arn:aws:secretsmanager:\${AWS::Region}:\${AWS::AccountId}:secret:clawster/${botName}/config`,
                  },
                },
                ...(gatewayAuthToken
                  ? [
                      {
                        Name: "OPENCLAW_GATEWAY_TOKEN",
                        ValueFrom: { Ref: "GatewayTokenSecret" },
                      },
                    ]
                  : []),
              ],
              LogConfiguration: {
                LogDriver: "awslogs",
                Options: {
                  "awslogs-group": {
                    "Fn::Sub": `/ecs/clawster-${botName}`,
                  },
                  "awslogs-region": { Ref: "AWS::Region" },
                  "awslogs-stream-prefix": "ecs",
                },
              },
            },
          ],
          Tags: [tag],
        },
      },

      // ── ECS Service (uses capacity provider, not LaunchType) ──
      EcsService: {
        Type: "AWS::ECS::Service",
        DependsOn: ["TaskDefinition", "ClusterCapacityProviderAssociation"],
        Properties: {
          ServiceName: { "Fn::Sub": `clawster-${botName}` },
          Cluster: { Ref: "EcsCluster" },
          TaskDefinition: { Ref: "TaskDefinition" },
          DesiredCount: 0,
          CapacityProviderStrategy: [
            {
              CapacityProvider: { Ref: "EcsCapacityProvider" },
              Weight: 1,
            },
          ],
          NetworkConfiguration: {
            AwsvpcConfiguration: {
              Subnets: { Ref: "SubnetIds" },
              SecurityGroups: [{ Ref: "SecurityGroup" }],
              AssignPublicIp: "ENABLED",
            },
          },
          Tags: [tag],
        },
      },
    },

    Outputs: {
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
        Description: "Security Group ID",
        Value: { Ref: "SecurityGroup" },
      },
      LogGroupName: {
        Description: "CloudWatch Log Group name",
        Value: { Ref: "LogGroup" },
      },
    },
  };
}
