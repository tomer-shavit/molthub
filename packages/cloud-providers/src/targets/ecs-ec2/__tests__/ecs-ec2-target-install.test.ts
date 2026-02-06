/**
 * Tests for EcsEc2Target.install() stack state handling.
 *
 * Verifies that install() correctly handles per-bot stacks in transitional
 * states (DELETE_IN_PROGRESS, ROLLBACK_COMPLETE, FAILED) by waiting/cleaning
 * up before creating a fresh stack.
 */

import { EcsEc2Target } from "../ecs-ec2-target";
import type { EcsEc2Config } from "../ecs-ec2-config";
import type {
  EcsEc2Services,
  ICloudFormationService,
  IECSService,
  ISecretsManagerService,
  ICloudWatchLogsService,
  IAutoScalingService,
  StackInfo,
} from "../ecs-ec2-services.interface";
import type { InstallOptions } from "../../../interface/deployment-target";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHARED_STACK = "clawster-shared-us-east-1";
const BOT_STACK = "clawster-bot-test-bot";

const SHARED_STACK_INFO: StackInfo = {
  stackId: "shared-id",
  stackName: SHARED_STACK,
  status: "CREATE_COMPLETE",
  creationTime: new Date(),
  outputs: [],
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Create a CF service mock where the shared infra stack is always healthy,
 * and per-bot stack behavior is configured via perBotStatus/perBotExists.
 */
function createSmartCfMock(opts: {
  perBotExists: boolean;
  perBotStatus?: string;
  updateStackFn?: jest.Mock;
}): ICloudFormationService {
  const { perBotExists, perBotStatus, updateStackFn } = opts;

  return {
    createStack: jest.fn().mockResolvedValue("stack-id"),
    updateStack: updateStackFn ?? jest.fn().mockResolvedValue("stack-id"),
    deleteStack: jest.fn().mockResolvedValue(undefined),
    describeStack: jest.fn().mockImplementation((stackName: string) => {
      if (stackName === SHARED_STACK) return Promise.resolve(SHARED_STACK_INFO);
      if (stackName === BOT_STACK && perBotStatus) {
        return Promise.resolve({
          stackId: "bot-id",
          stackName: BOT_STACK,
          status: perBotStatus,
          creationTime: new Date(),
          outputs: [],
        });
      }
      return Promise.resolve(undefined);
    }),
    waitForStackStatus: jest.fn().mockResolvedValue({
      stackId: "id",
      stackName: "test",
      status: "CREATE_COMPLETE",
      creationTime: new Date(),
      outputs: [],
    }),
    getStackOutputs: jest.fn().mockResolvedValue({
      VpcId: "vpc-123",
      PublicSubnet1Id: "sub-1",
      PublicSubnet2Id: "sub-2",
      PrivateSubnet1Id: "sub-3",
      PrivateSubnet2Id: "sub-4",
      PrivateRouteTableId: "rt-1",
      VpcEndpointSecurityGroupId: "sg-1",
      Ec2InstanceProfileArn: "arn:aws:iam::123:instance-profile/ip",
      TaskExecutionRoleArn: "arn:aws:iam::123:role/exec",
    }),
    stackExists: jest.fn().mockImplementation((stackName: string) => {
      if (stackName === SHARED_STACK) return Promise.resolve(true);
      if (stackName === BOT_STACK) return Promise.resolve(perBotExists);
      return Promise.resolve(false);
    }),
  };
}

function createMockEcsService(): IECSService {
  return {
    updateService: jest.fn().mockResolvedValue(undefined),
    describeService: jest.fn().mockResolvedValue({
      status: "ACTIVE",
      runningCount: 0,
      desiredCount: 0,
      deployments: [{ status: "PRIMARY", runningCount: 0, desiredCount: 0 }],
      events: [],
    }),
    listContainerInstances: jest.fn().mockResolvedValue([]),
    deregisterContainerInstance: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockSecretsService(): ISecretsManagerService {
  return {
    createSecret: jest.fn().mockResolvedValue("secret-arn"),
    updateSecret: jest.fn().mockResolvedValue(undefined),
    deleteSecret: jest.fn().mockResolvedValue(undefined),
    secretExists: jest.fn().mockResolvedValue(false),
  };
}

function createMockLogsService(): ICloudWatchLogsService {
  return {
    getLogStreams: jest.fn().mockResolvedValue([]),
    getLogs: jest.fn().mockResolvedValue({ events: [] }),
    deleteLogGroup: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockAutoScalingService(): IAutoScalingService {
  return {
    removeScaleInProtection: jest.fn().mockResolvedValue(undefined),
  };
}

function createTarget(cfOpts: {
  perBotExists: boolean;
  perBotStatus?: string;
  updateStackFn?: jest.Mock;
}): {
  target: EcsEc2Target;
  services: EcsEc2Services;
} {
  const services: EcsEc2Services = {
    cloudFormation: createSmartCfMock(cfOpts),
    ecs: createMockEcsService(),
    secretsManager: createMockSecretsService(),
    cloudWatchLogs: createMockLogsService(),
    autoScaling: createMockAutoScalingService(),
  };

  const config: EcsEc2Config = {
    accessKeyId: "AKIATEST",
    secretAccessKey: "test-secret",
    region: "us-east-1",
    useSharedInfra: true,
  };

  const target = new EcsEc2Target({ config, services });
  return { target, services };
}

const defaultInstallOpts: InstallOptions = {
  profileName: "test-bot",
  port: 18789,
  gatewayAuthToken: "tok",
  containerEnv: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EcsEc2Target.install() — stack state handling", () => {
  it("creates a new stack when none exists", async () => {
    const { target, services } = createTarget({ perBotExists: false });

    const result = await target.install(defaultInstallOpts);

    expect(result.success).toBe(true);
    expect(services.cloudFormation.createStack).toHaveBeenCalledWith(
      BOT_STACK,
      expect.any(String),
      expect.objectContaining({ capabilities: ["CAPABILITY_NAMED_IAM"] }),
    );
    expect(services.cloudFormation.updateStack).not.toHaveBeenCalled();
  });

  it("updates an existing stack in a healthy state", async () => {
    const { target, services } = createTarget({
      perBotExists: true,
      perBotStatus: "CREATE_COMPLETE",
    });

    const result = await target.install(defaultInstallOpts);

    expect(result.success).toBe(true);
    expect(services.cloudFormation.updateStack).toHaveBeenCalled();
    // createStack is called for the shared infra but NOT for the per-bot stack
    const createCalls = (services.cloudFormation.createStack as jest.Mock).mock.calls;
    const botCreateCalls = createCalls.filter(
      (args: unknown[]) => args[0] === BOT_STACK,
    );
    expect(botCreateCalls).toHaveLength(0);
  });

  it("waits for DELETE_IN_PROGRESS then creates fresh", async () => {
    const { target, services } = createTarget({
      perBotExists: true,
      perBotStatus: "DELETE_IN_PROGRESS",
    });

    const result = await target.install(defaultInstallOpts);

    expect(result.success).toBe(true);
    // Should wait for delete to finish
    expect(services.cloudFormation.waitForStackStatus).toHaveBeenCalledWith(
      BOT_STACK,
      "DELETE_COMPLETE",
      expect.anything(),
    );
    // Should create new per-bot stack
    const createCalls = (services.cloudFormation.createStack as jest.Mock).mock.calls;
    const botCreateCalls = createCalls.filter(
      (args: unknown[]) => args[0] === BOT_STACK,
    );
    expect(botCreateCalls).toHaveLength(1);
    expect(services.cloudFormation.updateStack).not.toHaveBeenCalled();
  });

  it("deletes ROLLBACK_COMPLETE stack then creates fresh", async () => {
    const { target, services } = createTarget({
      perBotExists: true,
      perBotStatus: "ROLLBACK_COMPLETE",
    });

    const result = await target.install(defaultInstallOpts);

    expect(result.success).toBe(true);
    expect(services.cloudFormation.deleteStack).toHaveBeenCalledWith(BOT_STACK);
    expect(services.cloudFormation.waitForStackStatus).toHaveBeenCalledWith(
      BOT_STACK,
      "DELETE_COMPLETE",
      expect.anything(),
    );
    const createCalls = (services.cloudFormation.createStack as jest.Mock).mock.calls;
    const botCreateCalls = createCalls.filter(
      (args: unknown[]) => args[0] === BOT_STACK,
    );
    expect(botCreateCalls).toHaveLength(1);
    expect(services.cloudFormation.updateStack).not.toHaveBeenCalled();
  });

  it("deletes CREATE_FAILED stack then creates fresh", async () => {
    const { target, services } = createTarget({
      perBotExists: true,
      perBotStatus: "CREATE_FAILED",
    });

    const result = await target.install(defaultInstallOpts);

    expect(result.success).toBe(true);
    expect(services.cloudFormation.deleteStack).toHaveBeenCalledWith(BOT_STACK);
    const createCalls = (services.cloudFormation.createStack as jest.Mock).mock.calls;
    const botCreateCalls = createCalls.filter(
      (args: unknown[]) => args[0] === BOT_STACK,
    );
    expect(botCreateCalls).toHaveLength(1);
    expect(services.cloudFormation.updateStack).not.toHaveBeenCalled();
  });

  it("force-deletes DELETE_FAILED stack by cleaning up stuck resources", async () => {
    const cfMock = createSmartCfMock({
      perBotExists: true,
      perBotStatus: "DELETE_FAILED",
    });

    // After force-delete, describeStack returns undefined (stack gone)
    let deleteCallCount = 0;
    (cfMock.deleteStack as jest.Mock).mockImplementation(() => {
      deleteCallCount++;
      return Promise.resolve(undefined);
    });

    // After first deleteStack call + waitForStackStatus, stack is gone
    (cfMock.waitForStackStatus as jest.Mock).mockResolvedValue({
      stackId: "id",
      stackName: BOT_STACK,
      status: "DELETE_COMPLETE",
      creationTime: new Date(),
      outputs: [],
    });

    const ecsMock = createMockEcsService();
    (ecsMock.listContainerInstances as jest.Mock).mockResolvedValue([
      "arn:aws:ecs:us-east-1:123:container-instance/clawster-test-bot/abc123",
    ]);

    const autoScalingMock = createMockAutoScalingService();
    const services: EcsEc2Services = {
      cloudFormation: cfMock,
      ecs: ecsMock,
      secretsManager: createMockSecretsService(),
      cloudWatchLogs: createMockLogsService(),
      autoScaling: autoScalingMock,
    };

    const config: EcsEc2Config = {
      accessKeyId: "AKIATEST",
      secretAccessKey: "test-secret",
      region: "us-east-1",
      useSharedInfra: true,
    };

    const target = new EcsEc2Target({ config, services });
    const result = await target.install(defaultInstallOpts);

    expect(result.success).toBe(true);
    // Should have deregistered container instances
    expect(ecsMock.deregisterContainerInstance).toHaveBeenCalledWith(
      "clawster-test-bot",
      "arn:aws:ecs:us-east-1:123:container-instance/clawster-test-bot/abc123",
      true,
    );
    // Should have removed scale-in protection via autoScaling service
    expect(autoScalingMock.removeScaleInProtection).toHaveBeenCalledWith("clawster-test-bot-asg");
    // Should have called deleteStack (from forceDeleteStack)
    expect(deleteCallCount).toBeGreaterThanOrEqual(1);
    // Should create a fresh stack after cleanup
    const createCalls = (cfMock.createStack as jest.Mock).mock.calls;
    const botCreateCalls = createCalls.filter(
      (args: unknown[]) => args[0] === BOT_STACK,
    );
    expect(botCreateCalls).toHaveLength(1);
  });

  it("uses RetainResources when cleanup does not fully resolve DELETE_FAILED", async () => {
    const cfMock = createSmartCfMock({
      perBotExists: true,
      perBotStatus: "DELETE_FAILED",
    });

    let deleteCallCount = 0;
    (cfMock.deleteStack as jest.Mock).mockImplementation(() => {
      deleteCallCount++;
      return Promise.resolve(undefined);
    });

    // First waitForStackStatus after cleanup+delete: still fails
    // Second waitForStackStatus after retainResources delete: succeeds
    // Third waitForStackStatus: for the fresh create
    (cfMock.waitForStackStatus as jest.Mock)
      .mockRejectedValueOnce(new Error("Stack timed out"))
      .mockResolvedValueOnce({
        stackId: "id",
        stackName: BOT_STACK,
        status: "DELETE_COMPLETE",
        creationTime: new Date(),
        outputs: [],
      })
      .mockResolvedValue({
        stackId: "id",
        stackName: BOT_STACK,
        status: "CREATE_COMPLETE",
        creationTime: new Date(),
        outputs: [],
      });

    // After first delete retry fails, describeStack returns DELETE_FAILED with reason
    let describeCallCount = 0;
    (cfMock.describeStack as jest.Mock).mockImplementation((stackName: string) => {
      if (stackName === SHARED_STACK) return Promise.resolve(SHARED_STACK_INFO);
      describeCallCount++;
      // First call: initial status check → DELETE_FAILED
      // Second call (inside forceDeleteStack retry): still DELETE_FAILED with reason
      if (describeCallCount <= 2) {
        return Promise.resolve({
          stackId: "bot-id",
          stackName: BOT_STACK,
          status: "DELETE_FAILED",
          statusReason: "The following resource(s) failed to delete: [VpcGatewayAttachment, EcsCluster]. ",
          creationTime: new Date(),
          outputs: [],
        });
      }
      return Promise.resolve(undefined);
    });

    const services: EcsEc2Services = {
      cloudFormation: cfMock,
      ecs: createMockEcsService(),
      secretsManager: createMockSecretsService(),
      cloudWatchLogs: createMockLogsService(),
      autoScaling: createMockAutoScalingService(),
    };

    const config: EcsEc2Config = {
      accessKeyId: "AKIATEST",
      secretAccessKey: "test-secret",
      region: "us-east-1",
      useSharedInfra: true,
    };

    const target = new EcsEc2Target({ config, services });
    const result = await target.install(defaultInstallOpts);

    expect(result.success).toBe(true);
    // Should have called deleteStack with retainResources on the second attempt
    expect(cfMock.deleteStack).toHaveBeenCalledWith(
      BOT_STACK,
      { retainResources: ["VpcGatewayAttachment", "EcsCluster"] },
    );
  });

  it("handles 'No updates' gracefully on update", async () => {
    const { target, services } = createTarget({
      perBotExists: true,
      perBotStatus: "UPDATE_COMPLETE",
      updateStackFn: jest.fn().mockRejectedValue(
        new Error("No updates are to be performed"),
      ),
    });

    const result = await target.install(defaultInstallOpts);

    expect(result.success).toBe(true);
    expect(services.cloudFormation.updateStack).toHaveBeenCalled();
  });
});
