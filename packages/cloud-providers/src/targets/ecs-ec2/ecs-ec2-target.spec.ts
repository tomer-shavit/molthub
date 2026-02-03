/**
 * Unit Tests — EcsEc2Target
 *
 * Mocks child_process.execFile to intercept all AWS CLI calls
 * made by runAwsCommand() and returns canned JSON responses.
 */
import { execFile } from "child_process";
import { EcsEc2Target } from "./ecs-ec2-target";
import type { EcsEc2Config } from "./ecs-ec2-config";
import { DeploymentTargetType } from "../../interface/deployment-target";

jest.mock("child_process");

const mockedExecFile = execFile as unknown as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid config used across all tests */
function makeConfig(overrides?: Partial<EcsEc2Config>): EcsEc2Config {
  return {
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    subnetIds: ["subnet-aaa", "subnet-bbb"],
    securityGroupId: "sg-12345",
    ...overrides,
  };
}

/**
 * Sets up the mocked execFile to resolve with the given stdout value
 * for each successive call. Calls beyond the provided list resolve
 * with empty string.
 */
function mockAwsCalls(stdouts: string[]): void {
  let callIndex = 0;
  mockedExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const stdout = stdouts[callIndex] ?? "";
      callIndex++;
      cb(null, stdout, "");
    },
  );
}

/**
 * Sets up execFile so that call at `failIndex` rejects, while all
 * others resolve with the provided stdouts (indexed ignoring the failed one).
 */
