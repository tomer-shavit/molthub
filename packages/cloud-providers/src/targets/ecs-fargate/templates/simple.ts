/**
 * CloudFormation template generator for Simple ECS Fargate deployments.
 *
 * Creates a minimal Fargate setup (~$15/mo) that runs a single OpenClaw
 * gateway task in the user's default VPC with a public IP. Suitable for
 * development, testing, and low-traffic personal bots.
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

  // When using a public base image, install OpenClaw at container startup.
  // The OPENCLAW_CONFIG env var is injected from Secrets Manager by ECS.
  // We must write it to ~/.openclaw/openclaw.json before starting the gateway,
  // because OpenClaw reads config from disk (not from env vars).
  const command = usePublicImage
    ? ["sh", "-c", [
        `apt-get update && apt-get install -y git`,
        `npm install -g openclaw@latest`,
        `mkdir -p ~/.openclaw`,
        `if [ -n "$OPENCLAW_CONFIG" ]; then printenv OPENCLAW_CONFIG > ~/.openclaw/openclaw.json; fi`,
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

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `Clawster Simple ECS Fargate stack for bot "${botName}"`,

    Parameters: {
      VpcId: {
        Type: "AWS::EC2::VPC::Id",
        Description: "VPC to deploy the ECS service into",
      },
      SubnetIds: {
        Type: "List<AWS::EC2::Subnet::Id>",
        Description:
          "Public subnet IDs for the Fargate tasks (must be in the specified VPC)",
      },
    },

    Resources: {
      // ── ECR Repository ──
      EcrRepository: {
        Type: "AWS::ECR::Repository",
        Properties: {
          RepositoryName: { "Fn::Sub": `clawster/${botName}` },
          ImageScanningConfiguration: {
            ScanOnPush: true,
          },
          ImageTagMutability: "MUTABLE",
          Tags: [tag],
        },
      },

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

      // ── IAM Task Execution Role ──
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

      // ── IAM Task Role (empty — least privilege) ──
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
            "Fn::Sub": `Clawster ${botName} ECS Fargate security group`,
          },
          VpcId: { Ref: "VpcId" },
          SecurityGroupIngress: [
            {
              IpProtocol: "tcp",
              FromPort: gatewayPort,
              ToPort: gatewayPort,
              CidrIp: allowedCidr,
              Description: `OpenClaw gateway – allowed: ${allowedCidr}`,
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

      // ── ECS Task Definition ──
      TaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: { "Fn::Sub": `clawster-${botName}` },
          Cpu: String(cpu),
          Memory: String(memory),
          NetworkMode: "awsvpc",
          RequiresCompatibilities: ["FARGATE"],
          ExecutionRoleArn: { "Fn::GetAtt": ["TaskExecutionRole", "Arn"] },
          TaskRoleArn: { "Fn::GetAtt": ["TaskRole", "Arn"] },
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

      // ── ECS Service ──
      EcsService: {
        Type: "AWS::ECS::Service",
        DependsOn: ["TaskDefinition"],
        Properties: {
          ServiceName: { "Fn::Sub": `clawster-${botName}` },
          Cluster: { Ref: "EcsCluster" },
          TaskDefinition: { Ref: "TaskDefinition" },
          DesiredCount: 0,
          LaunchType: "FARGATE",
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
      EcrRepositoryUri: {
        Description: "ECR Repository URI",
        Value: { "Fn::GetAtt": ["EcrRepository", "RepositoryUri"] },
      },
    },
  };
}
