import { AwsEc2Target } from "./aws-ec2-target";
import type { AwsEc2Config } from "./aws-ec2-config";
import type { IAwsNetworkManager, IAwsComputeManager } from "./managers";
import type { ISecretsManagerService, ICloudWatchLogsService } from "./aws-ec2-services.interface";
import { DeploymentTargetType } from "../../interface/deployment-target";

/**
 * Creates a minimal mock for IAwsNetworkManager with all methods as jest.fn().
 */
function createMockNetworkManager(): jest.Mocked<IAwsNetworkManager> {
  return {
    ensureSharedInfra: jest.fn(),
    updateSecurityGroupRules: jest.fn(),
    getSharedInfra: jest.fn(),
    deleteSharedInfraIfOrphaned: jest.fn(),
  };
}

/**
 * Creates a minimal mock for IAwsComputeManager with all methods as jest.fn().
 */
function createMockComputeManager(): jest.Mocked<IAwsComputeManager> {
  return {
    resolveUbuntuAmi: jest.fn(),
    ensureLaunchTemplate: jest.fn(),
    deleteLaunchTemplate: jest.fn(),
    runInstance: jest.fn(),
    terminateInstance: jest.fn(),
    findInstanceByTag: jest.fn(),
    getInstancePublicIp: jest.fn(),
    getInstanceStatus: jest.fn(),
  };
}

/**
 * Creates a minimal mock for ISecretsManagerService with all methods as jest.fn().
 */
function createMockSecretsManager(): jest.Mocked<ISecretsManagerService> {
  return {
    createSecret: jest.fn(),
    updateSecret: jest.fn(),
    deleteSecret: jest.fn(),
    restoreSecret: jest.fn(),
    secretExists: jest.fn(),
  };
}

/**
 * Creates a minimal mock for ICloudWatchLogsService with all methods as jest.fn().
 */
function createMockCloudWatchLogs(): jest.Mocked<ICloudWatchLogsService> {
  return {
    getLogStreams: jest.fn(),
    getLogs: jest.fn(),
    deleteLogGroup: jest.fn(),
  };
}

const DEFAULT_SHARED_INFRA = {
  vpcId: "vpc-123",
  subnetId: "subnet-456",
  internetGatewayId: "igw-789",
  routeTableId: "rtb-abc",
  securityGroupId: "sg-def",
  instanceProfileArn: "arn:aws:iam::123456789012:instance-profile/clawster",
  iamRoleName: "clawster-role",
};

