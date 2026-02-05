/**
 * Tests for shared infrastructure templates and configuration.
 */
import { generateSharedInfraTemplate } from "./templates/shared-production";
import { buildSharedVpcResources } from "./templates/shared-vpc-template";
import { buildSharedVpcEndpointResources } from "./templates/shared-vpc-endpoints-template";
import { buildSharedIamResources } from "./templates/shared-iam-template";
import { buildSharedOutputs } from "./templates/shared-outputs-template";
import {
  SharedExportNames,
  getSharedInfraStackName,
  SHARED_INFRA_STACK_PREFIX,
} from "./shared-infra-config";

describe("SharedInfraConfig", () => {
  it("generates stack name from region", () => {
    expect(getSharedInfraStackName("us-east-1")).toBe("clawster-shared-us-east-1");
    expect(getSharedInfraStackName("eu-west-1")).toBe("clawster-shared-eu-west-1");
  });

  it("has correct stack prefix", () => {
    expect(SHARED_INFRA_STACK_PREFIX).toBe("clawster-shared");
  });

  it("defines all required export names", () => {
    expect(SharedExportNames.VpcId).toBe("clawster-shared-VpcId");
    expect(SharedExportNames.PublicSubnet1).toBe("clawster-shared-PublicSubnet1");
    expect(SharedExportNames.PublicSubnet2).toBe("clawster-shared-PublicSubnet2");
    expect(SharedExportNames.PrivateSubnet1).toBe("clawster-shared-PrivateSubnet1");
    expect(SharedExportNames.PrivateSubnet2).toBe("clawster-shared-PrivateSubnet2");
    expect(SharedExportNames.PrivateRouteTable).toBe("clawster-shared-PrivateRouteTable");
    expect(SharedExportNames.VpcEndpointSecurityGroupId).toBe("clawster-shared-VpcEndpointSgId");
    expect(SharedExportNames.Ec2InstanceProfileArn).toBe("clawster-shared-Ec2InstanceProfileArn");
    expect(SharedExportNames.TaskExecutionRoleArn).toBe("clawster-shared-TaskExecRoleArn");
  });
});

describe("Shared VPC Template", () => {
  const resources = buildSharedVpcResources();

  it("creates a VPC resource", () => {
    expect(resources.Vpc).toBeDefined();
    expect(resources.Vpc.Type).toBe("AWS::EC2::VPC");
    expect(resources.Vpc.Properties.EnableDnsSupport).toBe(true);
    expect(resources.Vpc.Properties.EnableDnsHostnames).toBe(true);
  });

  it("creates 2 public subnets with public IPs", () => {
    expect(resources.PublicSubnet1).toBeDefined();
    expect(resources.PublicSubnet2).toBeDefined();
    expect(resources.PublicSubnet1.Properties.MapPublicIpOnLaunch).toBe(true);
    expect(resources.PublicSubnet2.Properties.MapPublicIpOnLaunch).toBe(true);
  });

  it("creates 2 private subnets without public IPs", () => {
    expect(resources.PrivateSubnet1).toBeDefined();
    expect(resources.PrivateSubnet2).toBeDefined();
    expect(resources.PrivateSubnet1.Properties.MapPublicIpOnLaunch).toBeUndefined();
    expect(resources.PrivateSubnet2.Properties.MapPublicIpOnLaunch).toBeUndefined();
  });

  it("creates Internet Gateway and attachment", () => {
    expect(resources.InternetGateway).toBeDefined();
    expect(resources.VpcGatewayAttachment).toBeDefined();
  });

  it("creates public and private route tables", () => {
    expect(resources.PublicRouteTable).toBeDefined();
    expect(resources.PrivateRouteTable).toBeDefined();
    expect(resources.PublicRoute).toBeDefined();
  });

  it("uses clawster-shared naming", () => {
    const vpcTags = resources.Vpc.Properties.Tags as Array<{ Key: string; Value: string }>;
    expect(vpcTags).toContainEqual({ Key: "clawster:shared", Value: "true" });
  });
});

describe("Shared VPC Endpoints Template", () => {
  const resources = buildSharedVpcEndpointResources();

  it("creates VPC endpoint security group", () => {
    expect(resources.VpcEndpointSecurityGroup).toBeDefined();
    expect(resources.VpcEndpointSecurityGroup.Type).toBe("AWS::EC2::SecurityGroup");
  });

  it("creates all 9 VPC endpoints", () => {
    const endpointNames = [
      "EcrApiEndpoint",
      "EcrDkrEndpoint",
      "S3Endpoint",
      "LogsEndpoint",
      "SecretsManagerEndpoint",
      "SsmEndpoint",
      "EcsEndpoint",
      "EcsAgentEndpoint",
      "EcsTelemetryEndpoint",
    ];

    for (const name of endpointNames) {
      expect(resources[name]).toBeDefined();
      expect(resources[name].Type).toBe("AWS::EC2::VPCEndpoint");
    }
  });

  it("uses Gateway type for S3 endpoint (free)", () => {
    expect(resources.S3Endpoint.Properties.VpcEndpointType).toBe("Gateway");
  });

  it("uses Interface type for all other endpoints", () => {
    const interfaceEndpoints = [
      "EcrApiEndpoint",
      "EcrDkrEndpoint",
      "LogsEndpoint",
      "SecretsManagerEndpoint",
      "SsmEndpoint",
      "EcsEndpoint",
      "EcsAgentEndpoint",
      "EcsTelemetryEndpoint",
    ];

    for (const name of interfaceEndpoints) {
      expect(resources[name].Properties.VpcEndpointType).toBe("Interface");
    }
  });
});

