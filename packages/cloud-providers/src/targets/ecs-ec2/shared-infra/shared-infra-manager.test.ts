/**
 * Tests for SharedInfraManager — idempotent creation, concurrent handling, outputs.
 */
import {
  ensureSharedInfra,
  getSharedInfraOutputs,
  isSharedInfraReady,
} from "./shared-infra-manager";
import type { ICloudFormationService } from "../ecs-ec2-services.interface";

/** Create a mock CF service */
function mockCfService(overrides?: Partial<ICloudFormationService>): ICloudFormationService {
  return {
    createStack: jest.fn().mockResolvedValue("stack-id"),
    updateStack: jest.fn().mockResolvedValue("stack-id"),
    deleteStack: jest.fn().mockResolvedValue(undefined),
    describeStack: jest.fn().mockResolvedValue({ status: "CREATE_COMPLETE" }),
    waitForStackStatus: jest.fn().mockResolvedValue({ status: "CREATE_COMPLETE" }),
    getStackOutputs: jest.fn().mockResolvedValue({
      VpcId: "vpc-123",
      PublicSubnet1Id: "subnet-pub1",
      PublicSubnet2Id: "subnet-pub2",
      PrivateSubnet1Id: "subnet-priv1",
      PrivateSubnet2Id: "subnet-priv2",
      PrivateRouteTableId: "rtb-123",
      NatInstanceId: "i-nat123",
      Ec2InstanceProfileArn: "arn:aws:iam::123:instance-profile/clawster-shared-ec2-profile",
      TaskExecutionRoleArn: "arn:aws:iam::123:role/clawster-shared-exec",
    }),
    stackExists: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe("ensureSharedInfra", () => {
  it("creates shared stack when it does not exist", async () => {
    const cf = mockCfService({ stackExists: jest.fn().mockResolvedValue(false) });
    const logs: string[] = [];

    const outputs = await ensureSharedInfra(cf, "us-east-1", (msg) => logs.push(msg));

    expect(cf.createStack).toHaveBeenCalledWith(
      "clawster-shared-us-east-1",
      expect.any(String),
      expect.objectContaining({ capabilities: ["CAPABILITY_NAMED_IAM"] }),
    );
    expect(cf.waitForStackStatus).toHaveBeenCalledWith(
      "clawster-shared-us-east-1",
      "CREATE_COMPLETE",
      expect.any(Object),
    );
    expect(outputs.vpcId).toBe("vpc-123");
    expect(logs.some((l) => l.includes("Creating shared infra"))).toBe(true);
  });

  it("skips creation when stack already exists and is ready", async () => {
    const cf = mockCfService({
      stackExists: jest.fn().mockResolvedValue(true),
      describeStack: jest.fn().mockResolvedValue({ status: "CREATE_COMPLETE" }),
    });

    const outputs = await ensureSharedInfra(cf, "us-east-1");

    expect(cf.createStack).not.toHaveBeenCalled();
    expect(outputs.vpcId).toBe("vpc-123");
  });

  it("waits when stack is CREATE_IN_PROGRESS (concurrent creation)", async () => {
    const cf = mockCfService({
      stackExists: jest.fn().mockResolvedValue(true),
      describeStack: jest.fn().mockResolvedValue({ status: "CREATE_IN_PROGRESS" }),
    });

    await ensureSharedInfra(cf, "us-east-1");

    expect(cf.waitForStackStatus).toHaveBeenCalledWith(
      "clawster-shared-us-east-1",
      "CREATE_COMPLETE",
      expect.objectContaining({ timeoutMs: 600000 }),
    );
    expect(cf.createStack).not.toHaveBeenCalled();
  });

  it("waits when stack is UPDATE_IN_PROGRESS", async () => {
    const cf = mockCfService({
      stackExists: jest.fn().mockResolvedValue(true),
      describeStack: jest.fn().mockResolvedValue({ status: "UPDATE_IN_PROGRESS" }),
    });

    await ensureSharedInfra(cf, "us-east-1");

    expect(cf.waitForStackStatus).toHaveBeenCalledWith(
      "clawster-shared-us-east-1",
      "UPDATE_COMPLETE",
      expect.objectContaining({ timeoutMs: 600000 }),
    );
  });

  it("throws when stack is in unexpected state", async () => {
    const cf = mockCfService({
      stackExists: jest.fn().mockResolvedValue(true),
      describeStack: jest.fn().mockResolvedValue({ status: "ROLLBACK_COMPLETE" }),
    });

    await expect(ensureSharedInfra(cf, "us-east-1")).rejects.toThrow(
      "unexpected state: ROLLBACK_COMPLETE",
    );
  });

  it("handles AlreadyExistsException race condition", async () => {
    const cf = mockCfService({
      stackExists: jest.fn().mockResolvedValue(false),
      createStack: jest.fn().mockRejectedValue(new Error("AlreadyExistsException")),
    });

    const outputs = await ensureSharedInfra(cf, "us-east-1");

    // Should wait for the stack created by the other deployment
    expect(cf.waitForStackStatus).toHaveBeenCalledWith(
      "clawster-shared-us-east-1",
      "CREATE_COMPLETE",
      expect.any(Object),
    );
    expect(outputs.vpcId).toBe("vpc-123");
  });

  it("rethrows non-AlreadyExists errors during creation", async () => {
    const cf = mockCfService({
      stackExists: jest.fn().mockResolvedValue(false),
      createStack: jest.fn().mockRejectedValue(new Error("InsufficientPermissions")),
    });

    await expect(ensureSharedInfra(cf, "us-east-1")).rejects.toThrow("InsufficientPermissions");
  });
});

describe("getSharedInfraOutputs", () => {
  it("maps CF stack outputs to SharedInfraOutputs", async () => {
    const cf = mockCfService();
    const outputs = await getSharedInfraOutputs(cf, "us-east-1");

    expect(outputs).toEqual({
      vpcId: "vpc-123",
      publicSubnet1: "subnet-pub1",
      publicSubnet2: "subnet-pub2",
      privateSubnet1: "subnet-priv1",
      privateSubnet2: "subnet-priv2",
      privateRouteTable: "rtb-123",
      natInstanceId: "i-nat123",
      ec2InstanceProfileArn: "arn:aws:iam::123:instance-profile/clawster-shared-ec2-profile",
      taskExecutionRoleArn: "arn:aws:iam::123:role/clawster-shared-exec",
    });
  });

  it("defaults to empty string for missing outputs", async () => {
    const cf = mockCfService({
      getStackOutputs: jest.fn().mockResolvedValue({}),
    });

    const outputs = await getSharedInfraOutputs(cf, "us-east-1");
    expect(outputs.vpcId).toBe("");
    expect(outputs.ec2InstanceProfileArn).toBe("");
  });
});

describe("isSharedInfraReady", () => {
  it("returns true when stack exists and is CREATE_COMPLETE", async () => {
    const cf = mockCfService({
      stackExists: jest.fn().mockResolvedValue(true),
      describeStack: jest.fn().mockResolvedValue({ status: "CREATE_COMPLETE" }),
    });

    expect(await isSharedInfraReady(cf, "us-east-1")).toBe(true);
  });

  it("returns true when stack exists and is UPDATE_COMPLETE", async () => {
    const cf = mockCfService({
      stackExists: jest.fn().mockResolvedValue(true),
      describeStack: jest.fn().mockResolvedValue({ status: "UPDATE_COMPLETE" }),
    });

    expect(await isSharedInfraReady(cf, "us-east-1")).toBe(true);
  });

  it("returns false when stack does not exist", async () => {
    const cf = mockCfService({
      stackExists: jest.fn().mockResolvedValue(false),
    });

    expect(await isSharedInfraReady(cf, "us-east-1")).toBe(false);
  });

  it("returns false when stack is in progress", async () => {
    const cf = mockCfService({
      stackExists: jest.fn().mockResolvedValue(true),
      describeStack: jest.fn().mockResolvedValue({ status: "CREATE_IN_PROGRESS" }),
    });

    expect(await isSharedInfraReady(cf, "us-east-1")).toBe(false);
  });
});