describe("AwsEc2Target", () => {
  const baseConfig: AwsEc2Config = {
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    profileName: "test-bot",
  };

  let mockNetworkManager: jest.Mocked<IAwsNetworkManager>;
  let mockComputeManager: jest.Mocked<IAwsComputeManager>;
  let mockSecretsManager: jest.Mocked<ISecretsManagerService>;
  let mockCloudWatchLogs: jest.Mocked<ICloudWatchLogsService>;

  function createTarget(configOverrides: Partial<AwsEc2Config> = {}): AwsEc2Target {
    return new AwsEc2Target({
      config: { ...baseConfig, ...configOverrides },
      managers: { networkManager: mockNetworkManager, computeManager: mockComputeManager },
      services: { secretsManager: mockSecretsManager, cloudWatchLogs: mockCloudWatchLogs },
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockNetworkManager = createMockNetworkManager();
    mockComputeManager = createMockComputeManager();
    mockSecretsManager = createMockSecretsManager();
    mockCloudWatchLogs = createMockCloudWatchLogs();
  });

  // ── Constructor ──────────────────────────────────────────────────────

  describe("constructor", () => {
    it("should create target with correct type", () => {
      const target = createTarget();
      expect(target.type).toBe(DeploymentTargetType.ECS_EC2);
    });

    it("should accept AwsEc2TargetOptions with injected managers and services", () => {
      const target = createTarget();
      expect(target).toBeInstanceOf(AwsEc2Target);
    });

    it("should use default instance type when not specified", () => {
      const target = createTarget();
      const targetAny = target as unknown as { instanceType: string };
      expect(targetAny.instanceType).toBe("t3.small");
    });

    it("should use custom instance type when specified", () => {
      const target = createTarget({ instanceType: "t3.large" });
      const targetAny = target as unknown as { instanceType: string };
      expect(targetAny.instanceType).toBe("t3.large");
    });

    it("should use default boot disk size when not specified", () => {
      const target = createTarget();
      const targetAny = target as unknown as { bootDiskSizeGb: number };
      expect(targetAny.bootDiskSizeGb).toBe(20);
    });

    it("should use custom boot disk size when specified", () => {
      const target = createTarget({ bootDiskSizeGb: 50 });
      const targetAny = target as unknown as { bootDiskSizeGb: number };
      expect(targetAny.bootDiskSizeGb).toBe(50);
    });

    it("should set profileName from config when provided", () => {
      const target = createTarget({ profileName: "my-bot" });
      const targetAny = target as unknown as { profileName: string | undefined };
      expect(targetAny.profileName).toBe("my-bot");
    });
  });

  // ── Resource Naming ──────────────────────────────────────────────────

  describe("deriveNames", () => {
    it("should derive correct resource names from profileName", () => {
      const target = createTarget();
      const targetAny = target as unknown as {
        deriveNames: (name: string) => {
          launchTemplate: string;
          secretName: string;
          logGroup: string;
        };
      };

      const names = targetAny.deriveNames("test-bot");
      expect(names.launchTemplate).toBe("clawster-lt-test-bot");
      expect(names.secretName).toBe("clawster/test-bot/config");
      expect(names.logGroup).toBe("/clawster/test-bot");
    });

    it("should sanitize profile name with special characters", () => {
      const target = createTarget();
      const targetAny = target as unknown as {
        deriveNames: (name: string) => {
          launchTemplate: string;
          secretName: string;
          logGroup: string;
        };
      };

      const names = targetAny.deriveNames("My Bot 123!");
      expect(names.launchTemplate).toBe("clawster-lt-my-bot-123");
      expect(names.secretName).toBe("clawster/my-bot-123/config");
      expect(names.logGroup).toBe("/clawster/my-bot-123");
    });
  });

  // ── install() ────────────────────────────────────────────────────────

  describe("install", () => {
    beforeEach(() => {
      mockNetworkManager.ensureSharedInfra.mockResolvedValue(DEFAULT_SHARED_INFRA);
      mockNetworkManager.updateSecurityGroupRules.mockResolvedValue();
      mockSecretsManager.secretExists.mockResolvedValue(false);
      mockSecretsManager.createSecret.mockResolvedValue("arn:aws:secretsmanager:us-east-1:123456789012:secret:test");
      mockComputeManager.resolveUbuntuAmi.mockResolvedValue("ami-12345678");
      mockComputeManager.ensureLaunchTemplate.mockResolvedValue("lt-abcdef");
      mockCloudWatchLogs.getLogStreams.mockResolvedValue([]);
    });

    it("should return success result on successful install", async () => {
      const target = createTarget();

      const result = await target.install({ profileName: "test-bot", port: 18789 });

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe("clawster-lt-test-bot");
      expect(result.message).toContain("test-bot");
      expect(result.serviceName).toBe("clawster-lt-test-bot");
    });

    it("should not create an ASG", async () => {
      const target = createTarget();

      await target.install({ profileName: "test-bot", port: 18789 });

      // No ASG-related methods should exist on the compute manager
      expect(mockComputeManager.runInstance).not.toHaveBeenCalled();
      expect(mockComputeManager.terminateInstance).not.toHaveBeenCalled();
    });

    it("should call ensureSharedInfra as step 1", async () => {
      const target = createTarget();

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(mockNetworkManager.ensureSharedInfra).toHaveBeenCalledTimes(1);
    });

    it("should update security group rules when allowedCidr is configured", async () => {
      const target = createTarget({ allowedCidr: ["10.0.0.0/8", "192.168.0.0/16"] });

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(mockNetworkManager.updateSecurityGroupRules).toHaveBeenCalledWith(
        "sg-def",
        [
          { port: 22, cidr: "10.0.0.0/8", description: "SSH" },
          { port: 22, cidr: "192.168.0.0/16", description: "SSH" },
        ],
      );
    });

    it("should not update security group rules when no allowedCidr", async () => {
      const target = createTarget();

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(mockNetworkManager.updateSecurityGroupRules).not.toHaveBeenCalled();
    });

    it("should create a new secret when it does not exist", async () => {
      mockSecretsManager.secretExists.mockResolvedValue(false);
      const target = createTarget();

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(mockSecretsManager.secretExists).toHaveBeenCalledWith("clawster/test-bot/config");
      expect(mockSecretsManager.createSecret).toHaveBeenCalledWith(
        "clawster/test-bot/config",
        "{}",
        { "clawster:managed": "true" },
      );
    });

    it("should update existing secret when it already exists", async () => {
      mockSecretsManager.secretExists.mockResolvedValue(true);
      const target = createTarget();

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(mockSecretsManager.updateSecret).toHaveBeenCalledWith("clawster/test-bot/config", "{}");
      expect(mockSecretsManager.createSecret).not.toHaveBeenCalled();
    });

    it("should resolve Ubuntu AMI and create launch template", async () => {
      const target = createTarget();

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(mockComputeManager.resolveUbuntuAmi).toHaveBeenCalledTimes(1);
      expect(mockComputeManager.ensureLaunchTemplate).toHaveBeenCalledWith(
        "clawster-lt-test-bot",
        expect.objectContaining({
          instanceType: "t3.small",
          bootDiskSizeGb: 20,
          amiId: "ami-12345678",
          securityGroupId: "sg-def",
          instanceProfileArn: "arn:aws:iam::123456789012:instance-profile/clawster",
          tags: { "clawster:bot": "test-bot" },
        }),
      );
    });

    it("should attempt to check log group existence", async () => {
      const target = createTarget();

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(mockCloudWatchLogs.getLogStreams).toHaveBeenCalledWith("/clawster/test-bot");
    });

    it("should succeed even when log group check fails", async () => {
      mockCloudWatchLogs.getLogStreams.mockRejectedValue(new Error("ResourceNotFoundException"));
      const target = createTarget();

      const result = await target.install({ profileName: "test-bot", port: 18789 });

      expect(result.success).toBe(true);
    });

    it("should return failure result when ensureSharedInfra fails", async () => {
      mockNetworkManager.ensureSharedInfra.mockRejectedValue(new Error("VPC limit exceeded"));
      const target = createTarget();

      const result = await target.install({ profileName: "test-bot", port: 18789 });

      expect(result.success).toBe(false);
      expect(result.message).toContain("VPC limit exceeded");
    });

    it("should return failure result when secret creation fails", async () => {
      mockSecretsManager.secretExists.mockRejectedValue(new Error("Access denied"));
      const target = createTarget();

      const result = await target.install({ profileName: "test-bot", port: 18789 });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Access denied");
    });

    it("should return failure result when AMI resolution fails", async () => {
      mockComputeManager.resolveUbuntuAmi.mockRejectedValue(new Error("No AMI found"));
      const target = createTarget();

      const result = await target.install({ profileName: "test-bot", port: 18789 });

      expect(result.success).toBe(false);
      expect(result.message).toContain("No AMI found");
    });

    it("should set profileName on the target", async () => {
      const target = createTarget({ profileName: undefined });

      await target.install({ profileName: "new-bot", port: 18789 });

      const targetAny = target as unknown as { profileName: string };
      expect(targetAny.profileName).toBe("new-bot");
    });

    it("should use custom instance type in launch template config", async () => {
      const target = createTarget({ instanceType: "t3.medium" });

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(mockComputeManager.ensureLaunchTemplate).toHaveBeenCalledWith(
        "clawster-lt-test-bot",
        expect.objectContaining({ instanceType: "t3.medium" }),
      );
    });

    it("should use custom boot disk size in launch template config", async () => {
      const target = createTarget({ bootDiskSizeGb: 40 });

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(mockComputeManager.ensureLaunchTemplate).toHaveBeenCalledWith(
        "clawster-lt-test-bot",
        expect.objectContaining({ bootDiskSizeGb: 40 }),
      );
    });

    it("should include base64-encoded userData in launch template config", async () => {
      const target = createTarget();

      await target.install({ profileName: "test-bot", port: 18789 });

      const ltCall = mockComputeManager.ensureLaunchTemplate.mock.calls[0];
      const config = ltCall[1];
      expect(config.userData).toBeTruthy();
      // userData should be base64 encoded
      const decoded = Buffer.from(config.userData, "base64").toString("utf8");
      expect(decoded).toBeTruthy();
      expect(decoded.length).toBeGreaterThan(0);
    });
  });

  // ── configure() ──────────────────────────────────────────────────────

  describe("configure", () => {
    beforeEach(() => {
      mockSecretsManager.secretExists.mockResolvedValue(true);
      mockSecretsManager.updateSecret.mockResolvedValue();
    });

    it("should return success with requiresRestart true", async () => {
      const target = createTarget();

      const result = await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {},
      });

      expect(result.success).toBe(true);
      expect(result.requiresRestart).toBe(true);
      expect(result.message).toContain("restart");
    });

    it("should store config as JSON in Secrets Manager", async () => {
      const target = createTarget();

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: { gateway: { mode: "server", auth: { token: "secret" } } },
      });

      expect(mockSecretsManager.updateSecret).toHaveBeenCalledWith(
        "clawster/test-bot/config",
        expect.any(String),
      );

      const storedJson = mockSecretsManager.updateSecret.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);
      expect(parsed.gateway.auth).toEqual({ token: "secret" });
    });

    it("should set gateway.bind to 'lan'", async () => {
      const target = createTarget();

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: { gateway: { mode: "server" } },
      });

      const storedJson = mockSecretsManager.updateSecret.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);
      expect(parsed.gateway.bind).toBe("lan");
    });

    it("should set gateway.trustedProxies to Docker bridge CIDR", async () => {
      const target = createTarget();

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: { gateway: { mode: "server" } },
      });

      const storedJson = mockSecretsManager.updateSecret.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);
      expect(parsed.gateway.trustedProxies).toEqual(["172.17.0.0/16"]);
    });

    it("should delete gateway.host but keep gateway.port", async () => {
      const target = createTarget();

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          gateway: {
            host: "localhost",
            port: 12345,
            mode: "server",
            auth: { token: "abc" },
          },
        },
      });

      const storedJson = mockSecretsManager.updateSecret.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);
      expect(parsed.gateway.host).toBeUndefined();
      expect(parsed.gateway.port).toBe(12345);
      expect(parsed.gateway.mode).toBe("server");
      expect(parsed.gateway.auth).toEqual({ token: "abc" });
    });

    it("should transform root-level sandbox to agents.defaults.sandbox", async () => {
      const target = createTarget();

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          sandbox: { mode: "off" },
        },
      });

      const storedJson = mockSecretsManager.updateSecret.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);
      expect(parsed.sandbox).toBeUndefined();
      expect(parsed.agents.defaults.sandbox).toEqual({ mode: "off" });
    });

    it("should remove channels.*.enabled flags", async () => {
      const target = createTarget();

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          channels: {
            telegram: { enabled: true, botToken: "token123" },
            slack: { enabled: false, signingSecret: "secret" },
          },
        },
      });

      const storedJson = mockSecretsManager.updateSecret.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);
      expect(parsed.channels.telegram.enabled).toBeUndefined();
      expect(parsed.channels.telegram.botToken).toBe("token123");
      expect(parsed.channels.slack.enabled).toBeUndefined();
      expect(parsed.channels.slack.signingSecret).toBe("secret");
    });

    it("should remove skills.allowUnverified", async () => {
      const target = createTarget();

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          skills: { allowUnverified: true, allowBundled: ["github"] },
        },
      });

      const storedJson = mockSecretsManager.updateSecret.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);
      expect(parsed.skills.allowUnverified).toBeUndefined();
      expect(parsed.skills.allowBundled).toEqual(["github"]);
    });

    it("should handle config without gateway section", async () => {
      const target = createTarget();

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: { agents: { defaults: { model: "gpt-4" } } },
      });

      const storedJson = mockSecretsManager.updateSecret.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);
      // No gateway section — should not crash
      expect(parsed.agents.defaults.model).toBe("gpt-4");
    });

    it("should handle empty config with gateway defaults", async () => {
      const target = createTarget();

      const result = await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {},
      });

      expect(result.success).toBe(true);
      const storedJson = mockSecretsManager.updateSecret.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);
      expect(parsed.gateway.bind).toBe("lan");
      expect(parsed.gateway.mode).toBe("local");
      expect(parsed.gateway.trustedProxies).toEqual(["172.17.0.0/16"]);
    });

    it("should handle undefined config", async () => {
      const target = createTarget();

      const result = await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
      });

      expect(result.success).toBe(true);
    });

    it("should create secret if it does not exist", async () => {
      mockSecretsManager.secretExists.mockResolvedValue(false);
      mockSecretsManager.createSecret.mockResolvedValue("arn:secret");
      const target = createTarget();

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {},
      });

      expect(mockSecretsManager.createSecret).toHaveBeenCalledWith(
        "clawster/test-bot/config",
        expect.any(String),
        { "clawster:managed": "true" },
      );
    });

    it("should set profileName on the target", async () => {
      const target = createTarget({ profileName: undefined });

      await target.configure({
        profileName: "configured-bot",
        gatewayPort: 18789,
        config: {},
      });

      const targetAny = target as unknown as { profileName: string };
      expect(targetAny.profileName).toBe("configured-bot");
    });

    it("should apply all transformations together", async () => {
      const target = createTarget();

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          gateway: {
            host: "0.0.0.0",
            port: 9999,
            mode: "server",
            auth: { token: "my-token" },
          },
          sandbox: { mode: "docker" },
          channels: {
            telegram: { enabled: true, botToken: "tok" },
          },
          skills: { allowUnverified: true, allowBundled: ["github"] },
        },
      });

      const storedJson = mockSecretsManager.updateSecret.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);

      // Gateway: bind=lan, trustedProxies set, host deleted, port preserved
      expect(parsed.gateway.bind).toBe("lan");
      expect(parsed.gateway.trustedProxies).toEqual(["172.17.0.0/16"]);
      expect(parsed.gateway.host).toBeUndefined();
      expect(parsed.gateway.mode).toBe("server");
      expect(parsed.gateway.auth).toEqual({ token: "my-token" });

      // Sandbox relocated
      expect(parsed.sandbox).toBeUndefined();
      expect(parsed.agents.defaults.sandbox).toEqual({ mode: "docker" });

      // Channel enabled removed
      expect(parsed.channels.telegram.enabled).toBeUndefined();
      expect(parsed.channels.telegram.botToken).toBe("tok");

      // Skills deprecated field removed
      expect(parsed.skills.allowUnverified).toBeUndefined();
      expect(parsed.skills.allowBundled).toEqual(["github"]);
    });
  });

  // ── start() ──────────────────────────────────────────────────────────

  describe("start", () => {
    beforeEach(() => {
      mockNetworkManager.getSharedInfra.mockResolvedValue(DEFAULT_SHARED_INFRA);
    });

    it("should find existing instance and skip if already running", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-existing");
      mockComputeManager.getInstanceStatus.mockResolvedValue("running");

      await target.start();

      expect(mockComputeManager.findInstanceByTag).toHaveBeenCalledWith("test-bot");
      expect(mockComputeManager.runInstance).not.toHaveBeenCalled();
    });

    it("should terminate stopped instance and launch new one", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-stopped");
      mockComputeManager.getInstanceStatus
        .mockResolvedValueOnce("stopped")    // check existing
        .mockResolvedValueOnce("running");   // wait for new
      mockComputeManager.terminateInstance.mockResolvedValue();
      mockComputeManager.runInstance.mockResolvedValue("i-new");

      await target.start();

      expect(mockComputeManager.terminateInstance).toHaveBeenCalledWith("i-stopped");
      expect(mockComputeManager.runInstance).toHaveBeenCalledWith(
        "clawster-lt-test-bot",
        "subnet-456",
        "test-bot",
      );
    });

    it("should launch new instance when none found", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);
      mockComputeManager.runInstance.mockResolvedValue("i-new");
      mockComputeManager.getInstanceStatus.mockResolvedValue("running");

      await target.start();

      expect(mockComputeManager.runInstance).toHaveBeenCalledWith(
        "clawster-lt-test-bot",
        "subnet-456",
        "test-bot",
      );
    });

    it("should wait until instance status is running", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);
      mockComputeManager.runInstance.mockResolvedValue("i-new");
      mockComputeManager.getInstanceStatus
        .mockResolvedValueOnce("pending")
        .mockResolvedValueOnce("pending")
        .mockResolvedValueOnce("running");

      const targetAny = target as unknown as { sleep: (ms: number) => Promise<void> };
      targetAny.sleep = jest.fn().mockResolvedValue(undefined);

      await target.start();

      expect(mockComputeManager.getInstanceStatus).toHaveBeenCalledTimes(3);
    });

    it("should clear cached public IP", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);
      mockComputeManager.runInstance.mockResolvedValue("i-new");
      mockComputeManager.getInstanceStatus.mockResolvedValue("running");

      const targetAny = target as unknown as { cachedPublicIp: string | undefined };
      targetAny.cachedPublicIp = "1.2.3.4";

      await target.start();

      expect(targetAny.cachedPublicIp).toBeUndefined();
    });

    it("should throw when profileName is not set", async () => {
      const target = createTarget({ profileName: undefined });

      await expect(target.start()).rejects.toThrow("profileName not set");
    });

    it("should timeout when instance never reaches running state", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);
      mockComputeManager.runInstance.mockResolvedValue("i-new");
      mockComputeManager.getInstanceStatus.mockResolvedValue("pending");

      const targetAny = target as unknown as { sleep: (ms: number) => Promise<void> };
      targetAny.sleep = jest.fn().mockResolvedValue(undefined);

      let callCount = 0;
      const originalDateNow = Date.now;
      jest.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        return originalDateNow() + callCount * 300_000;
      });

      await expect(target.start()).rejects.toThrow("Timeout");

      jest.restoreAllMocks();
    });
  });

  // ── stop() ───────────────────────────────────────────────────────────

  describe("stop", () => {
    it("should find instance by tag and terminate it", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-running");
      mockComputeManager.terminateInstance.mockResolvedValue();

      await target.stop();

      expect(mockComputeManager.findInstanceByTag).toHaveBeenCalledWith("test-bot");
      expect(mockComputeManager.terminateInstance).toHaveBeenCalledWith("i-running");
    });

    it("should handle case when no instance found", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);

      await target.stop();

      expect(mockComputeManager.terminateInstance).not.toHaveBeenCalled();
    });

    it("should clear cached public IP", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);

      const targetAny = target as unknown as { cachedPublicIp: string | undefined };
      targetAny.cachedPublicIp = "1.2.3.4";

      await target.stop();

      expect(targetAny.cachedPublicIp).toBeUndefined();
    });

    it("should throw when profileName is not set", async () => {
      const target = createTarget({ profileName: undefined });

      await expect(target.stop()).rejects.toThrow("profileName not set");
    });
  });

  // ── restart() ────────────────────────────────────────────────────────

  describe("restart", () => {
    beforeEach(() => {
      mockNetworkManager.getSharedInfra.mockResolvedValue(DEFAULT_SHARED_INFRA);
    });

    it("should terminate existing and launch new instance", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-old");
      mockComputeManager.terminateInstance.mockResolvedValue();
      mockComputeManager.runInstance.mockResolvedValue("i-new");
      mockComputeManager.getInstanceStatus.mockResolvedValue("running");

      await target.restart();

      expect(mockComputeManager.terminateInstance).toHaveBeenCalledWith("i-old");
      expect(mockComputeManager.runInstance).toHaveBeenCalledWith(
        "clawster-lt-test-bot",
        "subnet-456",
        "test-bot",
      );
    });

    it("should launch new instance even when no existing instance", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);
      mockComputeManager.runInstance.mockResolvedValue("i-new");
      mockComputeManager.getInstanceStatus.mockResolvedValue("running");

      await target.restart();

      expect(mockComputeManager.terminateInstance).not.toHaveBeenCalled();
      expect(mockComputeManager.runInstance).toHaveBeenCalled();
    });

    it("should wait until new instance is running", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);
      mockComputeManager.runInstance.mockResolvedValue("i-new");
      mockComputeManager.getInstanceStatus
        .mockResolvedValueOnce("pending")
        .mockResolvedValueOnce("running");

      const targetAny = target as unknown as { sleep: (ms: number) => Promise<void> };
      targetAny.sleep = jest.fn().mockResolvedValue(undefined);

      await target.restart();

      expect(mockComputeManager.getInstanceStatus).toHaveBeenCalledTimes(2);
    });

    it("should clear cached public IP", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);
      mockComputeManager.runInstance.mockResolvedValue("i-new");
      mockComputeManager.getInstanceStatus.mockResolvedValue("running");

      const targetAny = target as unknown as { cachedPublicIp: string | undefined };
      targetAny.cachedPublicIp = "5.6.7.8";

      await target.restart();

      expect(targetAny.cachedPublicIp).toBeUndefined();
    });

    it("should throw when profileName is not set", async () => {
      const target = createTarget({ profileName: undefined });

      await expect(target.restart()).rejects.toThrow("profileName not set");
    });
  });

  // ── getStatus() ──────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("should return running state with gatewayPort when instance is running", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-running");
      mockComputeManager.getInstanceStatus.mockResolvedValue("running");

      const status = await target.getStatus();

      expect(status.state).toBe("running");
      expect(status.gatewayPort).toBe(18789);
    });

    it("should return stopped state when no instance found", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);

      const status = await target.getStatus();

      expect(status.state).toBe("stopped");
    });

    it("should return stopped state when instance is terminated", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-term");
      mockComputeManager.getInstanceStatus.mockResolvedValue("terminated");

      const status = await target.getStatus();

      expect(status.state).toBe("stopped");
    });

    it("should return running state for pending instances", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-pending");
      mockComputeManager.getInstanceStatus.mockResolvedValue("pending");

      const status = await target.getStatus();

      expect(status.state).toBe("running");
      expect(status.gatewayPort).toBe(18789);
    });

    it("should return stopped state for stopping instances", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-stopping");
      mockComputeManager.getInstanceStatus.mockResolvedValue("stopping");

      const status = await target.getStatus();

      expect(status.state).toBe("stopped");
    });

    it("should return not-installed when profileName is not set", async () => {
      const target = createTarget({ profileName: undefined });

      const status = await target.getStatus();

      expect(status.state).toBe("not-installed");
    });

    it("should return not-installed when findInstanceByTag throws", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockRejectedValue(new Error("AWS error"));

      const status = await target.getStatus();

      expect(status.state).toBe("not-installed");
    });
  });

  // ── getLogs() ────────────────────────────────────────────────────────

  describe("getLogs", () => {
    it("should return formatted log lines", async () => {
      const target = createTarget();
      const timestamp = new Date("2026-02-08T12:00:00Z");
      mockCloudWatchLogs.getLogs.mockResolvedValue({
        events: [
          { timestamp, message: "Server started" },
          { timestamp, message: "Listening on port 18789" },
        ],
      });

      const logs = await target.getLogs();

      expect(logs).toHaveLength(2);
      expect(logs[0]).toBe("[2026-02-08T12:00:00.000Z] Server started");
      expect(logs[1]).toBe("[2026-02-08T12:00:00.000Z] Listening on port 18789");
    });

    it("should pass default limit of 100 when no options provided", async () => {
      const target = createTarget();
      mockCloudWatchLogs.getLogs.mockResolvedValue({ events: [] });

      await target.getLogs();

      expect(mockCloudWatchLogs.getLogs).toHaveBeenCalledWith(
        "/clawster/test-bot",
        expect.objectContaining({ limit: 100 }),
      );
    });

    it("should pass custom lines option as limit", async () => {
      const target = createTarget();
      mockCloudWatchLogs.getLogs.mockResolvedValue({ events: [] });

      await target.getLogs({ lines: 50 });

      expect(mockCloudWatchLogs.getLogs).toHaveBeenCalledWith(
        "/clawster/test-bot",
        expect.objectContaining({ limit: 50 }),
      );
    });

    it("should pass since option as startTime", async () => {
      const target = createTarget();
      const since = new Date("2026-02-08T10:00:00Z");
      mockCloudWatchLogs.getLogs.mockResolvedValue({ events: [] });

      await target.getLogs({ since });

      expect(mockCloudWatchLogs.getLogs).toHaveBeenCalledWith(
        "/clawster/test-bot",
        expect.objectContaining({ startTime: since }),
      );
    });

    it("should return empty array when getLogs throws", async () => {
      const target = createTarget();
      mockCloudWatchLogs.getLogs.mockRejectedValue(new Error("Log group not found"));

      const logs = await target.getLogs();

      expect(logs).toEqual([]);
    });

    it("should throw when profileName is not set", async () => {
      const target = createTarget({ profileName: undefined });

      await expect(target.getLogs()).rejects.toThrow("profileName not set");
    });
  });

  // ── getEndpoint() ────────────────────────────────────────────────────

  describe("getEndpoint", () => {
    it("should return wss endpoint with custom domain on port 443", async () => {
      const target = createTarget({ customDomain: "bot.example.com" });

      const endpoint = await target.getEndpoint();

      expect(endpoint.host).toBe("bot.example.com");
      expect(endpoint.port).toBe(443);
      expect(endpoint.protocol).toBe("wss");
    });

    it("should return ws endpoint with public IP on port 80 when no custom domain", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-running");
      mockComputeManager.getInstancePublicIp.mockResolvedValue("54.123.45.67");

      const endpoint = await target.getEndpoint();

      expect(endpoint.host).toBe("54.123.45.67");
      expect(endpoint.port).toBe(80);
      expect(endpoint.protocol).toBe("ws");
    });

    it("should cache the public IP after first lookup", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-running");
      mockComputeManager.getInstancePublicIp.mockResolvedValue("54.123.45.67");

      await target.getEndpoint();
      await target.getEndpoint();

      expect(mockComputeManager.findInstanceByTag).toHaveBeenCalledTimes(1);
    });

    it("should throw when no public IP is available", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-running");
      mockComputeManager.getInstancePublicIp.mockResolvedValue(null);

      await expect(target.getEndpoint()).rejects.toThrow("No public IP available");
    });

    it("should throw when no instance found", async () => {
      const target = createTarget();
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);

      await expect(target.getEndpoint()).rejects.toThrow("No public IP available");
    });

    it("should throw when profileName is not set and no custom domain", async () => {
      const target = createTarget({ profileName: undefined });

      await expect(target.getEndpoint()).rejects.toThrow();
    });

    it("should skip public IP lookup for custom domain endpoint", async () => {
      const target = createTarget({ customDomain: "bot.example.com" });

      await target.getEndpoint();

      expect(mockComputeManager.findInstanceByTag).not.toHaveBeenCalled();
      expect(mockComputeManager.getInstancePublicIp).not.toHaveBeenCalled();
    });
  });

  // ── destroy() ────────────────────────────────────────────────────────

  describe("destroy", () => {
    beforeEach(() => {
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-existing");
      mockComputeManager.terminateInstance.mockResolvedValue();
      mockComputeManager.deleteLaunchTemplate.mockResolvedValue();
      mockSecretsManager.deleteSecret.mockResolvedValue();
      mockCloudWatchLogs.deleteLogGroup.mockResolvedValue();
    });

    it("should delete all resources in order", async () => {
      const target = createTarget();
      const callOrder: string[] = [];

      mockComputeManager.findInstanceByTag.mockImplementation(async () => {
        callOrder.push("findInstanceByTag");
        return "i-existing";
      });
      mockComputeManager.terminateInstance.mockImplementation(async () => {
        callOrder.push("terminateInstance");
      });
      mockComputeManager.deleteLaunchTemplate.mockImplementation(async () => {
        callOrder.push("deleteLaunchTemplate");
      });
      mockSecretsManager.deleteSecret.mockImplementation(async () => {
        callOrder.push("deleteSecret");
      });
      mockCloudWatchLogs.deleteLogGroup.mockImplementation(async () => {
        callOrder.push("deleteLogGroup");
      });

      await target.destroy();

      expect(callOrder).toEqual([
        "findInstanceByTag",
        "terminateInstance",
        "deleteLaunchTemplate",
        "deleteSecret",
        "deleteLogGroup",
      ]);
    });

    it("should terminate instance found by tag", async () => {
      const target = createTarget();

      await target.destroy();

      expect(mockComputeManager.findInstanceByTag).toHaveBeenCalledWith("test-bot");
      expect(mockComputeManager.terminateInstance).toHaveBeenCalledWith("i-existing");
    });

    it("should skip terminate when no instance found", async () => {
      mockComputeManager.findInstanceByTag.mockResolvedValue(null);
      const target = createTarget();

      await target.destroy();

      expect(mockComputeManager.terminateInstance).not.toHaveBeenCalled();
    });

    it("should delete launch template with correct name", async () => {
      const target = createTarget();

      await target.destroy();

      expect(mockComputeManager.deleteLaunchTemplate).toHaveBeenCalledWith("clawster-lt-test-bot");
    });

    it("should delete secret with force delete", async () => {
      const target = createTarget();

      await target.destroy();

      expect(mockSecretsManager.deleteSecret).toHaveBeenCalledWith(
        "clawster/test-bot/config",
        true,
      );
    });

    it("should delete log group", async () => {
      const target = createTarget();

      await target.destroy();

      expect(mockCloudWatchLogs.deleteLogGroup).toHaveBeenCalledWith("/clawster/test-bot");
    });

    it("should continue if secret deletion fails", async () => {
      const target = createTarget();
      mockSecretsManager.deleteSecret.mockRejectedValue(new Error("Secret not found"));

      await expect(target.destroy()).resolves.not.toThrow();

      expect(mockCloudWatchLogs.deleteLogGroup).toHaveBeenCalled();
    });

    it("should continue if log group deletion fails", async () => {
      const target = createTarget();
      mockCloudWatchLogs.deleteLogGroup.mockRejectedValue(new Error("Log group not found"));

      await expect(target.destroy()).resolves.not.toThrow();
    });

    it("should clear cached public IP", async () => {
      const target = createTarget();
      const targetAny = target as unknown as { cachedPublicIp: string | undefined };
      targetAny.cachedPublicIp = "1.2.3.4";

      await target.destroy();

      expect(targetAny.cachedPublicIp).toBeUndefined();
    });

    it("should throw when profileName is not set", async () => {
      const target = createTarget({ profileName: undefined });

      await expect(target.destroy()).rejects.toThrow("profileName not set");
    });
  });

  // ── getMetadata() ────────────────────────────────────────────────────

  describe("getMetadata", () => {
    it("should return correct type", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.type).toBe(DeploymentTargetType.ECS_EC2);
    });

    it("should return correct display name and icon", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.displayName).toBe("AWS EC2");
      expect(metadata.icon).toBe("aws");
    });

    it("should have ready status", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.status).toBe("ready");
    });

    it("should have provisioning steps without ASG", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.provisioningSteps.length).toBeGreaterThan(0);
      const stepIds = metadata.provisioningSteps.map((s) => s.id);
      expect(stepIds).toContain("create_vpc");
      expect(stepIds).toContain("create_sg");
      expect(stepIds).toContain("create_secret");
      expect(stepIds).toContain("resolve_ami");
      expect(stepIds).toContain("create_lt");
      expect(stepIds).toContain("launch_instance");
      expect(stepIds).toContain("health_check");
      expect(stepIds).not.toContain("create_asg");
    });

    it("should have resource update steps with terminate/launch", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.resourceUpdateSteps.length).toBeGreaterThan(0);
      const stepIds = metadata.resourceUpdateSteps.map((s) => s.id);
      expect(stepIds).toContain("validate_resources");
      expect(stepIds).toContain("terminate_instance");
      expect(stepIds).toContain("create_lt");
      expect(stepIds).toContain("launch_instance");
      expect(stepIds).not.toContain("scale_down");
      expect(stepIds).not.toContain("scale_up");
    });

    it("should have correct operation step mappings", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.operationSteps.install).toBe("create_lt");
      expect(metadata.operationSteps.start).toBe("health_check");
    });

    it("should declare correct capabilities", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.capabilities).toEqual({
        scaling: false,
        sandbox: true,
        persistentStorage: false,
        httpsEndpoint: true,
        logStreaming: true,
      });
    });

    it("should require region, accessKeyId, and secretAccessKey credentials", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      const requiredKeys = metadata.credentials
        .filter((c) => c.required)
        .map((c) => c.key);
      expect(requiredKeys).toContain("region");
      expect(requiredKeys).toContain("accessKeyId");
      expect(requiredKeys).toContain("secretAccessKey");
    });

    it("should mark secret credentials as sensitive", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      const accessKey = metadata.credentials.find((c) => c.key === "accessKeyId");
      const secretKey = metadata.credentials.find((c) => c.key === "secretAccessKey");
      expect(accessKey?.sensitive).toBe(true);
      expect(secretKey?.sensitive).toBe(true);
    });

    it("should mark region as non-sensitive", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      const region = metadata.credentials.find((c) => c.key === "region");
      expect(region?.sensitive).toBe(false);
    });

    it("should have tier specs for light, standard, and performance", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.tierSpecs).toBeDefined();
      expect(metadata.tierSpecs!.light).toBeDefined();
      expect(metadata.tierSpecs!.standard).toBeDefined();
      expect(metadata.tierSpecs!.performance).toBeDefined();
    });

    it("should have correct tier machine types", () => {
      const target = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.tierSpecs!.light.machineType).toBe("t3.small");
      expect(metadata.tierSpecs!.standard.machineType).toBe("t3.medium");
      expect(metadata.tierSpecs!.performance.machineType).toBe("t3.large");
    });
  });

  // ── Log callback ─────────────────────────────────────────────────────

  describe("log callback", () => {
    it("should emit log messages to registered callback during install", async () => {
      mockNetworkManager.ensureSharedInfra.mockResolvedValue(DEFAULT_SHARED_INFRA);
      mockSecretsManager.secretExists.mockResolvedValue(false);
      mockSecretsManager.createSecret.mockResolvedValue("arn:secret");
      mockComputeManager.resolveUbuntuAmi.mockResolvedValue("ami-12345678");
      mockComputeManager.ensureLaunchTemplate.mockResolvedValue("lt-abcdef");
      mockCloudWatchLogs.getLogStreams.mockResolvedValue([]);

      const logMessages: string[] = [];
      const target = createTarget();
      target.setLogCallback((msg) => logMessages.push(msg));

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(logMessages.some((m) => m.includes("[1/4]"))).toBe(true);
      expect(logMessages.some((m) => m.includes("[2/4]"))).toBe(true);
      expect(logMessages.some((m) => m.includes("[3/4]"))).toBe(true);
      expect(logMessages.some((m) => m.includes("[4/4]"))).toBe(true);
      expect(logMessages.some((m) => m.includes("Installation complete"))).toBe(true);
    });

    it("should emit log messages during destroy", async () => {
      mockComputeManager.findInstanceByTag.mockResolvedValue("i-existing");
      mockComputeManager.terminateInstance.mockResolvedValue();
      mockComputeManager.deleteLaunchTemplate.mockResolvedValue();
      mockSecretsManager.deleteSecret.mockResolvedValue();
      mockCloudWatchLogs.deleteLogGroup.mockResolvedValue();

      const logMessages: string[] = [];
      const target = createTarget();
      target.setLogCallback((msg) => logMessages.push(msg));

      await target.destroy();

      expect(logMessages.some((m) => m.includes("[1/4]"))).toBe(true);
      expect(logMessages.some((m) => m.includes("[2/4]"))).toBe(true);
      expect(logMessages.some((m) => m.includes("[3/4]"))).toBe(true);
      expect(logMessages.some((m) => m.includes("[4/4]"))).toBe(true);
      expect(logMessages.some((m) => m.includes("Destroy complete"))).toBe(true);
    });
  });

});
