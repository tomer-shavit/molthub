/**
 * Tests for EcsEc2Target.destroy() — resource cleanup and deletion recovery.
 *
 * Verifies that destroy() correctly handles:
 * - Pre-cleanup of stuck resources before deletion
 * - DELETE_FAILED recovery via forceDeleteStack
 * - Already-deleted stacks (idempotent)
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOT_STACK = "clawster-bot-test-bot";
const CLUSTER_NAME = "clawster-test-bot";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockCfService(overrides?: Partial<ICloudFormationService>): ICloudFormationService {
  return {
    createStack: jest.fn().mockResolvedValue("stack-id"),
    updateStack: jest.fn().mockResolvedValue("stack-id"),
    deleteStack: jest.fn().mockResolvedValue(undefined),
    describeStack: jest.fn().mockResolvedValue(undefined),
    waitForStackStatus: jest.fn().mockResolvedValue({
      stackId: "id",
      stackName: BOT_STACK,
      status: "DELETE_COMPLETE",
      creationTime: new Date(),
      outputs: [],
    }),
    getStackOutputs: jest.fn().mockResolvedValue({}),
    stackExists: jest.fn().mockResolvedValue(false),
    listStacks: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createMockEcsService(): IECSService {
  return {
    updateService: jest.fn().mockResolvedValue(undefined),
    describeService: jest.fn().mockResolvedValue(undefined),
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
    describeSecret: jest.fn().mockResolvedValue({ arn: "arn:aws:secretsmanager:us-east-1:123:secret:test-AbCdEf" }),
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

function createTarget(overrides?: {
  cf?: Partial<ICloudFormationService>;
  ecs?: IECSService;
  autoScaling?: IAutoScalingService;
  secrets?: Partial<ISecretsManagerService>;
}): {
  target: EcsEc2Target;
  services: EcsEc2Services;
} {
  const services: EcsEc2Services = {
    cloudFormation: createMockCfService(overrides?.cf),
    ecs: overrides?.ecs ?? createMockEcsService(),
    secretsManager: { ...createMockSecretsService(), ...overrides?.secrets },
    cloudWatchLogs: createMockLogsService(),
    autoScaling: overrides?.autoScaling ?? createMockAutoScalingService(),
  };

  const config: EcsEc2Config = {
    accessKeyId: "AKIATEST",
    secretAccessKey: "test-secret",
    region: "us-east-1",
    profileName: "test-bot",
    useSharedInfra: true,
  };

  const target = new EcsEc2Target({ config, services });
  return { target, services };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EcsEc2Target.destroy()", () => {
  it("deletes stack, secret, and log group on clean destroy", async () => {
    const { target, services } = createTarget({
      cf: { stackExists: jest.fn().mockResolvedValue(true) },
      secrets: { secretExists: jest.fn().mockResolvedValue(true) },
    });

    await target.destroy();

    expect(services.cloudFormation.deleteStack).toHaveBeenCalledWith(BOT_STACK, { force: true });
    expect(services.secretsManager.deleteSecret).toHaveBeenCalled();
    expect(services.cloudWatchLogs.deleteLogGroup).toHaveBeenCalled();
  });

  it("pre-cleans container instances before deletion", async () => {
    const ecsMock = createMockEcsService();
    (ecsMock.listContainerInstances as jest.Mock).mockResolvedValue([
      "arn:aws:ecs:us-east-1:123:container-instance/clawster-test-bot/abc123",
    ]);

    const { target } = createTarget({
      cf: { stackExists: jest.fn().mockResolvedValue(true) },
      secrets: { secretExists: jest.fn().mockResolvedValue(true) },
      ecs: ecsMock,
    });

    await target.destroy();

    expect(ecsMock.listContainerInstances).toHaveBeenCalledWith(CLUSTER_NAME);
    expect(ecsMock.deregisterContainerInstance).toHaveBeenCalledWith(
      CLUSTER_NAME,
      "arn:aws:ecs:us-east-1:123:container-instance/clawster-test-bot/abc123",
      true,
    );
  });

  it("calls removeScaleInProtection before deletion", async () => {
    const autoScalingMock = createMockAutoScalingService();
    const { target } = createTarget({
      cf: { stackExists: jest.fn().mockResolvedValue(true) },
      secrets: { secretExists: jest.fn().mockResolvedValue(true) },
      autoScaling: autoScalingMock,
    });

    await target.destroy();

    expect(autoScalingMock.removeScaleInProtection).toHaveBeenCalledWith(
      `${CLUSTER_NAME}-asg`,
    );
  });

  it("handles DELETE_FAILED by retrying with forceDeleteStack", async () => {
    const cfMock = createMockCfService({ stackExists: jest.fn().mockResolvedValue(true) });

    // First deleteStack + waitForStackStatus: fails with DELETE_FAILED
    (cfMock.waitForStackStatus as jest.Mock)
      .mockRejectedValueOnce(new Error("Stack DELETE_FAILED"))
      // Second: force-delete retry succeeds
      .mockResolvedValueOnce({
        stackId: "id",
        stackName: BOT_STACK,
        status: "DELETE_COMPLETE",
        creationTime: new Date(),
        outputs: [],
      });

    // After first failure, describeStack returns DELETE_FAILED
    (cfMock.describeStack as jest.Mock)
      .mockResolvedValueOnce({
        stackId: "bot-id",
        stackName: BOT_STACK,
        status: "DELETE_FAILED",
        creationTime: new Date(),
        outputs: [],
      } satisfies StackInfo);

    const { target, services } = createTarget({
      cf: cfMock,
      secrets: { secretExists: jest.fn().mockResolvedValue(true) },
    });

    await target.destroy();

    // deleteStack should have been called at least twice:
    // once in initial destroy, once in forceDeleteStack retry
    expect((services.cloudFormation.deleteStack as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("handles already-deleted stack gracefully", async () => {
    const cfMock = createMockCfService();
    (cfMock.deleteStack as jest.Mock).mockRejectedValue(new Error("Stack does not exist"));
    (cfMock.waitForStackStatus as jest.Mock).mockRejectedValue(
      new Error("Stack does not exist"),
    );
    (cfMock.describeStack as jest.Mock).mockResolvedValue(undefined);

    const { target } = createTarget({ cf: cfMock });

    // Should not throw
    await target.destroy();
  });

  it("still cleans up secret and log group when describeStack throws after deletion failure", async () => {
    const cfMock = createMockCfService({ stackExists: jest.fn().mockResolvedValue(true) });
    // deleteStack succeeds but waitForStackStatus fails
    (cfMock.waitForStackStatus as jest.Mock).mockRejectedValue(
      new Error("Stack timed out"),
    );
    // describeStack in the recovery path also throws (network error)
    (cfMock.describeStack as jest.Mock).mockRejectedValue(
      new Error("Network error"),
    );

    const { target, services } = createTarget({
      cf: cfMock,
      secrets: { secretExists: jest.fn().mockResolvedValue(true) },
    });

    // Should not throw — recovery failure must not skip remaining cleanup
    await target.destroy();

    // Secret and log group should still be cleaned up
    expect(services.secretsManager.deleteSecret).toHaveBeenCalled();
    expect(services.cloudWatchLogs.deleteLogGroup).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Fast path: no resources exist
  // -------------------------------------------------------------------------

  it("skips stack and secret teardown when no resources exist", async () => {
    const { target, services } = createTarget();

    await target.destroy();

    expect(services.cloudFormation.deleteStack).not.toHaveBeenCalled();
    expect(services.secretsManager.deleteSecret).not.toHaveBeenCalled();
    // Log group cleanup is always attempted (cheap, best-effort)
    expect(services.cloudWatchLogs.deleteLogGroup).toHaveBeenCalled();
  });

  it("skips stack but deletes secret when only secret exists", async () => {
    const { target, services } = createTarget({
      secrets: { secretExists: jest.fn().mockResolvedValue(true) },
    });

    await target.destroy();

    expect(services.cloudFormation.deleteStack).not.toHaveBeenCalled();
    expect(services.secretsManager.deleteSecret).toHaveBeenCalled();
  });

  it("deletes stack but skips secret when only stack exists", async () => {
    const { target, services } = createTarget({
      cf: { stackExists: jest.fn().mockResolvedValue(true) },
    });

    await target.destroy();

    expect(services.cloudFormation.deleteStack).toHaveBeenCalledWith(BOT_STACK, { force: true });
    expect(services.secretsManager.deleteSecret).not.toHaveBeenCalled();
  });
});
