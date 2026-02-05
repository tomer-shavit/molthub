/**
 * Tests for per-bot template generation (shared infra mode).
 */
import { generatePerBotTemplate, PerBotTemplateParams } from "./per-bot-template";
import { SharedExportNames } from "../shared-infra/shared-infra-config";

function makeParams(overrides?: Partial<PerBotTemplateParams>): PerBotTemplateParams {
  return {
    botName: "test-bot",
    gatewayPort: 18789,
    imageUri: "node:22-slim",
    gatewayAuthToken: "test-token-123",
    ...overrides,
  };
}

describe("generatePerBotTemplate", () => {
  const template = generatePerBotTemplate(makeParams());
  const resources = template.Resources as Record<string, Record<string, unknown>>;

  it("generates valid CF template with correct version", () => {
    expect(template.AWSTemplateFormatVersion).toBe("2010-09-09");
  });

  it("has description mentioning shared infra mode", () => {
    expect(template.Description).toContain("shared infra");
  });

  it("includes SSM parameter for ECS AMI", () => {
    const params = template.Parameters as Record<string, unknown>;
    expect(params.LatestEcsAmiId).toBeDefined();
  });

  // ── Fn::ImportValue tests ──

  it("uses Fn::ImportValue for VPC ID in security groups", () => {
    const albSg = resources.AlbSecurityGroup as { Properties: { VpcId: unknown } };
    expect(albSg.Properties.VpcId).toEqual({
      "Fn::ImportValue": SharedExportNames.VpcId,
    });

    const taskSg = resources.TaskSecurityGroup as { Properties: { VpcId: unknown } };
    expect(taskSg.Properties.VpcId).toEqual({
      "Fn::ImportValue": SharedExportNames.VpcId,
    });
  });

  it("uses Fn::ImportValue for public subnets in ALB", () => {
    const alb = resources.Alb as { Properties: { Subnets: unknown[] } };
    expect(alb.Properties.Subnets).toContainEqual({
      "Fn::ImportValue": SharedExportNames.PublicSubnet1,
    });
    expect(alb.Properties.Subnets).toContainEqual({
      "Fn::ImportValue": SharedExportNames.PublicSubnet2,
    });
  });

  it("uses Fn::ImportValue for VPC ID in target group", () => {
    const tg = resources.AlbTargetGroup as { Properties: { VpcId: unknown } };
    expect(tg.Properties.VpcId).toEqual({
      "Fn::ImportValue": SharedExportNames.VpcId,
    });
  });

  it("uses Fn::ImportValue for instance profile in launch template", () => {
    const lt = resources.LaunchTemplate as {
      Properties: { LaunchTemplateData: { IamInstanceProfile: { Arn: unknown } } };
    };
    expect(lt.Properties.LaunchTemplateData.IamInstanceProfile.Arn).toEqual({
      "Fn::ImportValue": SharedExportNames.Ec2InstanceProfileArn,
    });
  });

  it("uses Fn::ImportValue for private subnets in ASG", () => {
    const asg = resources.AutoScalingGroup as {
      Properties: { VPCZoneIdentifier: unknown[] };
    };
    expect(asg.Properties.VPCZoneIdentifier).toContainEqual({
      "Fn::ImportValue": SharedExportNames.PrivateSubnet1,
    });
    expect(asg.Properties.VPCZoneIdentifier).toContainEqual({
      "Fn::ImportValue": SharedExportNames.PrivateSubnet2,
    });
  });

  it("uses Fn::ImportValue for execution role in task definition", () => {
    const taskDef = resources.TaskDefinition as {
      Properties: { ExecutionRoleArn: unknown };
    };
    expect(taskDef.Properties.ExecutionRoleArn).toEqual({
      "Fn::ImportValue": SharedExportNames.TaskExecutionRoleArn,
    });
  });

  it("uses Fn::ImportValue for private subnets in ECS service", () => {
    const service = resources.EcsService as {
      Properties: { NetworkConfiguration: { AwsvpcConfiguration: { Subnets: unknown[] } } };
    };
    const subnets = service.Properties.NetworkConfiguration.AwsvpcConfiguration.Subnets;
    expect(subnets).toContainEqual({
      "Fn::ImportValue": SharedExportNames.PrivateSubnet1,
    });
  });

  // ── Per-bot resources ──

  it("creates per-bot ALB security group", () => {
    expect(resources.AlbSecurityGroup).toBeDefined();
  });

  it("creates per-bot task security group", () => {
    expect(resources.TaskSecurityGroup).toBeDefined();
  });

  it("creates per-bot ALB", () => {
    expect(resources.Alb).toBeDefined();
  });

  it("creates per-bot ECS cluster", () => {
    expect(resources.EcsCluster).toBeDefined();
  });

  it("creates per-bot task role (least privilege)", () => {
    expect(resources.TaskRole).toBeDefined();
    const taskRole = resources.TaskRole as { Properties: { RoleName: string } };
    expect(taskRole.Properties.RoleName).toContain("test-bot");
  });

  it("creates per-bot log group", () => {
    expect(resources.LogGroup).toBeDefined();
  });

  // ── Quick wins ──

  it("includes warm pool configuration", () => {
    expect(resources.WarmPool).toBeDefined();
    const warmPool = resources.WarmPool as {
      Properties: { PoolState: string; MaxGroupPreparedCapacity: number };
    };
    expect(warmPool.Properties.PoolState).toBe("Stopped");
    expect(warmPool.Properties.MaxGroupPreparedCapacity).toBe(1);
  });

  it("has tuned health check (5s interval, 3 unhealthy threshold)", () => {
    const tg = resources.AlbTargetGroup as {
      Properties: {
        HealthCheckIntervalSeconds: number;
        UnhealthyThresholdCount: number;
      };
    };
    expect(tg.Properties.HealthCheckIntervalSeconds).toBe(5);
    expect(tg.Properties.UnhealthyThresholdCount).toBe(3);
  });

  // ── Listener variations ──

  it("creates HTTP listener when no certificate provided", () => {
    const t = generatePerBotTemplate(makeParams());
    const r = t.Resources as Record<string, unknown>;
    expect(r.AlbHttpListener).toBeDefined();
    expect(r.AlbHttpsListener).toBeUndefined();
  });

  it("creates HTTPS listener + redirect when certificate provided", () => {
    const t = generatePerBotTemplate(
      makeParams({ certificateArn: "arn:aws:acm:us-east-1:123:certificate/abc" }),
    );
    const r = t.Resources as Record<string, unknown>;
    expect(r.AlbHttpsListener).toBeDefined();
    expect(r.AlbHttpRedirectListener).toBeDefined();
    expect(r.AlbHttpListener).toBeUndefined();
  });

  // ── Gateway token ──

  it("creates gateway token secret when token provided", () => {
    const t = generatePerBotTemplate(makeParams({ gatewayAuthToken: "my-token" }));
    const r = t.Resources as Record<string, unknown>;
    expect(r.GatewayTokenSecret).toBeDefined();
  });

  it("skips gateway token secret when no token", () => {
    const t = generatePerBotTemplate(makeParams({ gatewayAuthToken: "" }));
    const r = t.Resources as Record<string, unknown>;
    expect(r.GatewayTokenSecret).toBeUndefined();
  });

  // ── Outputs ──

  it("includes ALB DNS, cluster name, and service name in outputs", () => {
    const outputs = template.Outputs as Record<string, unknown>;
    expect(outputs.AlbDnsName).toBeDefined();
    expect(outputs.ClusterName).toBeDefined();
    expect(outputs.ServiceName).toBeDefined();
  });
});
