/**
 * Tests for quick wins applied to legacy templates:
 * - Health check tuning (ALB)
 * - Warm pools (ECS)
 * - Image caching (ECS)
 */
import { buildAlbResources } from "./alb-template";
import { buildEcsResources } from "./ecs-template";

describe("ALB Template — Health Check Tuning", () => {
  const { resources } = buildAlbResources("test-bot", 18789);

  it("uses 5-second health check interval (not 60)", () => {
    const tg = resources.AlbTargetGroup;
    expect(tg.Properties.HealthCheckIntervalSeconds).toBe(5);
  });

  it("uses 3-second health check timeout", () => {
    const tg = resources.AlbTargetGroup;
    expect(tg.Properties.HealthCheckTimeoutSeconds).toBe(3);
  });

  it("uses 2 healthy threshold", () => {
    const tg = resources.AlbTargetGroup;
    expect(tg.Properties.HealthyThresholdCount).toBe(2);
  });

  it("uses 3 unhealthy threshold (not 5)", () => {
    const tg = resources.AlbTargetGroup;
    expect(tg.Properties.UnhealthyThresholdCount).toBe(3);
  });
});

describe("ECS Template — Warm Pools", () => {
  const resources = buildEcsResources({
    botName: "test-bot",
    gatewayPort: 18789,
    imageUri: "node:22-slim",
    cpu: 1024,
    memory: 2048,
    gatewayAuthToken: "test-token",
    containerEnv: {},
    listenerDependency: "AlbHttpListener",
  });

  it("includes WarmPool resource on the ASG", () => {
    expect(resources.WarmPool).toBeDefined();
    expect(resources.WarmPool.Type).toBe("AWS::AutoScaling::WarmPool");
  });

  it("warm pool is in Stopped state", () => {
    expect(resources.WarmPool.Properties.PoolState).toBe("Stopped");
  });

  it("warm pool has MaxGroupPreparedCapacity of 1", () => {
    expect(resources.WarmPool.Properties.MaxGroupPreparedCapacity).toBe(1);
  });

  it("warm pool MinSize is 0", () => {
    expect(resources.WarmPool.Properties.MinSize).toBe(0);
  });
});

describe("ECS Template — UserData Configuration", () => {
  const resources = buildEcsResources({
    botName: "test-bot",
    gatewayPort: 18789,
    imageUri: "node:22-slim",
    cpu: 1024,
    memory: 2048,
    gatewayAuthToken: "test-token",
    containerEnv: {},
    listenerDependency: "AlbHttpListener",
  });

  it("includes ECS_WARM_POOLS_CHECK in UserData", () => {
    const lt = resources.LaunchTemplate;
    const ltData = lt.Properties.LaunchTemplateData as Record<string, unknown>;
    const userDataB64 = ltData.UserData as string;
    const userData = Buffer.from(userDataB64, "base64").toString("utf-8");
    expect(userData).toContain("ECS_WARM_POOLS_CHECK=true");
  });

  it("includes ECS_IMAGE_PULL_BEHAVIOR=prefer-cached in UserData", () => {
    const lt = resources.LaunchTemplate;
    const ltData = lt.Properties.LaunchTemplateData as Record<string, unknown>;
    const userDataB64 = ltData.UserData as string;
    const userData = Buffer.from(userDataB64, "base64").toString("utf-8");
    expect(userData).toContain("ECS_IMAGE_PULL_BEHAVIOR=prefer-cached");
  });

  it("includes ECS cluster name in UserData", () => {
    const lt = resources.LaunchTemplate;
    const ltData = lt.Properties.LaunchTemplateData as Record<string, unknown>;
    const userDataB64 = ltData.UserData as string;
    const userData = Buffer.from(userDataB64, "base64").toString("utf-8");
    expect(userData).toContain("ECS_CLUSTER=clawster-test-bot");
  });

  it("includes Sysbox install script in UserData", () => {
    const lt = resources.LaunchTemplate;
    const ltData = lt.Properties.LaunchTemplateData as Record<string, unknown>;
    const userDataB64 = ltData.UserData as string;
    const userData = Buffer.from(userDataB64, "base64").toString("utf-8");
    expect(userData).toContain("sysbox");
  });
});