function mockAwsCallsWithFailure(
  stdouts: string[],
  failIndex: number,
  errorMessage = "aws boom",
): void {
  let callIndex = 0;
  let successIndex = 0;
  mockedExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (callIndex === failIndex) {
        callIndex++;
        cb(new Error(errorMessage), "", errorMessage);
        return;
      }
      const stdout = stdouts[successIndex] ?? "";
      successIndex++;
      callIndex++;
      cb(null, stdout, "");
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EcsEc2Target", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("initialises with the provided config and defaults", () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);

      expect(target.type).toBe(DeploymentTargetType.ECS_EC2);
    });

    it("applies custom optional values from config", () => {
      const cfg = makeConfig({
        clusterName: "custom-cluster",
        image: "my-registry/openclaw:v2",
        cpu: 512,
        memory: 1024,
        assignPublicIp: false,
      });

      // Construction should not throw
      const target = new EcsEc2Target(cfg);
      expect(target.type).toBe(DeploymentTargetType.ECS_EC2);
    });
  });

  // -----------------------------------------------------------------------
  // install()
  // -----------------------------------------------------------------------

  describe("install()", () => {
    it("creates cluster, log group, task definition, and service, then returns success", async () => {
      const cfg = makeConfig({ executionRoleArn: "arn:aws:iam::123:role/exec", taskRoleArn: "arn:aws:iam::123:role/task" });
      const target = new EcsEc2Target(cfg);

      // Four AWS calls: create-cluster, create-log-group,
      // register-task-definition, create-service
      mockAwsCalls(["", "", "", ""]);

      const result = await target.install({
        profileName: "prod",
        port: 18789,
      });

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe("openclaw-prod");
      expect(result.serviceName).toBe("openclaw-prod");
      expect(result.message).toContain("openclaw-prod");
      expect(result.message).toContain("openclaw-cluster");

      // Verify the calls
      expect(mockedExecFile).toHaveBeenCalledTimes(4);

      // First call — create-cluster
      const firstCallArgs = mockedExecFile.mock.calls[0][1] as string[];
      expect(firstCallArgs).toContain("create-cluster");
      expect(firstCallArgs).toContain("openclaw-cluster");

      // Second call — create-log-group
      const secondCallArgs = mockedExecFile.mock.calls[1][1] as string[];
      expect(secondCallArgs).toContain("create-log-group");
      expect(secondCallArgs).toContain("/ecs/openclaw-prod");

      // Third call — register-task-definition
      const thirdCallArgs = mockedExecFile.mock.calls[2][1] as string[];
      expect(thirdCallArgs).toContain("register-task-definition");
      expect(thirdCallArgs).toContain("--execution-role-arn");
      expect(thirdCallArgs).toContain("--task-role-arn");

      // Fourth call — create-service
      const fourthCallArgs = mockedExecFile.mock.calls[3][1] as string[];
      expect(fourthCallArgs).toContain("create-service");
      expect(fourthCallArgs).toContain("openclaw-prod");
    });

    it("resolves a specific openclawVersion in the image tag", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);

      await target.install({
        profileName: "ver-test",
        port: 18800,
        openclawVersion: "v1.2.3",
      });

      // register-task-definition is the 3rd call (index 2)
      const taskDefArgs = mockedExecFile.mock.calls[2][1] as string[];
      const containerDefStr = taskDefArgs[taskDefArgs.indexOf("--container-definitions") + 1];
      expect(containerDefStr).toContain("openclaw:v1.2.3");
    });

    it("ignores log group creation failure and continues", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);

      // Fail the 2nd call (create-log-group, index 1), rest succeed
      mockAwsCallsWithFailure(["", "", ""], 1, "ResourceAlreadyExistsException");

      const result = await target.install({
        profileName: "lgfail",
        port: 18789,
      });

      expect(result.success).toBe(true);
    });

    it("returns failure when create-cluster fails", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);

      // Fail the first call (create-cluster)
      mockAwsCallsWithFailure([], 0, "ClusterCreationFailed");

      const result = await target.install({
        profileName: "fail",
        port: 18789,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("ECS EC2 install failed");
    });
  });

  // -----------------------------------------------------------------------
  // configure()
  // -----------------------------------------------------------------------

  describe("configure()", () => {
    it("stores config in Secrets Manager (create path) and returns success", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls([""]);

      const result = await target.configure({
        profileName: "my-profile",
        gatewayPort: 18789,
        environment: { NODE_ENV: "production" },
        config: { foo: "bar" },
      });

      expect(result.success).toBe(true);
      expect(result.requiresRestart).toBe(true);
      expect(result.message).toContain("Secrets Manager");

      // Should have called create-secret
      const args = mockedExecFile.mock.calls[0][1] as string[];
      expect(args).toContain("create-secret");
      expect(args).toContain("openclaw/my-profile/config");
    });

    it("falls back to update-secret when create-secret fails", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);

      // First call (create-secret) fails, second (update-secret) succeeds
      mockAwsCallsWithFailure([""], 0, "ResourceExistsException");

      const result = await target.configure({
        profileName: "existing",
        gatewayPort: 18789,
      });

      expect(result.success).toBe(true);
      expect(mockedExecFile).toHaveBeenCalledTimes(2);

      const updateArgs = mockedExecFile.mock.calls[1][1] as string[];
      expect(updateArgs).toContain("update-secret");
    });

    it("returns failure when both create and update fail", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);

      // Both calls fail
      let callIndex = 0;
      mockedExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          callIndex++;
          cb(new Error("access denied"), "", "access denied");
        },
      );

      const result = await target.configure({
        profileName: "nope",
        gatewayPort: 18789,
      });

      expect(result.success).toBe(false);
      expect(result.requiresRestart).toBe(false);
      expect(result.message).toContain("Failed to store config");
    });
  });

  // -----------------------------------------------------------------------
  // start()
  // -----------------------------------------------------------------------

  describe("start()", () => {
    it("calls update-service with desired-count 1", async () => {
      const cfg = makeConfig({ clusterName: "my-cluster" });
      const target = new EcsEc2Target(cfg);
      // Install first to set serviceName
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "s", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([""]);

      await target.start();

      const args = mockedExecFile.mock.calls[0][1] as string[];
      expect(args).toContain("update-service");
      expect(args).toContain("--desired-count");
      expect(args).toContain("1");
      expect(args).toContain("my-cluster");
    });
  });

  // -----------------------------------------------------------------------
  // stop()
  // -----------------------------------------------------------------------

  describe("stop()", () => {
    it("calls update-service with desired-count 0", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "s", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([""]);

      await target.stop();

      const args = mockedExecFile.mock.calls[0][1] as string[];
      expect(args).toContain("update-service");
      expect(args).toContain("--desired-count");
      expect(args).toContain("0");
    });
  });

  // -----------------------------------------------------------------------
  // restart()
  // -----------------------------------------------------------------------

  describe("restart()", () => {
    it("calls update-service with --force-new-deployment", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "r", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([""]);

      await target.restart();

      const args = mockedExecFile.mock.calls[0][1] as string[];
      expect(args).toContain("update-service");
      expect(args).toContain("--force-new-deployment");
    });
  });

  // -----------------------------------------------------------------------
  // getStatus()
  // -----------------------------------------------------------------------

  describe("getStatus()", () => {
    it('returns "running" when runningCount > 0', async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "st", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([
        JSON.stringify({
          services: [{ status: "ACTIVE", runningCount: 1, desiredCount: 1 }],
        }),
      ]);

      const status = await target.getStatus();
      expect(status.state).toBe("running");
      expect(status.gatewayPort).toBe(18789);
    });

    it('returns "stopped" when desiredCount is 0', async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "st", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([
        JSON.stringify({
          services: [{ status: "ACTIVE", runningCount: 0, desiredCount: 0 }],
        }),
      ]);

      const status = await target.getStatus();
      expect(status.state).toBe("stopped");
    });

    it('returns "error" when desired > 0 but running is 0', async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "st", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([
        JSON.stringify({
          services: [{ status: "ACTIVE", runningCount: 0, desiredCount: 1 }],
        }),
      ]);

      const status = await target.getStatus();
      expect(status.state).toBe("error");
      expect(status.error).toContain("ACTIVE");
      expect(status.error).toContain("0/1");
    });

    it('returns "not-installed" when no services are found', async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "st", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([JSON.stringify({ services: [] })]);

      const status = await target.getStatus();
      expect(status.state).toBe("not-installed");
    });

    it('returns "not-installed" when the AWS call fails', async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "st", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCallsWithFailure([], 0, "ServiceNotFound");

      const status = await target.getStatus();
      expect(status.state).toBe("not-installed");
    });
  });

  // -----------------------------------------------------------------------
  // getEndpoint()
  // -----------------------------------------------------------------------

  describe("getEndpoint()", () => {
    it("returns public IP and port from ENI lookup", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "ep", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([
        // list-tasks
        JSON.stringify({
          taskArns: ["arn:aws:ecs:us-east-1:123:task/openclaw-cluster/abc123"],
        }),
        // describe-tasks
        JSON.stringify({
          tasks: [
            {
              attachments: [
                {
                  type: "ElasticNetworkInterface",
                  details: [
                    { name: "networkInterfaceId", value: "eni-abc123" },
                  ],
                },
              ],
            },
          ],
        }),
        // describe-network-interfaces
        JSON.stringify({
          NetworkInterfaces: [
            {
              Association: { PublicIp: "54.123.45.67" },
            },
          ],
        }),
      ]);

      const endpoint = await target.getEndpoint();
      expect(endpoint.host).toBe("54.123.45.67");
      expect(endpoint.port).toBe(18789);
      expect(endpoint.protocol).toBe("ws");
    });

    it("throws when no running tasks are found", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "ep", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([JSON.stringify({ taskArns: [] })]);

      await expect(target.getEndpoint()).rejects.toThrow(
        "Failed to resolve ECS EC2 endpoint",
      );
    });

    it("throws when no ENI is found on the task", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "ep", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([
        JSON.stringify({
          taskArns: ["arn:aws:ecs:us-east-1:123:task/openclaw-cluster/abc123"],
        }),
        JSON.stringify({
          tasks: [{ attachments: [] }],
        }),
      ]);

      await expect(target.getEndpoint()).rejects.toThrow(
        "Failed to resolve ECS EC2 endpoint",
      );
    });

    it("throws when no public IP is assigned", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "ep", port: 18789 });

      mockedExecFile.mockClear();
      mockAwsCalls([
        JSON.stringify({
          taskArns: ["arn:aws:ecs:us-east-1:123:task/openclaw-cluster/abc123"],
        }),
        JSON.stringify({
          tasks: [
            {
              attachments: [
                {
                  type: "ElasticNetworkInterface",
                  details: [
                    { name: "networkInterfaceId", value: "eni-abc123" },
                  ],
                },
              ],
            },
          ],
        }),
        JSON.stringify({
          NetworkInterfaces: [{ Association: {} }],
        }),
      ]);

      await expect(target.getEndpoint()).rejects.toThrow(
        "No public IP assigned",
      );
    });
  });

  // -----------------------------------------------------------------------
  // destroy()
  // -----------------------------------------------------------------------

  describe("destroy()", () => {
    it("cleans up service, task definitions, secret, and log group", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "cleanup", port: 18789 });

      mockedExecFile.mockClear();

      // destroy issues these calls:
      // 1. update-service (desired 0)
      // 2. delete-service
      // 3. list-task-definitions
      // 4. deregister-task-definition (per arn)
      // 5. delete-secret
      // 6. delete-log-group
      mockAwsCalls([
        "", // update-service
        "", // delete-service
        JSON.stringify({
          taskDefinitionArns: [
            "arn:aws:ecs:us-east-1:123:task-definition/openclaw-cleanup:1",
            "arn:aws:ecs:us-east-1:123:task-definition/openclaw-cleanup:2",
          ],
        }),
        "", // deregister arn 1
        "", // deregister arn 2
        "", // delete-secret
        "", // delete-log-group
      ]);

      await target.destroy();

      expect(mockedExecFile).toHaveBeenCalledTimes(7);

      // Verify update-service (scale down)
      const call0Args = mockedExecFile.mock.calls[0][1] as string[];
      expect(call0Args).toContain("update-service");
      expect(call0Args).toContain("0");

      // Verify delete-service
      const call1Args = mockedExecFile.mock.calls[1][1] as string[];
      expect(call1Args).toContain("delete-service");
      expect(call1Args).toContain("--force");

      // Verify list-task-definitions
      const call2Args = mockedExecFile.mock.calls[2][1] as string[];
      expect(call2Args).toContain("list-task-definitions");
      expect(call2Args).toContain("openclaw-cleanup");

      // Verify deregister calls
      const call3Args = mockedExecFile.mock.calls[3][1] as string[];
      expect(call3Args).toContain("deregister-task-definition");

      const call4Args = mockedExecFile.mock.calls[4][1] as string[];
      expect(call4Args).toContain("deregister-task-definition");

      // Verify delete-secret
      const call5Args = mockedExecFile.mock.calls[5][1] as string[];
      expect(call5Args).toContain("delete-secret");
      expect(call5Args).toContain("openclaw/cleanup/config");

      // Verify delete-log-group
      const call6Args = mockedExecFile.mock.calls[6][1] as string[];
      expect(call6Args).toContain("delete-log-group");
      expect(call6Args).toContain("/ecs/openclaw-cleanup");
    });

    it("continues cleanup even when individual steps fail", async () => {
      const cfg = makeConfig();
      const target = new EcsEc2Target(cfg);
      mockAwsCalls(["", "", "", ""]);
      await target.install({ profileName: "partial", port: 18789 });

      mockedExecFile.mockClear();

      // All calls fail — destroy should not throw
      let callCount = 0;
      mockedExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          callCount++;
          cb(new Error("not found"), "", "not found");
        },
      );

      // Should not throw despite all failures
      await expect(target.destroy()).resolves.toBeUndefined();
    });
  });
});