describe("Shared IAM Template", () => {
  const resources = buildSharedIamResources();

  it("creates EC2 instance role with ECS and SSM policies", () => {
    expect(resources.Ec2InstanceRole).toBeDefined();
    expect(resources.Ec2InstanceRole.Type).toBe("AWS::IAM::Role");
    const policies = resources.Ec2InstanceRole.Properties.ManagedPolicyArns as string[];
    expect(policies).toContainEqual(
      expect.stringContaining("AmazonEC2ContainerServiceforEC2Role"),
    );
    expect(policies).toContainEqual(
      expect.stringContaining("AmazonSSMManagedInstanceCore"),
    );
  });

  it("creates EC2 instance profile", () => {
    expect(resources.Ec2InstanceProfile).toBeDefined();
    expect(resources.Ec2InstanceProfile.Type).toBe("AWS::IAM::InstanceProfile");
  });

  it("creates task execution role with wildcard SecretsManager access", () => {
    expect(resources.TaskExecutionRole).toBeDefined();
    const policies = resources.TaskExecutionRole.Properties.Policies as Array<{
      PolicyDocument: { Statement: Array<{ Resource: unknown }> };
    }>;
    const secretsPolicy = policies[0];
    const resource = secretsPolicy.PolicyDocument.Statement[0].Resource;
    // Should use clawster/* wildcard for all bots
    expect(resource).toEqual({
      "Fn::Sub": "arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:clawster/*",
    });
  });

  it("does NOT create a per-bot TaskRole (stays per-bot)", () => {
    expect(resources.TaskRole).toBeUndefined();
  });
});

describe("Shared Outputs Template", () => {
  const outputs = buildSharedOutputs();

  it("exports VPC ID", () => {
    const vpcOutput = outputs.VpcId as { Export: { Name: string } };
    expect(vpcOutput.Export.Name).toBe(SharedExportNames.VpcId);
  });

  it("exports all subnet IDs", () => {
    const pub1 = outputs.PublicSubnet1Id as { Export: { Name: string } };
    const pub2 = outputs.PublicSubnet2Id as { Export: { Name: string } };
    const priv1 = outputs.PrivateSubnet1Id as { Export: { Name: string } };
    const priv2 = outputs.PrivateSubnet2Id as { Export: { Name: string } };

    expect(pub1.Export.Name).toBe(SharedExportNames.PublicSubnet1);
    expect(pub2.Export.Name).toBe(SharedExportNames.PublicSubnet2);
    expect(priv1.Export.Name).toBe(SharedExportNames.PrivateSubnet1);
    expect(priv2.Export.Name).toBe(SharedExportNames.PrivateSubnet2);
  });

  it("exports instance profile and task execution role ARNs", () => {
    const profileOutput = outputs.Ec2InstanceProfileArn as { Export: { Name: string } };
    const roleOutput = outputs.TaskExecutionRoleArn as { Export: { Name: string } };

    expect(profileOutput.Export.Name).toBe(SharedExportNames.Ec2InstanceProfileArn);
    expect(roleOutput.Export.Name).toBe(SharedExportNames.TaskExecutionRoleArn);
  });
});

describe("generateSharedInfraTemplate", () => {
  const template = generateSharedInfraTemplate();

  it("generates valid CF template with correct version", () => {
    expect(template.AWSTemplateFormatVersion).toBe("2010-09-09");
  });

  it("has description mentioning shared infrastructure", () => {
    expect(template.Description).toContain("shared");
  });

  it("includes VPC resources", () => {
    const resources = template.Resources as Record<string, unknown>;
    expect(resources.Vpc).toBeDefined();
    expect(resources.InternetGateway).toBeDefined();
  });

  it("includes VPC endpoints", () => {
    const resources = template.Resources as Record<string, unknown>;
    expect(resources.EcrApiEndpoint).toBeDefined();
    expect(resources.EcrDkrEndpoint).toBeDefined();
    expect(resources.S3Endpoint).toBeDefined();
  });

  it("includes IAM resources", () => {
    const resources = template.Resources as Record<string, unknown>;
    expect(resources.Ec2InstanceRole).toBeDefined();
    expect(resources.Ec2InstanceProfile).toBeDefined();
    expect(resources.TaskExecutionRole).toBeDefined();
  });

  it("includes outputs with exports", () => {
    const outputs = template.Outputs as Record<string, { Export?: { Name: string } }>;
    expect(outputs.VpcId?.Export?.Name).toBe(SharedExportNames.VpcId);
  });

  it("does NOT include ECS-specific resources (those are per-bot)", () => {
    const resources = template.Resources as Record<string, unknown>;
    expect(resources.EcsCluster).toBeUndefined();
    expect(resources.TaskDefinition).toBeUndefined();
    expect(resources.EcsService).toBeUndefined();
    expect(resources.Alb).toBeUndefined();
  });
});
